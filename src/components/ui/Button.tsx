import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = "secondary", 
  size = "md", 
  icon = false,
  children, 
  className = "",
  ...props 
}) => {
  const sizeClass = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  const iconClass = icon ? "btn-icon" : "";
  return (
    <button className={`btn btn-${variant} ${sizeClass} ${iconClass} ${className}`} {...props}>
      {children}
    </button>
  );
};
