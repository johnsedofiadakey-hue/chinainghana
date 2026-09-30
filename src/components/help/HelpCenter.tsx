"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  MessageCircle,
  Package,
  Receipt,
  Rocket,
  Search,
  ShoppingCart,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";
import { cn, waLink } from "@/lib/format";
import { useDocData } from "@/lib/hooks";
import type { License } from "@/lib/types";
import { FAQ, QUICK_START, SECTIONS, type Audience, type HelpIcon, type HelpTopic } from "./content";

const ICONS: Record<HelpIcon, React.ComponentType<{ className?: string }>> = {
  start: Rocket,
  orders: ShoppingCart,
  sales: Receipt,
  products: Package,
  stock: Boxes,
  branches: Building2,
  team: Users,
  reports: BarChart3,
  phone: Smartphone,
};

const visible = <T extends { only?: Audience }>(item: T, who: Audience) => !item.only || item.only === who;

function topicText(t: HelpTopic): string {
  return [t.title, t.summary, ...(t.steps ?? []), ...(t.tips ?? [])].join(" ").toLowerCase();
}

export function HelpCenter({ audience, basePath }: { audience: Audience; basePath: "/admin" | "/manager" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const license = useDocData<License>(audience === "admin" ? "settings/license" : null).data;
  const href = (h: string) => h.replace(/^~/, basePath);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SECTIONS.map((s) => ({
      ...s,
      topics: s.topics.filter((t) => visible(t, audience) && (!q || q.split(/\s+/).every((w) => topicText(t).includes(w)))),
    })).filter((s) => s.topics.length);
  }, [query, audience]);

  const faq = FAQ.filter((f) => visible(f, audience)).filter((f) => {
    const q = query.trim().toLowerCase();
    return !q || q.split(/\s+/).every((w) => `${f.q} ${f.a}`.toLowerCase().includes(w));
  });

  const searching = query.trim().length > 0;
  const results = sections.reduce((n, s) => n + s.topics.length, 0) + faq.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Help"
        description={audience === "admin" ? "How everything works, for you and your managers." : "How to run your branch day to day."}
      />

      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help: receipt, stock…"
          aria-label="Search help"
          className="h-13 w-full rounded-2xl bg-white pl-12 pr-12 text-[15px] shadow-[var(--shadow-card)] ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:bg-navy-50"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!searching && (
        <Card className="mb-8 overflow-hidden">
          <div className="flex items-center gap-3 bg-navy-900 px-5 py-4 text-white">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-orange">
              <Rocket className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold">Getting started</h2>
              <p className="text-[13px] text-navy-200">Do these once and you&apos;re ready to go.</p>
            </div>
          </div>
          <ol className="divide-y divide-line">
            {QUICK_START[audience].map((step, i) => {
              const body = (
                <>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-50 font-display text-sm font-bold text-navy-700">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-navy-900">{step.title}</span>
                    <span className="block text-[13px] text-ink-soft">{step.body}</span>
                  </span>
                  {step.href && <ArrowRight className="mt-1 size-4 shrink-0 text-navy-500" aria-hidden />}
                </>
              );
              return (
                <li key={step.title}>
                  {step.href ? (
                    <Link href={href(step.href)} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-surface">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-5 py-3.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {searching && (
        <p className="mb-4 text-sm text-ink-soft" aria-live="polite">
          {results ? `${results} result${results === 1 ? "" : "s"} for “${query.trim()}”` : `Nothing found for “${query.trim()}”. Try another word, like order, stock or receipt.`}
        </p>
      )}

      <div className="space-y-8">
        {sections.map((section) => {
          const Icon = ICONS[section.icon];
          return (
            <section key={section.id} aria-labelledby={`help-${section.id}`}>
              <h2 id={`help-${section.id}`} className="mb-3 flex items-center gap-2.5 font-display text-lg font-bold text-navy-900">
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-orange-soft text-brand-orange-dark">
                  <Icon className="size-4" />
                </span>
                {section.title}
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {section.topics.map((t) => {
                    const isOpen = searching || open === t.id;
                    const link = t.link && visible(t.link, audience) ? t.link : null;
                    return (
                      <li key={t.id} id={`topic-${t.id}`}>
                        <button
                          type="button"
                          onClick={() => setOpen(open === t.id ? null : t.id)}
                          aria-expanded={isOpen}
                          aria-controls={`topic-body-${t.id}`}
                          className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-surface"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-navy-900">{t.title}</span>
                            <span className="mt-0.5 block text-[13px] text-ink-soft">{t.summary}</span>
                          </span>
                          <ChevronDown className={cn("mt-1 size-5 shrink-0 text-ink-soft transition-transform", isOpen && "rotate-180")} aria-hidden />
                        </button>
                        {isOpen && (
                          <div id={`topic-body-${t.id}`} className="space-y-4 px-5 pb-5">
                            {t.steps && (
                              <ol className="space-y-2.5">
                                {t.steps.map((s, i) => (
                                  <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-navy-900">
                                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-700 text-[12px] font-bold text-white">
                                      {i + 1}
                                    </span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ol>
                            )}
                            {t.tips && (
                              <div className="space-y-1.5 rounded-xl bg-sun-soft p-3.5">
                                {t.tips.map((tip, i) => (
                                  <p key={i} className="flex gap-2 text-[13px] leading-relaxed text-sun-ink">
                                    <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
                                    <span>{tip}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                            {link && (
                              <Link href={href(link.href)}>
                                <Button variant="secondary" size="sm">
                                  {link.label} <ArrowRight className="size-4" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          );
        })}

        {faq.length > 0 && (
          <section aria-labelledby="help-faq">
            <h2 id="help-faq" className="mb-3 flex items-center gap-2.5 font-display text-lg font-bold text-navy-900">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-orange-soft text-brand-orange-dark">
                <CircleHelp className="size-4" />
              </span>
              Something&apos;s not working
            </h2>
            <Card className="divide-y divide-line">
              {faq.map((f) => (
                <div key={f.q} className="px-5 py-4">
                  <p className="text-[15px] font-semibold text-navy-900">{f.q}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{f.a}</p>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>

      <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-display text-base font-bold text-navy-900">Still stuck?</p>
          <p className="text-[13px] text-ink-soft">
            {audience === "admin" ? "Message technical support on WhatsApp." : "Message the admin. They can reset passwords and fix branch details."}
          </p>
        </div>
        {audience === "admin" && license?.supportWhatsApp && (
          <a href={waLink(license.supportWhatsApp, "Hello, I need help with the China-in-Ghana app.")} target="_blank" rel="noopener noreferrer">
            <Button variant="whatsapp">
              <MessageCircle className="size-4" /> Get support
            </Button>
          </a>
        )}
      </Card>
    </div>
  );
}
