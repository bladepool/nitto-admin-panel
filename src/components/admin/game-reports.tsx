/*
 * Race Control > Security > Game reports: the in-game /report queue. Each report shows the room and the recent
 * chat the race server attached; staff (moderator 2+) resolve it as actioned or declined with a required note.
 * Server: apps/api src/json/admin.ts GET /api/mod/game-reports and POST /api/mod/game-reports/:id/resolve (game
 * repo). The decision goes to the moderation log and the linked support ticket is annotated and actioned/closed.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Cell, DataTable, EmptyState, ErrorState, LoadingState, Panel, Pill, Row, type PillTone } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, dateLabel } from "@/lib/admin-api";

type GameReport = {
  id: number;
  status: "pending" | "applied" | "declined";
  reason: string;
  reporter: string;
  racer: string | null;
  racerId: number | null;
  roomId: number | null;
  room: string | null;
  chat: string[];
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  ticket: { id: number; status: string } | null;
};

function statusTone(s: string): PillTone {
  if (s === "pending") return "warning";
  if (s === "applied") return "success";
  return "neutral";
}
const statusLabel = (s: string) => (s === "applied" ? "actioned" : s);

export function useGameReportCount() {
  return useQuery({
    queryKey: ["admin", "game-reports", "pending"],
    queryFn: () => api<{ cases: GameReport[] }>("/api/mod/game-reports?status=pending&limit=200"),
    retry: false,
  });
}

export function GameReportsPanel() {
  const [show, setShow] = useState<"pending" | "all">("pending");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const reports = useQuery({
    queryKey: ["admin", "game-reports", show],
    queryFn: () => api<{ cases: GameReport[] }>(`/api/mod/game-reports?status=${show}&limit=200`),
    retry: false,
  });
  const resolve = useMutation({
    mutationFn: (v: { id: number; decision: "actioned" | "declined"; note: string }) =>
      api<{ ok: true; status: string; ticket: { id: number; status: string } | null }>(`/api/mod/game-reports/${v.id}/resolve`, {
        method: "POST",
        body: { decision: v.decision, note: v.note },
      }),
    onSuccess: (r, v) => {
      toast.success(`Report #${v.id} ${v.decision}${r.ticket ? `; ticket #${r.ticket.id} ${r.ticket.status}` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "game-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "cases"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const list = reports.data?.cases ?? [];
  const act = (id: number, decision: "actioned" | "declined") => {
    const note = (notes[id] ?? "").trim();
    if (note.length < 3) { toast.error("Write a note (3+ characters) first."); return; }
    resolve.mutate({ id, decision, note });
  };

  return (
    <Panel title="Game reports (/report in game chat)" count={list.filter((r) => r.status === "pending").length}>
      <p className="mb-3 text-sm text-muted-foreground">
        Take any action first (mute, kick or ban in Moderator Tools), then resolve the report with a note: Resolve
        when you acted on it, Decline when no rule was broken. The note goes to the moderation log and the linked
        ticket.
      </p>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={show === "pending" ? "default" : "outline"} onClick={() => setShow("pending")}>Pending</Button>
        <Button size="sm" variant={show === "all" ? "default" : "outline"} onClick={() => setShow("all")}>All</Button>
      </div>
      {reports.isLoading ? (
        <LoadingState />
      ) : reports.isError ? (
        <ErrorState error={reports.error} what="the game reports" />
      ) : list.length === 0 ? (
        <EmptyState>{show === "pending" ? "No pending game reports." : "No game reports yet."}</EmptyState>
      ) : (
        <DataTable head={["Report", "Racer", "Reporter", "Room and recent chat", "State", ""]}>
          {list.map((r) => (
            <Row key={r.id}>
              <Cell className="max-w-[18rem] break-words text-sm">
                <div className="font-medium">#{r.id}</div>
                {r.reason}
                <div className="text-xs text-muted-foreground">{dateLabel(r.createdAt)}{r.ticket ? ` · ticket #${r.ticket.id} (${r.ticket.status})` : ""}</div>
              </Cell>
              <Cell className="text-sm">{r.racer ?? "?"}</Cell>
              <Cell className="text-sm">{r.reporter}</Cell>
              <Cell className="max-w-[26rem] text-xs">
                <div className="mb-1 font-medium">{r.room ?? (r.roomId != null ? `Room ${r.roomId}` : "Lobby")}</div>
                {r.chat.length ? (
                  <pre className="scroll-slim max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[0.6875rem]">{r.chat.join("\n")}</pre>
                ) : (
                  <span className="text-muted-foreground">no chat attached</span>
                )}
              </Cell>
              <Cell>
                <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                {r.decidedBy ? <div className="text-xs text-muted-foreground">by {r.decidedBy}</div> : null}
              </Cell>
              <Cell className="min-w-[16rem]">
                {r.status === "pending" ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder="Note (required)"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={resolve.isPending} onClick={() => act(r.id, "actioned")}>Resolve</Button>
                      <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => act(r.id, "declined")}>Decline</Button>
                    </div>
                  </div>
                ) : null}
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
