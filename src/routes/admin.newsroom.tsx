import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Newspaper, Send, Trash2, UploadCloud } from "lucide-react";
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
  type PillTone,
} from "@/components/admin/primitives";
import { ConfirmButton } from "@/components/admin/game-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, dateLabel } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/newsroom")({
  head: () => ({
    meta: [
      { title: "Newsroom — Racing Legends Race Control" },
      { name: "description", content: "Write Racer Spotlights and publish announcements to Discord and Telegram." },
    ],
  }),
  component: NewsroomPage,
});

/* ------------------------------- types --------------------------------- */
type ChannelStatus = "posted" | "dry-run" | "skipped" | "failed" | "sending" | null;
type Announcement = {
  id: number;
  title: string | null;
  body: string;
  author: string | null;
  status: "draft" | "published";
  discordStatus: ChannelStatus;
  discordMessageId: string | null;
  discordDetail: string | null;
  telegramStatus: ChannelStatus;
  telegramMessageId: string | null;
  telegramDetail: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};
type Spotlight = {
  id: number;
  racer: string;
  title: string;
  car: string | null;
  fastestEt: number | null;
  wins: number | null;
  racingSince: string | null;
  body: string;
  month: string | null;
  author: string | null;
  status: "draft" | "scheduled" | "published";
  publishedAt: string | null;
  createdBy: string | null;
};

const channelTone = (s: ChannelStatus): PillTone =>
  s === "posted" ? "success" : s === "failed" ? "danger" : s === "dry-run" ? "info" : s === "sending" ? "warning" : "neutral";

function ChannelPill({ label, status, detail }: { label: string; status: ChannelStatus; detail: string | null }) {
  return (
    <span title={detail ?? undefined} className="inline-flex items-center gap-1">
      <Pill tone={channelTone(status)}>{label}: {status ?? "—"}</Pill>
    </span>
  );
}

