import { NavLink } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-[var(--text-muted)]">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <span className="select-none text-[var(--border)] px-0.5" aria-hidden="true">
                /
              </span>
            )}
            {isLast || !item.to ? (
              <span
                className={isLast ? "font-medium text-[var(--text)]" : ""}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            ) : (
              <NavLink
                to={item.to}
                className="hover:text-[var(--accent)] transition-colors"
              >
                {item.label}
              </NavLink>
            )}
          </span>
        );
      })}
    </nav>
  );
}
