"use client";

import { useState, useEffect } from "react";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { ExpensesChart } from "@/components/dashboard/expenses-chart";
import { TransactionsList } from "@/components/dashboard/transactions-list";
import { SpendingBreakdown } from "@/components/dashboard/spending-breakdown";
import { ChatWidget } from "@/components/dashboard/chat-widget"; 
import { Plus, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://auravault-ai.onrender.com";

export function DashboardView() {
  const userId = "primary_user";

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [baseCreditLimit, setBaseCreditLimit] = useState(50000);
  const [currency, setCurrency] = useState({ symbol: "₹", locale: "en-IN" });
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState("Food");
  const [savingsSource, setSavingsSource] = useState("balance");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    console.log("DashboardView Config:", {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      API_BASE,
      userId
    });
  }, []);

  const fetchData = async () => {
    try {
      console.log("DashboardView: Fetching transactions from", `${API_BASE}/api/transactions`);
      const apiSecret = process.env.NEXT_PUBLIC_API_SECRET || "";

      const res = await fetch(`${API_BASE}/api/transactions`, {
        headers: {
          "X-API-Secret": apiSecret
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Expected a JSON array of transactions from the server.");
      }

      const sortedData = data.sort((a: any, b: any) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setTransactions(sortedData);
      setLoading(false);
    } catch (error: any) {
      console.error("DashboardView fetch error:", error);
      setAuthError(error?.message || "Failed to load secure vault data.");
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedLimit = localStorage.getItem(`auraVault_${userId}_creditLimit`);
    if (savedLimit) setBaseCreditLimit(parseFloat(savedLimit));
    
    const savedCurrency = (localStorage.getItem(`auraVault_${userId}_currency`) || "inr").toLowerCase();
    if (savedCurrency === "usd") {
      setCurrency({ symbol: "$", locale: "en-US" });
    } else if (savedCurrency === "eur") {
      setCurrency({ symbol: "€", locale: "en-IE" });
    } else if (savedCurrency === "gbp") {
      setCurrency({ symbol: "£", locale: "en-GB" });
    } else {
      setCurrency({ symbol: "₹", locale: "en-IN" });
    }
    
    fetchData();

    const handleSearchEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      setSearchQuery(customEvent.detail);
    };
    window.addEventListener("searchTransactions", handleSearchEvent);
    return () => window.removeEventListener("searchTransactions", handleSearchEvent);
  }, []);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newAmount) return;
    
    setIsSubmitting(true);
    try {
      let finalCategory = newCategory;
      if (newCategory === "Savings") {
        finalCategory = savingsSource === "balance" ? "Savings_Internal" : "Savings_External";
      }

      const apiSecret = process.env.NEXT_PUBLIC_API_SECRET || "";
      await fetch(`${API_BASE}/api/transactions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Secret": apiSecret
        },
        body: JSON.stringify({
          name: newName,
          amount: newAmount,
          category: finalCategory
        })
      });
      
      setNewName("");
      setNewAmount("");
      await fetchData();
      window.dispatchEvent(new Event("notificationsUpdated"));
      window.dispatchEvent(new Event("searchTransactions"));
    } catch (error) {
      console.error("Error adding transaction:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  let totalBalance = 0;
  let totalSavings = 0;
  let totalExpenses = 0;

  transactions.forEach((tx) => {
    const amt = parseFloat(tx.amount) || 0;
    const category = (tx.category || "").toLowerCase();

    if (category === "salary" || category === "income") {
      totalBalance += amt;
    } else if (category === "savings" || category === "investment" || category === "savings_external") {
      totalSavings += amt;
    } else if (category === "savings_internal") {
      totalSavings += amt;
      totalBalance -= amt; 
    } else {
      totalExpenses += Math.abs(amt);
      totalBalance -= Math.abs(amt);
    }
  });

  const creditAvailable = baseCreditLimit - totalExpenses;

  const safeSearchQuery = (searchQuery || "").toLowerCase();

  const filteredTransactions = transactions.filter((tx) => 
    (tx.name || "").toLowerCase().includes(safeSearchQuery) || 
    (tx.category || "").toLowerCase().includes(safeSearchQuery)
  );

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 mt-20 gap-4 p-8 border border-red-500/20 bg-red-500/5 rounded-xl max-w-xl mx-auto">
        <p className="font-semibold text-lg">{authError}</p>
        <p className="text-sm text-muted-foreground text-center">
          Make sure your local environment has `NEXT_PUBLIC_API_URL` set correctly to `http://localhost:5000` in `.env.local` and that you are signed in.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse mt-20">
        Syncing Secure Vault...
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          {/* BYPASS CLERK: Hardcoded your name for the hackathon */}
          Welcome back, Athish
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's your financial overview.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <BalanceCard title="Total Balance" amount={`${currency.symbol}${totalBalance.toLocaleString(currency.locale, { minimumFractionDigits: 2 })}`} change="This Month" changeType="positive" icon="wallet" />
        <BalanceCard title="Total Savings" amount={`${currency.symbol}${totalSavings.toLocaleString(currency.locale, { minimumFractionDigits: 2 })}`} change="This Month" changeType="positive" icon="savings" />
        <BalanceCard title="Credit Available" amount={`${currency.symbol}${creditAvailable.toLocaleString(currency.locale, { minimumFractionDigits: 2 })}`} change="Dynamic Limit" changeType={creditAvailable > 10000 ? "positive" : "negative"} icon="credit" />
      </div>

      <div className="bg-sidebar border border-sidebar-border rounded-xl p-6 mb-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">Quick Add Transaction</h3>
        <form onSubmit={handleAddTransaction} className="flex flex-col md:flex-row gap-4 items-end flex-wrap">
          <div className="flex-1 w-full min-w-[200px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">Description</label>
            <input 
              type="text" 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              placeholder="e.g. Amazon Purchase" 
              className="w-full bg-background border border-sidebar-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
              required
            />
          </div>
          
          <div className="flex-1 w-full min-w-[150px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">Amount ({currency.symbol})</label>
            <input 
              type="number" 
              value={newAmount} 
              onChange={(e) => setNewAmount(e.target.value)} 
              placeholder="0.00" 
              className="w-full bg-background border border-sidebar-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
              required
            />
          </div>

          <div className="flex-1 w-full min-w-[180px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">Category</label>
            <select 
              value={newCategory} 
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full bg-background border border-sidebar-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
            >
              <option value="Salary" className="font-semibold">Salary (Income)</option>
              <option value="Housing">Rent & Housing</option>
              <option value="Education">Education & Study</option>
              <option value="Food">Food & Dining</option>
              <option value="Travel">Travel & Commute</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Shopping">Shopping</option>
              <option value="Utilities">Utilities & Bills</option>
              <option value="Health">Healthcare</option>
              <option value="Savings">Savings & Investments</option>
              <option value="Other">Miscellaneous</option>
            </select>
          </div>

          {/* CONDITIONAL UI: Only shows when "Savings" is selected! */}
          {newCategory === "Savings" && (
            <div className="flex-1 w-full min-w-[180px] animate-in fade-in zoom-in duration-200">
              <label className="text-sm text-muted-foreground mb-1.5 block">Source of Funds</label>
              <select 
                value={savingsSource} 
                onChange={(e) => setSavingsSource(e.target.value)}
                className="w-full bg-background border border-sidebar-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
              >
                <option value="balance">Transfer from Balance</option>
                <option value="external">External Money</option>
              </select>
            </div>
          )}

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 text-black px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 h-[42px]"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Add</span>
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="lg:col-span-1">
          <ExpensesChart transactions={filteredTransactions} />
        </div>
        <div className="lg:col-span-1" id="transactions-list-section">
          <TransactionsList transactions={filteredTransactions} onRefresh={fetchData} />
        </div>
      </div>

      <div>
        <SpendingBreakdown transactions={filteredTransactions} />
      </div>

      <ChatWidget />
    </>
  );
}