import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Pencil, RefreshCw, Sparkles, Trash2, Undo2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, dateLabel, relativeLabel } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/admin/knowledge")({
  head: () => ({
    meta: [
      { title: "Ichiban Knowledge — Racing Legends Race Control" },
      { name: "description", content: "Curate Ichiban's Q&A knowledge base and answer the questions it could not." },
      { property: "og:title", content: "Ichiban Knowledge — Racing Legends Race Control" },
      { property: "og:description", content: "Ichiban's curated Q&A and unanswered-questions queue." },
    ],
  }),
  component: KnowledgePage,
});

type Entry = {
  id: number;
  question: string;
  alternates: string[];
  answer: string;
  tags: string[];
  audience: "staff" | "players" | "both";
  status: "draft" | "published";
  source: string | null;
  author: string;
  embedded: boolean;
  publishedAt: string | null;
  updatedAt: string;
};
type Unanswered = {
  id: number;
  question: string;
  channel: string;
  channels: string[];
  score: number;
  count: number;
  lastAskedAt: string;
  status: string;
  resolvedById: number | null;
};
type Draft = { id?: number; question: string; alternates: string; answer: string; tags: string; audience: string; source?: string; unansweredId?: number };
type Quality = {
  totals: { calls: number; up: number; down: number; unrated: number; notConfident: number };
  byPage: Array<{ page: string; calls: number; avgMs: number; up: number; down: number }>;
  recentDown: Array<{ id: number; page: string; actor: string; question: string; answer: string | null; ratingNote: string | null; ratedAt: string | null }>;
};
type Hit = { kind: string; title: string; text: string; score: number; match?: string; qnaId?: number };
type Rebuild = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  by: string | null;
  success: boolean | null;
  steps: Array<{ step: string; ok: boolean; output: string }>;
  kbNow?: { docs: number; vectors: number; model: string };
  embeddings?: boolean;
  qna: { embedded: number; missing: number } | null;
};

const key = (...p: unknown[]) => ["game", "knowledge", ...p];
const audienceTone = (a: string): PillTone => (a === "players" ? "info" : a === "both" ? "success" : "warning");
const channelTone = (c: string): PillTone => (c === "game" ? "primary" : c === "discord" ? "info" : "neutral");
const EMPTY: Draft = { question: "", alternates: "", answer: "", tags: "", audience: "players" };

