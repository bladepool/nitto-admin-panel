import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Eye, Pencil, Play, Plus, Trash2, XCircle, Zap } from "lucide-react";
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
import { ConfirmButton, GameApiCredential, NativeSelect } from "@/components/admin/game-api";
import { formInt, formText } from "@/lib/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, buildQuery, dateLabel, integer, money, unixLabel } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/tournaments")({
  head: () => ({
    meta: [
      { title: "Tournaments — 1320 Legends Race Control" },
      {
        name: "description",
        content: "Weekly live-tournament schedule, generated events, brackets and the simulator.",
      },
      { property: "og:title", content: "Tournaments — 1320 Legends Race Control" },
      { property: "og:description", content: "Weekly live-tournament schedule and events." },
    ],
  }),
  component: TournamentsPage,
});

/* ------------------------------------------------------------------ types */

type Kind = "h2h" | "bracket" | "pink";

type EntryRule = {
  cars?: number[];
  carLabel?: string;
  origin?: "domestic" | "import";
  maxHp?: number;
  induction?: "na" | "turbo" | "sc" | "forced";
  city?: number;
  scMin?: number;
  scMax?: number;
  members?: boolean;
};

type Slot = {
  id: number;
  name: string;
  kind: Kind;
  dow: number;
  timeLocal: string;
  tz: string;
  qualifyMinutes: number;
  maxEntrants: number;
  entryFee: number;
  entryCur: "f" | "m";
  prize1: number;
  prize2: number;
  prizeRound: number;
  rule: EntryRule;
  entryReq: string;
  descr: string;
  li: number;
  cs: string;
  active: boolean;
  every?: "week" | "hour";
  runner?: string | null;
  ruleText?: string;
  nextStartsAt?: number | null;
};

type HtEvent = {
  id: number;
  scheduleId: number;
  name: string;
  kind: Kind;
  startsAt: number;
  qualifyEndsAt: number;
  status: string;
  entryFee: number;
  entryCur: "f" | "m";
  prize1: number;
  prize2: number;
  prizeRound: number;
  entryReq: string;
  tstr: string;
  championId: number | null;
  runnerUpId: number | null;
  results: unknown;
  createdBy: string;
};

type EventDetail = {
  event: HtEvent;
  entries: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
  payouts: Array<Record<string, unknown>>;
};

