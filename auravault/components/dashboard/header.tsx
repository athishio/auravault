"use client";
import { useState, useRef, useEffect } from "react";
import { Bell, Search, AlertCircle, TrendingDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth, UserButton } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://auravault-ai.onrender.com";

export function Header({ currentTab = "Dashboard" }: { currentTab?: string }) {
  const { isLoaded, userId, getToken } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [activeNotifications, setActiveNotifications] = useState<any[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const checkRealEvents = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/transactions`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Header notifications sync failed:", res.status, errData);
        setAllTransactions([]);
        setActiveNotifications([]);
        return;
      }

      const txData = await res.json();
      if (!Array.isArray(txData)) {
        console.error("Header: Expected transaction array but got:", txData);
        setAllTransactions([]);
        setActiveNotifications([]);
        return;
      }

      setAllTransactions(txData);

      const limit = parseFloat(localStorage.getItem(`auraVault_${userId}_creditLimit`) || localStorage.getItem("auraVault_creditLimit") || "50000");
      const prefs = JSON.parse(localStorage.getItem(`auraVault_${userId}_notifications`) || localStorage.getItem("auraVault_notifications") || '{"unusualSpending":true,"budgetWarnings":true}');
      const dismissedAlerts = JSON.parse(localStorage.getItem(`auraVault_${userId}_dismissedAlerts`) || localStorage.getItem("auraVault_dismissedAlerts") || "[]");
      const seenAlerts = JSON.parse(localStorage.getItem(`auraVault_${userId}_seenAlerts`) || localStorage.getItem("auraVault_seenAlerts") || "[]");

      let totalExpenses = 0;
      const potentialAlerts: any[] = [];

      txData.forEach((tx: any) => {
        const amt = parseFloat(tx.amount) || 0;
        const cat = (tx.category || "").toLowerCase();
        
        if (cat !== "salary" && cat !== "income" && cat !== "savings") {
          totalExpenses += Math.abs(amt);
          
          if (Math.abs(amt) >= 5000 && prefs.unusualSpending) {
            potentialAlerts.push({
              id: `unusual-${tx.id}`,
              icon: AlertCircle,
              title: "Unusual Spending Detected",
              message: `₹${Math.abs(amt).toLocaleString('en-IN')} spent on ${tx.name}`,
              time: tx.date,
              type: "alert"
            });
          }
        }
      });

      if (totalExpenses >= (limit * 0.9) && prefs.budgetWarnings !== false) {
        potentialAlerts.push({
          id: "budget-warning",
          icon: TrendingDown,
          title: "Budget Limit Warning",
          message: `You've spent ₹${totalExpenses.toLocaleString('en-IN')} of your ₹${limit.toLocaleString('en-IN')} limit!`,
          time: "Just now",
          type: "warning"
        });
      }

      const visibleAlerts = potentialAlerts.filter(alert => !dismissedAlerts.includes(alert.id));
      setActiveNotifications(visibleAlerts);

      const hasBrandNew = visibleAlerts.some(alert => !seenAlerts.includes(alert.id));
      if (hasBrandNew) {
        setHasUnseen(true);
      }

    } catch (error) {
      console.error("Failed to generate real notifications:", error);
    }
  };

  const handleOpenNotifications = () => {
    const willOpen = !isNotificationsOpen;
    setIsNotificationsOpen(willOpen);

    if (willOpen && userId) {
      setHasUnseen(false);
      const seenAlerts = JSON.parse(localStorage.getItem(`auraVault_${userId}_seenAlerts`) || localStorage.getItem("auraVault_seenAlerts") || "[]");
      const newlySeen = activeNotifications.map(a => a.id);
      localStorage.setItem(`auraVault_${userId}_seenAlerts`, JSON.stringify([...new Set([...seenAlerts, ...newlySeen])]));
    } else {
      checkRealEvents(); 
    }
  };

  const handleDismissAll = () => {
    if (!userId) return;
    const dismissedAlerts = JSON.parse(localStorage.getItem(`auraVault_${userId}_dismissedAlerts`) || localStorage.getItem("auraVault_dismissedAlerts") || "[]");
    const newlyDismissed = activeNotifications.map(a => a.id);
    localStorage.setItem(`auraVault_${userId}_dismissedAlerts`, JSON.stringify([...new Set([...dismissedAlerts, ...newlyDismissed])]));
    
    setActiveNotifications([]);
    setHasUnseen(false);
    setIsNotificationsOpen(false);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowSearchDropdown(value.length > 0);
    window.dispatchEvent(new CustomEvent("searchTransactions", { detail: value }));
  };

  const handleSuggestionClick = (txName: string) => {
    setSearchTerm(txName);
    setShowSearchDropdown(false);
    window.dispatchEvent(new CustomEvent("searchTransactions", { detail: txName }));
    document.getElementById("transactions-list-section")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isLoaded && userId) {
      checkRealEvents();
      window.addEventListener("notificationsUpdated", checkRealEvents);
      return () => {
        window.removeEventListener("notificationsUpdated", checkRealEvents);
      };
    }
  }, [isLoaded, userId]); 

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNotificationsOpen, showSearchDropdown]);

  const searchResults = allTransactions.filter(tx => 
    (tx.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (tx.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 5);

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 z-50 relative">
      
      <div className="flex items-center gap-4 flex-1">
        {currentTab === "dashboard" && (
          <div className="relative max-w-md flex-1" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={handleSearch}
              onFocus={() => { if(searchTerm) setShowSearchDropdown(true); }}
              placeholder="Search transactions, accounts..."
              className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-emerald-500 transition-all"
            />
            
            {showSearchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
                {searchResults.length > 0 ? (
                  searchResults.map(tx => (
                    <div
                      key={tx.id}
                      onClick={() => handleSuggestionClick(tx.name)}
                      className="px-4 py-3 hover:bg-muted/50 cursor-pointer flex justify-between items-center transition-colors border-b border-border last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{tx.name}</p>
                        <p className="text-xs text-muted-foreground">{tx.category}</p>
                      </div>
                      <span className={`text-sm font-semibold ${(tx.category || "").toLowerCase() === 'salary' ? 'text-emerald-500' : 'text-foreground'}`}>
                        ₹{parseFloat(tx.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                    No matches found in your vault.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
      </div>

      <div className="flex items-center gap-4">
        <div ref={notificationsRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenNotifications}
            className="relative text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bell className="w-5 h-5" />
            {hasUnseen && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </Button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Live Alerts</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {activeNotifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Your vault is secure. No new alerts!
                  </div>
                ) : (
                  activeNotifications.map((notification) => {
                    const IconComponent = notification.icon;
                    return (
                      <div
                        key={notification.id}
                        className="p-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <div className="flex gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            notification.type === "alert" && "bg-red-500/20 text-red-500",
                            notification.type === "warning" && "bg-yellow-500/20 text-yellow-600"
                          )}>
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{notification.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{notification.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {activeNotifications.length > 0 && (
                <div className="p-3 border-t border-border">
                  <Button
                    variant="ghost"
                    className="w-full text-sm text-primary hover:text-primary/80"
                    onClick={handleDismissAll}
                  >
                    Dismiss All
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <UserButton showName appearance={{
            elements: {
              userButtonOuterIdentifier: "text-sm font-medium text-foreground",
            }
          }} />
        </div>
        
      </div>
    </header>
  );
}