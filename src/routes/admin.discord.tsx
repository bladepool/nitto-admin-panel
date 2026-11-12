import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeading } from "@/components/admin/shell";
import {
  Cell,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  Pill,
  Row,
  StatTile,
  type PillTone,
} from "@/components/admin/primitives";
import { ConfirmButton, GameApiCredential } from "@/components/admin/game-api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, dateLabel } from "@/lib/admin-api";
import { AskIchiban } from "@/lib/copilot";

export const Route = createFileRoute("/admin/discord")({
  head: () => ({
    meta: [
      { title: "Discord Moderation — Racing Legends Race Control" },
      {
        name: "description",
        content: "Ichiban's Discord cases waiting for staff: approve to run the Discord action, or dismiss.",
      },
      { property: "og:title", content: "Discord Moderation — Racing Legends Race Control" },
      { property: "og:description", content: "Staff review queue for Ichiban on the Racing Legends Discord." },
    ],
  }),
  component: DiscordPage,
});

type DiscordCase = {
  id: number;
  action: string;
  category: string;
  reason: string;
  confidence: number;
  status: string;
  actor: string;
  requestedBy: string | null;
  discordUserId: string | null;
  discordUsername: string | null;
  racer: string | null;
  messageText: string | null;
  messageUrl: string | null;
  mirror: string | null;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
};

type BotStatus = {
  enabled: boolean;
  connected: boolean;
  holdingGateway: boolean;
  dryRun: boolean;
  guildId: string | null;
  pending: number;
  modLogChannel: boolean;
  staffRoles: number;
};

const ACTIONS = ["warn", "mute", "kick", "ban"] as const;
type Act = (typeof ACTIONS)[number];
const ACTION_LABEL: Record<Act, string> = { warn: "Delete + warn", mute: "Timeout", kick: "Kick", ban: "Ban" };

const gameKey = (...parts: unknown[]) => ["game", "discord", ...parts];

function statusTone(status?: string): PillTone {
  if (status === "applied") return "success";
  if (status === "declined") return "danger";
  return "warning";
}

function categoryTone(category?: string): PillTone {
  if (category === "scam" || category === "harassment") return "danger";
  if (category === "cheat") return "warning";
  return "neutral";
}

