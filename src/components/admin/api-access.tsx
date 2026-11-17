/*
 * Race Control > Security: anonymous API access (flagged addresses with their evidence) and API IP blocks.
 * Server: apps/api src/json/api-access.ts (game repo, docs/65-api-access.md). Moderators see masked addresses
 * and no actions; admins (role 4+) see full addresses and can block and lift. The server enforces both.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  type PillTone,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, buildQuery, dateLabel, integer } from "@/lib/admin-api";

type AccessRow = {
  ip: string;
  canAct: boolean;
  level: "none" | "low" | "medium" | "high";
  points: number;
  reasons: string[];
  hours: number;
  firstAt: string;
  lastAt: string;
  counts: {
    anonymous: number;
    signedIn: number;
    gameClient: number;
    portalToken: number;
    portalBrowser: number;
    unsigned: number;
    scraperUa: number;
    sequentialSteps: number;
    maxPerMinute: number;
    rateLimited: number;
    blockedCalls: number;
  };
  via: string | null;
  trusted: boolean;
  peer: string | null;
  routes: Record<string, number>;
  userAgents: Record<string, number>;
  sample: unknown;
  blocked: number | null;
  usedBySignedInRecently: boolean | null;
};

type AccessReport = {
  hours: number;
  rows: AccessRow[];
  thresholds: Record<string, number | boolean>;
};

type IpBlock = {
  id: number;
  ip: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  auto: boolean;
  live: boolean;
};

function levelTone(level: string): PillTone {
  if (level === "high") return "danger";
  if (level === "medium") return "warning";
  return "neutral";
}

const topList = (m: Record<string, number>, n = 4) =>
  Object.entries(m ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

export function ApiAccessPanel() {
  const [hours, setHours] = useState(24);
  const [all, setAll] = useState(false);
  const queryClient = useQueryClient();
  const report = useQuery({
    queryKey: ["admin", "api-access", hours, all],
    queryFn: () =>
      api<AccessReport>(`/api/admin/api-access${buildQuery({ hours, all: all ? 1 : undefined })}`),
    retry: false,
  });
  const block = useBlockMutation(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "api-access"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "ip-blocks"] });
  });

  const rows = report.data?.rows ?? [];
  const t = report.data?.thresholds;

  return (
    <Panel title="Anonymous API access" count={rows.length}>
      <p className="mb-3 text-sm text-muted-foreground">
        Calls made without signing in, per address. Each call is checked for the game client's
        request shape and the website's portal token. Anything else counts as unsigned.
        {t ? (
          <>
            {" "}
            Flag at {integer(Number(t["flagAnonPerHour"]))} unsigned calls an hour; automatic{" "}
            {String(t["autoBlockHours"])} h block at {integer(Number(t["autoBlockAnonPerHour"]))} (
            {t["autoBlock"] ? "on" : "off"}), never for an address a signed-in racer used in the
            last {String(t["protectSignedInDays"])} days. Portal token required:{" "}
            {t["portalTokenRequired"] ? "yes" : "no (monitor only)"}.
          </>
        ) : null}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {[1, 24, 168].map((h) => (
          <Button
            key={h}
            size="sm"
            variant={hours === h ? "default" : "outline"}
            onClick={() => setHours(h)}
          >
            {h === 1 ? "Last hour" : h === 24 ? "Last 24 h" : "Last 7 days"}
          </Button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show
          unflagged addresses
        </label>
      </div>
      {report.isLoading ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState error={report.error} what="the API access report" />
      ) : rows.length === 0 ? (
        <EmptyState>No flagged addresses in this window.</EmptyState>
      ) : (
        <DataTable head={["Level", "Address", "Calls", "Looked like", "Evidence", "Last seen", ""]}>
          {rows.map((r) => (
            <Row key={r.ip}>
              <Cell>
                <Pill tone={levelTone(r.level)}>{r.level}</Pill>
              </Cell>
              <Cell mono>
                <div>{r.ip}</div>
                <div className="text-xs text-muted-foreground">
                  via {r.via ?? "?"}
                  {r.trusted ? "" : " (address not verified)"}
                </div>
                {r.blocked ? <Pill tone="danger">blocked #{r.blocked}</Pill> : null}
                {r.usedBySignedInRecently ? (
                  <div className="text-xs text-amber-600">used by a signed-in racer</div>
                ) : null}
              </Cell>
              <Cell className="text-sm">
                <div>{integer(r.counts.anonymous)} anonymous</div>
                <div className="text-muted-foreground">{integer(r.counts.unsigned)} unsigned</div>
                <div className="text-muted-foreground">{integer(r.counts.signedIn)} signed in</div>
                <div className="text-muted-foreground">
                  peak {integer(r.counts.maxPerMinute)}/min
                </div>
              </Cell>
              <Cell className="text-sm text-muted-foreground">
                <div>game client {integer(r.counts.gameClient)}</div>
                <div>portal token {integer(r.counts.portalToken)}</div>
                <div>website browser {integer(r.counts.portalBrowser)}</div>
              </Cell>
              <Cell className="max-w-[28rem] break-words text-sm">
                {r.reasons.length ? <div>{r.reasons.join("; ")}</div> : null}
                <div className="text-xs text-muted-foreground">
                  Routes: {topList(r.routes) || "none"}
                </div>
                <div className="text-xs text-muted-foreground">
                  User agents: {topList(r.userAgents, 3) || "none"}
                </div>
              </Cell>
              <Cell mono className="text-muted-foreground">
                {dateLabel(r.lastAt)}
              </Cell>
              <Cell>
                {r.canAct && !r.blocked ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={block.isPending}
                    onClick={() => {
                      const reason = window.prompt(
                        `Block ${r.ip} from the API. Reason:`,
                        r.reasons[0] ?? "",
                      );
                      if (!reason) return;
                      const h = window.prompt("Hours (leave empty to block until lifted):", "24");
                      if (h === null) return;
                      block.mutate({ ip: r.ip, reason, hours: h.trim() ? Number(h) : null });
                    }}
                  >
                    Block
                  </Button>
                ) : null}
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

function useBlockMutation(onDone: () => void) {
  return useMutation({
    mutationFn: async (v: {
      ip: string;
      reason: string;
      hours: number | null;
      confirm?: boolean;
    }) => {
      try {
        return await api("/api/admin/ip-blocks", { method: "POST", body: v });
      } catch (error) {
        const payload =
          error instanceof ApiError ? (error.payload as { needsConfirm?: boolean } | null) : null;
        if (
          payload?.needsConfirm &&
          !v.confirm &&
          window.confirm(`${(error as Error).message}\n\nBlock it anyway?`)
        ) {
          return api("/api/admin/ip-blocks", { method: "POST", body: { ...v, confirm: true } });
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Address blocked. Recorded in the audit trail.");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function IpBlocksPanel() {
  const queryClient = useQueryClient();
  const blocks = useQuery({
    queryKey: ["admin", "ip-blocks"],
    queryFn: () => api<{ canAct: boolean; blocks: IpBlock[] }>("/api/admin/ip-blocks"),
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "ip-blocks"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "api-access"] });
  };
  const block = useBlockMutation(refresh);
  const lift = useMutation({
    mutationFn: (v: { id: number; reason: string }) =>
      api(`/api/admin/ip-blocks/${v.id}/lift`, { method: "POST", body: { reason: v.reason } }),
    onSuccess: () => {
      toast.success("Block lifted. Recorded in the audit trail.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const list = blocks.data?.blocks ?? [];
  const canAct = blocks.data?.canAct ?? false;

  return (
    <Panel title="API IP blocks" count={list.filter((b) => b.live).length}>
      <p className="mb-3 text-sm text-muted-foreground">
        A blocked address gets a plain 403 from the game API and the website API. Staff pages stay
        reachable so a block can always be lifted.
      </p>
      {canAct ? (
        <form
          className="mb-4 grid gap-3 sm:grid-cols-[1fr_2fr_8rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const hours = String(data.get("hours") || "").trim();
            block.mutate({
              ip: String(data.get("ip") || "").trim(),
              reason: String(data.get("reason") || "").trim(),
              hours: hours ? Number(hours) : null,
            });
          }}
        >
          <Field label="Address or range">
            <Input name="ip" required placeholder="203.0.113.7 or 203.0.113.0/24" />
          </Field>
          <Field label="Reason">
            <Input name="reason" required minLength={3} placeholder="Why this address is blocked" />
          </Field>
          <Field label="Hours">
            <Input name="hours" inputMode="numeric" placeholder="until lifted" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="destructive" disabled={block.isPending}>
              Block
            </Button>
          </div>
        </form>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          Only admins can block or lift addresses.
        </p>
      )}
      {blocks.isLoading ? (
        <LoadingState />
      ) : blocks.isError ? (
        <ErrorState error={blocks.error} what="the IP blocks" />
      ) : list.length === 0 ? (
        <EmptyState>No addresses have been blocked.</EmptyState>
      ) : (
        <DataTable head={["Address", "State", "Reason", "By", "Set", "Expires", ""]}>
          {list.map((b) => (
            <Row key={b.id}>
              <Cell mono>
                {b.ip}
                <div className="text-xs text-muted-foreground">#{b.id}</div>
              </Cell>
              <Cell>
                <Pill tone={b.live ? "danger" : "neutral"}>
                  {b.live ? "active" : b.liftedAt ? "lifted" : "expired"}
                </Pill>
                {b.auto ? <div className="text-xs text-muted-foreground">automatic</div> : null}
              </Cell>
              <Cell className="max-w-[24rem] break-words text-sm text-muted-foreground">
                {b.reason}
              </Cell>
              <Cell className="text-sm">
                {b.createdBy}
                {b.liftedBy ? (
                  <div className="text-xs text-muted-foreground">lifted by {b.liftedBy}</div>
                ) : null}
              </Cell>
              <Cell mono className="text-muted-foreground">
                {dateLabel(b.createdAt)}
              </Cell>
              <Cell mono className="text-muted-foreground">
                {b.expiresAt ? dateLabel(b.expiresAt) : "until lifted"}
              </Cell>
              <Cell>
                {canAct && b.live ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={lift.isPending}
                    onClick={() => {
                      const reason = window.prompt(`Lift block #${b.id} on ${b.ip}. Reason:`);
                      if (reason) lift.mutate({ id: b.id, reason });
                    }}
                  >
                    Lift
                  </Button>
                ) : null}
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