type AuditRow = {
  id: number;
  schedule_id: number | null;
  event_id: number | null;
  action: string;
  actor: string;
  detail: unknown;
  at: string;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CITIES: Record<number, string> = {
  100: "Toreno",
  200: "Newburge",
  300: "Creek Side",
  400: "Vista Heights",
  500: "Diamond Point",
};
const KIND_OPTIONS = [
  { value: "h2h", label: "Heads-up (h2h)" },
  { value: "bracket", label: "Dial-in bracket" },
  { value: "pink", label: "Pink slips" },
];
const EVENT_STATUSES = [
  "scheduled",
  "qualifying",
  "racing",
  "settled",
  "cancelled",
  "aborted",
  "expired",
];

function kindTone(kind: string): PillTone {
  if (kind === "pink") return "danger";
  if (kind === "bracket") return "info";
  return "primary";
}

function eventTone(status: string): PillTone {
  if (status === "racing" || status === "qualifying") return "success";
  if (status === "scheduled") return "warning";
  if (status === "settled") return "info";
  if (status === "cancelled" || status === "aborted") return "danger";
  return "neutral";
}

function when(slot: Slot): string {
  if (slot.every === "hour") return `Hourly at :${slot.timeLocal.slice(3)}`;
  return `${DOW[slot.dow] ?? slot.dow} ${slot.timeLocal}`;
}

function fee(amount: number, cur: "f" | "m"): string {
  return cur === "m" && amount > 0 ? money(amount) : "Free";
}

const gameKey = (...parts: unknown[]) => ["game", "tournaments", ...parts];

/* ------------------------------------------------------------------- page */

function TournamentsPage() {
  const queryClient = useQueryClient();

  const schedule = useQuery({
    queryKey: gameKey("schedule"),
    queryFn: () => api<{ slots: Slot[] }>("/api/admin/tournament-schedule"),
    retry: false,
  });

  const generate = useMutation({
    mutationFn: (weeks: number) =>
      api<{ generated: number; ids: number[] }>("/api/admin/tournament-schedule/generate", {
        method: "POST",
        body: { weeks },
      }),
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} new event instance(s).`);
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const slots = schedule.data?.slots ?? [];
  const active = slots.filter((slot) => slot.active);
  const nextUp = active
    .map((slot) => slot.nextStartsAt ?? 0)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)[0];

  return (
    <>
      <PageHeading
        title="Tournaments"
        subtitle="Live real-player tournaments: the weekly schedule, the event instances it generates, and their brackets."
        actions={
          <>
            <Button
              variant="outline"
              disabled={generate.isPending}
              onClick={() => generate.mutate(2)}
            >
              <CalendarPlus className="size-4" aria-hidden />
              Generate 2 weeks
            </Button>
          </>
        }
      />

      <GameApiCredential />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Schedule slots" value={integer(slots.length)} tone="primary" />
        <StatTile label="Active slots" value={integer(active.length)} tone="success" />
        <StatTile label="Next start" value={nextUp ? unixLabel(nextUp) : "—"} />
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Weekly schedule</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="legacy">Legacy list / Simulator</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab query={schedule} slots={slots} />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <EventsTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
        <TabsContent value="legacy" className="mt-4">
          <LegacyTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* --------------------------------------------------------------- schedule */

function ScheduleTab({
  query,
  slots,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown };
  slots: Slot[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Slot | "new" | null>(null);
  const [runNow, setRunNow] = useState<Slot | null>(null);

  const deactivate = useMutation({
    mutationFn: (id: number) =>
      api<{ cancelledInstances: number }>(`/api/admin/tournament-schedule/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data) => {
      toast.success(`Slot deactivated; ${data.cancelledInstances} future instance(s) cancelled.`);
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reactivate = useMutation({
    mutationFn: (id: number) =>
      api(`/api/admin/tournament-schedule/${id}`, { method: "PATCH", body: { active: true } }),
    onSuccess: () => {
      toast.success("Slot re-activated.");
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel
      title="Weekly schedule"
      count={slots.length}
      note="Edits re-snapshot future instances"
      actions={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" aria-hidden />
          New slot
        </Button>
      }
    >
      {query.isLoading ? (
        <LoadingState label="Reading the schedule" />
      ) : query.isError ? (
        <ErrorState error={query.error} what="the tournament schedule" />
      ) : slots.length === 0 ? (
        <EmptyState>No schedule slots yet.</EmptyState>
      ) : (
        <DataTable head={["Slot", "Format", "When", "Next", "Entry", "Prizes", "Rule", "", ""]}>
          {slots.map((slot) => (
            <Row key={slot.id} className={slot.active ? "" : "opacity-60"}>
              <Cell>
                <div className="font-medium">{slot.name}</div>
                <div className="numeric text-xs text-muted-foreground">#{slot.id}</div>
              </Cell>
              <Cell>
                <Pill tone={kindTone(slot.kind)}>{slot.kind}</Pill>
              </Cell>
              <Cell mono className="whitespace-nowrap">
                {when(slot)}
                <div className="text-xs text-muted-foreground">
                  {slot.tz} · {slot.qualifyMinutes}m qual
                </div>
              </Cell>
              <Cell mono className="whitespace-nowrap text-muted-foreground">
                {slot.active ? unixLabel(slot.nextStartsAt) : "—"}
              </Cell>
              <Cell mono>{fee(slot.entryFee, slot.entryCur)}</Cell>
              <Cell mono className="whitespace-nowrap">
                {money(slot.prize1)} / {money(slot.prize2)}
                {slot.prizeRound > 0 && (
                  <div className="text-xs text-muted-foreground">
                    +{money(slot.prizeRound)}/round
                  </div>
                )}
              </Cell>
              <Cell className="max-w-[18rem] text-xs text-muted-foreground">
                {slot.ruleText ?? slot.entryReq}
              </Cell>
              <Cell>
                <Pill tone={slot.active ? "success" : "neutral"}>
                  {slot.active ? "active" : "off"}
                </Pill>
              </Cell>
              <Cell>
                <div className="flex gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Edit slot"
                    onClick={() => setEditing(slot)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Run now"
                    onClick={() => setRunNow(slot)}
                  >
                    <Zap className="size-3.5" aria-hidden />
                  </Button>
                  {slot.active ? (
                    <ConfirmButton
                      size="icon"
                      variant="destructive"
                      label="Deactivate slot"
                      title={`Deactivate “${slot.name}”?`}
                      description="The slot stops generating events and every future, not-yet-open instance is cancelled. It can be re-activated later."
                      confirmLabel="Deactivate"
                      disabled={deactivate.isPending}
                      onConfirm={() => deactivate.mutate(slot.id)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </ConfirmButton>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reactivate.isPending}
                      onClick={() => reactivate.mutate(slot.id)}
                    >
                      Enable
                    </Button>
                  )}
                </div>
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {editing != null && (
            <SlotForm slot={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={runNow != null} onOpenChange={(open) => !open && setRunNow(null)}>
        <DialogContent className="sm:max-w-lg">
          {runNow && <RunNowForm slot={runNow} onDone={() => setRunNow(null)} />}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function SlotForm({ slot, onDone }: { slot: Slot | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>(slot?.kind ?? "h2h");
  const [every, setEvery] = useState<string>(slot?.every ?? "week");
  const [entryCur, setEntryCur] = useState<string>(slot?.entryCur ?? "f");
  const [active, setActive] = useState(slot?.active ?? true);
  const [members, setMembers] = useState(Boolean(slot?.rule.members));
  const rule = slot?.rule ?? {};

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      slot
        ? api<{ slot: Slot; updatedInstances?: number }>(
            `/api/admin/tournament-schedule/${slot.id}`,
            { method: "PATCH", body },
          )
        : api<{ slot: Slot; updatedInstances?: number }>("/api/admin/tournament-schedule", {
            method: "POST",
            body,
          }),
    onSuccess: (data) => {
      const updated = data.updatedInstances;
      toast.success(
        slot
          ? `Slot saved; ${updated ?? 0} future instance(s) re-snapshotted.`
          : "Slot created. Generate to materialize its events.",
      );
      queryClient.invalidateQueries({ queryKey: gameKey() });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{slot ? `Edit slot #${slot.id}` : "New schedule slot"}</DialogTitle>
        <DialogDescription>
          The bracket chart is fixed at 32 entrants. Entry requirements text is generated from the
          rule unless you override it.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const nextRule: EntryRule = {};
          const cars = formText(data, "cars")
            .split(/[\s,]+/)
            .filter(Boolean)
            .map((value) => Math.trunc(Number(value)));
          if (cars.length) nextRule.cars = cars;
          const carLabel = formText(data, "carLabel");
          if (carLabel) nextRule.carLabel = carLabel;
          const origin = formText(data, "origin");
          if (origin === "domestic" || origin === "import") nextRule.origin = origin;
          const induction = formText(data, "induction");
          if (
            induction === "na" ||
            induction === "sc" ||
            induction === "turbo" ||
            induction === "forced"
          )
            nextRule.induction = induction;
          for (const key of ["maxHp", "city", "scMin", "scMax"] as const) {
            const value = formInt(data, key);
            if (value !== undefined) nextRule[key] = value;
          }
          if (members) nextRule.members = true;

          const body: Record<string, unknown> = {
            name: formText(data, "name"),
            kind,
            every,
            dow: formInt(data, "dow") ?? 0,
            timeLocal: formText(data, "timeLocal"),
            tz: formText(data, "tz") || "America/Los_Angeles",
            qualifyMinutes: formInt(data, "qualifyMinutes") ?? 30,
            entryCur,
            entryFee: entryCur === "f" ? 0 : (formInt(data, "entryFee") ?? 0),
            prize1: formInt(data, "prize1") ?? 0,
            prize2: formInt(data, "prize2") ?? 0,
            prizeRound: formInt(data, "prizeRound") ?? 0,
            li: formInt(data, "li") ?? 11,
            cs: formText(data, "cs") || "green",
            descr: formText(data, "descr"),
            entryReq: formText(data, "entryReq"),
            runner: formText(data, "runner") || null,
            active,
            rule: nextRule,
          };
          if (!slot) {
            const id = formInt(data, "id");
            if (id !== undefined) body["id"] = id;
          }
          save.mutate(body);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
          <Field label="Id">
            <Input
              name="id"
              type="number"
              min={4}
              defaultValue={slot?.id ?? ""}
              placeholder="auto"
              disabled={Boolean(slot)}
            />
          </Field>
          <Field label="Name">
            <Input name="name" required maxLength={80} defaultValue={slot?.name ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Format">
            <NativeSelect
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              options={KIND_OPTIONS}
            />
          </Field>
          <Field label="Recurrence">
            <NativeSelect
              value={every}
              onChange={(event) => setEvery(event.target.value)}
              options={[
                { value: "week", label: "Weekly" },
                { value: "hour", label: "Every hour" },
              ]}
            />
          </Field>
          <Field label="Day">
            <NativeSelect
              name="dow"
              defaultValue={String(slot?.dow ?? 6)}
              disabled={every === "hour"}
              options={DOW.map((label, index) => ({ value: String(index), label }))}
            />
          </Field>
          <Field label={every === "hour" ? "Minute (HH:MM)" : "Time (24h)"}>
            <Input
              name="timeLocal"
              required
              pattern="([01]\d|2[0-3]):[0-5]\d"
              placeholder="20:00"
              defaultValue={slot?.timeLocal ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Time zone" className="sm:col-span-2">
            <Input name="tz" defaultValue={slot?.tz ?? "America/Los_Angeles"} />
          </Field>
          <Field label="Qualifying (min)">
            <Input
              name="qualifyMinutes"
              type="number"
              min={1}
              max={240}
              defaultValue={slot?.qualifyMinutes ?? 30}
            />
          </Field>
          <Field label="Runner pin">
            <Input name="runner" placeholder="any" defaultValue={slot?.runner ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Entry">
            <NativeSelect
              value={entryCur}
              onChange={(event) => setEntryCur(event.target.value)}
              options={[
                { value: "f", label: "Free" },
                { value: "m", label: "Cash fee" },
              ]}
            />
          </Field>
          <Field label="Fee">
            <Input
              name="entryFee"
              type="number"
              min={0}
              disabled={entryCur === "f"}
              defaultValue={slot?.entryFee ?? 0}
            />
          </Field>
          <Field label="1st prize">
            <Input name="prize1" type="number" min={0} defaultValue={slot?.prize1 ?? 0} />
          </Field>
          <Field label="2nd prize">
            <Input name="prize2" type="number" min={0} defaultValue={slot?.prize2 ?? 0} />
          </Field>
          <Field label="Per round win">
            <Input name="prizeRound" type="number" min={0} defaultValue={slot?.prizeRound ?? 0} />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-border p-3">
          <legend className="label-eyebrow px-1">Entry rule (all present fields must hold)</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Car ids" className="sm:col-span-2">
              <Input
                name="cars"
                placeholder="e.g. 31, 37"
                defaultValue={rule.cars?.join(", ") ?? ""}
              />
            </Field>
            <Field label="Car label" className="sm:col-span-2">
              <Input name="carLabel" placeholder="Honda Civic" defaultValue={rule.carLabel ?? ""} />
            </Field>
            <Field label="Origin">
              <NativeSelect
                name="origin"
                defaultValue={rule.origin ?? ""}
                options={[
                  { value: "", label: "Any" },
                  { value: "domestic", label: "Domestic" },
                  { value: "import", label: "Import" },
                ]}
              />
            </Field>
            <Field label="Induction">
              <NativeSelect
                name="induction"
                defaultValue={rule.induction ?? ""}
                options={[
                  { value: "", label: "Any" },
                  { value: "na", label: "N/A only" },
                  { value: "turbo", label: "Turbo" },
                  { value: "sc", label: "Supercharged" },
                  { value: "forced", label: "Turbo or SC" },
                ]}
              />
            </Field>
            <Field label="Max HP">
              <Input name="maxHp" type="number" min={0} defaultValue={rule.maxHp ?? ""} />
            </Field>
            <Field label="City">
              <NativeSelect
                name="city"
                defaultValue={rule.city != null ? String(rule.city) : ""}
                options={[
                  { value: "", label: "Any" },
                  ...Object.entries(CITIES).map(([value, label]) => ({ value, label })),
                ]}
              />
            </Field>
            <Field label="SC min">
              <Input name="scMin" type="number" min={0} defaultValue={rule.scMin ?? ""} />
            </Field>
            <Field label="SC max">
              <Input name="scMax" type="number" min={0} defaultValue={rule.scMax ?? ""} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
              <Switch checked={members} onCheckedChange={setMembers} />
              Members only
            </label>
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem]">
          <Field label="Entry requirements override">
            <Input
              name="entryReq"
              placeholder={slot?.ruleText ?? "generated from the rule"}
              defaultValue=""
            />
          </Field>
          <Field label="Icon (li)">
            <Input name="li" type="number" defaultValue={slot?.li ?? 11} />
          </Field>
          <Field label="Colour">
            <Input name="cs" defaultValue={slot?.cs ?? "green"} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea name="descr" rows={2} defaultValue={slot?.descr ?? ""} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Active
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {slot ? "Save slot" : "Create slot"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function RunNowForm({ slot, onDone }: { slot: Slot; onDone: () => void }) {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ event: HtEvent | null }>(`/api/admin/tournament-schedule/${slot.id}/run-now`, {
        method: "POST",
        body,
      }),
    onSuccess: (data) => {
      toast.success(
        data.event
          ? `Event #${data.event.id} created; qualifying opens ${unixLabel(data.event.startsAt)}.`
          : "Event created.",
      );
      queryClient.invalidateQueries({ queryKey: gameKey() });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Run “{slot.name}” now</DialogTitle>
        <DialogDescription>
          Creates an ad-hoc instance of this slot (tests and special events). Blank fields use the
          server defaults.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const body: Record<string, unknown> = {};
          for (const key of [
            "inSeconds",
            "qualifySeconds",
            "graceSeconds",
            "roundGapSeconds",
            "readyTimeoutSeconds",
            "trophyCarId",
          ]) {
            const value = formInt(data, key);
            if (value !== undefined) body[key] = value;
          }
          const runner = formText(data, "runner");
          if (runner) body["runner"] = runner;
          run.mutate(body);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts in (s)">
            <Input name="inSeconds" type="number" min={0} max={604800} placeholder="0" />
          </Field>
          <Field label="Qualifying (s)">
            <Input
              name="qualifySeconds"
              type="number"
              min={10}
              max={14400}
              placeholder={String(slot.qualifyMinutes * 60)}
            />
          </Field>
          <Field label="Grace (s)">
            <Input name="graceSeconds" type="number" min={1} max={300} placeholder="60" />
          </Field>
          <Field label="Round gap (s)">
            <Input name="roundGapSeconds" type="number" min={0} max={120} placeholder="25" />
          </Field>
          <Field label="Ready timeout (s)">
            <Input name="readyTimeoutSeconds" type="number" min={5} max={300} placeholder="45" />
          </Field>
          <Field label="Runner pin">
            <Input name="runner" placeholder={slot.runner ?? "any"} />
          </Field>
          <Field label="Trophy car id (award-only)" className="col-span-2">
            <Input name="trophyCarId" type="number" min={1} placeholder="none" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={run.isPending}>
            <Play className="size-3.5" aria-hidden />
            Create event
          </Button>
        </div>
      </form>
    </>
  );
}

/* ----------------------------------------------------------------- events */

function EventsTab() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [daysBack, setDaysBack] = useState(7);
  const [openId, setOpenId] = useState<number | null>(null);

  const from = Math.floor(Date.now() / 1000 / 3600) * 3600 - daysBack * 86400;
  const events = useQuery({
    queryKey: gameKey("events", status, daysBack),
    queryFn: () =>
      api<{ events: HtEvent[] }>(
        `/api/admin/tournament-events${buildQuery({ status, from, limit: 300 })}`,
      ),
    retry: false,
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api<{ refunded?: number[] }>(`/api/admin/tournament-events/${id}/cancel`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: (data) => {
      toast.success(`Event cancelled; ${data.refunded?.length ?? 0} entry fee(s) refunded.`);
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const list = events.data?.events ?? [];

  return (
    <Panel
      title="Event instances"
      count={list.length}
      actions={
        <div className="flex items-center gap-2">
          <NativeSelect
            className="w-36"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: "", label: "Any status" },
              ...EVENT_STATUSES.map((value) => ({ value, label: value })),
            ]}
          />
          <NativeSelect
            className="w-36"
            value={String(daysBack)}
            onChange={(event) => setDaysBack(Number(event.target.value))}
            options={[
              { value: "1", label: "From yesterday" },
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "365", label: "Last year" },
            ]}
          />
        </div>
      }
    >
      {events.isLoading ? (
        <LoadingState label="Reading events" />
      ) : events.isError ? (
        <ErrorState error={events.error} what="tournament events" />
      ) : list.length === 0 ? (
        <EmptyState>No events in this window. Generate the schedule to create some.</EmptyState>
      ) : (
        <DataTable
          head={["Event", "Format", "Status", "Qualifying", "Entry", "Purse", "Champion", ""]}
        >
          {list.map((item) => (
            <Row key={item.id}>
              <Cell>
                <div className="font-medium">{item.name}</div>
                <div className="numeric text-xs text-muted-foreground">
                  #{item.id} · slot {item.scheduleId} · {item.createdBy}
                </div>
              </Cell>
              <Cell>
                <Pill tone={kindTone(item.kind)}>{item.kind}</Pill>
              </Cell>
              <Cell>
                <Pill tone={eventTone(item.status)}>{item.status}</Pill>
              </Cell>
              <Cell mono className="whitespace-nowrap text-muted-foreground">
                {unixLabel(item.startsAt)}
                <div className="text-xs">to {unixLabel(item.qualifyEndsAt)}</div>
              </Cell>
              <Cell mono>{fee(item.entryFee, item.entryCur)}</Cell>
              <Cell mono className="whitespace-nowrap">
                {money(item.prize1)} / {money(item.prize2)}
              </Cell>
              <Cell mono>{item.championId ? `#${item.championId}` : "—"}</Cell>
              <Cell>
                <div className="flex gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Event detail"
                    onClick={() => setOpenId(item.id)}
                  >
                    <Eye className="size-3.5" aria-hidden />
                  </Button>
                  {(item.status === "scheduled" || item.status === "qualifying") && (
                    <CancelEventButton
                      event={item}
                      disabled={cancel.isPending}
                      onCancel={(reason) => cancel.mutate({ id: item.id, reason })}
                    />
                  )}
                </div>
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}

      <Dialog open={openId != null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          {openId != null && <EventDetailView id={openId} />}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function CancelEventButton({
  event,
  disabled,
  onCancel,
}: {
  event: HtEvent;
  disabled: boolean;
  onCancel: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button
        size="icon"
        variant="destructive"
        aria-label="Cancel event"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <XCircle className="size-3.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel event #{event.id}?</DialogTitle>
            <DialogDescription>
              {event.name} is {event.status}. Cancelling refunds every paid entry fee. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason (required)">
            <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => {
                onCancel(reason.trim());
                setOpen(false);
              }}
            >
              Cancel event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const n = (value: unknown, digits = 3) =>
  value == null || value === "" ? "—" : Number(value).toFixed(digits);

function EventDetailView({ id }: { id: number }) {
  const detail = useQuery({
    queryKey: gameKey("event", id),
    queryFn: () => api<EventDetail>(`/api/admin/tournament-events/${id}`),
    retry: false,
  });

  if (detail.isLoading) return <LoadingState label="Reading the event" />;
  if (detail.isError || !detail.data)
    return <ErrorState error={detail.error} what={`event #${id}`} />;

  const { event, entries, runs, matches, payouts } = detail.data;
  const names = new Map<number, string>();
  for (const entry of entries)
    names.set(Number(entry["player_id"]), String(entry["username"] ?? ""));
  const who = (pid: unknown) => {
    const id = Number(pid);
    if (!id) return "—";
    return names.get(id) || `#${id}`;
  };
  const rounds = new Map<number, Array<Record<string, unknown>>>();
  for (const match of matches) {
    const round = Number(match["round"]);
    rounds.set(round, [...(rounds.get(round) ?? []), match]);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {event.name} <span className="numeric text-muted-foreground">#{event.id}</span>
        </DialogTitle>
        <DialogDescription>
          {event.kind} · {event.status} · qualifying {unixLabel(event.startsAt)} to{" "}
          {unixLabel(event.qualifyEndsAt)} · {event.entryReq}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Entrants" value={integer(entries.length)} />
        <StatTile label="Qualifying runs" value={integer(runs.length)} />
        <StatTile label="Champion" value={who(event.championId)} tone="success" />
        <StatTile label="Runner-up" value={who(event.runnerUpId)} />
      </div>

      <Panel title="Entrants" count={entries.length}>
        {entries.length === 0 ? (
          <EmptyState>No entrants.</EmptyState>
        ) : (
          <DataTable
            head={[
              "Seed",
              "Racer",
              "Car",
              "Dial-in",
              "Best RT",
              "Best ET",
              "Best total",
              "Runs",
              "Status",
              "Place",
              "Prize",
            ]}
          >
            {entries.map((entry) => (
              <Row key={String(entry["player_id"])}>
                <Cell mono>{entry["seed"] == null ? "—" : String(entry["seed"])}</Cell>
                <Cell className="font-medium">
                  {who(entry["player_id"])}
                  {entry["is_bot"] ? <Pill className="ml-2">bot</Pill> : null}
                  {entry["wild_card"] ? (
                    <Pill className="ml-2" tone="accent">
                      wild
                    </Pill>
                  ) : null}
                </Cell>
                <Cell mono>{String(entry["car_id"] ?? "—")}</Cell>
                <Cell mono>{n(entry["bt"])}</Cell>
                <Cell mono>{n(entry["best_rt"])}</Cell>
                <Cell mono>{n(entry["best_et"])}</Cell>
                <Cell mono>{n(entry["best_total"])}</Cell>
                <Cell mono>{String(entry["runs"] ?? 0)}</Cell>
                <Cell>
                  <Pill>{String(entry["status"] ?? "")}</Pill>
                </Cell>
                <Cell mono>{entry["placement"] == null ? "—" : String(entry["placement"])}</Cell>
                <Cell mono>{money(entry["prize"])}</Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </Panel>

      <Panel title="Bracket" count={matches.length}>
        {matches.length === 0 ? (
          <EmptyState>The bracket has not been drawn.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {[...rounds.entries()].map(([round, list]) => (
              <div key={round}>
                <p className="label-eyebrow mb-1">Round {round}</p>
                <DataTable head={["#", "Lane 1", "ET", "Lane 2", "ET", "Winner", "Reason"]}>
                  {list.map((match) => (
                    <Row key={`${round}-${String(match["match"])}`}>
                      <Cell mono>{String(match["match"])}</Cell>
                      <Cell>{who(match["p1"])}</Cell>
                      <Cell mono>{n(match["et1"])}</Cell>
                      <Cell>{who(match["p2"])}</Cell>
                      <Cell mono>{n(match["et2"])}</Cell>
                      <Cell className="font-medium">{who(match["winner_id"])}</Cell>
                      <Cell className="text-xs text-muted-foreground">
                        {String(match["reason"] ?? "")}
                        {match["pink_car"] ? ` · pink car ${String(match["pink_car"])}` : ""}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Qualifying runs" count={runs.length}>
        {runs.length === 0 ? (
          <EmptyState>No qualifying runs.</EmptyState>
        ) : (
          <DataTable head={["Racer", "RT", "ET", "Speed", "Dial-in", "Total", "Status", "At"]}>
            {runs.slice(-200).map((run) => (
              <Row key={String(run["id"])}>
                <Cell>{who(run["player_id"])}</Cell>
                <Cell mono>{n(run["rt"])}</Cell>
                <Cell mono>{n(run["et"])}</Cell>
                <Cell mono>{n(run["ts"], 2)}</Cell>
                <Cell mono>{n(run["bt"])}</Cell>
                <Cell mono>{n(run["total"])}</Cell>
                <Cell mono>{String(run["status"])}</Cell>
                <Cell mono className="text-muted-foreground">
                  {dateLabel(String(run["at"] ?? ""))}
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </Panel>

      {payouts.length > 0 && (
        <Panel title="Payouts" count={payouts.length}>
          <DataTable head={["Racer", "Currency", "Amount", "Reason", "At"]}>
            {payouts.map((row) => (
              <Row key={String(row["id"])}>
                <Cell>{who(row["playerId"])}</Cell>
                <Cell>{String(row["currency"])}</Cell>
                <Cell mono>{integer(row["delta"])}</Cell>
                <Cell className="text-xs">{String(row["reason"])}</Cell>
                <Cell mono className="text-muted-foreground">
                  {dateLabel(String(row["createdAt"] ?? ""))}
                </Cell>
              </Row>
            ))}
          </DataTable>
        </Panel>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ audit */

function AuditTab() {
  const audit = useQuery({
    queryKey: gameKey("audit"),
    queryFn: () => api<{ events: AuditRow[] }>("/api/admin/tournament-schedule/audit?limit=200"),
    retry: false,
  });
  const list = audit.data?.events ?? [];
  return (
    <Panel title="Schedule audit" count={list.length} note="Every schedule write, newest first">
      {audit.isLoading ? (
        <LoadingState label="Reading the audit log" />
      ) : audit.isError ? (
        <ErrorState error={audit.error} what="the schedule audit" />
      ) : list.length === 0 ? (
        <EmptyState>No schedule changes recorded.</EmptyState>
      ) : (
        <DataTable head={["At", "Actor", "Action", "Slot", "Event", "Detail"]}>
          {list.map((row) => (
            <Row key={row.id}>
              <Cell mono className="whitespace-nowrap text-muted-foreground">
                {dateLabel(row.at)}
              </Cell>
              <Cell className="font-medium">{row.actor}</Cell>
              <Cell>
                <Pill>{row.action}</Pill>
              </Cell>
              <Cell mono>{row.schedule_id ?? "—"}</Cell>
              <Cell mono>{row.event_id ?? "—"}</Cell>
              <Cell className="max-w-[28rem] truncate font-mono text-xs text-muted-foreground">
                {row.detail == null ? "" : JSON.stringify(row.detail)}
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- legacy */

type LegacyTournament = {
  id: number;
  name: string;
  kind: Kind;
  cs: string;
  tstr: string;
  status: number;
  maxEntrants: number;
  entryFee: number;
  entryCur: "f" | "m";
  prize1: number;
  prize2: number;
  prizeRound: number;
  li: number;
  pi: number;
  leagueId: string;
  recurrence: "none" | "weekly" | "always";
  startAt: number;
  endAt: number;
  lockCarId: number | null;
  lockCarLabel: string | null;
  lockNa: boolean;
  lockCity: number | null;
  scMin: number | null;
  scMax: number | null;
  entryReq: string;
  descr: string;
  active: boolean;
  sortOrder: number;
};

type SimResult = {
  races: number;
  text: string;
  bracket: {
    fieldSize: number;
    champion: { name: string; car: string };
    runnerUp: { name: string; car: string };
    payouts: { champion: number; runnerUp: number; perRoundWin: number };
  };
};

const LEGACY_STATUS: Record<number, string> = { 0: "closed", 1: "scheduled", 2: "always open" };

function LegacyTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LegacyTournament | "new" | null>(null);
  const [simFor, setSimFor] = useState<LegacyTournament | null>(null);

  const list = useQuery({
    queryKey: gameKey("legacy"),
    queryFn: () => api<{ tournaments: LegacyTournament[] }>("/api/admin/tournaments"),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api(`/api/admin/tournaments/${id}/active`, { method: "POST", body: { active } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gameKey("legacy") }),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/tournaments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Tournament deleted.");
      queryClient.invalidateQueries({ queryKey: gameKey("legacy") });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = list.data?.tournaments ?? [];

  return (
    <Panel
      title="Legacy tournament list"
      count={rows.length}
      note="The older in-game list (tournaments-human) and the bracket simulator"
      actions={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" aria-hidden />
          New tournament
        </Button>
      }
    >
      {list.isLoading ? (
        <LoadingState label="Reading tournaments" />
      ) : list.isError ? (
        <ErrorState error={list.error} what="tournaments" />
      ) : rows.length === 0 ? (
        <EmptyState>No tournaments.</EmptyState>
      ) : (
        <DataTable
          head={["Tournament", "Type", "Status", "Schedule", "Entry", "Purse", "Active", ""]}
        >
          {rows.map((item) => (
            <Row key={item.id}>
              <Cell>
                <div className="font-medium">{item.name}</div>
                <div className="numeric text-xs text-muted-foreground">#{item.id}</div>
              </Cell>
              <Cell>
                <Pill tone={kindTone(item.kind)}>{item.kind}</Pill>
              </Cell>
              <Cell>
                <Pill
                  tone={item.status === 0 ? "neutral" : item.status === 2 ? "success" : "warning"}
                >
                  {LEGACY_STATUS[item.status] ?? String(item.status)}
                </Pill>
              </Cell>
              <Cell mono className="whitespace-nowrap">
                {item.tstr}
                <div className="text-xs text-muted-foreground">{item.recurrence}</div>
              </Cell>
              <Cell mono>{fee(item.entryFee, item.entryCur)}</Cell>
              <Cell mono className="whitespace-nowrap">
                {money(item.prize1)} / {money(item.prize2)}
              </Cell>
              <Cell>
                <Switch
                  checked={item.active}
                  disabled={toggle.isPending}
                  onCheckedChange={(active) => toggle.mutate({ id: item.id, active })}
                  aria-label="Active"
                />
              </Cell>
              <Cell>
                <div className="flex gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Edit"
                    onClick={() => setEditing(item)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSimFor(item)}>
                    <Play className="size-3.5" aria-hidden />
                    Simulate
                  </Button>
                  <ConfirmButton
                    size="icon"
                    variant="destructive"
                    label="Delete"
                    title={`Delete “${item.name}”?`}
                    description="The tournament is removed from the in-game list. This cannot be undone."
                    confirmLabel="Delete"
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(item.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </ConfirmButton>
                </div>
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {editing != null && (
            <LegacyForm
              tournament={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={simFor != null} onOpenChange={(open) => !open && setSimFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {simFor && <Simulator tournament={simFor} />}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function LegacyForm({
  tournament,
  onDone,
}: {
  tournament: LegacyTournament | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const t = tournament;
  const [kind, setKind] = useState<string>(t?.kind ?? "bracket");
  const [entryCur, setEntryCur] = useState<string>(t?.entryCur ?? "f");
  const [lockNa, setLockNa] = useState(t?.lockNa ?? false);
  const [active, setActive] = useState(t?.active ?? true);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ created: boolean; tournament: LegacyTournament }>("/api/admin/tournaments", {
        method: "POST",
        body,
      }),
    onSuccess: (data) => {
      toast.success(
        data.created ? `Tournament #${data.tournament.id} created.` : "Tournament saved.",
      );
      queryClient.invalidateQueries({ queryKey: gameKey("legacy") });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toUnix = (value: string) => (value ? Math.floor(new Date(value).getTime() / 1000) : 0);
  const toLocal = (seconds?: number) => {
    if (!seconds) return "";
    const date = new Date(seconds * 1000);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t ? `Edit tournament #${t.id}` : "New tournament"}</DialogTitle>
        <DialogDescription>New tournaments get an id in the 1000+ band.</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const opt = (key: string) => formInt(data, key) ?? null;
          const body: Record<string, unknown> = {
            name: formText(data, "name"),
            kind,
            status: formInt(data, "status") ?? 1,
            tstr: formText(data, "tstr"),
            recurrence: formText(data, "recurrence"),
            startAt: toUnix(formText(data, "startAt")),
            endAt: toUnix(formText(data, "endAt")),
            maxEntrants: formInt(data, "maxEntrants") ?? 32,
            entryCur,
            entryFee: entryCur === "f" ? 0 : (formInt(data, "entryFee") ?? 0),
            prize1: formInt(data, "prize1") ?? 0,
            prize2: formInt(data, "prize2") ?? 0,
            prizeRound: formInt(data, "prizeRound") ?? 0,
            lockCarId: opt("lockCarId"),
            lockCarLabel: formText(data, "lockCarLabel"),
            lockCity: opt("lockCity"),
            scMin: opt("scMin"),
            scMax: opt("scMax"),
            lockNa,
            entryReq: formText(data, "entryReq"),
            descr: formText(data, "descr"),
            sortOrder: formInt(data, "sortOrder") ?? 100,
            active,
          };
          if (t) body["id"] = t.id;
          save.mutate(body);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
          <Field label="Name">
            <Input name="name" required defaultValue={t?.name ?? ""} />
          </Field>
          <Field label="Type">
            <NativeSelect
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              options={KIND_OPTIONS}
            />
          </Field>
          <Field label="Status (s)">
            <NativeSelect
              name="status"
              defaultValue={String(t?.status ?? 1)}
              options={[
                { value: "2", label: "2 · always open" },
                { value: "1", label: "1 · scheduled" },
                { value: "0", label: "0 · closed" },
              ]}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Schedule text">
            <Input name="tstr" placeholder="ANY TIME" defaultValue={t?.tstr ?? ""} />
          </Field>
          <Field label="Recurrence">
            <NativeSelect
              name="recurrence"
              defaultValue={t?.recurrence ?? "none"}
              options={[
                { value: "none", label: "One-off" },
                { value: "weekly", label: "Weekly" },
                { value: "always", label: "Always" },
              ]}
            />
          </Field>
          <Field label="Starts">
            <Input name="startAt" type="datetime-local" defaultValue={toLocal(t?.startAt)} />
          </Field>
          <Field label="Ends">
            <Input name="endAt" type="datetime-local" defaultValue={toLocal(t?.endAt)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Draw size">
            <Input
              name="maxEntrants"
              type="number"
              min={2}
              max={64}
              defaultValue={t?.maxEntrants ?? 32}
            />
          </Field>
          <Field label="Entry (ct/et)">
            <NativeSelect
              value={entryCur}
              onChange={(event) => setEntryCur(event.target.value)}
              options={[
                { value: "f", label: "Free (f)" },
                { value: "m", label: "Money (m)" },
              ]}
            />
          </Field>
          <Field label="Fee">
            <Input
              name="entryFee"
              type="number"
              min={0}
              disabled={entryCur === "f"}
              defaultValue={t?.entryFee ?? 0}
            />
          </Field>
          <Field label="Purse p1">
            <Input name="prize1" type="number" min={0} defaultValue={t?.prize1 ?? 0} />
          </Field>
          <Field label="Purse p2">
            <Input name="prize2" type="number" min={0} defaultValue={t?.prize2 ?? 0} />
          </Field>
          <Field label="Per round">
            <Input name="prizeRound" type="number" min={0} defaultValue={t?.prizeRound ?? 0} />
          </Field>
        </div>
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="label-eyebrow px-1">Eligibility</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Car lock id">
              <Input name="lockCarId" type="number" min={1} defaultValue={t?.lockCarId ?? ""} />
            </Field>
            <Field label="Car lock label">
              <Input name="lockCarLabel" defaultValue={t?.lockCarLabel ?? ""} />
            </Field>
            <Field label="City">
              <NativeSelect
                name="lockCity"
                defaultValue={t?.lockCity != null ? String(t.lockCity) : ""}
                options={[
                  { value: "", label: "Any" },
                  ...Object.entries(CITIES).map(([value, label]) => ({ value, label })),
                ]}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch checked={lockNa} onCheckedChange={setLockNa} />
              N/A only
            </label>
            <Field label="SC min">
              <Input name="scMin" type="number" min={0} defaultValue={t?.scMin ?? ""} />
            </Field>
            <Field label="SC max">
              <Input name="scMax" type="number" min={0} defaultValue={t?.scMax ?? ""} />
            </Field>
            <Field label="Sort order">
              <Input name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 100} />
            </Field>
          </div>
        </fieldset>
        <Field label="Entry requirements">
          <Textarea name="entryReq" rows={2} defaultValue={t?.entryReq ?? ""} />
        </Field>
        <Field label="Description">
          <Textarea name="descr" rows={2} defaultValue={t?.descr ?? ""} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Active (shown in the client)
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function Simulator({ tournament }: { tournament: LegacyTournament }) {
  const queryClient = useQueryClient();
  const [fieldSize, setFieldSize] = useState(
    [8, 16, 32, 64].includes(tournament.maxEntrants) ? String(tournament.maxEntrants) : "32",
  );
  const [seed, setSeed] = useState("");
  const sim = useMutation({
    mutationFn: () =>
      api<SimResult>(`/api/admin/tournaments/${tournament.id}/simulate`, {
        method: "POST",
        body: { fieldSize: Number(fieldSize), ...(seed ? { seed: Number(seed) } : {}) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gameKey("legacy") }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Simulate “{tournament.name}”</DialogTitle>
        <DialogDescription>
          Runs every race of a bot field to a champion. Simulating also ENABLES the tournament
          (active, and a closed status is lifted to scheduled).
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Field size" className="w-32">
          <NativeSelect
            value={fieldSize}
            onChange={(event) => setFieldSize(event.target.value)}
            options={["8", "16", "32", "64"].map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="Seed" className="w-32">
          <Input
            type="number"
            placeholder="random"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
          />
        </Field>
        <Button disabled={sim.isPending} onClick={() => sim.mutate()}>
          <Play className="size-3.5" aria-hidden />
          Run simulation
        </Button>
      </div>
      {sim.isPending && <LoadingState label="Racing the bracket" />}
      {sim.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Champion"
              value={sim.data.bracket.champion.name}
              hint={`${sim.data.bracket.champion.car} · ${money(sim.data.bracket.payouts.champion)}`}
              tone="success"
            />
            <StatTile
              label="Runner-up"
              value={sim.data.bracket.runnerUp.name}
              hint={`${sim.data.bracket.runnerUp.car} · ${money(sim.data.bracket.payouts.runnerUp)}`}
            />
            <StatTile
              label="Races"
              value={integer(sim.data.races)}
              hint={`${sim.data.bracket.fieldSize}-car field`}
            />
          </div>
          <pre className="scroll-slim max-h-[50vh] overflow-auto rounded-lg border border-border bg-surface/70 p-3 font-mono text-xs leading-relaxed">
            {sim.data.text}
          </pre>
        </>
      )}
    </>
  );
}
