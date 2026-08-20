from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import boto3
import uuid
import tempfile
import json
import os
from datetime import datetime
from boto3.dynamodb.conditions import Attr, Key
import re
import pdfplumber
import jwt
from jwt import PyJWKClient
from functools import wraps
from botocore.exceptions import ClientError

from dotenv import load_dotenv
load_dotenv()

allowed_origins_env = os.getenv("ALLOWED_ORIGIN")
if allowed_origins_env:
    allowed_origins = [orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()]
else:
    allowed_origins = ["https://auravault-ai.vercel.app", "http://localhost:3000"]

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": allowed_origins}})

genai.configure(api_key=os.getenv("API_KEY"))

dynamodb = boto3.resource(
    'dynamodb',
    region_name='ap-south-1', 
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

transactions_table = dynamodb.Table('Transactions')
users_table = dynamodb.Table('Users')

MOCK_USER_ID = "hackathon_admin"

def log_debug(msg):
    try:
        with open("debug.log", "a") as f:
            f.write(f"{datetime.now().isoformat()} - {msg}\n")
            f.flush()
    except Exception:
        pass

_jwk_client = None

def get_jwk_client():
    global _jwk_client
    if _jwk_client is None:
        jwks_url = os.getenv("CLERK_JWKS_URL")
        if not jwks_url:
            issuer = os.getenv("CLERK_JWT_ISSUER") or os.getenv("CLERK_ISSUER")
            if issuer:
                jwks_url = f"{issuer.rstrip('/')}/.well-known/jwks.json"
        if not jwks_url:
            raise ValueError("CLERK_JWKS_URL or CLERK_JWT_ISSUER / CLERK_ISSUER environment variable is not set")
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", None)
        if not auth_header:
            log_debug("DEBUG AUTH: Authorization header is missing")
            return jsonify({"error": "Authorization header is missing"}), 401
            
        parts = auth_header.split()
        if parts[0].lower() != "bearer" or len(parts) != 2:
            log_debug("DEBUG AUTH: Authorization header is malformed")
            return jsonify({"error": "Authorization header must be Bearer token"}), 401
            
        token = parts[1]
        try:
            client = get_jwk_client()
            signing_key = client.get_signing_key_from_jwt(token)
            
            issuer = os.getenv("CLERK_JWT_ISSUER") or os.getenv("CLERK_ISSUER")
            log_debug(f"DEBUG AUTH: decoding token starting with {token[:15]}... issuer={issuer}")
            
            # Disable strict issuer check in PyJWT and check manually to support trailing slash differences
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_aud": False, "verify_iss": False},
                leeway=60
            )
            
            # Manual issuer check normalized by stripping trailing slashes
            iss = payload.get("iss")
            if issuer:
                expected_iss = issuer.rstrip("/")
                actual_iss = iss.rstrip("/") if iss else None
                if actual_iss != expected_iss:
                    raise jwt.exceptions.InvalidIssuerError(f"Issuer mismatch: expected {expected_iss}, got {actual_iss}")

            user_id = payload.get("sub")
            if not user_id:
                log_debug("DEBUG AUTH: Token payload missing 'sub' claim")
                return jsonify({"error": "Token payload missing 'sub' claim"}), 401
                
            request.user_id = user_id
            log_debug(f"DEBUG AUTH: Success! user_id={user_id}")
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            log_debug(f"DEBUG AUTH ERROR: {str(e)}\nTraceback:\n{tb}")
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
            
        return f(*args, **kwargs)
    return decorated

@app.route('/api/transactions', methods=['GET', 'POST'])
@requires_auth
def handle_transactions():
    if request.method == 'GET':
        user_id = request.user_id
        log_debug(f"DEBUG GET TRANSACTIONS: user_id={user_id}")
        
        try:
            response = transactions_table.query(
                IndexName='UserIndex',
                KeyConditionExpression=Key('userId').eq(user_id)
            )
            items = response.get('Items', [])
            log_debug(f"DEBUG GET TRANSACTIONS: retrieved {len(items)} items")
            for item in items:
                item['amount'] = float(item.get('amount', 0))
            return jsonify(items)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            log_debug(f"DEBUG GET TRANSACTIONS ERROR: {str(e)}\nTraceback:\n{tb}")
            return jsonify({"error": str(e)}), 500
            
    if request.method == 'POST':
        try:
            data = request.json
            new_id = str(uuid.uuid4()) 
            transaction_item = {
                'id': new_id,
                'userId': request.user_id,
                'name': data.get('name', 'Manual Entry'),
                'amount': str(data.get('amount', 0)), 
                'category': data.get('category', 'Other'),
                'date': datetime.now().strftime('%b %d, %Y')
            }
            transactions_table.put_item(Item=transaction_item)
            transaction_item['amount'] = float(transaction_item['amount'])
            return jsonify({"message": "Transaction added successfully!", "transaction": transaction_item}), 201
        except Exception as e:
            return jsonify({"error": "Failed to save to AWS"}), 500
        
