import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell as BarCell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Bot, ShieldHalf } from "lucide-react";

import { PageHeading } from "@/components/admin/shell";
import {
  Cell,
  DataTable,
  Eyebrow,
  Panel,
  Pill,
  Row,
  StatTile,
  type PillTone,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/anticheat")({
  head: () => ({
    meta: [
      { title: "Anti-Cheat — 1320 Legends Race Control" },
      {
        name: "description",
        content: "Plausibility thresholds, enforcement policy and Ichiban's detection review.",
      },
      { property: "og:title", content: "Anti-Cheat — 1320 Legends Race Control" },
      {
        property: "og:description",
        content: "Plausibility thresholds, enforcement policy and Ichiban's detection review.",
      },
    ],
  }),
  component: AntiCheatPage,
});

/* ------------------------------------------------------------------ config */

type ParamKey = "minEt" | "maxEt" | "maxTs" | "flagMute" | "flagBan" | "flagWindow";

type ParamDef = {
  key: ParamKey;
  name: string;
  envKey: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  note: string;
};

const PARAMS: ParamDef[] = [
  { key: "minEt", name: "Min elapsed time", envKey: "MIN_ET", min: 2, max: 6, step: 0.1, unit: "s", note: "A quarter-mile faster than this is physically impossible." },
  { key: "maxEt", name: "Max elapsed time", envKey: "MAX_ET", min: 30, max: 120, step: 1, unit: "s", note: "Runs longer than this count as a stall / abandon." },
  { key: "maxTs", name: "Max trap speed", envKey: "MAX_TS", min: 180, max: 320, step: 5, unit: "mph", note: "Top-end speed ceiling at the traps." },
  { key: "flagMute", name: "Flags → auto-mute", envKey: "FLAG_MUTE_THRESHOLD", min: 1, max: 10, step: 1, unit: "", note: "Flagged runs in the window before a cheat mute." },
  { key: "flagBan", name: "Flags → ban review", envKey: "FLAG_BAN_THRESHOLD", min: 3, max: 20, step: 1, unit: "", note: "Escalates to a ban recommendation for staff." },
  { key: "flagWindow", name: "Flag window", envKey: "FLAG_WINDOW_HOURS", min: 1, max: 72, step: 1, unit: "h", note: "Rolling window that counts toward the thresholds." },
];

const DEFAULTS: Record<ParamKey, number> = {
  minEt: 3,
  maxEt: 60,
  maxTs: 250,
  flagMute: 3,
  flagBan: 6,
  flagWindow: 24,
};

const DEFAULT_DURATIONS = [
  { category: "Profanity", minutes: 15, tone: "neutral" as PillTone },
  { category: "Other", minutes: 30, tone: "neutral" as PillTone },
  { category: "Harassment", minutes: 60, tone: "warning" as PillTone },
  { category: "Cheat", minutes: 120, tone: "danger" as PillTone },
];

/* ------------------------------------------------------------- sample data */

type Detection = {
  id: string;
  username: string;
  accountId: number;
  category: "cheat" | "glitch" | "tuning";
  confidence: number;
  severity: "high" | "mid" | "low";
  analysis: string;
  recommendation: string;
};

const SAMPLE_DETECTIONS: Detection[] = [
  {
    id: "d1",
    username: "noskid99",
    accountId: 2231,
    category: "cheat",
    confidence: 92,
    severity: "high",
    analysis:
      "Four sub-3.0s quarter-mile runs in 11 minutes on a 180 hp starter car. ET is below the physical floor and inconsistent with the car's dyno — matches ET injection, not a tuning edge case.",
    recommendation: "120-minute cheat mute + void the 4 purses ($4,000).",
  },
  {
    id: "d2",
    username: "DMKZ",
    accountId: 2624,
    category: "glitch",
    confidence: 64,
    severity: "mid",
    analysis:
      "One 2.9s run among 30 clean races. Reaction time and trap speed are plausible; likely a client timing glitch on a laggy connection rather than tampering.",
    recommendation: "Flag only, no action — watch for a repeat.",
  },
  {
    id: "d3",
    username: "EL GABO RACING",
    accountId: 1922,
    category: "tuning",
    confidence: 38,
    severity: "low",
    analysis:
      "Trap speed 3 mph over the ceiling on a fully-built S-class car. Within tuning tolerance; the ceiling may be slightly low for this class.",
    recommendation: "Raise MAX_TS review for S-class rather than penalize.",
  },
];

type FlaggedRun = {
  id: string;
  username: string;
  accountId: number;
  car: string;
  et: number;
  trap: number;
  reason: string;
  verdict: string;
  status: "muting" | "review" | "cleared" | "flagged";
};

