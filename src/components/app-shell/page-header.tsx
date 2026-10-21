import { cn } from "@/lib/utils";

// Заголовок экрана: название, пояснение и действия справа.
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className,
      )}
    >
      <div className="grid min-w-0 gap-1">
        {eyebrow && (
          <div className="text-muted-foreground text-sm">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Карточка с одной цифрой: обзор и отчёты.
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  footer,
  testId,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "primary";
  footer?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 shadow-xs",
        tone === "primary"
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-sm font-medium",
            tone === "primary"
              ? "text-primary-foreground/80"
              : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-8 place-items-center rounded-lg [&_svg]:size-4",
              tone === "primary"
                ? "bg-primary-foreground/15"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div>
        <p
          className="text-2xl font-semibold tracking-tight tabular-nums"
          data-testid={testId}
        >
          {value}
        </p>
        {hint && (
          <p
            className={cn(
              "mt-1 text-sm",
              tone === "primary"
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        )}
      </div>
      {footer && <div className="mt-auto pt-1">{footer}</div>}
    </div>
  );
}
