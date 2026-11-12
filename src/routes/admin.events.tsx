import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

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
import {
  ConfirmButton,
  GameApiCredential,
  NativeSelect,
  RacerPicker,
} from "@/components/admin/game-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  buildQuery,
  dateLabel,
  integer,
  money,
  unixLabel,
  type RacerCard,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/events")({
  head: () => ({
    meta: [
      { title: "Events — Racing Legends Race Control" },
      {
        name: "description",
        content:
          "Award event prizes, complete events, settle prize tables and track trophy supply.",
      },
      { property: "og:title", content: "Events — Racing Legends Race Control" },
      { property: "og:description", content: "Award event prizes and track trophy supply." },
    ],
  }),
  component: EventsPage,
});

type PrizeKind = "car" | "part" | "badge" | "money" | "points";

const PRIZE_KINDS: Array<{ value: PrizeKind; label: string; ref: string }> = [
  { value: "car", label: "Car", ref: "catalog car id" },
  { value: "part", label: "Part", ref: "catalog part id" },
  { value: "badge", label: "Badge", ref: "badge key" },
  { value: "money", label: "Money", ref: "amount" },
  { value: "points", label: "Points", ref: "amount" },
];

type CompleteResult = {
  accountId: number | string;
  kind?: string;
  refId?: string;
  status: "granted" | "already" | "exhausted" | "error" | string;
  detail?: string;
};

type PrizeLine = {
  place: number;
  playerId: number;
  name: string;
  seed: number;
  elimPlacement: number;
  badge: string;
  wheel: number | null;
  money: number;
  points: number;
  alreadyPaid: number;
};

type Standing = {
  rank: number;
  playerId: number;
  name: string;
  points: number;
  events: number;
  wins: number;
};

type Series = {
  id: number;
  name: string;
  slotIds: number[];
  startsAt: number | null;
  endsAt: number | null;
  status: "draft" | "active" | "closed" | string;
  trophies: Array<{ place: number; carId: number }>;
  standings: Standing[];
};

type LimitedCar = {
  carId: number;
  prefix: string;
  cap: number;
  onSale: boolean;
  sold: number;
  left: number;
  dealerLid: number;
  display: { hp?: number; tq?: number; weight?: number; et?: string } | null;
};

const gameKey = (...parts: unknown[]) => ["game", "events", ...parts];

function resultTone(status: string): PillTone {
  if (status === "granted") return "success";
  if (status === "already") return "neutral";
  if (status === "exhausted") return "warning";
  return "danger";
}

const prizeRefHint = (kind: string) => PRIZE_KINDS.find((item) => item.value === kind)?.ref ?? "";

