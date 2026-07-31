import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { Settings } from "lucide-react";

export const SettingsPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx SettingsPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="Settings">
        <EmptyState
          icon=<Settings size={24} />
          title="Settings"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
