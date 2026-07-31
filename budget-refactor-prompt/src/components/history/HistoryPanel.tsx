import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { History } from "lucide-react";

export const HistoryPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx HistoryPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="History">
        <EmptyState
          icon=<History size={24} />
          title="History"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
