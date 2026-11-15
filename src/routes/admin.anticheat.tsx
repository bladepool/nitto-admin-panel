import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, Cell as BarCell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Eye, ShieldQuestion } from "lucide-react";

import { PageHeading } from "@/components/admin/shell";
import {
  Cell,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Panel,
  Pill,
  Row,
  StatTile,
  type PillTone,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, buildQuery, dateLabel, getGameAuth, integer, money } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

/*
 * Anti-cheat: monitor and learn. The game server records every finished run and runs each rule in
 * MONITOR mode (nothing is enforced). This page shows what enforce WOULD have done, lets staff label each
 * signal legit / cheat (per-rule precision), and shows the distributions thresholds should come from.
 * API: /api/admin/anticheat/* (apps/api/src/anticheat/routes.ts).
 */

export const Route = createFileRoute("/admin/anticheat")({
  head: () => ({
    meta: [
      { title: "Anti-Cheat — Racing Legends Race Control" },
      { name: "description", content: "Monitor-mode anti-cheat: what each rule would have flagged, staff review and precision." },
      { property: "og:title", content: "Anti-Cheat — Racing Legends Race Control" },
      { property: "og:description", content: "Monitor-mode anti-cheat: what each rule would have flagged, staff review and precision." },
    ],
  }),
  component: AntiCheatPage,
});

/* ------------------------------------------------------------------ types */

type RuleRow = {
  rule: string;
  severity: "high" | "medium" | "low";
  what: string;
  wouldDo: string;
  voidsRun: boolean;
  signals: number;
  players: number;
  runs: number;
  legit: number;
  cheat: number;
  unreviewed: number;
  precision: number | null;
  wouldVoidWins: number;
  wouldWithholdMoney: number;
  wouldWithholdSc: number;
};
type Overview = {
  mode: "off" | "monitor" | "enforce";
  days: number;
  thresholds: Record<string, unknown>;
  totals: { runs: number; players: number; finished: number; money: number } | null;
  byMode: Array<{ mode: string; runs: number; players: number }>;
  rules: RuleRow[];
  wouldEnforce: { runs: number; players: number; wins: number; money: number } | null;
  trend: Array<{ day: string; rule: string; n: number }>;
  threats: Array<{ signal: string; events: number; players: number; actions: string }>;
};
type Signal = {
  id: number;
  at: string;
  rule: string;
  severity: string;
  playerId: number;
  username: string | null;
  mode: string | null;
  raceKey: string | null;
  value: number | null;
  threshold: number | null;
  evidence: Record<string, unknown> | null;
  verdict: "legit" | "cheat" | null;
  verdictBy: string | null;
  verdictNote: string | null;
  et: number | null;
  predEt: number | null;
  etRatio: number | null;
  won: boolean | null;
  payout: number | null;
  hp: number | null;
  induction: string | null;
  carClass: string | null;
};
type Run = {
  id: number;
  at: string;
  mode: string;
  carId: number | null;
  opponentId: number | null;
  et: number | null;
  rt: number | null;
  rtNorm: number | null;
  ts: number | null;
  bt: number | null;
  won: boolean | null;
  payout: number;
  scDelta: number;
  rtMsgs: number | null;
  hp: number | null;
  induction: string | null;
  predEt: number | null;
  etRatio: number | null;
  rules: string[];
};
type Drill = {
  player: { id: number; username: string; clientRole: number; bannedAt: string | null };
  stats: { runs: number; wins: number; money: number; sc: number; rtMean: number | null; rtStdev: number | null; redLights: number; etRatioMin: number | null; etRatioMedian: number | null; opponents: number };
  opponents: Array<{ opponentId: number; username: string | null; races: number; wins: number; money: number }>;
  runs: Run[];
  signals: Signal[];
  threats: Array<{ id: number; at: string; signal: string; action: string; detail: unknown }>;
};
type Dist = {
  etRatio: { rows: Array<{ carClass: string; bin: number; n: number; from: number | null }>; percentiles: Array<{ carClass: string; n: number; min: number; p001: number; p01: number; p05: number; p50: number }> };
  rt: { rows: Array<{ mode: string; bin: number; n: number; from: number | null }>; percentiles: Array<{ mode: string; n: number; redLights: number; p001: number | null; p01: number | null; p50: number | null }> };
};

