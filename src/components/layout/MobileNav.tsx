import React, { useState } from "react";
import {
  LayoutDashboard, Receipt, Wallet, BarChart3, MoreHorizontal,
  ListTodo, Gift, FlaskConical, Clock, Tags, Settings, X,
} from "lucide-react";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const mobileTabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "spending", label: "Spend", icon: Receipt },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Stats", icon: BarChart3 },
];

const moreTabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "activities", label: "Activities", icon: ListTodo },
  { key: "wishlist", label: "Wishlist", icon: Gift },
  { key: "categories", label: "Categories", icon: Tags },
  { key: "history", label: "History", icon: Clock },
  { key: "scenarios", label: "Scenarios", icon: FlaskConical },
  { key: "settings", label: "Settings", icon: Settings },
];

export const MobileNav: React.FC<{ activeTab: TabKey; setActiveTab: (t: TabKey) => void }> = ({ activeTab, setActiveTab }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreTabs.some((t) => t.key === activeTab);

  return (
    <>
      {moreOpen && (
        <div
          className="mobile-more-overlay"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <div
            className="mobile-more-sheet"
            role="dialog"
            aria-label="More sections"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-more-header">
              <span className="text-title">More</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mobile-more-grid">
              {moreTabs.map((t) => (
                <button
                  key={t.key}
                  className={`mobile-more-item ${activeTab === t.key ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab(t.key);
                    setMoreOpen(false);
                  }}
                >
                  <t.icon size={20} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileTabs.map((t) => (
          <button
            key={t.key}
            className={`mobile-nav-item ${activeTab === t.key ? "active" : ""}`}
            onClick={() => {
              setActiveTab(t.key);
              setMoreOpen(false);
            }}
            aria-current={activeTab === t.key ? "page" : undefined}
          >
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        ))}
        <button
          className={`mobile-nav-item ${moreActive || moreOpen ? "active" : ""}`}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
};
