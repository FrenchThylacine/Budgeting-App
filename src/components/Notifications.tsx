import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, XCircle, X, Info } from "lucide-react";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
  action?: () => void;
  actionLabel?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const NotificationContext = React.createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = { ...notification, id };

    setNotifications((prev) => [...prev, newNotification]);

    // Auto-remove after duration (default 5s)
    if (notification.duration !== 0) {
      const duration = notification.duration || 5000;
      setTimeout(() => removeNotification(id), duration);
    }

    return id;
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearNotifications }}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
}

function NotificationContainer() {
  const context = React.useContext(NotificationContext);
  if (!context) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {context.notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={() => context.removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onClose: () => void;
}

function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const getIcon = () => {
    switch (notification.type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "info":
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getBgColor = () => {
    switch (notification.type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "info":
        return "bg-blue-50 border-blue-200";
    }
  };

  const getTextColor = () => {
    switch (notification.type) {
      case "success":
        return "text-green-800";
      case "error":
        return "text-red-800";
      case "warning":
        return "text-yellow-800";
      case "info":
        return "text-blue-800";
    }
  };

  return (
    <div className={`${getBgColor()} border rounded-lg p-4 flex items-start gap-3 shadow-md`}>
      {getIcon()}
      <div className="flex-1">
        <p className={`${getTextColor()} text-sm font-medium`}>{notification.message}</p>
        {notification.action && (
          <button
            onClick={() => {
              notification.action?.();
              onClose();
            }}
            className={`${getTextColor()} text-xs font-semibold mt-2 underline hover:no-underline`}
          >
            {notification.actionLabel || "Action"}
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        className={`${getTextColor()} hover:opacity-70 flex-shrink-0`}
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