/* ---------------------------------------------------------------- helpers */

const sevTone = (s: string): PillTone => (s === "high" ? "danger" : s === "medium" ? "warning" : "neutral");
const n3 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "—");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function evidenceLine(s: Signal): string {
  const e = s.evidence ?? {};
  switch (s.rule) {
    case "et_under_build_floor":
      return `ET ${n3(e["et"])} vs predicted best ${n3(e["predEt"])} (${pct(s.value)} of it)`;
    case "total_mismatch":
      return `client total ${n3(e["clientTotal"])} vs rt+et ${n3(e["serverTotal"])}`;
    case "rt_superhuman":
      return `reaction ${n3(e["normalized"])} s after a perfect light`;
    case "rt_resend":
      return `${s.value} reaction messages: ${(e["values"] as number[] | undefined)?.join(", ") ?? ""}`;
    case "rt_too_consistent":
      return `stdev ${n3(e["stdev"])} over ${e["n"]} reactions`;
    case "pair_farming":
      return `${e["wins"]}/${e["races"]} wins vs #${e["opponentId"]}, ${money(e["money"])}`;
    case "payout_velocity":
      return `${money(e["money"])} in ${e["windowMin"]} min (${e["runs"]} runs)`;
    case "perfect_dial":
      return `${e["hits"]}/${e["runs"]} runs within ${e["windowS"]} s of the dial`;
    case "finish_before_possible":
      return `finished ${n3(e["serverElapsedS"])} s after open, claimed ET ${n3(e["et"])}`;
    case "unowned_challenge_car":
      return e["missing"] ? `car #${s.value} does not exist` : `car #${s.value} belongs to #${e["ownerId"]}`;
    case "dial_below_floor":
      return `dial ${n3(e["bt"])} vs predicted best ${n3(e["predEt"])}`;
    case "envelope_implausible":
      return `ET ${n3(e["et"])}, trap ${n3(e["ts"])}`;
    default:
      return s.value != null ? `${s.value} (threshold ${s.threshold ?? "—"})` : "";
  }
}