function EventsPage() {
  return (
    <>
      <PageHeading
        title="Events"
        subtitle="Prize awards, event completion, trophy supply, prize-table settlement, series and limited cars."
      />
      <GameApiCredential />
      <Tabs defaultValue="awards">
        <TabsList className="flex-wrap">
          <TabsTrigger value="awards">Awards</TabsTrigger>
          <TabsTrigger value="supply">Supply</TabsTrigger>
          <TabsTrigger value="settle">Prize settlement</TabsTrigger>
          <TabsTrigger value="series">Series</TabsTrigger>
          <TabsTrigger value="limited">Limited cars</TabsTrigger>
        </TabsList>
        <TabsContent value="awards" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <CompleteEventPanel />
            <AwardItemPanel />
          </div>
        </TabsContent>
        <TabsContent value="supply" className="mt-4">
          <SupplyPanel />
        </TabsContent>
        <TabsContent value="settle" className="mt-4">
          <SettlePanel />
        </TabsContent>
        <TabsContent value="series" className="mt-4">
          <SeriesPanel />
        </TabsContent>
        <TabsContent value="limited" className="mt-4">
          <LimitedCarsPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------ award item */

function AwardItemPanel() {
  const [racer, setRacer] = useState<RacerCard | null>(null);
  const [kind, setKind] = useState<string>("car");

  const award = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ applied: boolean }>("/api/admin/events/award-item", { method: "POST", body }),
    onSuccess: (data) =>
      data.applied ? toast.success("Prize awarded.") : toast("Already awarded (idempotent)."),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel title="Award an item" note="One prize, one racer">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!racer) return;
          const data = new FormData(event.currentTarget);
          const eventName = String(data.get("eventName") || "").trim();
          const reason = String(data.get("reason") || "").trim();
          award.mutate({
            accountId: racer.id,
            kind,
            refId: String(data.get("refId") || "").trim(),
            ...(eventName ? { eventName } : {}),
            ...(reason ? { reason } : {}),
          });
        }}
      >
        <RacerPicker value={racer} onChange={setRacer} />
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="Kind">
            <NativeSelect
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              options={PRIZE_KINDS.map(({ value, label }) => ({ value, label }))}
            />
          </Field>
          <Field label="Ref">
            <Input name="refId" required placeholder={prizeRefHint(kind)} />
          </Field>
        </div>
        <Field label="Event name">
          <Input name="eventName" placeholder="optional" />
        </Field>
        <Field label="Reason">
          <Input name="reason" placeholder="event award" />
        </Field>
        {(kind === "money" || kind === "points") && (
          <p className="text-xs text-muted-foreground">
            Currency prizes need an Admin and are capped per grant (money 1,000,000, points 100,000)
            below Owner.
          </p>
        )}
        <Button type="submit" disabled={!racer || award.isPending}>
          <Gift className="size-4" aria-hidden />
          Award prize
        </Button>
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------- complete event */

type WinnerDraft = {
  id: number;
  racer: RacerCard | null;
  prizes: Array<{ kind: string; refId: string }>;
};

