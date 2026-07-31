import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { Gift } from "lucide-react";

export const WishlistPanel: React.FC = () => {
  // TODO: Migrate full logic from original App.tsx WishlistPanel
  // This is a placeholder using the new design system
  return (
    <div className="page-enter">
      <Section title="Wishlist">
        <EmptyState
          icon=<Gift size={24} />
          title="Wishlist"
          description="This section is being migrated to the new design system. The full functionality will be restored."
        />
      </Section>
    </div>
  );
};