function KnowledgePage() {
  const qc = useQueryClient();
  const { session } = useAdminSession();
  const admin = Number(session?.roleClass ?? 0) >= 4;
  const [tab, setTab] = useState("queue");
  const [editor, setEditor] = useState<Draft | null>(null);
  const [filter, setFilter] = useState({ status: "all", audience: "all", q: "" });
  const [probe, setProbe] = useState({ question: "", audience: "players" });

  const queue = useQuery({ queryKey: key("unanswered"), queryFn: () => api<{ items: Unanswered[]; counts: Record<string, number> }>("/api/admin/knowledge/unanswered?status=open"), retry: false });
  const entries = useQuery({
    queryKey: key("qna", filter),
    queryFn: () => api<{ entries: Entry[] }>(`/api/admin/knowledge/qna?status=${filter.status}&audience=${filter.audience}&q=${encodeURIComponent(filter.q)}`),
    retry: false,
  });
  const quality = useQuery({ queryKey: key("quality"), queryFn: () => api<Quality>("/api/admin/knowledge/quality"), retry: false, enabled: tab === "quality" });
  const rebuild = useQuery({
    queryKey: key("rebuild"),
    queryFn: () => api<Rebuild>("/api/admin/knowledge/rebuild"),
    retry: false,
    enabled: tab === "maintain",
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: key() });
  const fail = (e: Error) => toast.error(e.message);

  const draftFrom = useMutation({
    mutationFn: (u: Unanswered) => api<{ ok: boolean; draft?: { question: string; alternates: string[]; answer: string; tags: string[]; audience: string }; error?: string; sources: Array<{ title: string }> }>(`/api/admin/knowledge/unanswered/${u.id}/draft`, { method: "POST", body: {} }).then((r) => ({ r, u })),
    onSuccess: ({ r, u }) => {
      if (!r.draft) {
        toast.error(r.error ?? "No draft");
        return;
      }
      setEditor({ question: r.draft.question, alternates: [u.question, ...r.draft.alternates].join("\n"), answer: r.draft.answer, tags: r.draft.tags.join(", "), audience: r.draft.audience, source: `unanswered #${u.id}`, unansweredId: u.id });
      toast.success(`Ichiban drafted an answer${r.sources.length ? ` from ${r.sources.length} source(s)` : ""}. Edit it before publishing.`);
    },
    onError: (e: Error) => toast.error(e.message.includes("offline") ? "Ichiban is offline: write the answer by hand." : e.message),
  });
  const dismiss = useMutation({ mutationFn: (id: number) => api(`/api/admin/knowledge/unanswered/${id}/dismiss`, { method: "POST", body: {} }), onSuccess: refresh, onError: fail });

  const save = useMutation({
    mutationFn: async ({ d, publish }: { d: Draft; publish: boolean }) => {
      const body = {
        question: d.question,
        answer: d.answer,
        audience: d.audience,
        alternates: d.alternates.split("\n").map((s) => s.trim()).filter(Boolean),
        tags: d.tags.split(",").map((s) => s.trim()).filter(Boolean),
        ...(d.source ? { source: d.source } : {}),
      };
      const r = d.id
        ? await api<{ entry: Entry }>(`/api/admin/knowledge/qna/${d.id}`, { method: "PATCH", body })
        : await api<{ entry: Entry }>("/api/admin/knowledge/qna", { method: "POST", body });
      if (publish && r.entry.status !== "published") {
        return api<{ entry: Entry; note: string }>(`/api/admin/knowledge/qna/${r.entry.id}/publish`, { method: "POST", body: d.unansweredId ? { resolveUnansweredId: d.unansweredId } : {} });
      }
      return { entry: r.entry, note: "Saved." };
    },
    onSuccess: (r) => {
      toast.success(r.note);
      setEditor(null);
      refresh();
    },
    onError: fail,
  });
  const publish = useMutation({ mutationFn: (id: number) => api<{ note: string }>(`/api/admin/knowledge/qna/${id}/publish`, { method: "POST", body: {} }), onSuccess: (r) => { toast.success(r.note); refresh(); }, onError: fail });
  const unpublish = useMutation({ mutationFn: (id: number) => api(`/api/admin/knowledge/qna/${id}/unpublish`, { method: "POST", body: {} }), onSuccess: refresh, onError: fail });
  const remove = useMutation({ mutationFn: (id: number) => api(`/api/admin/knowledge/qna/${id}`, { method: "DELETE" }), onSuccess: refresh, onError: fail });
  const test = useMutation({ mutationFn: () => api<{ hits: Hit[]; topScore: number; confident: boolean; embedded: boolean }>("/api/admin/knowledge/test", { method: "POST", body: probe }), onError: fail });
  const runRebuild = useMutation({ mutationFn: () => api("/api/admin/knowledge/rebuild", { method: "POST", body: {} }), onSuccess: () => { toast("Rebuild started on the server."); void rebuild.refetch(); }, onError: fail });
  const seed = useMutation({ mutationFn: () => api<{ created: number; existing: number }>("/api/admin/knowledge/seed", { method: "POST", body: {} }), onSuccess: (r) => { toast.success(`Seeded ${r.created} starter entries (${r.existing} already there).`); refresh(); }, onError: fail });

  const items = queue.data?.items ?? [];
  const list = entries.data?.entries ?? [];
  const published = list.filter((e) => e.status === "published").length;

  return (
    <>
      <PageHeading
        title="Ichiban Knowledge"
        subtitle="Curated Q&A Ichiban answers from first (exact phrasings win outright), and the questions it could not answer in game chat, Discord or here. Publishing embeds just that entry, so it is live for the next question."
        actions={
          <Button onClick={() => setEditor({ ...EMPTY })}>
            <BookOpen className="size-4" aria-hidden />
            New Q&A
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open questions" value={queue.data?.counts["open"] ?? 0} tone="primary" />
        <StatTile label="Resolved" value={queue.data?.counts["resolved"] ?? 0} tone="success" />
        <StatTile label="Q&A shown" value={list.length} />
        <StatTile label="Published" value={published} tone="success" />
      </div>

      {editor && (
        <Panel
          className="mb-5"
          title={editor.id ? `Edit Q&A #${editor.id}` : editor.unansweredId ? `Answer question #${editor.unansweredId}` : "New Q&A"}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setEditor(null)}>
              <X className="size-4" aria-hidden /> Close
            </Button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              <Field label="Question">
                <Input value={editor.question} maxLength={300} onChange={(e) => setEditor({ ...editor, question: e.target.value })} />
              </Field>
              <Field label="Other ways people ask it (one per line)">
                <Textarea rows={4} value={editor.alternates} onChange={(e) => setEditor({ ...editor, alternates: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Audience">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={editor.audience}
                    onChange={(e) => setEditor({ ...editor, audience: e.target.value })}
                  >
                    <option value="players">Players (game + Discord)</option>
                    <option value="both">Players and staff</option>
                    <option value="staff">Staff only</option>
                  </select>
                </Field>
                <Field label="Tags (comma separated)">
                  <Input value={editor.tags} onChange={(e) => setEditor({ ...editor, tags: e.target.value })} />
                </Field>
              </div>
            </div>
            <div className="grid gap-3">
              <Field label="Answer">
                <Textarea rows={8} maxLength={4000} value={editor.answer} onChange={(e) => setEditor({ ...editor, answer: e.target.value })} />
              </Field>
              {editor.answer.includes("[NEEDS STAFF ANSWER]") && (
                <p className="text-xs text-warning">Ichiban did not find this in its sources: replace the placeholder with the real answer.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Facts only. Player-facing answers (players / both) can be sent in game chat and Discord: never put staff internals or private data in them.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={save.isPending || !editor.question.trim() || !editor.answer.trim() || editor.answer.includes("[NEEDS STAFF ANSWER]")}
                  onClick={() => save.mutate({ d: editor, publish: true })}
                >
                  <Check className="size-4" aria-hidden /> Save and publish
                </Button>
                <Button variant="outline" disabled={save.isPending || !editor.question.trim() || !editor.answer.trim()} onClick={() => save.mutate({ d: editor, publish: false })}>
                  Save as draft
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Unanswered ({items.length})</TabsTrigger>
          <TabsTrigger value="qna">Q&A entries</TabsTrigger>
          <TabsTrigger value="quality">Answer quality</TabsTrigger>
          <TabsTrigger value="test">Test retrieval</TabsTrigger>
          <TabsTrigger value="maintain">Rebuild</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-3">
          <Panel title="Questions Ichiban could not answer confidently" count={items.length} note="most asked first">
            {queue.isLoading ? (
              <LoadingState label="Reading the queue" />
            ) : queue.isError ? (
              <ErrorState error={queue.error} what="the unanswered queue" />
            ) : items.length === 0 ? (
              <EmptyState>Nothing waiting. Ichiban had an answer for everything lately.</EmptyState>
            ) : (
              <DataTable head={["Question", "Where", "Asked", "Best match", "Last asked", ""]}>
                {items.map((u) => (
                  <Row key={u.id}>
                    <Cell className="max-w-[26rem]">
                      <div className="font-medium">{u.question}</div>
                      <div className="numeric text-xs text-muted-foreground">#{u.id}</div>
                    </Cell>
                    <Cell>
                      <div className="flex flex-wrap gap-1">
                        {u.channels.map((c) => (
                          <Pill key={c} tone={channelTone(c)}>
                            {c}
                          </Pill>
                        ))}
                      </div>
                    </Cell>
                    <Cell mono>×{u.count}</Cell>
                    <Cell mono className="text-muted-foreground">{u.score.toFixed(2)}</Cell>
                    <Cell mono className="text-muted-foreground">{relativeLabel(u.lastAskedAt)}</Cell>
                    <Cell>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" disabled={draftFrom.isPending} onClick={() => draftFrom.mutate(u)}>
                          <Sparkles className="size-3.5" aria-hidden /> Draft with Ichiban
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditor({ ...EMPTY, question: u.question, alternates: u.question, source: `unanswered #${u.id}`, unansweredId: u.id })}>
                          <Pencil className="size-3.5" aria-hidden /> Write
                        </Button>
                        <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(u.id)}>
                          Dismiss
                        </Button>
                      </div>
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="qna" className="mt-3">
          <Panel
            title="Curated Q&A"
            count={list.length}
            actions={
              <div className="flex flex-wrap gap-2">
                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Status">
                  <option value="all">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={filter.audience} onChange={(e) => setFilter({ ...filter, audience: e.target.value })} aria-label="Audience">
                  <option value="all">All audiences</option>
                  <option value="players">Players</option>
                  <option value="both">Both</option>
                  <option value="staff">Staff</option>
                </select>
                <Input className="h-8 w-44 text-xs" placeholder="Search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
              </div>
            }
          >
            {entries.isLoading ? (
              <LoadingState />
            ) : entries.isError ? (
              <ErrorState error={entries.error} what="Q&A entries" />
            ) : list.length === 0 ? (
              <EmptyState>No Q&A yet. Answer a queued question, add one by hand, or seed the starter set from the Rebuild tab.</EmptyState>
            ) : (
              <DataTable head={["Question", "Answer", "Audience", "State", "Updated", ""]}>
                {list.map((e) => (
                  <Row key={e.id}>
                    <Cell className="max-w-[18rem]">
                      <div className="font-medium">{e.question}</div>
                      {e.alternates.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">+{e.alternates.length} phrasing(s)</div>}
                      {e.tags.length > 0 && <div className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">{e.tags.join(" · ")}</div>}
                    </Cell>
                    <Cell className="max-w-[24rem] text-xs whitespace-pre-wrap">{e.answer}</Cell>
                    <Cell>
                      <Pill tone={audienceTone(e.audience)}>{e.audience}</Pill>
                    </Cell>
                    <Cell>
                      <Pill tone={e.status === "published" ? "success" : "neutral"}>{e.status}</Pill>
                      {e.status === "published" && !e.embedded && <div className="mt-1 text-[0.6875rem] text-warning">not embedded</div>}
                    </Cell>
                    <Cell mono className="text-xs text-muted-foreground">
                      {dateLabel(e.updatedAt)}
                      <div>{e.author}</div>
                    </Cell>
                    <Cell>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setEditor({ id: e.id, question: e.question, alternates: e.alternates.join("\n"), answer: e.answer, tags: e.tags.join(", "), audience: e.audience })}>
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        {e.status === "published" ? (
                          <Button size="sm" variant="outline" onClick={() => unpublish.mutate(e.id)} title="Unpublish">
                            <Undo2 className="size-3.5" aria-hidden />
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => publish.mutate(e.id)}>
                            Publish
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete Q&A #${e.id}?`)) remove.mutate(e.id); }} title="Delete">
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="quality" className="mt-3 space-y-4">
          {quality.isLoading ? (
            <LoadingState />
          ) : quality.isError ? (
            <ErrorState error={quality.error} what="copilot quality" />
          ) : quality.data ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatTile label="Copilot answers" value={quality.data.totals.calls} />
                <StatTile label="Thumbs up" value={quality.data.totals.up} tone="success" />
                <StatTile label="Thumbs down" value={quality.data.totals.down} tone="danger" />
                <StatTile label="Unrated" value={quality.data.totals.unrated} />
                <StatTile label="Not confident" value={quality.data.totals.notConfident} tone="warning" />
              </div>
              <Panel title="By page">
                <DataTable head={["Page", "Answers", "Up", "Down", "Avg latency"]}>
                  {quality.data.byPage.map((p) => (
                    <Row key={p.page}>
                      <Cell className="font-medium">{p.page}</Cell>
                      <Cell mono>{p.calls}</Cell>
                      <Cell mono className="text-success">{p.up}</Cell>
                      <Cell mono className="text-destructive">{p.down}</Cell>
                      <Cell mono>{p.avgMs} ms</Cell>
                    </Row>
                  ))}
                </DataTable>
              </Panel>
              <Panel title="Recent thumbs down" count={quality.data.recentDown.length}>
                {quality.data.recentDown.length === 0 ? (
                  <EmptyState>No thumbs down yet.</EmptyState>
                ) : (
                  <DataTable head={["Question", "Answer", "Note", "Who"]}>
                    {quality.data.recentDown.map((d) => (
                      <Row key={d.id}>
                        <Cell className="max-w-[18rem] text-xs">{d.question}</Cell>
                        <Cell className="max-w-[24rem] text-xs whitespace-pre-wrap text-muted-foreground">{d.answer}</Cell>
                        <Cell className="text-xs">{d.ratingNote ?? "—"}</Cell>
                        <Cell mono className="text-xs">{d.actor} · {d.page}</Cell>
                      </Row>
                    ))}
                  </DataTable>
                )}
              </Panel>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="test" className="mt-3">
          <Panel title="What would Ichiban use?" note="Q&A first, then the corpus">
            <form
              className="mb-4 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (probe.question.trim()) test.mutate();
              }}
            >
              <Field label="Question" className="min-w-[18rem] flex-1">
                <Input value={probe.question} onChange={(e) => setProbe({ ...probe, question: e.target.value })} placeholder="how long is a mute?" />
              </Field>
              <Field label="Asked by">
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={probe.audience} onChange={(e) => setProbe({ ...probe, audience: e.target.value })}>
                  <option value="players">A player (game / Discord)</option>
                  <option value="staff">Staff (portal)</option>
                </select>
              </Field>
              <Button type="submit" disabled={test.isPending}>Test</Button>
            </form>
            {test.data &&
              (test.data.hits.length === 0 ? (
                <EmptyState>Nothing relevant: Ichiban would log this as unanswered.</EmptyState>
              ) : (
                <DataTable head={["#", "Kind", "Title", "Score", "Text"]}>
                  {test.data.hits.map((h, i) => (
                    <Row key={i}>
                      <Cell mono>{i + 1}</Cell>
                      <Cell>
                        <Pill tone={h.kind === "qna" ? "primary" : "neutral"}>{h.match === "exact" ? "Q&A exact" : h.kind}</Pill>
                      </Cell>
                      <Cell className="text-xs font-medium">{h.title}</Cell>
                      <Cell mono>{h.score.toFixed(2)}</Cell>
                      <Cell className="max-w-[28rem] text-xs whitespace-pre-wrap text-muted-foreground">{h.text}</Cell>
                    </Row>
                  ))}
                </DataTable>
              ))}
            {test.data && <p className="mt-2 text-xs text-muted-foreground">Top score {test.data.topScore.toFixed(2)} · {test.data.confident ? "confident" : "not confident (would be logged)"} · {test.data.embedded ? "semantic + exact" : "exact / lexical only (no embeddings here)"}</p>}
          </Panel>
        </TabsContent>

        <TabsContent value="maintain" className="mt-3">
          <Panel title="Rebuild Ichiban's knowledge" note="runs on the game server; the Gemini key never leaves it">
            <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
              Rebuild re-runs the corpus build (history, policy, racers, setups) and the embedding step on the server, reloads it,
              and embeds any published Q&A that is missing a vector. Publishing a single Q&A never needs a rebuild.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button disabled={!admin || runRebuild.isPending || rebuild.data?.running} onClick={() => runRebuild.mutate()}>
                <RefreshCw className={rebuild.data?.running ? "size-4 animate-spin" : "size-4"} aria-hidden />
                {rebuild.data?.running ? "Rebuilding…" : "Rebuild knowledge base"}
              </Button>
              <Button variant="outline" disabled={!admin || seed.isPending} onClick={() => seed.mutate()}>
                Seed starter Q&A
              </Button>
              {!admin && <span className="self-center text-xs text-warning">Admins and up only.</span>}
            </div>
            {rebuild.data && (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Pill tone="neutral">corpus {rebuild.data.kbNow?.docs ?? 0} docs · {rebuild.data.kbNow?.vectors ?? 0} vectors</Pill>
                  <Pill tone={rebuild.data.embeddings ? "success" : "warning"}>{rebuild.data.embeddings ? "embeddings on" : "no key: embeddings off"}</Pill>
                  {rebuild.data.success != null && <Pill tone={rebuild.data.success ? "success" : "danger"}>{rebuild.data.success ? "last rebuild ok" : "last rebuild failed"}</Pill>}
                  {rebuild.data.finishedAt && <span className="text-xs text-muted-foreground">{dateLabel(rebuild.data.finishedAt)} by {rebuild.data.by}</span>}
                </div>
                {rebuild.data.steps.map((s) => (
                  <details key={s.step} className="rounded-lg border border-border bg-surface/60 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium">
                      {s.ok ? "✓" : "✗"} {s.step}
                    </summary>
                    <pre className="scroll-slim mt-2 max-h-48 overflow-auto font-mono text-[0.6875rem] whitespace-pre-wrap text-muted-foreground">{s.output}</pre>
                  </details>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
