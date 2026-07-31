import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { Wallet } from "lucide-react";

export const WalletPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx WalletPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="Wallet">
        <EmptyState
          icon=<Wallet size={24} />
          title="Wallet"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
