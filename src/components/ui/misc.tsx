import { Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

type Tone = "navy" | "orange" | "sun" | "fresh" | "alert" | "neutral";

const tones: Record<Tone, string> = {
  navy: "bg-navy-50 text-navy-700",
  orange: "bg-brand-orange-soft text-brand-orange-dark",
  sun: "bg-sun-soft text-sun-ink",
  fresh: "bg-fresh-soft text-fresh-ink",
  alert: "bg-alert-soft text-alert-ink",
  neutral: "bg-surface text-ink-soft ring-1 ring-inset ring-line",
};

export function Badge({ tone = "navy", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-line/60", className)}>{children}</div>;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-10 text-ink-soft", className)} role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">{icon}</div>}
      <p className="font-display text-lg font-bold text-navy-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "navy",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
        {icon && <span className={cn("flex size-8 items-center justify-center rounded-lg", tones[tone])}>{icon}</span>}
      </div>
      <p className="mt-1 font-display text-2xl font-bold text-navy-900">{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-ink-soft">{sub}</p>}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-900 md:text-[28px]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
