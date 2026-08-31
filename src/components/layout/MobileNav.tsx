import React, { useState } from "react";
import type { TabKey } from "../../domain/tabs";
import {
  LayoutDashboard, Receipt, Wallet, BarChart3, MoreHorizontal,
  ListTodo, Gift, FlaskConical, Clock, Tags, Settings, Coins, X, FileText } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";


const mobileTabs: { key: TabKey; labelKey: string; icon: React.ElementType }[] = [
  { key: "dashboard", labelKey: "nav.home", icon: LayoutDashboard },
  { key: "spending", labelKey: "nav.spend", icon: Receipt },
  { key: "wallet", labelKey: "nav.wallet", icon: Wallet },
  { key: "analytics", labelKey: "nav.stats", icon: BarChart3 },
];

const moreTabs: { key: TabKey; labelKey: string; icon: React.ElementType }[] = [
  { key: "activities", labelKey: "nav.activities", icon: ListTodo },
  { key: "wishlist", labelKey: "nav.wishlist", icon: Gift },
  { key: "categories", labelKey: "nav.categories", icon: Tags },
  { key: "report", labelKey: "nav.report", icon: FileText },
  { key: "scenarios", labelKey: "nav.scenarios", icon: FlaskConical },
  { key: "settings", labelKey: "nav.settings", icon: Settings },
];

export const MobileNav: React.FC<{ activeTab: TabKey; setActiveTab: (t: TabKey) => void }> = ({ activeTab, setActiveTab }) => {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreTabs.some((tab) => tab.key === activeTab);

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
            aria-label={t("nav.moreSections")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-more-header">
              <span className="text-title">{t("nav.more")}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setMoreOpen(false)}
                aria-label={t("nav.closeMenu")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mobile-more-grid">
              {moreTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`mobile-more-item ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setMoreOpen(false);
                  }}
                >
                  <tab.icon size={20} />
                  <span>{t(tab.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav" aria-label={t("nav.mobileNavigation")}>
        {mobileTabs.map((tab) => (
          <button
            key={tab.key}
            className={`mobile-nav-item ${activeTab === tab.key ? "active" : ""}`}
            data-tab={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setMoreOpen(false);
            }}
            aria-current={activeTab === tab.key ? "page" : undefined}
          >
            <tab.icon size={20} />
            <span>{t(tab.labelKey)}</span>
          </button>
        ))}
        <button
          className={`mobile-nav-item ${moreActive || moreOpen ? "active" : ""}`}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
        >
          <MoreHorizontal size={20} />
          <span>{t("nav.more")}</span>
        </button>
      </nav>
    </>
  );
};