/* ---------------------------- announcements ----------------------------- */
function Announcements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const list = useQuery({
    queryKey: ["newsroom", "announcements"],
    queryFn: () => api<{ announcements: Announcement[] }>("/api/admin/announcements?limit=50"),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Write the announcement body first.");
      const draft = await api<{ announcement: Announcement }>("/api/admin/announcements", {
        method: "POST",
        body: { title: title.trim() || null, body: body.trim() },
      });
      return api<{ announcement: Announcement; discord: { status: string; detail: string }; telegram: { status: string; detail: string } }>(
        `/api/admin/announcements/${draft.announcement.id}/publish`,
        { method: "POST" },
      );
    },
    onSuccess: (r) => {
      toast.success(`Announcement published. Discord: ${r.discord.status} · Telegram: ${r.telegram.status}`);
      setTitle("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["newsroom", "announcements"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const republish = useMutation({
    mutationFn: (id: number) => api(`/api/admin/announcements/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Re-sent to any channel that had not posted yet.");
      void qc.invalidateQueries({ queryKey: ["newsroom", "announcements"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Draft deleted.");
      void qc.invalidateQueries({ queryKey: ["newsroom", "announcements"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = list.data?.announcements ?? [];

  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Megaphone className="size-4" /> Announcement</span>}
      note="Publishes once to Discord #announcements and the Telegram channel.">
      <div className="grid gap-3">
        <Field label="Title (optional)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Race night tonight!" />
        </Field>
        <Field label="Body">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000}
            placeholder="Write the announcement. Plain text + emoji; it is formatted for each platform automatically." />
        </Field>
        <div className="flex items-center gap-2">
          <Button onClick={() => publish.mutate()} disabled={publish.isPending || !body.trim()}>
            <Send className="size-4" /> {publish.isPending ? "Publishing…" : "Publish to Discord + Telegram"}
          </Button>
          <span className="text-xs text-muted-foreground">Each announcement is saved and never double-posts.</span>
        </div>
      </div>

      <div className="mt-5">
        {list.isLoading ? (
          <LoadingState label="Loading announcements" />
        ) : list.error ? (
          <ErrorState error={list.error} what="announcements" />
        ) : rows.length === 0 ? (
          <EmptyState>No announcements yet.</EmptyState>
        ) : (
          <DataTable head={["When", "Title", "Channels", "By", ""]}>
            {rows.map((a) => (
              <Row key={a.id}>
                <Cell mono>{dateLabel(a.publishedAt ?? a.createdAt)}</Cell>
                <Cell>
                  <div className="font-medium">{a.title || <span className="text-muted-foreground">(no title)</span>}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{a.body}</div>
                </Cell>
                <Cell>
                  <div className="flex flex-wrap gap-1">
                    {a.status === "draft" ? (
                      <Pill tone="neutral">draft</Pill>
                    ) : (
                      <>
                        <ChannelPill label="Discord" status={a.discordStatus} detail={a.discordDetail} />
                        <ChannelPill label="Telegram" status={a.telegramStatus} detail={a.telegramDetail} />
                      </>
                    )}
                  </div>
                </Cell>
                <Cell mono>{a.author || a.createdBy || "—"}</Cell>
                <Cell>
                  <div className="flex gap-1.5">
                    {(a.status === "draft" || a.discordStatus === "failed" || a.telegramStatus === "failed") && (
                      <Button size="sm" variant="outline" onClick={() => republish.mutate(a.id)} disabled={republish.isPending}>
                        <UploadCloud className="size-3.5" /> {a.status === "draft" ? "Publish" : "Retry"}
                      </Button>
                    )}
                    {a.status === "draft" && (
                      <ConfirmButton title="Delete this draft?" description="This announcement draft will be removed." confirmLabel="Delete" label="Delete draft" onConfirm={() => remove.mutate(a.id)}>
                        <Trash2 className="size-3.5" />
                      </ConfirmButton>
                    )}
                  </div>
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </div>
    </Panel>
  );
}

/* ----------------------------- spotlights ------------------------------- */
const emptyDraft = { racer: "", title: "Racer Spotlight", car: "", fastestEt: "", wins: "", racingSince: "", body: "", month: "" };

function Spotlights() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ ...emptyDraft });

  const list = useQuery({
    queryKey: ["newsroom", "spotlights"],
    queryFn: () => api<{ spotlights: Spotlight[]; currentMonth: string }>("/api/admin/spotlights"),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!draft.racer.trim()) throw new Error("A racer handle is required.");
      return api<{ spotlight: Spotlight }>("/api/admin/spotlights", {
        method: "POST",
        body: {
          racer: draft.racer.trim(),
          title: draft.title.trim() || "Racer Spotlight",
          car: draft.car.trim() || null,
          fastestEt: draft.fastestEt.trim() ? Number(draft.fastestEt) : null,
          wins: draft.wins.trim() ? Math.trunc(Number(draft.wins)) : null,
          racingSince: draft.racingSince.trim() || null,
          body: draft.body,
          month: draft.month.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Spotlight draft saved.");
      setDraft({ ...emptyDraft });
      void qc.invalidateQueries({ queryKey: ["newsroom", "spotlights"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "publish" | "unpublish" | "delete" }) =>
      action === "delete"
        ? api(`/api/admin/spotlights/${id}`, { method: "DELETE" })
        : api(`/api/admin/spotlights/${id}/${action}`, { method: "POST" }),
    onSuccess: (_d, v) => {
      toast.success(`Spotlight ${v.action}ed.`);
      void qc.invalidateQueries({ queryKey: ["newsroom", "spotlights"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const prefill = useMutation({
    mutationFn: (handle: string) => api<{ prefill: { racer: string; car: string | null; fastestEt: number | null; wins: number | null; racingSince: string | null } }>(
      `/api/admin/spotlights/prefill?handle=${encodeURIComponent(handle)}`,
    ),
    onSuccess: (r) => {
      const f = r.prefill;
      setDraft((d) => ({
        ...d,
        racer: f.racer,
        car: f.car ?? d.car,
        fastestEt: f.fastestEt != null ? String(f.fastestEt) : d.fastestEt,
        wins: f.wins != null ? String(f.wins) : d.wins,
        racingSince: f.racingSince ?? d.racingSince,
      }));
      toast.success(`Loaded live stats for ${f.racer}.`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = list.data?.spotlights ?? [];

  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Newspaper className="size-4" /> Racer Spotlight</span>}
      note="Draft a spotlight, then publish it. Your byline becomes a Game Journalist on Discord.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Racer handle" className="sm:col-span-2">
          <div className="flex gap-2">
            <Input value={draft.racer} onChange={(e) => setDraft({ ...draft, racer: e.target.value })} placeholder="II RaY II" />
            <Button variant="outline" type="button" onClick={() => draft.racer.trim() && prefill.mutate(draft.racer.trim())} disabled={prefill.isPending}>
              {prefill.isPending ? "Loading…" : "Load stats"}
            </Button>
          </div>
        </Field>
        <Field label="Title"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} /></Field>
        <Field label="Car"><Input value={draft.car} onChange={(e) => setDraft({ ...draft, car: e.target.value })} maxLength={80} /></Field>
        <Field label="Fastest ET"><Input value={draft.fastestEt} onChange={(e) => setDraft({ ...draft, fastestEt: e.target.value })} inputMode="decimal" placeholder="7.512" /></Field>
        <Field label="Wins"><Input value={draft.wins} onChange={(e) => setDraft({ ...draft, wins: e.target.value })} inputMode="numeric" /></Field>
        <Field label="Racing since"><Input value={draft.racingSince} onChange={(e) => setDraft({ ...draft, racingSince: e.target.value })} placeholder="3/3/2007" /></Field>
        <Field label="Month (optional, YYYY-MM)"><Input value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} placeholder="2026-11" /></Field>
        <Field label="Feature text" className="sm:col-span-2">
          <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={6} maxLength={20000} />
        </Field>
      </div>
      <div className="mt-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending || !draft.racer.trim()}>
          {create.isPending ? "Saving…" : "Save draft"}
        </Button>
      </div>

      <div className="mt-5">
        {list.isLoading ? (
          <LoadingState label="Loading spotlights" />
        ) : list.error ? (
          <ErrorState error={list.error} what="spotlights" />
        ) : rows.length === 0 ? (
          <EmptyState>No spotlights yet.</EmptyState>
        ) : (
          <DataTable head={["Racer", "Title", "Status", "By", ""]}>
            {rows.map((s) => (
              <Row key={s.id}>
                <Cell>{s.racer}</Cell>
                <Cell>{s.title}</Cell>
                <Cell><Pill tone={s.status === "published" ? "success" : s.status === "scheduled" ? "info" : "neutral"}>{s.status}</Pill></Cell>
                <Cell mono>{s.author || s.createdBy || "—"}</Cell>
                <Cell>
                  <div className="flex gap-1.5">
                    {s.status !== "published" ? (
                      <Button size="sm" onClick={() => act.mutate({ id: s.id, action: "publish" })} disabled={act.isPending}>Publish</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => act.mutate({ id: s.id, action: "unpublish" })} disabled={act.isPending}>Unpublish</Button>
                    )}
                    {s.status === "draft" && (
                      <ConfirmButton title="Delete this spotlight draft?" description="This draft will be removed." confirmLabel="Delete" label="Delete spotlight draft" onConfirm={() => act.mutate({ id: s.id, action: "delete" })}>
                        <Trash2 className="size-3.5" />
                      </ConfirmButton>
                    )}
                  </div>
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </div>
    </Panel>
  );
}

function NewsroomPage() {
  return (
    <div className="grid gap-5">
      <PageHeading title="Newsroom" subtitle="Write Racer Spotlights and publish announcements to Discord and Telegram." />
      <Announcements />
      <Spotlights />
    </div>
  );
}
