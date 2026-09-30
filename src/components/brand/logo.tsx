import { cn } from "@/lib/format";

/**
 * China-in-Ghana mark: a rounded "home" tile (appliances for the home) with a
 * spark (bright deals) — navy base, orange + sun accents.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#16306E" />
      <path d="M10 19.5 20 11l10 8.5V29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" fill="#fff" />
      <rect x="15.5" y="20.5" width="9" height="10.5" rx="2" fill="#FF6B1A" />
      <circle cx="30.5" cy="10" r="4" fill="#FFC83D" />
    </svg>
  );
}

export function Logo({ className, inverted = false, compact = false }: { className?: string; inverted?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className={cn("font-display text-[19px] leading-none font-black tracking-tight", inverted ? "text-white" : "text-navy-900")}>
          China<span className="text-brand-orange">-in-</span>Ghana
        </span>
      )}
    </span>
  );
}
