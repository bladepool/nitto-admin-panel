import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, RefreshCw, Undo2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, dateLabel } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/invites")({
  head: () => ({
    meta: [
      { title: "Discord Invites — Racing Legends Race Control" },
      {
        name: "description",
        content: "Gmail-style Discord invites: who invited whom, invites left per member, staff grants, and the game mirror status.",
      },
      { property: "og:title", content: "Discord Invites — Racing Legends Race Control" },
      { property: "og:description", content: "Who invited whom on the Racing Legends Discord, and extra invites from staff." },
    ],
  }),
  component: InvitesPage,
});

type Person = { discordUserId: string; username: string | null; racer: string | null };
type Invite = {
  id: number;
  inviter: Person;
  invitee: Person | null;
  inviteCode: string;
  accessCode: string | null;
  state: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  accessCodeClaimedAt: string | null;
  accessCodeRacer: string | null;
};
type Member = Person & { base: number; granted: number; used: number; pending: number; left: number };
type Grant = { id: number; discordUserId: string; amount: number; grantedBy: string; note: string | null; createdAt: string };
type InvitesResponse = { enabled: boolean; perMember: number; invites: Invite[]; members: Member[]; grants: Grant[] };
type MirrorStatus = {
  enabled: boolean;
  running: boolean;
  provisioned: boolean;
  raceLinked: boolean;
  dryRun: boolean;
  channels: Array<{ key: string; channelId: string | null }>;
  rooms: Array<{ roomId: number; channelId: string | null; temporary: boolean; members: number }>;
  invites: { enabled: boolean; perMember: number; sweep: boolean; maxAgeS: number };
  stats: { gameToDiscord: number; discordToGame: number; refusedUnlinked: number; refusedMuted: number; refusedModeration: number } | null;
};

const key = (...parts: unknown[]) => ["game", "discord-invites", ...parts];

function stateTone(state: string): PillTone {
  if (state === "joined" || state === "code used") return "success";
  if (state === "waiting") return "info";
  if (state === "revoked") return "danger";
  return "neutral";
}

const who = (p: Person | null) => (p ? p.racer ?? p.username ?? p.discordUserId : "—");

