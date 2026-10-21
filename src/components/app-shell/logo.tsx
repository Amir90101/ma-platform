import { cn } from "@/lib/utils";

// Знак продукта: схема зала — четыре места, одно занято (отмечено).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="#e0182d" />
      <rect x="7" y="7" width="8" height="8" rx="2.5" fill="#ffffff" />
      <rect x="17" y="7" width="8" height="8" rx="2.5" fill="#ffffff" />
      <rect x="7" y="17" width="8" height="8" rx="2.5" fill="#ffffff" />
      <rect
        x="17"
        y="17"
        width="8"
        height="8"
        rx="2.5"
        fill="#ffffff"
        opacity="0.4"
      />
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
    <span className={cn("flex items-center gap-2.5 font-bold", className)}>
      <LogoMark />
      <span className="truncate">{name}</span>
    </span>
  );
}