const SAMPLE_FLAGGED: FlaggedRun[] = [
  { id: "f1", username: "noskid99", accountId: 2231, car: "Integra GSR · 180hp", et: 2.41, trap: 142, reason: "below MIN_ET", verdict: "cheat · 92%", status: "muting" },
  { id: "f2", username: "DMKZ", accountId: 2624, car: "Skyline R34 · 611hp", et: 2.9, trap: 188, reason: "below MIN_ET", verdict: "glitch · 64%", status: "review" },
  { id: "f3", username: "kuxika", accountId: 1386, car: "Supra · 720hp", et: 8.11, trap: 253, reason: "over MAX_TS", verdict: "tuning · 38%", status: "cleared" },
  { id: "f4", username: "Francisco si", accountId: 2330, car: "RX-7 · 505hp", et: 1.98, trap: 201, reason: "below MIN_ET", verdict: "cheat · 88%", status: "flagged" },
  { id: "f5", username: "Andy Midd", accountId: 2105, car: "Civic · 240hp", et: 61.4, trap: 9, reason: "over MAX_ET", verdict: "abandon", status: "cleared" },
];

const SAMPLE_TREND = [3, 2, 4, 3, 5, 4, 6, 5, 7, 9, 6, 8, 4, 7].map((flagged, i) => ({
  day: `D${i + 1}`,
  flagged,
}));

function statusTone(status: FlaggedRun["status"]): PillTone {
  if (status === "muting" || status === "flagged") return "danger";
  if (status === "review") return "warning";
  if (status === "cleared") return "success";
  return "neutral";
}

function categoryTone(category: Detection["category"]): PillTone {
  if (category === "cheat") return "danger";
  if (category === "glitch") return "warning";
  return "info";
}

function fmt(value: number, unit: string): string {
  if (unit === "s") return `${value.toFixed(value < 10 ? 2 : 1)}s`;
  if (unit === "mph") return `${value} mph`;
  if (unit === "h") return `${value}h`;
  return String(value);
}

/* ------------------------------------------------------------------- page */