function InvitesPage() {
  const queryClient = useQueryClient();
  const [grantUser, setGrantUser] = useState("");
  const [grantAmount, setGrantAmount] = useState("1");
  const [grantNote, setGrantNote] = useState("");

  const invites = useQuery({ queryKey: key("list"), queryFn: () => api<InvitesResponse>("/api/mod/discord/invites?limit=500"), retry: false });
  const mirror = useQuery({ queryKey: key("mirror"), queryFn: () => api<MirrorStatus>("/api/mod/discord/mirror"), retry: false });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key() });

  const grant = useMutation({
    mutationFn: (body: { discordUserId: string; amount: number; note?: string | undefined }) =>
      api<{ left: number }>("/api/mod/discord/invites/grant", { method: "POST", body }),
    onSuccess: (data, v) => {
      toast.success(`Granted ${v.amount}. They have ${data.left} left.`);
      setGrantUser("");
      setGrantNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api(`/api/mod/discord/invites/${id}/revoke`, { method: "POST", body: {} }),
    onSuccess: () => {
      toast.success("Invite revoked and returned to the member.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setup = useMutation({
    mutationFn: () => api<{ created: string[]; errors: string[] }>("/api/mod/discord/mirror/setup", { method: "POST", body: {} }),
    onSuccess: (r) => {
      toast.success(r.created.length ? `Created ${r.created.join(", ")}` : "Everything was already in place.");
      if (r.errors.length) toast.error(r.errors.join("; "));
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = invites.data;
  const m = mirror.data;
  const list = data?.invites ?? [];
  const joined = list.filter((i) => i.state === "joined").length;
  const amount = Math.trunc(Number(grantAmount));
  const grantValid = /^\d{5,25}$/.test(grantUser.trim()) && Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= 100;

  return (
    <>
      <PageHeading
        title="Discord Invites"
        subtitle="Only the bot issues invites to the Racing Legends Discord. Every member gets a fixed number for life: /invite gives them one single-use link plus one game access code for the same friend. An unused invite comes back when it expires."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {data && <Pill tone={data.enabled ? "success" : "neutral"}>{data.enabled ? "Invites on" : "Invites off"}</Pill>}
            {m && <Pill tone={m.running ? "success" : m.enabled ? "warning" : "neutral"}>{m.running ? "Mirror running" : m.enabled ? "Mirror not running here" : "Mirror off"}</Pill>}
            {m?.dryRun && <Pill tone="warning">Dry run</Pill>}
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="size-4" aria-hidden />
              Refresh
            </Button>
          </div>
        }
      />

      <GameApiCredential />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Invites issued" value={list.length} />
        <StatTile label="Joined" value={joined} tone={joined ? "success" : "neutral"} />
        <StatTile label="Per member" value={data?.perMember ?? "—"} hint="plus staff grants" />
        <StatTile
          label="Room bridge"
          value={m?.stats ? `${m.stats.gameToDiscord} / ${m.stats.discordToGame}` : "—"}
          hint={m?.stats ? `game→Discord / Discord→game · ${m.raceLinked ? "race server linked" : "race server not linked"}` : "not running"}
        />
      </div>

      <Tabs defaultValue="invites">
        <TabsList>
          <TabsTrigger value="invites">Invites ({list.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({data?.members.length ?? 0})</TabsTrigger>
          <TabsTrigger value="grant">Grant invites</TabsTrigger>
          <TabsTrigger value="mirror">Mirror</TabsTrigger>
        </TabsList>

        <TabsContent value="invites" className="mt-3">
          <Panel title="Who invited whom" count={list.length}>
            {invites.isLoading ? (
              <LoadingState label="Reading invites" />
            ) : invites.isError ? (
              <ErrorState error={invites.error} what="Discord invites" />
            ) : list.length === 0 ? (
              <EmptyState>No invites yet.</EmptyState>
            ) : (
              <DataTable head={["Inviter", "Invitee", "State", "Invite / code", "Issued", "Expires", ""]}>
                {list.map((i) => (
                  <Row key={i.id}>
                    <Cell>
                      <div className="font-medium">{who(i.inviter)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{i.inviter.discordUserId}</div>
                    </Cell>
                    <Cell>
                      <div className="font-medium">{who(i.invitee)}</div>
                      {i.accessCodeRacer && <div className="text-xs text-muted-foreground">racer {i.accessCodeRacer}</div>}
                    </Cell>
                    <Cell>
                      <Pill tone={stateTone(i.state)}>{i.state}</Pill>
                    </Cell>
                    <Cell mono className="text-xs">
                      <div>discord.gg/{i.inviteCode}</div>
                      <div className="text-muted-foreground">{i.accessCode ?? "—"}</div>
                    </Cell>
                    <Cell mono className="text-muted-foreground">{dateLabel(i.createdAt)}</Cell>
                    <Cell mono className="text-muted-foreground">{i.expiresAt ? dateLabel(i.expiresAt) : "never"}</Cell>
                    <Cell>
                      {i.state === "waiting" && (
                        <ConfirmButton
                          variant="outline"
                          destructive
                          title={`Revoke invite discord.gg/${i.inviteCode}?`}
                          description="Deletes the Discord invite, expires its game access code at once, and gives the invite back to the member."
                          confirmLabel="Revoke"
                          disabled={revoke.isPending}
                          onConfirm={() => revoke.mutate(i.id)}
                        >
                          <Undo2 className="size-3.5" aria-hidden />
                          Revoke
                        </ConfirmButton>
                      )}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="members" className="mt-3">
          <Panel title="Invites per member" count={data?.members.length ?? 0} note="members who invited someone or got a grant">
            {!data || data.members.length === 0 ? (
              <EmptyState>Nobody has used /invite yet.</EmptyState>
            ) : (
              <DataTable head={["Member", "Used", "Waiting", "Granted", "Left", ""]}>
                {data.members.map((mem) => (
                  <Row key={mem.discordUserId}>
                    <Cell>
                      <div className="font-medium">{who(mem)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{mem.discordUserId}</div>
                    </Cell>
                    <Cell mono>{mem.used}</Cell>
                    <Cell mono>{mem.pending}</Cell>
                    <Cell mono>{mem.granted}</Cell>
                    <Cell>
                      <Pill tone={mem.left > 0 ? "success" : "warning"}>{mem.left} of {mem.base + mem.granted}</Pill>
                    </Cell>
                    <Cell>
                      <Button size="sm" variant="outline" onClick={() => setGrantUser(mem.discordUserId)}>
                        <Gift className="size-3.5" aria-hidden />
                        Grant
                      </Button>
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="grant" className="mt-3">
          <Panel title="Grant extra invites" note="a negative amount takes invites back">
            <form
              className="grid max-w-xl gap-3 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (grantValid) grant.mutate({ discordUserId: grantUser.trim(), amount, note: grantNote.trim() || undefined });
              }}
            >
              <label className="grid gap-1 text-sm">
                Discord user id
                <Input value={grantUser} onChange={(e) => setGrantUser(e.target.value)} placeholder="e.g. 123456789012345678" inputMode="numeric" />
              </label>
              <label className="grid gap-1 text-sm">
                Amount
                <Input value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} type="number" min={-100} max={100} />
              </label>
              <label className="grid gap-1 text-sm">
                Note (audit)
                <Input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="why" maxLength={300} />
              </label>
              <div>
                <Button type="submit" disabled={!grantValid || grant.isPending}>
                  <Gift className="size-4" aria-hidden />
                  Grant
                </Button>
              </div>
            </form>
            {data && data.grants.length > 0 && (
              <DataTable head={["Member", "Amount", "By", "Note", "When"]}>
                {data.grants.map((g) => (
                  <Row key={g.id}>
                    <Cell mono className="text-xs">{g.discordUserId}</Cell>
                    <Cell mono>{g.amount > 0 ? `+${g.amount}` : g.amount}</Cell>
                    <Cell className="text-xs">{g.grantedBy}</Cell>
                    <Cell className="text-xs text-muted-foreground">{g.note ?? ""}</Cell>
                    <Cell mono className="text-muted-foreground">{dateLabel(g.createdAt)}</Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="mirror" className="mt-3">
          <Panel title="Game mirror" note="room channels, feeds and the live tournament view">
            {mirror.isLoading ? (
              <LoadingState />
            ) : mirror.isError ? (
              <ErrorState error={mirror.error} what="the Discord mirror status" />
            ) : !m ? null : (
              <div className="grid gap-3 p-4">
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone={m.provisioned ? "success" : "warning"}>{m.provisioned ? "Channels set up" : "Not set up yet"}</Pill>
                  <Pill tone={m.raceLinked ? "success" : "warning"}>{m.raceLinked ? "Race server linked" : "No race server events"}</Pill>
                  <Pill tone={m.invites.sweep ? "info" : "neutral"}>{m.invites.sweep ? "Invite sweep on" : "Invite sweep off"}</Pill>
                </div>
                {m.stats && (
                  <p className="text-sm text-muted-foreground">
                    Refused from Discord: {m.stats.refusedUnlinked} not linked to a racer, {m.stats.refusedMuted} muted or banned,{" "}
                    {m.stats.refusedModeration} flagged by Ichiban.
                  </p>
                )}
                <div>
                  <ConfirmButton
                    variant="default"
                    title="Set up the Discord mirror?"
                    description="Creates any missing category, feed channel, room channel, webhook and pinned feed message. Safe to re-run: nothing that exists is recreated. Server permissions are not changed."
                    confirmLabel="Set up"
                    disabled={!m.running || setup.isPending}
                    onConfirm={() => setup.mutate()}
                  >
                    Run setup
                  </ConfirmButton>
                </div>
                {m.rooms.length > 0 && (
                  <DataTable head={["Room", "Channel", "Kind", "Racers"]}>
                    {m.rooms.map((r) => (
                      <Row key={r.roomId}>
                        <Cell mono>{r.roomId}</Cell>
                        <Cell mono className="text-xs">{r.channelId}</Cell>
                        <Cell>
                          <Pill tone={r.temporary ? "info" : "neutral"}>{r.temporary ? "temporary" : "permanent"}</Pill>
                        </Cell>
                        <Cell mono>{r.members}</Cell>
                      </Row>
                    ))}
                  </DataTable>
                )}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
