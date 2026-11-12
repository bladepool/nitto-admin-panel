import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, UserX } from "lucide-react";
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
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, integer, relativeLabel, roleName } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/live")({
  head: () => ({
    meta: [
      { title: "Live ops — Racing Legends Race Control" },
      {
        name: "description",
        content: "See who is online, message rooms and broadcast to the server.",
      },
      { property: "og:title", content: "Live ops — Racing Legends Race Control" },
      { property: "og:description", content: "See who is online and broadcast to the server." },
    ],
  }),
  component: LivePage,
});

type OnlinePlayer = {
  accountId?: number;
  username?: string;
  roleClass?: number;
  room?: string;
  since?: string;
  ip?: string;
  // Real backend shape (GET /api/admin/online) sends these instead of `room`/`since`/`ip`.
  roomName?: string | number;
  connectedAt?: string;
  remoteAddress?: string;
};

function LivePage() {
  const queryClient = useQueryClient();

  const online = useQuery({
    queryKey: ["admin", "online"],
    queryFn: () =>
      api<{ players?: OnlinePlayer[]; total?: number; rooms?: number }>("/api/admin/online"),
    retry: false,
    refetchInterval: 10_000,
  });

  const kick = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/admin/online/kick", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Racer removed from the session.");
      queryClient.invalidateQueries({ queryKey: ["admin", "online"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roomMessage = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/admin/online/room-message", { method: "POST", body }),
    onSuccess: () => toast.success("Message sent to the room."),
    onError: (error: Error) => toast.error(error.message),
  });

  const broadcast = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/admin/broadcast", { method: "POST", body }),
    onSuccess: () => toast.success("Broadcast sent server-wide."),
    onError: (error: Error) => toast.error(error.message),
  });

  const players = online.data?.players ?? [];
  const rooms = new Set(players.map((player) => player.room || player.roomName || "lobby"));

  return (
    <>
      <PageHeading
        title="Live ops"
        subtitle="Who's connected right now, plus the tools to talk to them or pull them out."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Online"
          value={online.isError ? "—" : integer(online.data?.total ?? players.length)}
          hint="Refreshes every 10s"
          tone="primary"
        />
        <StatTile label="Active rooms" value={online.isError ? "—" : integer(rooms.size)} />
        <StatTile
          label="Staff online"
          value={integer(players.filter((player) => Number(player.roleClass ?? 0) > 0).length)}
          tone="success"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Connected racers" count={players.length}>
          {online.isLoading ? (
            <LoadingState label="Reading the paddock" />
          ) : online.isError ? (
            <ErrorState error={online.error} what="the online list" />
          ) : players.length === 0 ? (
            <EmptyState>Nobody is connected right now.</EmptyState>
          ) : (
            <DataTable head={["Racer", "Role", "Room", "Since", ""]}>
              {players.map((player, index) => (
                <Row key={`${player.accountId}-${index}`}>
                  <Cell>
                    <span className="font-medium">{player.username || "unknown"}</span>
                    <span className="numeric ml-1.5 text-xs text-muted-foreground">
                      #{player.accountId}
                    </span>
                  </Cell>
                  <Cell>
                    <Pill tone={Number(player.roleClass ?? 0) > 0 ? "accent" : "neutral"}>
                      {roleName(player.roleClass)}
                    </Pill>
                  </Cell>
                  <Cell className="text-muted-foreground">
                    {player.room || player.roomName || "lobby"}
                  </Cell>
                  <Cell mono className="text-muted-foreground">
                    {relativeLabel(player.since || player.connectedAt)}
                  </Cell>
                  <Cell>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={kick.isPending}
                      onClick={() => kick.mutate({ accountId: player.accountId })}
                    >
                      <UserX className="size-3.5" aria-hidden />
                      Kick
                    </Button>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Server broadcast">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                broadcast.mutate({ message: String(data.get("message") || "") });
                event.currentTarget.reset();
              }}
            >
              <Field label="Message to everyone">
                <Textarea
                  name="message"
                  required
                  rows={3}
                  placeholder="Servers restart in 10 minutes."
                />
              </Field>
              <Button type="submit" disabled={broadcast.isPending}>
                <Megaphone className="size-4" aria-hidden />
                Send broadcast
              </Button>
            </form>
          </Panel>

          <Panel title="Message one room">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                roomMessage.mutate({
                  room: String(data.get("room") || ""),
                  message: String(data.get("message") || ""),
                });
                event.currentTarget.reset();
              }}
            >
              <Field label="Room">
                <Input name="room" required placeholder="lobby" list="live-rooms" />
              </Field>
              <datalist id="live-rooms">
                {[...rooms].map((room) => (
                  <option key={room} value={room} />
                ))}
              </datalist>
              <Field label="Message">
                <Textarea
                  name="message"
                  required
                  rows={2}
                  placeholder="Line up for the next round."
                />
              </Field>
              <Button type="submit" variant="secondary" disabled={roomMessage.isPending}>
                Send to room
              </Button>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
