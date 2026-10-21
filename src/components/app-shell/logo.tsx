import { cn } from "@/lib/utils";

// Знак продукта: шар на зелёном сукне. Подпись — название из messages.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <circle cx="16" cy="16" r="8.5" fill="var(--primary-foreground)" />
      <circle cx="16" cy="16" r="3.6" fill="var(--primary)" />
      <circle cx="13.2" cy="12.8" r="1.6" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function Logo({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <LogoMark />
      <span className="truncate">{name}</span>
    </span>
  );
}
