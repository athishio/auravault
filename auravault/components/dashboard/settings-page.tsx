"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sun, Moon, Monitor, Bell, AlertCircle, CreditCard } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { isLoaded: isAuthLoaded, userId } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const [creditLimit, setCreditLimit] = useState("50000");
  const [showLimitSuccess, setShowLimitSuccess] = useState(false);
  const [showProfileSuccess, setShowProfileSuccess] = useState(false);
  const [showNotifSuccess, setShowNotifSuccess] = useState(false);

  const [formData, setFormData] = useState({
    currency: "inr",
  });
  
  const [notifications, setNotifications] = useState({
    unusualSpending: true,
    weeklyAiSummary: true,
  });

  useEffect(() => {
    setMounted(true);
    
    if (isAuthLoaded && userId) {
      const savedLimit = localStorage.getItem(`auraVault_${userId}_creditLimit`);
      if (savedLimit) setCreditLimit(savedLimit);

      const savedCurrency = localStorage.getItem(`auraVault_${userId}_currency`);
      if (savedCurrency) setFormData({ currency: savedCurrency });

      const savedNotifs = localStorage.getItem(`auraVault_${userId}_notifications`);
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
    }
  }, [isAuthLoaded, userId]);

  if (!mounted) return <div className="text-foreground p-8 animate-pulse">Loading secure settings...</div>;

  const handleSaveCreditLimit = () => {
    if (!userId) return;
    localStorage.setItem(`auraVault_${userId}_creditLimit`, creditLimit);
    setShowLimitSuccess(true);
    setTimeout(() => setShowLimitSuccess(false), 2000);
  };

  const handleSaveProfile = () => {
    if (!userId) return;
    localStorage.setItem(`auraVault_${userId}_currency`, formData.currency);
    setShowProfileSuccess(true);
    setTimeout(() => setShowProfileSuccess(false), 2000);
  };

  const handleSaveNotifications = () => {
    if (!userId) return;
    localStorage.setItem(`auraVault_${userId}_notifications`, JSON.stringify(notifications));
    window.dispatchEvent(new Event("notificationsUpdated"));
    setShowNotifSuccess(true);
    setTimeout(() => setShowNotifSuccess(false), 2000);
  };

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun, description: "Bright and clean interface" },
    { value: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
    { value: "system", label: "System Preferred", icon: Monitor, description: "Match your device settings" },
  ];

  const handleNotificationChange = (field: string, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [field]: value }));
  };

  const currencyOptions = [
    { value: "inr", label: "₹ Indian Rupee (INR)" },
    { value: "usd", label: "$ US Dollar (USD)" },
    { value: "eur", label: "€ Euro (EUR)" },
    { value: "gbp", label: "£ British Pound (GBP)" },
  ];

  return (
    <div className="max-w-2xl w-full pb-10 mt-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">Customize your AuraVault experience</p>
      </div>

      <Card className="p-6 border border-border">
        <h2 className="text-xl font-semibold text-foreground mb-6">App Preferences</h2>
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground block mb-4">Interface Theme</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-3 ${
                    isSelected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="p-6 border border-border mt-6">
        <h2 className="text-xl font-semibold text-foreground mb-6">Account</h2>
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Master Profile</label>
            <Input disabled value={user?.fullName || "AuraVault User"} className="w-full px-4 py-2 bg-muted text-muted-foreground font-medium" />
            <p className="text-xs text-muted-foreground mt-1">Authenticated Account (Personal Vault Access)</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Primary Currency</label>
            <div className="flex gap-3">
              <Select value={formData.currency} onValueChange={(value) => setFormData({ currency: value })}>
                <SelectTrigger className="flex-1 px-4 py-2 rounded-lg border border-border bg-card text-foreground focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSaveProfile} className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[120px]">
                {showProfileSuccess ? "Saved!" : "Save Profile"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 border border-primary/20 bg-primary/5 shadow-sm mt-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="flex items-center gap-3 mb-6 relative z-10">
          <div className="p-2 bg-primary/20 text-primary rounded-lg"><CreditCard className="w-5 h-5" /></div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Financial Limits</h2>
            <p className="text-sm text-muted-foreground mt-1">Set your dynamic dashboard calculations</p>
          </div>
        </div>
        <div className="space-y-4 relative z-10">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Base Credit Limit</label>
            <div className="flex gap-3">
              <Input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="flex-1 bg-card border border-border text-foreground focus:ring-primary"
              />
              <Button onClick={handleSaveCreditLimit} className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[120px]">
                {showLimitSuccess ? "Saved!" : "Save Limit"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 border border-border mt-6">
        <h2 className="text-xl font-semibold text-foreground mb-6">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-start justify-between p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Unusual Spending Alerts</p>
                <p className="text-sm text-muted-foreground">Get notified of duplicate or large transactions</p>
              </div>
            </div>
            <Switch checked={notifications.unusualSpending} onCheckedChange={(value) => handleNotificationChange("unusualSpending", value)} className="mt-0.5" />
          </div>

          <div className="flex items-start justify-between p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Weekly AI Summary</p>
                <p className="text-sm text-muted-foreground">Receive an AI-generated recap of your vault</p>
              </div>
            </div>
            <Switch checked={notifications.weeklyAiSummary} onCheckedChange={(value) => handleNotificationChange("weeklyAiSummary", value)} className="mt-0.5" />
          </div>
          
          <div className="pt-4 border-t border-border flex justify-end">
            <Button onClick={handleSaveNotifications} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {showNotifSuccess ? "Preferences Saved!" : "Save Notification Settings"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}