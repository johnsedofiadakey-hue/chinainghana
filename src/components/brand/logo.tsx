import { cn } from "@/lib/format";
import { BRAND, HOUSE_PATH, STAR_POINTS } from "./mark.mjs";

/**
 * China-in-Ghana "Star home" mark: a house (home appliances) with a gold star —
 * both Ghana's and China's flags carry stars. Geometry lives in ./mark.mjs.
 */
export function LogoMark({ className, variant = "navy" }: { className?: string; variant?: "navy" | "orange" }) {
  const tile = variant === "orange" ? BRAND.orange : BRAND.navy;
  const star = variant === "orange" ? BRAND.navyDark : BRAND.sun;
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill={tile} />
      <path d={HOUSE_PATH} fill={BRAND.white} />
      <polygon points={STAR_POINTS} fill={star} />
    </svg>
  );
}

export function Logo({ className, inverted = false, compact = false }: { className?: string; inverted?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* On navy backgrounds the orange tile keeps the mark from disappearing. */}
      <LogoMark variant={inverted ? "orange" : "navy"} />
      {!compact && (
        <span className={cn("font-display text-[19px] leading-none font-black tracking-tight", inverted ? "text-white" : "text-navy-900")}>
          China<span className="text-brand-orange">-in-</span>Ghana
        </span>
      )}
    </span>
  );
}