let draftId = 1;
const newWinner = (): WinnerDraft => ({
  id: draftId++,
  racer: null,
  prizes: [{ kind: "car", refId: "" }],
});

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CompleteEventPanel() {
  const [eventName, setEventName] = useState("");
  const [base, setBase] = useState("");
  const [winners, setWinners] = useState<WinnerDraft[]>(() => [newWinner()]);
  const [results, setResults] = useState<CompleteResult[] | null>(null);

  const complete = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ results: CompleteResult[] }>("/api/admin/events/complete", { method: "POST", body }),
    onSuccess: (data) => {
      setResults(data.results);
      const exhausted = data.results.filter((r) => r.status === "exhausted").length;
      const errors = data.results.filter((r) => r.status === "error").length;
      if (exhausted || errors)
        toast.warning(`Completed with ${exhausted} exhausted and ${errors} failed prize(s).`);
      else toast.success("Event completed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = (id: number, patch: Partial<WinnerDraft>) =>
    setWinners((list) => list.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const ready =
    eventName.trim() &&
    winners.length > 0 &&
    winners.every((w) => w.racer && w.prizes.length > 0 && w.prizes.every((p) => p.refId.trim()));

  const idempotencyBase = base.trim() || slug(eventName);
  const nameOf = (accountId: number | string) =>
    winners.find((w) => w.racer?.id === Number(accountId))?.racer?.username ?? `#${accountId}`;

  return (
    <Panel title="Complete an event" note="Winners → prize packs, idempotent per prize">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Event name">
            <Input
              value={eventName}
              placeholder="Friday Night Heads-Up"
              onChange={(event) => setEventName(event.target.value)}
            />
          </Field>
          <Field label="Idempotency base">
            <Input
              value={base}
              placeholder={slug(eventName) || "derived from the event name"}
              onChange={(event) => setBase(event.target.value)}
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Re-submitting with the same base never pays a prize twice. Change it only for a genuinely
          new event.
        </p>

        {winners.map((winner, index) => (
          <div key={winner.id} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="label-eyebrow">Winner {index + 1}</span>
              {winners.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWinners((list) => list.filter((w) => w.id !== winner.id))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </Button>
              )}
            </div>
            <RacerPicker value={winner.racer} onChange={(racer) => update(winner.id, { racer })} />
            <div className="mt-3 flex flex-col gap-2">
              {winner.prizes.map((prize, prizeIndex) => (
                <div key={prizeIndex} className="grid grid-cols-[8rem_1fr_auto] gap-2">
                  <NativeSelect
                    value={prize.kind}
                    aria-label="Prize kind"
                    onChange={(event) =>
                      update(winner.id, {
                        prizes: winner.prizes.map((p, i) =>
                          i === prizeIndex ? { ...p, kind: event.target.value } : p,
                        ),
                      })
                    }
                    options={PRIZE_KINDS.map(({ value, label }) => ({ value, label }))}
                  />
                  <Input
                    value={prize.refId}
                    aria-label="Prize ref"
                    placeholder={prizeRefHint(prize.kind)}
                    onChange={(event) =>
                      update(winner.id, {
                        prizes: winner.prizes.map((p, i) =>
                          i === prizeIndex ? { ...p, refId: event.target.value } : p,
                        ),
                      })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove prize"
                    disabled={winner.prizes.length === 1}
                    onClick={() =>
                      update(winner.id, {
                        prizes: winner.prizes.filter((_, i) => i !== prizeIndex),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() =>
                  update(winner.id, { prizes: [...winner.prizes, { kind: "car", refId: "" }] })
                }
              >
                <Plus className="size-3.5" aria-hidden />
                Add prize
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => setWinners((list) => [...list, newWinner()])}>
            <UserPlus className="size-4" aria-hidden />
            Add winner
          </Button>
          <ConfirmButton
            variant="default"
            size="default"
            destructive={false}
            title={`Complete “${eventName}”?`}
            description={
              <>
                Grants {winners.reduce((total, w) => total + w.prizes.length, 0)} prize(s) to{" "}
                {winners.length} racer(s) under idempotency base{" "}
                <span className="font-mono">{idempotencyBase}</span>. Scarce trophies already handed
                out come back as exhausted.
              </>
            }
            confirmLabel="Grant prizes"
            disabled={!ready || complete.isPending}
            onConfirm={() =>
              complete.mutate({
                eventName: eventName.trim(),
                idempotencyBase,
                winners: winners.map((w) => ({
                  accountId: w.racer?.id,
                  prizes: w.prizes.map((p) => ({ kind: p.kind, refId: p.refId.trim() })),
                })),
              })
            }
          >
            Complete event
          </ConfirmButton>
        </div>

        {results && (
          <div>
            <p className="label-eyebrow mb-1.5">Results</p>
            {results.length === 0 ? (
              <EmptyState>No prizes processed.</EmptyState>
            ) : (
              <DataTable head={["Racer", "Prize", "Result", "Detail"]}>
                {results.map((result, index) => (
                  <Row key={index}>
                    <Cell className="font-medium">{nameOf(result.accountId)}</Cell>
                    <Cell mono>{result.kind ? `${result.kind} ${result.refId ?? ""}` : "—"}</Cell>
                    <Cell>
                      <Pill tone={resultTone(result.status)}>{result.status}</Pill>
                    </Cell>
                    <Cell className="text-xs text-muted-foreground">{result.detail ?? ""}</Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- supply */

function SupplyPanel() {
  const [kind, setKind] = useState("car");
  const [refId, setRefId] = useState("");
  const [submitted, setSubmitted] = useState<{ kind: string; refId: string } | null>(null);

  const supply = useQuery({
    queryKey: gameKey("supply", submitted?.kind, submitted?.refId),
    queryFn: () =>
      api<{
        supplyCap: number | null;
        granted: number;
        remaining: number | null;
        awards: Array<{
          playerId: number;
          eventName: string | null;
          grantedBy: string | null;
          createdAt: string;
        }>;
      }>(`/api/admin/awards${buildQuery(submitted ?? {})}`),
    enabled: Boolean(submitted),
    retry: false,
  });

  return (
    <Panel title="Trophy / limited supply" note="Cap, granted count and every holder">
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (refId.trim()) setSubmitted({ kind, refId: refId.trim() });
        }}
      >
        <Field label="Kind" className="w-32">
          <NativeSelect
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            options={[
              { value: "car", label: "Car" },
              { value: "part", label: "Part" },
              { value: "badge", label: "Badge" },
            ]}
          />
        </Field>
        <Field label="Ref" className="w-48">
          <Input
            value={refId}
            placeholder={prizeRefHint(kind)}
            onChange={(event) => setRefId(event.target.value)}
          />
        </Field>
        <Button type="submit">
          <Search className="size-4" aria-hidden />
          Look up
        </Button>
      </form>

      {!submitted ? (
        <EmptyState>Enter a catalog car / part id or a badge key.</EmptyState>
      ) : supply.isLoading ? (
        <LoadingState label="Counting grants" />
      ) : supply.isError ? (
        <ErrorState error={supply.error} what="the award supply" />
      ) : supply.data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Supply cap"
              value={supply.data.supplyCap == null ? "Uncapped" : integer(supply.data.supplyCap)}
            />
            <StatTile label="Granted" value={integer(supply.data.granted)} tone="primary" />
            <StatTile
              label="Remaining"
              value={supply.data.remaining == null ? "—" : integer(supply.data.remaining)}
              tone={supply.data.remaining === 0 ? "danger" : "success"}
            />
          </div>
          {supply.data.awards.length === 0 ? (
            <EmptyState>Nobody holds this yet.</EmptyState>
          ) : (
            <DataTable head={["Account", "Event", "Granted by", "When"]}>
              {supply.data.awards.map((award, index) => (
                <Row key={index}>
                  <Cell mono>#{award.playerId}</Cell>
                  <Cell>{award.eventName ?? "—"}</Cell>
                  <Cell>{award.grantedBy ?? "—"}</Cell>
                  <Cell mono className="text-muted-foreground">
                    {dateLabel(award.createdAt)}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
          {supply.data.granted > supply.data.awards.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the first {supply.data.awards.length} of {integer(supply.data.granted)}.
            </p>
          )}
        </>
      ) : null}
    </Panel>
  );
}

/* ----------------------------------------------------------- settlement */

function PrizeLines({ lines }: { lines: PrizeLine[] }) {
  if (lines.length === 0) return <EmptyState>No prize lines.</EmptyState>;
  return (
    <DataTable head={["Place", "Racer", "Badge", "Wheel", "Money", "Points", "Already paid"]}>
      {lines.map((line) => (
        <Row key={`${line.place}-${line.playerId}`}>
          <Cell mono>{line.place}</Cell>
          <Cell className="font-medium">
            {line.name}{" "}
            <span className="numeric text-xs text-muted-foreground">#{line.playerId}</span>
          </Cell>
          <Cell mono className="text-xs">
            {line.badge || "—"}
          </Cell>
          <Cell mono>{line.wheel ?? "—"}</Cell>
          <Cell mono>{money(line.money)}</Cell>
          <Cell mono>{integer(line.points)}</Cell>
          <Cell mono className="text-muted-foreground">
            {money(line.alreadyPaid)}
          </Cell>
        </Row>
      ))}
    </DataTable>
  );
}

function SettlePanel() {
  const [eventId, setEventId] = useState("");
  const [result, setResult] = useState<{
    dryRun: boolean;
    table: boolean;
    lines: PrizeLine[];
  } | null>(null);

  const settle = useMutation({
    mutationFn: (dryRun: boolean) =>
      api<{ dryRun?: boolean; table: boolean; lines: PrizeLine[] }>(
        "/api/admin/events/settle-prizes",
        { method: "POST", body: { eventId: Number(eventId), dryRun } },
      ),
    onSuccess: (data, dryRun) => {
      setResult({ dryRun, table: data.table, lines: data.lines });
      if (!data.table) toast("This event's slot has no prize table.");
      else if (!dryRun) toast.success(`Paid ${data.lines.length} prize line(s).`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid = Number(eventId) > 0;

  return (
    <Panel title="Settle a tournament's prize table" note="Admin+ · idempotent per event and racer">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Event id" className="w-48">
          <Input
            type="number"
            min={1}
            value={eventId}
            placeholder="20000123"
            onChange={(event) => setEventId(event.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          disabled={!valid || settle.isPending}
          onClick={() => settle.mutate(true)}
        >
          Preview
        </Button>
        <ConfirmButton
          variant="default"
          size="default"
          destructive={false}
          title={`Pay event #${eventId}?`}
          description="Pays every placement line from the slot's prize table. Lines already paid are skipped."
          confirmLabel="Pay prizes"
          disabled={!valid || settle.isPending}
          onConfirm={() => settle.mutate(false)}
        >
          Pay prizes
        </ConfirmButton>
      </div>
      {result &&
        (result.table ? (
          <>
            <Pill tone={result.dryRun ? "warning" : "success"}>
              {result.dryRun ? "Preview only" : "Paid"}
            </Pill>
            <div className="mt-3">
              <PrizeLines lines={result.lines} />
            </div>
          </>
        ) : (
          <EmptyState>No prize table for this event.</EmptyState>
        ))}
    </Panel>
  );
}

/* ---------------------------------------------------------------- series */

function SeriesPanel() {
  const queryClient = useQueryClient();
  const [closePlan, setClosePlan] = useState<{
    id: number;
    dryRun: boolean;
    lines: PrizeLine[];
    trophies: unknown;
  } | null>(null);

  const series = useQuery({
    queryKey: gameKey("series"),
    queryFn: () => api<Series[]>("/api/admin/series"),
    retry: false,
  });

  const start = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) =>
      api("/api/admin/series/start", { method: "POST", body: { id, days } }),
    onSuccess: () => {
      toast.success("Series started.");
      queryClient.invalidateQueries({ queryKey: gameKey("series") });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const close = useMutation({
    mutationFn: ({ id, dryRun }: { id: number; dryRun: boolean }) =>
      api<{ lines: PrizeLine[]; trophies: unknown }>("/api/admin/series/close", {
        method: "POST",
        body: { id, dryRun },
      }),
    onSuccess: (data, vars) => {
      setClosePlan({
        id: vars.id,
        dryRun: vars.dryRun,
        lines: data.lines,
        trophies: data.trophies,
      });
      if (!vars.dryRun) {
        toast.success("Series closed and paid.");
        queryClient.invalidateQueries({ queryKey: gameKey("series") });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const list = Array.isArray(series.data) ? series.data : [];

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Tournament series" count={list.length} note="Month-long points leaderboards">
        {series.isLoading ? (
          <LoadingState label="Reading series" />
        ) : series.isError ? (
          <ErrorState error={series.error} what="series" />
        ) : list.length === 0 ? (
          <EmptyState>No series configured.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map((item) => (
              <SeriesCard
                key={item.id}
                series={item}
                busy={start.isPending || close.isPending}
                onStart={(days) => start.mutate({ id: item.id, days })}
                onClose={(dryRun) => close.mutate({ id: item.id, dryRun })}
              />
            ))}
          </div>
        )}
      </Panel>
      {closePlan && (
        <Panel
          title={`Series #${closePlan.id} close ${closePlan.dryRun ? "plan" : "result"}`}
          note={closePlan.dryRun ? "Nothing paid yet" : "Paid"}
        >
          <PrizeLines lines={closePlan.lines} />
          {Array.isArray(closePlan.trophies) && closePlan.trophies.length > 0 && (
            <pre className="mt-3 rounded-lg border border-border bg-surface/70 p-3 font-mono text-xs">
              {JSON.stringify(closePlan.trophies, null, 2)}
            </pre>
          )}
        </Panel>
      )}
    </div>
  );
}

function SeriesCard({
  series,
  busy,
  onStart,
  onClose,
}: {
  series: Series;
  busy: boolean;
  onStart: (days: number) => void;
  onClose: (dryRun: boolean) => void;
}) {
  const [days, setDays] = useState("30");
  const tone: PillTone =
    series.status === "active" ? "success" : series.status === "draft" ? "warning" : "neutral";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-medium">{series.name}</span>
        <span className="numeric text-xs text-muted-foreground">#{series.id}</span>
        <Pill tone={tone}>{series.status}</Pill>
        <span className="text-xs text-muted-foreground">
          slots {series.slotIds.join(", ") || "—"} · {unixLabel(series.startsAt)} to{" "}
          {unixLabel(series.endsAt)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {series.status === "draft" && (
            <>
              <Input
                className="h-8 w-20"
                type="number"
                min={1}
                value={days}
                aria-label="Days"
                onChange={(event) => setDays(event.target.value)}
              />
              <ConfirmButton
                destructive={false}
                title={`Start “${series.name}”?`}
                description={`Opens the series for ${days} day(s) starting now and switches its slots on.`}
                confirmLabel="Start series"
                disabled={busy || !(Number(days) > 0)}
                onConfirm={() => onStart(Number(days))}
              >
                Start
              </ConfirmButton>
            </>
          )}
          {series.status === "active" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onClose(true)}>
                Preview close
              </Button>
              <ConfirmButton
                title={`Close “${series.name}” and pay?`}
                description="Freezes the standings and pays the series prize table plus trophy cars by standing. Idempotent per series and racer."
                confirmLabel="Close and pay"
                disabled={busy}
                onConfirm={() => onClose(false)}
              >
                Close
              </ConfirmButton>
            </>
          )}
        </div>
      </div>
      {series.standings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No standings yet.</p>
      ) : (
        <DataTable head={["Rank", "Racer", "Points", "Events", "Wins"]}>
          {series.standings.slice(0, 10).map((row) => (
            <Row key={row.playerId}>
              <Cell mono>{row.rank}</Cell>
              <Cell className="font-medium">{row.name}</Cell>
              <Cell mono>{integer(row.points)}</Cell>
              <Cell mono>{row.events}</Cell>
              <Cell mono>{row.wins}</Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- limited cars */

function LimitedCarsPanel() {
  const queryClient = useQueryClient();
  const cars = useQuery({
    queryKey: gameKey("limited"),
    queryFn: () => api<LimitedCar[]>("/api/admin/limited-cars"),
    retry: false,
  });
  const sale = useMutation({
    mutationFn: ({ id, onSale }: { id: number; onSale: boolean }) =>
      api(`/api/admin/limited-cars/${id}/sale`, { method: "POST", body: { onSale } }),
    onSuccess: (_data, vars) => {
      toast.success(vars.onSale ? "Sale opened." : "Sale closed.");
      queryClient.invalidateQueries({ queryKey: gameKey("limited") });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const list = Array.isArray(cars.data) ? cars.data : [];

  return (
    <Panel title="Limited numbered cars" count={list.length} note="Admin+ to open or close a sale">
      {cars.isLoading ? (
        <LoadingState label="Reading limited cars" />
      ) : cars.isError ? (
        <ErrorState error={cars.error} what="limited cars" />
      ) : list.length === 0 ? (
        <EmptyState>No limited cars configured.</EmptyState>
      ) : (
        <DataTable head={["Car", "Prefix", "Cap", "Sold", "Left", "Dealer", "On sale"]}>
          {list.map((car) => (
            <Row key={car.carId}>
              <Cell mono>
                #{car.carId}
                {car.display?.hp ? (
                  <div className="text-xs text-muted-foreground">
                    {car.display.hp} hp{car.display.et ? ` · ${car.display.et}` : ""}
                  </div>
                ) : null}
              </Cell>
              <Cell mono>{car.prefix}</Cell>
              <Cell mono>{integer(car.cap)}</Cell>
              <Cell mono>{integer(car.sold)}</Cell>
              <Cell mono>
                <Pill tone={car.left <= 0 ? "danger" : "success"}>{integer(car.left)}</Pill>
              </Cell>
              <Cell mono>{car.dealerLid}</Cell>
              <Cell>
                <Switch
                  checked={car.onSale}
                  disabled={sale.isPending}
                  aria-label="On sale"
                  onCheckedChange={(onSale) => sale.mutate({ id: car.carId, onSale })}
                />
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