function DiscordPage() {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Record<number, Act>>({});

  const status = useQuery({
    queryKey: gameKey("status"),
    queryFn: () => api<BotStatus>("/api/mod/discord/status"),
    retry: false,
  });
  const pending = useQuery({
    queryKey: gameKey("pending"),
    queryFn: () => api<{ cases: DiscordCase[] }>("/api/mod/discord/queue?status=pending&limit=200"),
    retry: false,
  });
  const all = useQuery({
    queryKey: gameKey("all"),
    queryFn: () => api<{ cases: DiscordCase[] }>("/api/mod/discord/queue?status=all&limit=200"),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: ({ id, verb, action }: { id: number; verb: "approve" | "deny"; action?: Act }) =>
      api(`/api/mod/discord/queue/${id}/${verb}`, {
        method: "POST",
        body: verb === "approve" && action ? { action } : {},
      }),
    onSuccess: (_data, variables) => {
      toast.success(variables.verb === "approve" ? "Done on Discord." : "Dismissed.");
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const queue = pending.data?.cases ?? [];
  const decided = (all.data?.cases ?? []).filter((c) => c.status !== "pending");
  const s = status.data;

  return (
    <>
      <PageHeading
        title="Discord Moderation"
        subtitle="Ichiban moderates the Racing Legends Discord with the same rules as the game. Bans it is not sure about, and member reports without a message, wait here. Approving runs the action on Discord; a ban also bans the member's linked racer in game."
        actions={
          s ? (
            <div className="flex gap-1.5">
              <Pill tone={s.enabled ? (s.connected ? "success" : "warning") : "neutral"}>
                {s.enabled ? (s.connected ? "Bot online" : "Bot offline") : "Bot disabled"}
              </Pill>
              {s.dryRun && <Pill tone="warning">Dry run</Pill>}
            </div>
          ) : null
        }
      />

      <GameApiCredential />

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Waiting" value={s.pending} tone={s.pending > 0 ? "warning" : "neutral"} />
          <StatTile label="Gateway" value={s.holdingGateway ? "held here" : "not held"} hint={s.connected ? "connected" : "disconnected"} />
          <StatTile label="Mode" value={s.dryRun ? "observe only" : "enforcing"} tone={s.dryRun ? "warning" : "success"} />
          <StatTile label="Staff roles" value={s.staffRoles} hint={s.modLogChannel ? "mod log on" : "no mod log channel"} />
        </div>
      )}

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Review queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="decided">History ({decided.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-3">
          <Panel title="Waiting for a decision" count={queue.length}>
            {pending.isLoading ? (
              <LoadingState label="Reading the queue" />
            ) : pending.isError ? (
              <ErrorState error={pending.error} what="the Discord review queue" />
            ) : queue.length === 0 ? (
              <EmptyState>Queue is clear.</EmptyState>
            ) : (
              <DataTable head={["Member", "Message", "Ichiban's call", "Reported by", "When", "Decision"]}>
                {queue.map((c) => {
                  const suggested = (ACTIONS as readonly string[]).includes(c.action) ? (c.action as Act) : "warn";
                  const act = choice[c.id] ?? suggested;
                  return (
                    <Row key={c.id}>
                      <Cell>
                        <div className="font-medium">{c.discordUsername ?? c.discordUserId}</div>
                        <div className="font-mono text-xs text-muted-foreground">{c.discordUserId}</div>
                        {c.racer && <div className="mt-0.5 text-xs text-muted-foreground">racer {c.racer}</div>}
                        <AskIchiban className="mt-1.5" select={{ type: "discordCase", id: c.id, label: `Discord case #${c.id}: ${c.discordUsername ?? c.discordUserId}` }} />
                      </Cell>
                      <Cell className="max-w-[22rem] text-xs">
                        {c.messageText ? <div className="whitespace-pre-wrap break-words">{c.messageText}</div> : <span className="text-muted-foreground">(no message)</span>}
                        {c.messageUrl && (
                          <a className="mt-1 inline-flex items-center gap-1 text-primary hover:underline" href={c.messageUrl} target="_blank" rel="noreferrer">
                            open in Discord <ExternalLink className="size-3" aria-hidden />
                          </a>
                        )}
                      </Cell>
                      <Cell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          <Pill tone={categoryTone(c.category)}>{c.category}</Pill>
                          <Pill tone="info">{c.action}</Pill>
                          <Pill tone="neutral">{Math.round(c.confidence * 100)}%</Pill>
                        </div>
                        <div className="mt-1 text-muted-foreground">{c.reason}</div>
                      </Cell>
                      <Cell className="text-xs text-muted-foreground">{c.requestedBy ?? c.actor}</Cell>
                      <Cell mono className="text-muted-foreground">{dateLabel(c.createdAt)}</Cell>
                      <Cell>
                        <div className="flex flex-col gap-1.5">
                          <select
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                            value={act}
                            onChange={(event) => setChoice((cur) => ({ ...cur, [c.id]: event.target.value as Act }))}
                            aria-label="Action to apply"
                          >
                            {ACTIONS.map((a) => (
                              <option key={a} value={a}>
                                {ACTION_LABEL[a]}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-1.5">
                            <ConfirmButton
                              variant="default"
                              destructive={act === "ban"}
                              title={`${ACTION_LABEL[act]}: ${c.discordUsername ?? c.discordUserId}?`}
                              description={
                                act === "ban"
                                  ? "Bans the member from the Discord server. If they are linked to a racer, the racer is banned in game too (and unbanning either side lifts both)."
                                  : act === "mute"
                                    ? "Times the member out on Discord. Timeouts never carry over to the game."
                                    : act === "kick"
                                      ? "Kicks the member from the Discord server (they can rejoin with an invite)."
                                      : "Deletes the message and posts a short warning in the channel."
                              }
                              confirmLabel={ACTION_LABEL[act]}
                              disabled={decide.isPending}
                              onConfirm={() => decide.mutate({ id: c.id, verb: "approve", action: act })}
                            >
                              <Check className="size-3.5" aria-hidden />
                              Approve
                            </ConfirmButton>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ id: c.id, verb: "deny" })}
                            >
                              <X className="size-3.5" aria-hidden />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </Cell>
                    </Row>
                  );
                })}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="decided" className="mt-3">
          <Panel title="Recent Discord actions" count={decided.length} note="autonomous, staff and mirrored">
            {all.isLoading ? (
              <LoadingState />
            ) : all.isError ? (
              <ErrorState error={all.error} what="Discord moderation history" />
            ) : decided.length === 0 ? (
              <EmptyState>Nothing yet.</EmptyState>
            ) : (
              <DataTable head={["Member", "Action", "Reason", "State", "By", "When"]}>
                {decided.map((c) => (
                  <Row key={c.id}>
                    <Cell>
                      <div className="font-medium">{c.discordUsername ?? c.discordUserId}</div>
                      {c.racer && <div className="text-xs text-muted-foreground">racer {c.racer}</div>}
                    </Cell>
                    <Cell>
                      <Pill tone="info">{c.action}</Pill>
                      {c.mirror && <div className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">mirror {c.mirror}</div>}
                    </Cell>
                    <Cell className="max-w-[24rem] text-xs text-muted-foreground">{c.reason}</Cell>
                    <Cell>
                      <Pill tone={statusTone(c.status)}>{c.status}</Pill>
                    </Cell>
                    <Cell className="text-xs text-muted-foreground">{c.decidedBy ?? c.actor}</Cell>
                    <Cell mono className="text-muted-foreground">{dateLabel(c.decidedAt ?? c.createdAt)}</Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