@app.route('/api/transactions/all', methods=['DELETE'])
@requires_auth
def delete_all_transactions():
    user_id = request.user_id
        
    try:
        response = transactions_table.query(IndexName='UserIndex', KeyConditionExpression=Key('userId').eq(user_id))
        items = response.get('Items', [])
        with transactions_table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'id': item['id']})               
        return jsonify({"message": "Vault cleared successfully!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
@requires_auth
def delete_transaction(transaction_id):
    user_id = request.user_id
    try:
        transactions_table.delete_item(
            Key={'id': transaction_id},
            ConditionExpression=Attr('userId').eq(user_id)
        )
        return jsonify({"message": "Transaction deleted successfully!"}), 200
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return jsonify({"error": "Transaction not found or unauthorized"}), 404
        return jsonify({"error": "Failed to delete from database"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/settings', methods=['GET', 'POST'])
@requires_auth
def handle_settings():
    if request.method == 'GET':
        user_id = request.user_id
        try:
            response = users_table.get_item(Key={'userId': user_id})
            return jsonify(response.get('Item', {}))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.method == 'POST':
        data = request.json
        try:
            item = {
                'userId': request.user_id,
                'currency': data.get('currency', 'INR'),
                'monthlyBudget': str(data.get('monthlyBudget', 0)),
                'theme': data.get('theme', 'dark'),
                'language': data.get('language', 'English'),
                'notifications': data.get('notifications', 'email')
            }
            users_table.put_item(Item=item)
            return jsonify({"message": "Settings locked in!"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
@requires_auth
def chat():
    data = request.json
    try:
        user_message = data.get("message", "")
        user_id = request.user_id
        history = data.get("history", []) 

        response = transactions_table.query(IndexName='UserIndex', KeyConditionExpression=Key('userId').eq(user_id))
        transactions = response.get('Items', [])
        
        raw_currency = str(data.get('currency_code', data.get('currency', 'inr'))).lower()
        
        symbol_map = {
            "usd": "$",
            "eur": "€",
            "inr": "₹",
            "gbp": "£",
            "$": "$",
            "€": "€",
            "₹": "₹",
            "£": "£"
        }
        currency_symbol = symbol_map.get(raw_currency, raw_currency)
        total_balance = 0
        total_expenses = 0
        recent_txs = []
        category_spending = {}
        
        for tx in transactions:
            amt = float(tx.get('amount', 0))
            cat = str(tx.get('category', '')).lower()
            
            if cat in ['salary', 'income']:
                total_balance += amt
            elif cat not in ['savings', 'investment', 'savings_external', 'savings_internal']:
                total_expenses += abs(amt)
                total_balance -= abs(amt)
                category_spending[cat] = category_spending.get(cat, 0) + abs(amt)
        category_str = ", ".join([f"{k.capitalize()}: {currency_symbol}{v}" for k, v in category_spending.items()]) if category_spending else "No categorized expenses."

        sorted_txs = sorted(transactions, key=lambda x: str(x.get('date', '')), reverse=True)[:5]
        for tx in sorted_txs:
            recent_txs.append(f"{tx.get('name')} ({currency_symbol}{tx.get('amount')})")
            
        recent_tx_str = ", ".join(recent_txs) if recent_txs else "No recent transactions"
        current_datetime = datetime.now().strftime('%B %d, %Y at %I:%M %p')
        
        system_context = f"""
        You are AuraVault AI, an elite wealth architect and behavioral finance expert. 
        You possess the analytical rigor of a top-tier hedge fund manager. You do not just track money; you engineer financial freedom. Your tone is direct, highly confident, strictly concise, and professional.

        LIVE TELEMETRY DATA:
        - Current Date & Time: {current_datetime}
        - Liquidity (Balance): {currency_symbol}{total_balance}
        - Burn Rate (Total Expenses): {currency_symbol}{total_expenses}
        - Categorized Spending: {category_str} 
        - Cash Flow Velocity (Recent): {recent_tx_str}

        COGNITIVE FRAMEWORK & OPERATING RULES:
        1. THE ICEBREAKER PROTOCOL: If the user simply greets you (e.g., "hi", "hello"), reply with ONE short sentence acknowledging their Liquidity, and ask what they want to work on.
        2. THE GENERAL INQUIRY PROTOCOL (STRICT OVERRIDE): If the user asks a simple, factual, or non-financial question, answer it directly and concisely. DO NOT force a financial analysis.
        3. THE AUDITOR PROTOCOL: If the user asks about specific spending, look specifically at the 'Categorized Spending' data and give them the exact numbers.
        4. ZERO-WASTE COMMUNICATION: Maximum 3 short paragraphs. NO generic AI intros.
        5. BOLD THE BAG: Financial figures must always be bolded with the correct currency symbol (e.g., **{currency_symbol}27,770**). 
        """
        
        model = genai.GenerativeModel('gemini-3.5-flash', system_instruction=system_context)
        
        formatted_history = []
        for msg in history:
            role = "model" if msg["role"] == "ai" else "user"
            formatted_history.append({"role": role, "parts": [msg["content"]]})
            
        while len(formatted_history) > 0 and formatted_history[0]["role"] == "model":
            formatted_history.pop(0)
            
        chat_session = model.start_chat(history=formatted_history)
        ai_response = chat_session.send_message(user_message)
        
        return jsonify({"reply": ai_response.text}), 200
        
    except Exception as e:
        return jsonify({"reply": f"API Error: {str(e)}"}), 500

from werkzeug.utils import secure_filename

@app.route('/api/upload', methods=['POST'])
@requires_auth
def upload_statement():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files['file']
    user_id = request.user_id
    
    if file.filename == '':
        return jsonify({"error": "Missing file"}), 400

    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({"error": "Invalid filename"}), 400

    # Reject the upload if the extension isn't one of .pdf, .csv, .txt
    allowed_extensions = {'.pdf', '.csv', '.txt'}
    _, ext = os.path.splitext(filename.lower())
    if ext not in allowed_extensions:
        return jsonify({"error": "Invalid file extension. Only .pdf, .csv, and .txt are allowed"}), 400

    # Add a max file size check (10MB) before saving
    try:
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        if file_size > 10 * 1024 * 1024:
            return jsonify({"error": "File size exceeds 10MB limit"}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to check file size: {str(e)}"}), 400

    try:
        temp_dir = tempfile.gettempdir()
        filepath = os.path.join(temp_dir, filename)
        file.save(filepath)
        
        extracted_text = ""
        
        # 1. Read the PDF document deterministically
        if filepath.lower().endswith('.pdf'):
            with pdfplumber.open(filepath) as pdf:
                for page in pdf.pages:
                    extracted_text += page.extract_text() + "\n"
        else:
            # Fallback for CSV or TXT if you upload those
            with open(filepath, 'r', encoding='utf-8') as f:
                extracted_text = f.read()

        # 2. Use Regex to find standard bank statement lines
        # Matches formats like: 05-May-2026   Rent Payment   10000.00
        transaction_pattern = re.compile(r"(\d{2}-[a-zA-Z]{3}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})")
        
        added_txs = []
        
        # 3. Parse matches and save directly to AWS DynamoDB
        with transactions_table.batch_writer() as batch:
            for line in extracted_text.split('\n'):
                match = transaction_pattern.search(line)
                if match:
                    date_str, description, amount_str = match.groups()
                    
                    # Clean up the amount (remove commas)
                    clean_amount = amount_str.replace(',', '')
                    
                    # Simple keyword-based auto-categorization
                    desc_lower = description.lower()
                    category = "Other"
                    if "salary" in desc_lower: category = "Salary"
                    elif "rent" in desc_lower or "housing" in desc_lower: category = "Housing"
                    elif "grocery" in desc_lower or "coffee" in desc_lower: category = "Food"
                    elif "atm" in desc_lower: category = "Cash"
                    
                    new_id = str(uuid.uuid4())
                    item = {
                        'id': new_id,
                        'userId': user_id,
                        'name': description.strip(),
                        'amount': clean_amount,
                        'category': category,
                        'date': date_str.strip()
                    }
                    batch.put_item(Item=item)
                    added_txs.append(item)
        
        os.remove(filepath)
        
        return jsonify({"message": "Successfully processed using deterministic parser", "count": len(added_txs)}), 200

    except Exception as e:
        print("Local Parsing Error:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() in ("true", "1")
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)