async function downloadCsv(kind: "signals" | "runs", days: number, rule?: string) {
  const auth = getGameAuth();
  const headers: Record<string, string> = { "x-rl-staff": "1" };
  if (auth) headers[auth.mode === "key" ? "x-admin-key" : "Authorization"] = auth.mode === "key" ? auth.token : `Bearer ${auth.token}`;
  try {
    const res = await fetch(`/api/admin/anticheat/export.csv${buildQuery({ kind, days, rule })}`, { credentials: "include", headers });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `anticheat-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/* ------------------------------------------------------------------- page */

function AntiCheatPage() {
  const [days, setDays] = useState(7);
  const [rule, setRule] = useState<string>("");
  const [verdict, setVerdict] = useState<"unreviewed" | "legit" | "cheat" | "all">("unreviewed");
  const [playerFilter, setPlayerFilter] = useState("");
  const [drillId, setDrillId] = useState<number | null>(null);

  const overview = useQuery({
    queryKey: ["admin", "anticheat", "overview", days],
    queryFn: () => api<Overview>(`/api/admin/anticheat/overview${buildQuery({ days })}`),
  });

  const o = overview.data;
  const unreviewed = o?.rules.reduce((s, r) => s + r.unreviewed, 0) ?? 0;

  return (
    <>
      <PageHeading
        title="Anti-Cheat"
        subtitle="Monitor and learn: every finished run is recorded and every rule runs, but nothing is enforced. Label signals to measure each rule before it is ever allowed to act."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {o && (
              <Pill tone={o.mode === "enforce" ? "danger" : o.mode === "monitor" ? "warning" : "neutral"}>
                {o.mode === "monitor" ? "monitor only" : o.mode}
              </Pill>
            )}
            {[7, 14, 30].map((d) => (
              <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
                {d}d
              </Button>
            ))}
          </div>
        }
      />

      {overview.isLoading && <LoadingState label="Loading anti-cheat overview" />}
      {overview.isError && <ErrorState error={overview.error} what="the anti-cheat overview" />}

      {o && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={`Runs recorded · ${o.days}d`} value={integer(o.totals?.runs)} hint={`${integer(o.totals?.players)} racers · ${o.byMode.map((m) => `${m.mode} ${m.runs}`).join(" · ") || "no runs yet"}`} />
            <StatTile
              label="Enforce would have voided"
              value={integer(o.wouldEnforce?.runs)}
              hint={`${integer(o.wouldEnforce?.players)} racers · ${integer(o.wouldEnforce?.wins)} wins · ${money(o.wouldEnforce?.money)} in purses`}
              tone={(o.wouldEnforce?.runs ?? 0) > 0 ? "warning" : "neutral"}
            />
            <StatTile label="Signals to review" value={integer(unreviewed)} hint="label them legit or cheat below" tone={unreviewed > 0 ? "primary" : "neutral"} />
            <StatTile
              label="Labelled"
              value={integer(o.rules.reduce((s, r) => s + r.legit + r.cheat, 0))}
              hint={`${integer(o.rules.reduce((s, r) => s + r.cheat, 0))} cheat · ${integer(o.rules.reduce((s, r) => s + r.legit, 0))} legit`}
              tone="success"
            />
          </div>

          <Panel
            title="What each rule would have done"
            note="click a rule to see its signals · precision = cheat / labelled"
            className="mt-4"
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => void downloadCsv("signals", days, rule || undefined)}>
                  <Download className="size-3.5" aria-hidden /> Signals CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => void downloadCsv("runs", days)}>
                  <Download className="size-3.5" aria-hidden /> Runs CSV
                </Button>
              </>
            }
          >
            <DataTable head={["Rule", "Signals", "Racers", "Runs", "Would void / withhold", "Labelled", "Precision", "If enforced"]}>
              {o.rules.map((r) => (
                <Row key={r.rule} className={cn("cursor-pointer", rule === r.rule && "bg-surface-raised/70")}>
                  <Cell>
                    <button type="button" className="text-left" onClick={() => setRule(rule === r.rule ? "" : r.rule)}>
                      <span className="flex items-center gap-2">
                        <Pill tone={sevTone(r.severity)}>{r.severity}</Pill>
                        <span className="font-mono text-xs font-semibold">{r.rule}</span>
                      </span>
                      <span className="mt-1 block max-w-[28rem] text-xs text-muted-foreground">{r.what}</span>
                    </button>
                  </Cell>
                  <Cell mono>{integer(r.signals)}</Cell>
                  <Cell mono>{integer(r.players)}</Cell>
                  <Cell mono>{integer(r.runs)}</Cell>
                  <Cell mono className="text-muted-foreground">
                    {r.voidsRun ? `${integer(r.wouldVoidWins)} wins · ${money(r.wouldWithholdMoney)} · ${integer(r.wouldWithholdSc)} SC` : "—"}
                  </Cell>
                  <Cell mono className="text-muted-foreground">
                    {r.cheat} cheat · {r.legit} legit
                  </Cell>
                  <Cell mono className={cn(r.precision == null ? "text-muted-foreground" : r.precision >= 0.95 ? "text-success" : r.precision < 0.5 ? "text-destructive" : "text-warning")}>
                    {r.precision == null ? "—" : pct(r.precision)}
                  </Cell>
                  <Cell className="max-w-[16rem] text-xs text-muted-foreground">{r.wouldDo}</Cell>
                </Row>
              ))}
            </DataTable>
          </Panel>

          <Cases
            days={days}
            rule={rule}
            setRule={setRule}
            verdict={verdict}
            setVerdict={setVerdict}
            playerFilter={playerFilter}
            setPlayerFilter={setPlayerFilter}
            onDrill={setDrillId}
            rules={o.rules.map((r) => r.rule)}
          />

          {drillId != null && <PlayerDrill id={drillId} days={Math.max(days, 30)} onClose={() => setDrillId(null)} onDrill={setDrillId} />}

          <Distributions days={Math.max(days, 30)} />

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Threat detector signals" note="threat_events, recorded alongside (THREAT_MODE=log: no auto-bans)">
              {o.threats.length === 0 ? (
                <EmptyState>No threat events in this window.</EmptyState>
              ) : (
                <DataTable head={["Signal", "Events", "Racers", "Action"]}>
                  {o.threats.map((t) => (
                    <Row key={t.signal}>
                      <Cell className="font-mono text-xs">{t.signal}</Cell>
                      <Cell mono>{integer(t.events)}</Cell>
                      <Cell mono>{integer(t.players)}</Cell>
                      <Cell className="text-muted-foreground">{t.actions}</Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
            </Panel>
            <Panel title="Thresholds" note="read-only · ANTICHEAT_THRESHOLDS overrides any key">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {Object.entries(o.thresholds).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-muted-foreground">{k}</dt>
                    <dd className="numeric">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ cases */

function Cases(props: {
  days: number;
  rule: string;
  setRule: (r: string) => void;
  verdict: "unreviewed" | "legit" | "cheat" | "all";
  setVerdict: (v: "unreviewed" | "legit" | "cheat" | "all") => void;
  playerFilter: string;
  setPlayerFilter: (v: string) => void;
  onDrill: (id: number) => void;
  rules: string[];
}) {
  const { days, rule, verdict, playerFilter } = props;
  const queryClient = useQueryClient();
  const player = Number(playerFilter) > 0 ? Number(playerFilter) : undefined;
  const list = useQuery({
    queryKey: ["admin", "anticheat", "signals", days, rule, verdict, player],
    queryFn: () => api<{ total: number; signals: Signal[] }>(`/api/admin/anticheat/signals${buildQuery({ days: Math.max(days, 30), rule, verdict, player, limit: 100 })}`),
  });
  const mark = useMutation({
    mutationFn: (v: { id: number; verdict: "legit" | "cheat" | null }) =>
      api(`/api/admin/anticheat/signals/${v.id}/mark`, { method: "POST", body: { verdict: v.verdict } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "anticheat"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Panel title="Signals" count={list.data?.total} note="label each one: the labels are what precision is computed from" className="mt-4">
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Field label="Rule">
          <select
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            value={rule}
            onChange={(e) => props.setRule(e.target.value)}
          >
            <option value="">all rules</option>
            {props.rules.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label">
          <select
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            value={verdict}
            onChange={(e) => props.setVerdict(e.target.value as typeof verdict)}
          >
            <option value="unreviewed">unreviewed</option>
            <option value="cheat">cheat</option>
            <option value="legit">legit</option>
            <option value="all">all</option>
          </select>
        </Field>
        <Field label="Racer id">
          <Input value={playerFilter} onChange={(e) => props.setPlayerFilter(e.target.value.replace(/\D/g, ""))} placeholder="any" className="h-9" />
        </Field>
      </div>
      {list.isLoading && <LoadingState label="Loading signals" />}
      {list.isError && <ErrorState error={list.error} what="signals" />}
      {list.data && list.data.signals.length === 0 && <EmptyState>No signals match. In monitor mode that is good news.</EmptyState>}
      {list.data && list.data.signals.length > 0 && (
        <DataTable head={["When", "Rule", "Racer", "Evidence", "Run", "Label", ""]}>
          {list.data.signals.map((s) => (
            <Row key={s.id}>
              <Cell className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(s.at)}</Cell>
              <Cell>
                <span className="flex items-center gap-1.5">
                  <Pill tone={sevTone(s.severity)}>{s.severity[0]}</Pill>
                  <span className="font-mono text-xs">{s.rule}</span>
                </span>
              </Cell>
              <Cell>
                <button type="button" className="font-medium hover:underline" onClick={() => props.onDrill(s.playerId)}>
                  {s.username ?? "?"}
                </button>
                <span className="numeric ml-1.5 text-xs text-muted-foreground">#{s.playerId}</span>
              </Cell>
              <Cell className="max-w-[22rem] text-xs">{evidenceLine(s)}</Cell>
              <Cell className="text-xs text-muted-foreground">
                {s.mode}
                {s.won != null && <> · {s.won ? `won ${money(s.payout)}` : "lost"}</>}
                {s.hp != null && <> · {s.hp} hp {s.induction}</>}
              </Cell>
              <Cell>
                {s.verdict ? <Pill tone={s.verdict === "cheat" ? "danger" : "success"}>{s.verdict}</Pill> : <Pill>new</Pill>}
                {s.verdictBy && <span className="ml-1 text-[0.6875rem] text-muted-foreground">{s.verdictBy}</span>}
              </Cell>
              <Cell className="whitespace-nowrap">
                <div className="flex gap-1">
                  <Button size="sm" variant={s.verdict === "cheat" ? "destructive" : "outline"} disabled={mark.isPending} onClick={() => mark.mutate({ id: s.id, verdict: "cheat" })}>
                    Cheat
                  </Button>
                  <Button size="sm" variant={s.verdict === "legit" ? "default" : "outline"} disabled={mark.isPending} onClick={() => mark.mutate({ id: s.id, verdict: "legit" })}>
                    Legit
                  </Button>
                  {s.verdict && (
                    <Button size="sm" variant="ghost" disabled={mark.isPending} onClick={() => mark.mutate({ id: s.id, verdict: null })}>
                      Clear
                    </Button>
                  )}
                </div>
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- drill-down */

function PlayerDrill({ id, days, onClose, onDrill }: { id: number; days: number; onClose: () => void; onDrill: (id: number) => void }) {
  const q = useQuery({
    queryKey: ["admin", "anticheat", "player", id, days],
    queryFn: () => api<Drill>(`/api/admin/anticheat/players/${id}${buildQuery({ days })}`),
  });
  const d = q.data;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Eye className="size-4 text-primary" aria-hidden /> {d ? d.player.username : `Racer #${id}`}
          <span className="numeric text-xs text-muted-foreground">#{id}</span>
          {d?.player.bannedAt && <Pill tone="danger">banned</Pill>}
        </span>
      }
      note={`last ${days} days`}
      className="mt-4"
      actions={
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {q.isLoading && <LoadingState label="Loading racer" />}
      {q.isError && <ErrorState error={q.error} what="this racer" />}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile label="Runs" value={integer(d.stats.runs)} hint={`${integer(d.stats.wins)} wins · ${integer(d.stats.redLights)} red lights`} />
            <StatTile label="Race money" value={money(d.stats.money)} hint={`${integer(d.stats.sc)} SC`} />
            <StatTile label="Reaction" value={n3(d.stats.rtMean)} hint={`stdev ${n3(d.stats.rtStdev)} after a perfect light`} />
            <StatTile label="ET / predicted" value={n3(d.stats.etRatioMedian)} hint={`best ${n3(d.stats.etRatioMin)} (1.000 = the build's perfect run)`} tone={(d.stats.etRatioMin ?? 2) < 0.97 ? "danger" : "neutral"} />
            <StatTile label="Opponents" value={integer(d.stats.opponents)} hint={d.opponents[0] ? `most: ${d.opponents[0].username ?? `#${d.opponents[0].opponentId}`} (${d.opponents[0].races})` : "—"} />
          </div>

          {d.opponents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {d.opponents.map((op) => (
                <button key={op.opponentId} type="button" className="rounded-md border border-border px-2 py-1 hover:bg-surface-raised" onClick={() => onDrill(op.opponentId)}>
                  {op.username ?? `#${op.opponentId}`} · {op.wins}/{op.races} won · {money(op.money)}
                </button>
              ))}
            </div>
          )}

          <h3 className="label-eyebrow mt-4 mb-2">Runs</h3>
          {d.runs.length === 0 ? (
            <EmptyState>No recorded runs.</EmptyState>
          ) : (
            <DataTable head={["When", "Mode", "ET", "Pred.", "Ratio", "RT", "Trap", "Dial", "Result", "Car", "Rules"]}>
              {d.runs.slice(0, 60).map((r) => (
                <Row key={r.id}>
                  <Cell className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(r.at)}</Cell>
                  <Cell className="text-xs">{r.mode}</Cell>
                  <Cell mono>{n3(r.et)}</Cell>
                  <Cell mono className="text-muted-foreground">{n3(r.predEt)}</Cell>
                  <Cell mono className={cn((r.etRatio ?? 2) < 0.97 && "text-destructive")}>{n3(r.etRatio)}</Cell>
                  <Cell mono>
                    {n3(r.rt)}
                    {(r.rtMsgs ?? 0) > 1 && <span className="ml-1 text-warning">×{r.rtMsgs}</span>}
                  </Cell>
                  <Cell mono className="text-muted-foreground">{n3(r.ts)}</Cell>
                  <Cell mono className="text-muted-foreground">{r.bt ? n3(r.bt) : "—"}</Cell>
                  <Cell className="text-xs">{r.won ? `won ${money(r.payout)}` : r.et == null ? "DNF" : "lost"}</Cell>
                  <Cell className="text-xs text-muted-foreground">{r.hp != null ? `${r.hp} hp ${r.induction ?? ""}` : `#${r.carId ?? "?"}`}</Cell>
                  <Cell className="text-xs">{r.rules.length ? r.rules.join(", ") : <span className="text-muted-foreground">—</span>}</Cell>
                </Row>
              ))}
            </DataTable>
          )}

          {d.threats.length > 0 && (
            <>
              <h3 className="label-eyebrow mt-4 mb-2">Threat events</h3>
              <DataTable head={["When", "Signal", "Action", "Detail"]}>
                {d.threats.map((t) => (
                  <Row key={t.id}>
                    <Cell className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(t.at)}</Cell>
                    <Cell className="font-mono text-xs">{t.signal}</Cell>
                    <Cell className="text-xs">{t.action}</Cell>
                    <Cell className="max-w-[28rem] truncate font-mono text-[0.6875rem] text-muted-foreground">{JSON.stringify(t.detail)}</Cell>
                  </Row>
                ))}
              </DataTable>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------- distributions */

function Histogram({ data, mark }: { data: Array<{ label: string; n: number; hot: boolean }>; mark: string }) {
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={32} />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [v, "runs"]}
          />
          <Bar dataKey="n" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <BarCell key={i} fill={d.hot ? "var(--color-destructive)" : "var(--color-primary)"} fillOpacity={d.hot ? 0.9 : 0.6} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[0.6875rem] text-muted-foreground">{mark}</p>
    </div>
  );
}

