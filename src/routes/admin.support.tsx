import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, MessageSquare, RefreshCw, UserCheck, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, buildQuery, dateLabel, relativeLabel } from "@/lib/admin-api";

/*
 * Race Control > Support: the unified support desk (API docs/support-system.md). One ticket store shared by
 * the in-game Support Center, Discord (Ichiban /support + staff threads) and the website. A reply here is
 * delivered as in-game mail, a Discord DM and a line in the ticket's staff thread; an internal note is staff only.
 */

type SearchParams = { ticket?: number };

export const Route = createFileRoute("/admin/support")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const n = Number(search["ticket"]);
    return Number.isInteger(n) && n > 0 ? { ticket: n } : {};
  },
  head: () => ({
    meta: [
      { title: "Support — Racing Legends Race Control" },
      { name: "description", content: "The unified support desk: game, Discord and website tickets in one queue." },
      { property: "og:title", content: "Support — Racing Legends Race Control" },
      { property: "og:description", content: "Staff support desk." },
    ],
  }),
  component: SupportPage,
});

type TypeSpec = { key: string; label: string; gate: string; desk: string; decision: boolean; hint: string; priority: string };
type Meta = {
  types: TypeSpec[];
  statuses: string[];
  active: string[];
  priorities: string[];
  sources: string[];
  counts: Record<string, number>;
  activeByType: Record<string, number>;
};
type Ticket = {
  id: number;
  playerId: number | null;
  reporter: string | null;
  topic: string;
  misconduct: boolean;
  email: string | null;
  offenderUsername: string | null;
  status: string;
  createdAt: string;
  type: string;
  typeLabel: string;
  source: string;
  subject: string;
  priority: string;
  assignee: string | null;
  discordUserId: string | null;
  discordName: string | null;
  discordThreadId: string | null;
  linkKind: string | null;
  linkId: string | null;
  request: Record<string, unknown> | null;
  decision: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  updatedAt: string;
  messages: number;
  lastMessageAt: string | null;
};
type Message = {
  id: number;
  authorKind: "player" | "staff" | "system";
  authorName: string | null;
  body: string;
  attachments: Array<{ url: string; name?: string | null }>;
  internal: boolean;
  source: string;
  dmState: string | null;
  mailId: number | null;
  createdAt: string;
};
type Detail = {
  ticket: Ticket;
  messages: Message[];
  events: Array<{ id: number; kind: string; body: string | null; status_from: string | null; status_to: string | null; actor: string | null; at: string }>;
  context: {
    reporter: { username: string; clientRole: number; banned: boolean; bans: number; vip: boolean; discordLinked: boolean } | null;
    offender: { username: string; banned: boolean; bans: number } | null;
  };
  related: Ticket[];
  spec: TypeSpec;
  links: {
    migrationItems?: Array<{ id: number; carName: string; catalogCarId: number; reason: string; status: string; denyReason: string | null }>;
    claim?: { id: number; handle: string; status: string } | null;
    inviteRequest?: { id: number; name: string; status: string } | null;
  };
};

const key = (...parts: unknown[]) => ["game", "support", ...parts];

export function statusTone(status: string): PillTone {
  if (status === "open") return "warning";
  if (status === "waiting_on_staff") return "danger";
  if (status === "waiting_on_player") return "info";
  if (status === "resolved" || status === "actioned") return "success";
  return "neutral";
}
function priorityTone(p: string): PillTone {
  return p === "urgent" ? "danger" : p === "high" ? "warning" : p === "low" ? "neutral" : "primary";
}
const words = (s: string) => s.replace(/_/g, " ");

function SupportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/support" });
  const [status, setStatus] = useState("active");
  const [type, setType] = useState("all");
  const [source, setSource] = useState("all");
  const [assignee, setAssignee] = useState("");
  const [q, setQ] = useState("");
  const selected = search.ticket ?? null;
  const select = (id: number | null) => navigate({ search: id ? { ticket: id } : {} });

  const meta = useQuery({ queryKey: key("meta"), queryFn: () => api<Meta>("/api/admin/support/meta"), retry: false });
  const list = useQuery({
    queryKey: key("list", status, type, source, assignee, q),
    queryFn: () =>
      api<{ tickets: Ticket[] }>(
        `/api/admin/support/tickets${buildQuery({ status, type: type === "all" ? undefined : type, source: source === "all" ? undefined : source, assignee: assignee || undefined, q: q.trim() || undefined })}`,
      ),
    retry: false,
    refetchInterval: 30_000,
  });

  const types = meta.data?.types ?? [];
  const counts = meta.data?.counts ?? {};
  const tickets = list.data?.tickets ?? [];

  return (
    <>
      <PageHeading
        title="Support"
        subtitle="One desk for the in-game Support Center, Discord (/support and the staff threads) and the website. Replies reach the racer as in-game mail and a Discord DM; internal notes stay with staff."
      />
      <GameApiCredential />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Open" value={counts["open"] ?? 0} tone="warning" />
        <StatTile label="Waiting on staff" value={counts["waiting_on_staff"] ?? 0} tone="danger" />
        <StatTile label="Waiting on player" value={counts["waiting_on_player"] ?? 0} />
        <StatTile label="Resolved" value={(counts["resolved"] ?? 0) + (counts["actioned"] ?? 0)} tone="success" />
      </div>

      <Panel title="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Status">
            <NativeSelect
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[{ value: "active", label: "Active (open + waiting)" }, { value: "all", label: "All" }, ...(meta.data?.statuses ?? []).map((s) => ({ value: s, label: words(s) }))]}
            />
          </Field>
          <Field label="Type">
            <NativeSelect
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t.key, label: `${t.label}${meta.data?.activeByType[t.key] ? ` (${meta.data.activeByType[t.key]})` : ""}` }))]}
            />
          </Field>
          <Field label="Source">
            <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} options={[{ value: "all", label: "All sources" }, ...(meta.data?.sources ?? []).map((s) => ({ value: s, label: s }))]} />
          </Field>
          <Field label="Assignee">
            <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "none", label: "Unassigned" }]} />
          </Field>
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Text, racer, subject" className="h-9" />
          </Field>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel title="Tickets" count={tickets.length} actions={<Button size="sm" variant="ghost" onClick={() => list.refetch()} aria-label="Refresh"><RefreshCw className="size-3.5" aria-hidden /></Button>}>
          {list.isLoading ? (
            <LoadingState label="Reading the desk" />
          ) : list.isError ? (
            <ErrorState error={list.error} what="support tickets" />
          ) : tickets.length === 0 ? (
            <EmptyState>Nothing here.</EmptyState>
          ) : (
            <DataTable head={["#", "Ticket", "From", "State", "Updated"]}>
              {tickets.map((t) => (
                <Row key={t.id} className={selected === t.id ? "bg-primary/10" : "cursor-pointer hover:bg-muted/40"}>
                  <Cell mono className="text-muted-foreground">
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => select(t.id)}>#{t.id}</button>
                  </Cell>
                  <Cell>
                    <button type="button" className="text-left" onClick={() => select(t.id)}>
                      <div className="font-medium">{t.subject}</div>
                      <div className="text-xs text-muted-foreground">{t.typeLabel} · {t.source}</div>
                    </button>
                  </Cell>
                  <Cell className="text-xs">
                    {t.reporter ?? t.discordName ?? (t.email ? "email" : "—")}
                    {t.assignee ? <div className="text-muted-foreground">→ {t.assignee}</div> : null}
                  </Cell>
                  <Cell>
                    <div className="flex flex-col items-start gap-1">
                      <Pill tone={statusTone(t.status)}>{words(t.status)}</Pill>
                      {t.priority !== "normal" && <Pill tone={priorityTone(t.priority)}>{t.priority}</Pill>}
                    </div>
                  </Cell>
                  <Cell mono className="text-xs text-muted-foreground">{relativeLabel(t.lastMessageAt ?? t.updatedAt)}</Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>

        {selected ? (
          <TicketDetail id={selected} meta={meta.data} onClose={() => select(null)} />
        ) : (
          <Panel title="Ticket">
            <EmptyState>Pick a ticket to read the conversation and answer it.</EmptyState>
          </Panel>
        )}
      </div>
    </>
  );
}

function TicketDetail({ id, meta, onClose }: { id: number; meta: Meta | undefined; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [carId, setCarId] = useState("");
  const [amount, setAmount] = useState("");
  const [denyReason, setDenyReason] = useState<Record<number, string>>({});

  const detail = useQuery({ queryKey: key("ticket", id), queryFn: () => api<Detail>(`/api/admin/support/tickets/${id}`), retry: false, refetchInterval: 20_000 });
  useEffect(() => { setReply(""); setNote(""); setReason(""); setCarId(""); setAmount(""); }, [id]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key() });

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api(`/api/admin/support/tickets/${id}/${path}`, { method: "POST", body }),
    onSuccess: (_d, v) => {
      toast.success(v.path === "reply" ? "Reply sent (mail + Discord)." : v.path === "note" ? "Internal note added." : "Saved.");
      if (v.path === "reply") setReply("");
      if (v.path === "note") setNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const review = useMutation({
    mutationFn: ({ itemId, verb, reason }: { itemId: number; verb: "approve" | "deny"; reason?: string }) =>
      api(`/api/admin/migrations/review/${itemId}/${verb}`, { method: "POST", body: verb === "deny" ? { reason } : {} }),
    onSuccess: () => { toast.success("Import decision saved; the ticket was updated."); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const t = detail.data?.ticket;
  const statusOptions = useMemo(() => (meta?.statuses ?? ["open", "waiting_on_player", "waiting_on_staff", "resolved", "closed"]).map((s) => ({ value: s, label: words(s) })), [meta]);

  if (detail.isLoading) return <Panel title={`Ticket #${id}`}><LoadingState /></Panel>;
  if (detail.isError || !t || !detail.data) return <Panel title={`Ticket #${id}`}><ErrorState error={detail.error} what="this ticket" /></Panel>;
  const d = detail.data;
  const canReply = t.playerId != null || Boolean(t.discordUserId);
  const busy = act.isPending;

  return (
    <Panel
      title={<span>#{t.id} · {t.subject}</span>}
      note={`${t.typeLabel} · from ${t.source} · opened ${dateLabel(t.createdAt)}`}
      actions={<Button size="sm" variant="ghost" onClick={onClose} aria-label="Close ticket view"><X className="size-3.5" aria-hidden /></Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={statusTone(t.status)}>{words(t.status)}</Pill>
        <Pill tone={priorityTone(t.priority)}>{t.priority}</Pill>
        {t.decision && <Pill tone={t.decision === "approved" ? "success" : "danger"}>{t.decision}{t.decidedBy ? ` · ${t.decidedBy}` : ""}</Pill>}
        {t.discordThreadId ? <Pill tone="accent">Discord thread</Pill> : null}
        {t.assignee ? <span className="text-xs text-muted-foreground">Assigned to {t.assignee}</span> : <span className="text-xs text-muted-foreground">Unassigned</span>}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-medium text-foreground">Racer:</span>{" "}
          {d.context.reporter ? (
            <>
              {d.context.reporter.username}
              {d.context.reporter.vip ? " · VIP" : ""}
              {d.context.reporter.banned ? " · BANNED" : ""}
              {d.context.reporter.bans ? ` · ${d.context.reporter.bans} ban(s)` : ""}
              {d.context.reporter.discordLinked ? " · Discord linked" : ""}
            </>
          ) : (
            "none"
          )}
        </div>
        <div><span className="font-medium text-foreground">Discord:</span> {t.discordName ?? (t.discordUserId ? t.discordUserId : "none")}</div>
        {d.context.offender && (
          <div><span className="font-medium text-foreground">Reported:</span> {d.context.offender.username}{d.context.offender.banned ? " · banned" : ""} · {d.context.offender.bans} ban(s)</div>
        )}
        {t.email && <div><span className="font-medium text-foreground">Email:</span> {t.email}</div>}
        {t.request && (
          <div className="sm:col-span-2">
            <span className="font-medium text-foreground">Request:</span>{" "}
            {Object.entries(t.request).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
          </div>
        )}
        {t.linkKind && <div className="sm:col-span-2"><span className="font-medium text-foreground">Linked:</span> {t.linkKind} #{t.linkId}</div>}
      </div>

      {/* conversation */}
      <div className="mt-4 flex max-h-[28rem] flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">
        {d.messages.length === 0 ? (
          <EmptyState>No messages.</EmptyState>
        ) : (
          d.messages.map((m) => (
            <div
              key={m.id}
              className={
                m.internal
                  ? "rounded-md border border-warning/40 bg-warning/10 p-2 text-sm"
                  : m.authorKind === "staff"
                    ? "ml-6 rounded-md border border-primary/30 bg-primary/10 p-2 text-sm"
                    : m.authorKind === "system"
                      ? "text-center text-xs text-muted-foreground"
                      : "mr-6 rounded-md border border-border bg-muted/40 p-2 text-sm"
              }
            >
              {m.authorKind !== "system" && (
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {m.internal && <Lock className="size-3" aria-label="Internal note" />}
                  <span className="font-medium text-foreground">{m.authorName ?? m.authorKind}</span>
                  <span>· {m.source}</span>
                  <span>· {dateLabel(m.createdAt)}</span>
                  {m.mailId ? <span>· mailed</span> : null}
                  {m.dmState ? <span>· DM {m.dmState}</span> : null}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              {m.attachments.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5 text-xs">
                  {m.attachments.map((a) => (
                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">
                      {a.name || a.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* reply / note */}
      <div className="mt-3 grid gap-3">
        <Field label="Reply to the racer (in-game mail + Discord DM)">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} disabled={!canReply} placeholder={canReply ? "Write a reply" : "No racer and no Discord account: add a note instead"} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !reply.trim() || !canReply} onClick={() => act.mutate({ path: "reply", body: { body: reply } })}>
            <MessageSquare className="size-3.5" aria-hidden /> Send reply
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !reply.trim() || !canReply} onClick={() => act.mutate({ path: "reply", body: { body: reply, resolve: true } })}>
            <Check className="size-3.5" aria-hidden /> Reply and resolve
          </Button>
        </div>
        <Field label="Internal note (staff only)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Never shown to the racer" />
        </Field>
        <div>
          <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => act.mutate({ path: "note", body: { body: note } })}>
            <Lock className="size-3.5" aria-hidden /> Add note
          </Button>
        </div>
      </div>

      {/* state */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <NativeSelect value={t.status} disabled={busy} onChange={(e) => act.mutate({ path: "status", body: { status: e.target.value } })} options={statusOptions} />
        </Field>
        <Field label="Priority">
          <NativeSelect value={t.priority} disabled={busy} onChange={(e) => act.mutate({ path: "priority", body: { priority: e.target.value } })} options={(meta?.priorities ?? ["low", "normal", "high", "urgent"]).map((p) => ({ value: p, label: p }))} />
        </Field>
        <Field label="Assignee">
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ path: "assign", body: { assignee: "me" } })}>
              <UserCheck className="size-3.5" aria-hidden /> Me
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || !t.assignee} onClick={() => act.mutate({ path: "assign", body: { assignee: null } })}>
              Clear
            </Button>
          </div>
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {t.status !== "closed" ? (
          <ConfirmButton title={`Close ticket #${t.id}?`} description="The racer sees it as closed and can open a new ticket. The Discord thread is archived." confirmLabel="Close ticket" disabled={busy} onConfirm={() => act.mutate({ path: "status", body: { status: "closed" } })}>
            <X className="size-3.5" aria-hidden /> Close
          </ConfirmButton>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ path: "status", body: { status: "open" } })}>Reopen</Button>
        )}
      </div>

      {/* decision */}
      {d.spec.decision && !t.decision && (
        <div className="mt-4 rounded-md border border-border p-3">
          <div className="mb-2 text-sm font-medium">Decision</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {t.type === "car_restore" && (
              <Field label="Catalogue car id to restore">
                <Input value={carId} onChange={(e) => setCarId(e.target.value)} inputMode="numeric" className="h-9" />
              </Field>
            )}
            {t.type === "money_transfer" && (
              <Field label="Amount ($, admin only)">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="h-9" />
              </Field>
            )}
            <Field label="Reason (shown to the racer; required to deny)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" />
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ConfirmButton
              variant="default"
              destructive={false}
              title={`Approve ticket #${t.id}?`}
              description={t.type === "car_restore" ? "The car is granted through the award service (supply caps hold)." : t.type === "money_transfer" ? "The money is credited through the economy ledger, once." : "The decision is recorded and the racer is told."}
              confirmLabel="Approve"
              disabled={busy || (t.type === "car_restore" && !carId.trim()) || (t.type === "money_transfer" && !amount.trim())}
              onConfirm={() => act.mutate({ path: "decide", body: { decision: "approve", reason, ...(carId ? { catalogCarId: Number(carId) } : {}), ...(amount ? { amount: Number(amount) } : {}) } })}
            >
              <Check className="size-3.5" aria-hidden /> Approve
            </ConfirmButton>
            <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => act.mutate({ path: "decide", body: { decision: "deny", reason } })}>
              <X className="size-3.5" aria-hidden /> Deny
            </Button>
          </div>
        </div>
      )}

      {/* linked flows */}
      {d.links.migrationItems && d.links.migrationItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium">Garage import review</div>
          <DataTable head={["Car", "Why", "State", ""]}>
            {d.links.migrationItems.map((i) => (
              <Row key={i.id}>
                <Cell>{i.carName}<div className="font-mono text-xs text-muted-foreground">catalog {i.catalogCarId}</div></Cell>
                <Cell className="text-xs">{i.reason}</Cell>
                <Cell><Pill tone={i.status === "approved" ? "success" : i.status === "denied" ? "danger" : "warning"}>{i.status}</Pill>{i.denyReason ? <div className="text-xs text-muted-foreground">{i.denyReason}</div> : null}</Cell>
                <Cell>
                  {i.status === "pending" && (
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <ConfirmButton variant="default" destructive={false} title={`Grant “${i.carName}”?`} description="Granted through the award service; supply caps hold." confirmLabel="Approve and grant" disabled={review.isPending} onConfirm={() => review.mutate({ itemId: i.id, verb: "approve" })}>
                          <Check className="size-3.5" aria-hidden />
                        </ConfirmButton>
                        <Button size="sm" variant="destructive" disabled={review.isPending || !(denyReason[i.id] ?? "").trim()} onClick={() => review.mutate({ itemId: i.id, verb: "deny", reason: denyReason[i.id] ?? "" })}>
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                      <Input className="h-8 text-xs" placeholder="Reason to deny" value={denyReason[i.id] ?? ""} onChange={(e) => setDenyReason((cur) => ({ ...cur, [i.id]: e.target.value }))} />
                    </div>
                  )}
                </Cell>
              </Row>
            ))}
          </DataTable>
        </div>
      )}
      {d.links.claim && <div className="mt-3 text-xs text-muted-foreground">OG claim #{d.links.claim.id} for {d.links.claim.handle}: {d.links.claim.status}. Decide it in Accounts → claims; this ticket follows.</div>}
      {d.links.inviteRequest && <div className="mt-3 text-xs text-muted-foreground">Invite request #{d.links.inviteRequest.id} ({d.links.inviteRequest.name}): {d.links.inviteRequest.status}.</div>}

      {d.related.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium">Possibly related</div>
          <ul className="space-y-0.5 text-xs">
            {d.related.slice(0, 8).map((r) => (
              <li key={r.id}>#{r.id} · {words(r.status)} · {r.subject}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Audit trail ({d.events.length})</summary>
        <ul className="mt-1 space-y-0.5">
          {d.events.map((e) => (
            <li key={e.id}>{dateLabel(e.at)} · {e.actor} · {e.kind}{e.status_to ? ` ${e.status_from ?? ""} → ${e.status_to}` : ""}{e.body ? `: ${e.body}` : ""}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
