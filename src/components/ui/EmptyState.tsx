import React from "react";
import { Package } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon || <Package size={24} />}</div>
    <div className="text-callout" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{title}</div>
    {description && <div className="text-caption" style={{ maxWidth: 320 }}>{description}</div>}
    {action && <div style={{ marginTop: 8 }}>{action}</div>}
  </div>
);
