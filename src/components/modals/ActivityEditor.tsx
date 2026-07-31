import React from "react";

interface ActivityEditorProps {
  onClose: () => void;
  activity?: any; onSave?: (d: any) => void
}

export const ActivityEditor: React.FC<ActivityEditorProps> = ({ onClose, activity, onSave }) => {
  // TODO: Migrate full logic from original App.tsx
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-title">Edit Activity</h2>
        <p className="text-caption">This modal is being migrated to the new design system.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
