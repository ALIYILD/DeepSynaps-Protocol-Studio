import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:brightness-110",
  secondary: "soft-panel text-[var(--text)] hover:border-[var(--accent)]",
  ghost: "text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
