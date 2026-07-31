import React from "react";
import { LayoutDashboard, Receipt, Wallet, BarChart3, Settings } from "lucide-react";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const mobileTabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "spending", label: "Spend", icon: Receipt },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Stats", icon: BarChart3 },
  { key: "settings", label: "More", icon: Settings },
];

export const MobileNav: React.FC<{ activeTab: TabKey; setActiveTab: (t: TabKey) => void }> = ({ activeTab, setActiveTab }) => (
  <nav className="mobile-nav" aria-label="Mobile navigation">
    {mobileTabs.map((t) => (
      <button
        key={t.key}
        className={`mobile-nav-item ${activeTab === t.key ? "active" : ""}`}
        onClick={() => setActiveTab(t.key)}
        aria-current={activeTab === t.key ? "page" : undefined}
      >
        <t.icon size={20} />
        <span>{t.label}</span>
      </button>
    ))}
  </nav>
);
