import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { ListTodo } from "lucide-react";

export const ActivityPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx ActivityPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="Activities">
        <EmptyState
          icon=<ListTodo size={24} />
          title="Activities"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
