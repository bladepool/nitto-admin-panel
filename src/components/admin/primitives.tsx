import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/admin-api";

export function Panel({
  title,
  note,
  actions,
  count,
  children,
  className,
}: {
  title?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  count?: number | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card shadow-panel backdrop-blur-sm",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised/60 px-4 py-3">
          <div className="flex items-baseline gap-3">
            {title && (
              <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
            )}
            {typeof count === "number" && <Count value={count} />}
            {note && <span className="text-xs text-muted-foreground">{note}</span>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Count({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "numeric rounded-full px-2 py-0.5 text-xs font-bold",
        value > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="label-eyebrow">{children}</span>;
}

const pillTones = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  primary: "border-primary/40 bg-primary/15 text-primary",
  accent: "border-accent/40 bg-accent/15 text-accent",
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  danger: "border-destructive/45 bg-destructive/15 text-destructive",
  info: "border-info/40 bg-info/15 text-info",
} as const;

export type PillTone = keyof typeof pillTones;

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em]",
        pillTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "primary" | "warning" | "danger" | "success";
}) {
  const valueTone = {
    neutral: "text-foreground",
    primary: "text-primary",
    warning: "text-warning",
    danger: "text-destructive",
    success: "text-success",
  }[tone];

  return (
    <div className="rounded-[10px] border border-border bg-surface px-3.5 py-3">
      <Eyebrow>{label}</Eyebrow>
      <div className={cn("font-wordmark mt-1.5 text-[1.75rem] leading-[1.1] font-extrabold italic tabular-nums", valueTone)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-5 opacity-60" aria-hidden />
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

/**
 * One consistent failure surface. A 404 from an admin endpoint means the API
 * is not served here, which reads very differently from a real server error.
 */
export function ErrorState({ error, what }: { error: unknown; what: string }) {
  const offline = error instanceof ApiError && error.offline;
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div>
        <p className="font-semibold text-foreground">
          {offline ? `${what} isn't available here` : `Couldn't load ${what}`}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {offline
            ? "This screen reads live data from the game server. Connect it to see real numbers."
            : message}
        </p>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </label>
  );
}

export function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="scroll-slim -mx-1 overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-sm">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                className="label-eyebrow border-b border-border bg-[#11151b] px-2.5 py-2.5 text-left font-semibold"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn(
        "border-b border-border/70 transition-colors hover:bg-surface-raised/50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  className,
  mono,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td className={cn("px-2.5 py-2.5 align-top", mono && "numeric", className)}>{children}</td>
  );
}
