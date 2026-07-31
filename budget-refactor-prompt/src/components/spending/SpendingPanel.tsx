import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { Receipt } from "lucide-react";

export const SpendingPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx SpendingPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="Spending">
        <EmptyState
          icon=<Receipt size={24} />
          title="Spending"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
