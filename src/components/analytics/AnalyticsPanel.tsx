import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { BarChart3 } from "lucide-react";

export const AnalyticsPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx AnalyticsPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="Analytics">
        <EmptyState
          icon=<BarChart3 size={24} />
          title="Analytics"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