function Distributions({ days }: { days: number }) {
  const q = useQuery({
    queryKey: ["admin", "anticheat", "dist", days],
    queryFn: () => api<Dist>(`/api/admin/anticheat/distributions${buildQuery({ days })}`),
  });
  const classes = useMemo(() => [...new Set(q.data?.etRatio.rows.map((r) => r.carClass) ?? [])], [q.data]);
  const modes = useMemo(() => [...new Set(q.data?.rt.rows.map((r) => r.mode) ?? [])], [q.data]);
  const [cls, setCls] = useState("");
  const [mode, setMode] = useState("");
  const pickCls = cls || classes[0] || "";
  const pickMode = mode || modes[0] || "";
  const etData = (q.data?.etRatio.rows ?? [])
    .filter((r) => r.carClass === pickCls)
    .map((r) => ({ label: r.from == null ? "<0.80" : r.bin > 40 ? "1.60+" : r.from.toFixed(2), n: r.n, hot: r.from == null || r.from < 0.97 }));
  const rtData = (q.data?.rt.rows ?? [])
    .filter((r) => r.mode === pickMode)
    .map((r) => ({ label: r.from == null ? "red" : r.bin > 60 ? "0.50+" : r.from.toFixed(2), n: r.n, hot: r.from != null && r.from >= 0 && r.from < 0.1 }));

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <ShieldQuestion className="size-4 text-muted-foreground" aria-hidden /> Distributions
        </span>
      }
      note={`last ${days} days · set thresholds from these, not from guesses`}
      className="mt-4"
    >
      {q.isLoading && <LoadingState label="Loading distributions" />}
      {q.isError && <ErrorState error={q.error} what="distributions" />}
      {q.data && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="label-eyebrow mr-1">ET ÷ predicted best</span>
              {classes.map((c) => (
                <Button key={c} size="sm" variant={c === pickCls ? "default" : "outline"} onClick={() => setCls(c)}>
                  {c}
                </Button>
              ))}
            </div>
            {etData.length ? (
              <Histogram data={etData} mark="1.00 = the build's scripted perfect run. Red: below the et_under_build_floor line (0.97). Honest runs should sit at 1.00 and above." />
            ) : (
              <EmptyState>No client-reported runs with a native prediction yet.</EmptyState>
            )}
            <DataTable head={["Class", "Runs", "Min", "p0.1", "p1", "p5", "Median"]}>
              {q.data.etRatio.percentiles.map((p) => (
                <Row key={p.carClass}>
                  <Cell className="text-xs">{p.carClass}</Cell>
                  <Cell mono>{integer(p.n)}</Cell>
                  <Cell mono className={cn(p.min < 0.97 && "text-destructive")}>{n3(p.min)}</Cell>
                  <Cell mono>{n3(p.p001)}</Cell>
                  <Cell mono>{n3(p.p01)}</Cell>
                  <Cell mono>{n3(p.p05)}</Cell>
                  <Cell mono>{n3(p.p50)}</Cell>
                </Row>
              ))}
            </DataTable>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="label-eyebrow mr-1">Reaction after a perfect light</span>
              {modes.map((m) => (
                <Button key={m} size="sm" variant={m === pickMode ? "default" : "outline"} onClick={() => setMode(m)}>
                  {m}
                </Button>
              ))}
            </div>
            {rtData.length ? (
              <Histogram data={rtData} mark="0.00 = a perfect light; negative = red light. Red: the rt_superhuman band (under 0.100 s)." />
            ) : (
              <EmptyState>No reaction times recorded yet.</EmptyState>
            )}
            <DataTable head={["Path", "Runs", "Red lights", "p0.1", "p1", "Median"]}>
              {q.data.rt.percentiles.map((p) => (
                <Row key={p.mode}>
                  <Cell className="text-xs">{p.mode}</Cell>
                  <Cell mono>{integer(p.n)}</Cell>
                  <Cell mono>{integer(p.redLights)}</Cell>
                  <Cell mono>{n3(p.p001)}</Cell>
                  <Cell mono>{n3(p.p01)}</Cell>
                  <Cell mono>{n3(p.p50)}</Cell>
                </Row>
              ))}
            </DataTable>
          </div>
        </div>
      )}
    </Panel>
  );
}