function AntiCheatPage() {
  const [enabled, setEnabled] = useState(true);
  const [params, setParams] = useState<Record<ParamKey, number>>(DEFAULTS);
  const [durations, setDurations] = useState(DEFAULT_DURATIONS);
  const [dirty, setDirty] = useState(false);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  // The backend anti-cheat admin endpoints are being wired; this screen degrades to sample data.
  const config = useQuery({
    queryKey: ["admin", "anticheat", "config"],
    queryFn: () => api<{ enabled?: boolean; params?: Partial<Record<ParamKey, number>> }>("/api/admin/anticheat/config"),
    retry: false,
  });
  const usingSample = config.isError || !config.data;

  const detections = SAMPLE_DETECTIONS.filter((d) => !resolved[d.id]);

  const maxTrend = useMemo(() => Math.max(...SAMPLE_TREND.map((t) => t.flagged)), []);

  function setParam(key: ParamKey, value: number) {
    setParams((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }

  function resolve(id: string, outcome: string) {
    setResolved((r) => ({ ...r, [id]: outcome }));
  }

  return (
    <>
      <PageHeading
        title="Anti-Cheat"
        subtitle="Server-authoritative race validation. These thresholds drive flagging; Ichiban reviews every flag and recommends enforcement."
        actions={usingSample ? <Pill tone="warning">Sample data</Pill> : <Pill tone="success">Live</Pill>}
      />

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Flagged runs · 24h" value="37" hint="▲ 11 vs yesterday" tone="danger" />
        <StatTile label="Auto-mutes · 24h" value="6" hint="3 cheat · 3 other" />
        <StatTile label="Pending agent review" value={String(detections.length)} hint="oldest 8m ago" tone="warning" />
        <StatTile label="False-positive rate" value="2.1%" hint="▼ 0.6pt this week" tone="success" />
      </div>

      {/* Master toggle */}
      <section className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-panel">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
          aria-label="Anti-cheat enabled"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Anti-cheat is{" "}
            <span className={enabled ? "text-success" : "text-destructive"}>
              {enabled ? "ON" : "OFF"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Flagging + Ichiban escalation on the race server.{" "}
            <span className="numeric text-muted-foreground/80">
              ANTICHEAT_ENABLED={enabled ? "1" : "0"}
            </span>{" "}
            · turn off only for end-to-end test runs.
          </p>
        </div>
        <Pill tone="neutral">policy v4</Pill>
      </section>

      {/* Parameters */}
      <Panel
        title="Plausibility parameters"
        note="applies to race server + challenge submit"
        className="mt-4"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setParams(DEFAULTS);
                setDurations(DEFAULT_DURATIONS);
                setDirty(false);
              }}
            >
              Reset
            </Button>
            <Button size="sm" disabled={!dirty} onClick={() => setDirty(false)}>
              Save policy v5
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PARAMS.map((p) => (
            <div key={p.key} className="rounded-lg border border-border bg-surface/70 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="numeric text-base font-semibold text-primary">
                  {fmt(params[p.key], p.unit)}
                </span>
              </div>
              <Slider
                className="mt-3"
                value={[params[p.key]]}
                min={p.min}
                max={p.max}
                step={p.step}
                onValueChange={([v]) => setParam(p.key, v ?? params[p.key])}
              />
              <div className="numeric mt-1 flex justify-between text-[0.625rem] text-muted-foreground">
                <span>{p.min}</span>
                <span>{p.max}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {p.note} <span className="numeric text-muted-foreground/70">{p.envKey}</span>
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Ichiban review */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Bot className="size-4 text-primary" aria-hidden /> Ichiban — anti-cheat review
            </span>
          }
          note="each flag explained, with a recommended action"
        >
          <div className="flex flex-col gap-3">
            {detections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No detections waiting on review.
              </div>
            ) : (
              detections.map((d) => (
                <article key={d.id} className="flex gap-3 rounded-lg border border-border bg-surface/70 p-3.5">
                  <span
                    className={cn(
                      "mt-0.5 w-1 shrink-0 rounded-full",
                      d.severity === "high" ? "bg-destructive" : d.severity === "mid" ? "bg-warning" : "bg-info",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{d.username}</span>
                      <span className="numeric text-xs text-muted-foreground">#{d.accountId}</span>
                      <Pill tone={categoryTone(d.category)}>{d.category}</Pill>
                      <Pill tone="warning">{d.confidence}% conf</Pill>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{d.analysis}</p>
                    <p className="mt-2 text-sm">
                      Recommends <span className="font-medium text-foreground">{d.recommendation}</span>
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => resolve(d.id, "enforced")}>
                        Enforce
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolve(d.id, "approved")}>
                        Approve, no action
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolve(d.id, "dismissed")}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          {/* Trend */}
          <Panel title="Flagged runs · 14 days" note={`peak ${maxTrend}`}>
            <div className="h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SAMPLE_TREND} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="day" hide />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--color-muted-foreground)" }}
                  />
                  <Bar dataKey="flagged" radius={[3, 3, 0, 0]}>
                    {SAMPLE_TREND.map((entry, i) => (
                      <BarCell
                        key={i}
                        fill={entry.flagged >= 7 ? "var(--color-destructive)" : "var(--color-primary)"}
                        fillOpacity={entry.flagged >= 7 ? 0.9 : 0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Enforcement durations */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ShieldHalf className="size-4 text-muted-foreground" aria-hidden /> Enforcement policy
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              {durations.map((d, i) => (
                <div key={d.category} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Pill tone={d.tone}>{d.category}</Pill>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={d.minutes}
                      onChange={(e) => {
                        const minutes = Number(e.target.value);
                        setDurations((prev) => prev.map((row, j) => (j === i ? { ...row, minutes } : row)));
                        setDirty(true);
                      }}
                      className="numeric h-8 w-20 text-right"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Durations are editable per category and double on repeat within the window.
            </p>
          </Panel>
        </div>
      </div>

      {/* Flagged runs */}
      <Panel title="Recent flagged runs" note="live feed · race server" className="mt-4">
        <DataTable head={["Racer", "Car", "ET", "Trap", "Reason", "Agent verdict", "Status"]}>
          {SAMPLE_FLAGGED.map((run) => (
            <Row key={run.id}>
              <Cell>
                <span className="font-medium">{run.username}</span>
                <span className="numeric ml-1.5 text-xs text-muted-foreground">#{run.accountId}</span>
              </Cell>
              <Cell className="text-muted-foreground">{run.car}</Cell>
              <Cell mono className={run.et < 3 ? "text-destructive" : run.et > 60 ? "text-warning" : ""}>
                {run.et.toFixed(2)}s
              </Cell>
              <Cell mono className={run.trap > 250 ? "text-warning" : "text-muted-foreground"}>
                {run.trap}
              </Cell>
              <Cell className="text-muted-foreground">{run.reason}</Cell>
              <Cell className="text-muted-foreground">{run.verdict}</Cell>
              <Cell>
                <Pill tone={statusTone(run.status)}>{run.status}</Pill>
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
