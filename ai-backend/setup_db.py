import boto3
import os
import time
from dotenv import load_dotenv
load_dotenv()

dynamodb = boto3.resource(
    'dynamodb',
    region_name='ap-south-1',
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

def create_tables():
    try:
        table = dynamodb.create_table(
            TableName='Transactions',
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[
                {'AttributeName': 'id', 'AttributeType': 'S'},
                {'AttributeName': 'userId', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'UserIndex',
                    'KeySchema': [
                        {'AttributeName': 'userId', 'KeyType': 'HASH'}
                    ],
                    'Projection': {
                        'ProjectionType': 'ALL'
                    }
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        table.meta.client.get_waiter('table_exists').wait(TableName='Transactions')
        print("Transactions table is online!")
    except Exception as e:
        print("Transactions table already exists. Checking for GSI...")
        update_existing_table_with_gsi()

    try:
        print("Waiting for AWS to build the Users table...")
        users_table = dynamodb.create_table(
            TableName='Users',
            KeySchema=[{'AttributeName': 'userId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'userId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        users_table.meta.client.get_waiter('table_exists').wait(TableName='Users')
        print("Success! Users table is online!")
    except Exception as e:
        print("Users table already exists.")

def update_existing_table_with_gsi():
    client = boto3.client(
        'dynamodb',
        region_name='ap-south-1',
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
    )
    try:
        print("Checking if GSI 'UserIndex' needs to be added...")
        desc = client.describe_table(TableName='Transactions')
        gsis = desc['Table'].get('GlobalSecondaryIndexes', [])
        gsi_names = [gsi['IndexName'] for gsi in gsis]
        
        if 'UserIndex' not in gsi_names:
            print("Adding 'UserIndex' GSI to Transactions table...")
            attr_defs = desc['Table'].get('AttributeDefinitions', [])
            attr_names = [attr['AttributeName'] for attr in attr_defs]
            if 'userId' not in attr_names:
                attr_defs.append({'AttributeName': 'userId', 'AttributeType': 'S'})

            client.update_table(
                TableName='Transactions',
                AttributeDefinitions=attr_defs,
                GlobalSecondaryIndexUpdates=[
                    {
                        'Create': {
                            'IndexName': 'UserIndex',
                            'KeySchema': [
                                {'AttributeName': 'userId', 'KeyType': 'HASH'}
                            ],
                            'Projection': {
                                'ProjectionType': 'ALL'
                            }
                        }
                    }
                ]
            )
            print("GSI update initiated. Waiting for index to become ACTIVE...")
            while True:
                desc = client.describe_table(TableName='Transactions')
                gsis = desc['Table'].get('GlobalSecondaryIndexes', [])
                user_index = next((gsi for gsi in gsis if gsi['IndexName'] == 'UserIndex'), None)
                if user_index and user_index['IndexStatus'] == 'ACTIVE':
                    print("GSI 'UserIndex' is now ACTIVE!")
                    break
                print("Index is still creating...")
                time.sleep(5)
        else:
            print("GSI 'UserIndex' already exists on Transactions table.")
    except Exception as e:
        print(f"Error checking/updating table: {str(e)}")

if __name__ == '__main__':
    create_tables()