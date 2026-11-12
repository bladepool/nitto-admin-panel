/*
 * Ichiban, the staff copilot, docked on every admin page (mounted once in AdminShell).
 *
 * Asks POST /api/admin/copilot/ask with {page, question | quick, context.selected, history}. Answers show
 * their sources (knowledge titles) and the live data blocks used. ACTION CARDS are proposals: "Confirm"
 * calls the card's own audited endpoint through api() with this staff member's session, so the server's
 * role gate, self-award guard and supply caps decide exactly as if the page's own button was pressed.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Send, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/admin/primitives";
import { api, roleName } from "@/lib/admin-api";
import { useCopilot, type ActionCard, type QuickAction } from "@/lib/copilot";
import { cn } from "@/lib/utils";

type Status = {
  enabled: boolean;
  message?: string;
  persona: { name: string; avatarUrl: string };
  pageTitle?: string;
  quickActions: QuickAction[];
  kb?: { docs: number; vectors: number; qnaPublished: number; unansweredOpen: number };
};
type AskReply = {
  ok: boolean;
  enabled: boolean;
  answer: string;
  confident: boolean;
  sources: Array<{ title: string; kind: string; score?: number }>;
  data: string[];
  cards: ActionCard[];
  notes: string[];
  error?: string;
  callId: number | null;
  ms?: number;
};
type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; reply: AskReply; rated?: 1 | -1; cardState: Record<string, "done" | "failed" | "busy" | "review"> };

function Avatar({ url, size = "size-9" }: { url: string; size?: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-full border border-primary/50 bg-primary/15 font-display text-sm font-bold text-primary")}>
      I
    </span>
  ) : (
    <img src={url} alt="Ichiban" onError={() => setBroken(true)} className={cn(size, "shrink-0 rounded-full border border-primary/50 object-cover")} />
  );
}

export function CopilotDock({ role }: { role: number }) {
  const { page, selected, setSelected, open, setOpen } = useCopilot();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const messages = threads[page] ?? [];
  const endRef = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: ["copilot", "status", page],
    queryFn: () => api<Status>(`/api/admin/copilot/status?page=${encodeURIComponent(page)}`),
    retry: false,
    staleTime: 60_000,
    enabled: open,
  });
  const avatarUrl = status.data?.persona.avatarUrl ?? "/api/admin/copilot/avatar";
  const setMsgs = (fn: (m: Msg[]) => Msg[]) => setThreads((t) => ({ ...t, [page]: fn(t[page] ?? []) }));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, open]);

  const ask = useMutation({
    mutationFn: (v: { question?: string; quick?: string }) =>
      api<AskReply>("/api/admin/copilot/ask", {
        method: "POST",
        body: {
          page,
          ...(v.question ? { question: v.question } : {}),
          ...(v.quick ? { quick: v.quick } : {}),
          context: selected ? { selected } : {},
          history: messages
            .slice(-6)
            .map((m) => (m.role === "user" ? { role: "user", text: m.text } : { role: "assistant", text: m.reply.answer })),
        },
      }),
    onSuccess: (reply) => setMsgs((m) => [...m, { role: "assistant", reply, cardState: {} }]),
    onError: (error: Error) =>
      setMsgs((m) => [
        ...m,
        { role: "assistant", cardState: {}, reply: { ok: false, enabled: true, answer: "", confident: false, sources: [], data: [], cards: [], notes: [], error: error.message, callId: null } },
      ]),
  });

  function send(question: string, quick?: QuickAction) {
    const q = question.trim();
    if (!q && !quick) return;
    if (quick?.needsBrief && !q) {
      toast("Type a short brief first, then press the quick action.");
      return;
    }
    setMsgs((m) => [...m, { role: "user", text: quick ? `${quick.label}${q ? `: ${q}` : ""}` : q }]);
    setText("");
    ask.mutate({ ...(q ? { question: q } : {}), ...(quick ? { quick: quick.id } : {}) });
  }

  async function rate(index: number, rating: 1 | -1) {
    const msg = messages[index];
    if (!msg || msg.role !== "assistant" || !msg.reply.callId) return;
    try {
      await api("/api/admin/copilot/feedback", { method: "POST", body: { callId: msg.reply.callId, rating } });
      setMsgs((m) => m.map((x, i) => (i === index && x.role === "assistant" ? { ...x, rated: rating } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function setCard(index: number, id: string, s: "done" | "failed" | "busy" | "review" | undefined) {
    setMsgs((m) =>
      m.map((x, i) => {
        if (i !== index || x.role !== "assistant") return x;
        const cardState = { ...x.cardState };
        if (s) cardState[id] = s;
        else delete cardState[id];
        return { ...x, cardState };
      }),
    );
  }

  async function confirmCard(index: number, card: ActionCard, callId: number | null) {
    // Only ever the game API's own staff routes, exactly as the server built them.
    if (!/^\/api\/(admin|mod)\//.test(card.path)) {
      toast.error("Refused: not a staff API route.");
      return;
    }
    setCard(index, card.id, "busy");
    try {
      await api(card.path, { method: card.method, body: card.body });
      setCard(index, card.id, "done");
      toast.success(`Done: ${card.title}`);
      void api("/api/admin/copilot/card-outcome", { method: "POST", body: { callId, kind: card.kind, status: "confirmed" } }).catch(() => {});
      await queryClient.invalidateQueries();
    } catch (e) {
      setCard(index, card.id, "failed");
      toast.error(`${card.title}: ${(e as Error).message}`);
      void api("/api/admin/copilot/card-outcome", { method: "POST", body: { callId, kind: card.kind, status: "failed", detail: (e as Error).message } }).catch(() => {});
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full border border-primary/50 bg-card/95 py-1.5 pr-4 pl-1.5 shadow-panel backdrop-blur transition-colors hover:bg-surface-raised"
        aria-label="Open Ichiban, the staff copilot"
      >
        <Avatar url={avatarUrl} size="size-9" />
        <span className="flex flex-col text-left leading-tight">
          <span className="font-display text-sm font-semibold tracking-wide">ICHIBAN</span>
          <span className="text-[0.6875rem] text-muted-foreground">Ask about this page</span>
        </span>
      </button>
    );
  }

  const offline = status.data && !status.data.enabled;
  const quick = status.data?.quickActions ?? [];

  return (
    <aside
      aria-label="Ichiban copilot"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[26rem] flex-col border-l border-border bg-background/97 shadow-panel backdrop-blur"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar url={avatarUrl} size="size-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-semibold tracking-wide">ICHIBAN</span>
            {status.isLoading ? null : offline ? <Pill tone="warning">Offline</Pill> : <Pill tone="success">Online</Pill>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            Staff copilot · {status.data?.pageTitle ?? page} · suggestions only
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close Ichiban">
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      {offline && (
        <div className="flex gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>Ichiban is offline. {status.data?.message}</span>
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2 text-xs">
          <span className="label-eyebrow">Selected</span>
          <span className="min-w-0 flex-1 truncate font-medium">{selected.label}</span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)} aria-label="Clear selection">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div className="scroll-slim flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            <p>
              Hi, I'm Ichiban. Ask me about <b className="text-foreground">{status.data?.pageTitle ?? "this page"}</b>, or pick a quick action
              below. I can draft and summarize, and propose actions you confirm with one click.
            </p>
            {selected && <p className="mt-2">I'll use the selected item: {selected.label}.</p>}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-lg bg-primary/15 px-3 py-2 text-sm whitespace-pre-wrap">
              {m.text}
            </div>
          ) : (
            <div key={i} className="flex gap-2">
              <Avatar url={avatarUrl} size="size-7" />
              <div className="min-w-0 flex-1 space-y-2">
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap",
                    m.reply.error ? "border-destructive/40 bg-destructive/10" : "border-border bg-card",
                  )}
                >
                  {m.reply.answer || m.reply.error}
                  {m.reply.answer && m.reply.error ? <div className="mt-1 text-xs text-destructive">{m.reply.error}</div> : null}
                  {!m.reply.confident && m.reply.ok && (
                    <div className="mt-1 text-xs text-warning">Not confident: logged for the Ichiban Knowledge queue.</div>
                  )}
                </div>

                {m.reply.cards.map((card) => {
                  const st = m.cardState[card.id];
                  return (
                    <div
                      key={card.id}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-xs",
                        card.recommended ? "border-primary/60 bg-primary/10" : "border-border bg-surface/70",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground">{card.title}</span>
                            {card.recommended && <Pill tone="primary">Recommended</Pill>}
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{card.summary}</p>
                          <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
                            {card.method} {card.path} · needs {roleName(card.minRole)}
                          </p>
                        </div>
                      </div>
                      {st === "review" && (
                        <pre className="scroll-slim mt-2 max-h-40 overflow-auto rounded bg-background/80 p-2 font-mono text-[0.6875rem] text-muted-foreground">
                          {JSON.stringify(card.body, null, 2)}
                        </pre>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {st === "done" ? (
                          <Pill tone="success">
                            <Check className="size-3" aria-hidden /> Done
                          </Pill>
                        ) : !card.allowed || role < card.minRole ? (
                          <span className="text-warning">Needs {roleName(card.minRole)}: the server will refuse it for your role.</span>
                        ) : st === "review" || st === "busy" || st === "failed" ? (
                          <>
                            <Button
                              size="sm"
                              variant={card.danger ? "destructive" : "default"}
                              disabled={st === "busy"}
                              onClick={() => void confirmCard(i, card, m.reply.callId)}
                            >
                              {st === "busy" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                              {st === "failed" ? "Try again" : card.confirmLabel}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setCard(i, card.id, undefined)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setCard(i, card.id, "review")}>
                            Review…
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {(m.reply.sources.length > 0 || m.reply.data.length > 0) && (
                  <div className="space-y-0.5 text-[0.6875rem] text-muted-foreground">
                    {m.reply.sources.length > 0 && (
                      <div>
                        <span className="label-eyebrow">Sources</span>{" "}
                        {m.reply.sources.map((s) => `${s.title}${s.score != null ? ` (${s.score})` : ""}`).join(" · ")}
                      </div>
                    )}
                    {m.reply.data.length > 0 && (
                      <div>
                        <span className="label-eyebrow">Data</span> {m.reply.data.join(" · ")}
                      </div>
                    )}
                  </div>
                )}
                {m.reply.notes.length > 0 && <ul className="list-disc pl-4 text-[0.6875rem] text-muted-foreground">{m.reply.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>}

                {m.reply.callId && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <button
                      type="button"
                      aria-label="Helpful"
                      className={cn("rounded p-1 hover:text-success", m.rated === 1 && "text-success")}
                      onClick={() => void rate(i, 1)}
                    >
                      <ThumbsUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Not helpful"
                      className={cn("rounded p-1 hover:text-destructive", m.rated === -1 && "text-destructive")}
                      onClick={() => void rate(i, -1)}
                    >
                      <ThumbsDown className="size-3.5" aria-hidden />
                    </button>
                    {m.reply.ms != null && <span className="ml-1 font-mono text-[0.625rem]">{m.reply.ms} ms</span>}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Ichiban is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 pt-2.5">
          {quick.map((q) => (
            <button
              key={q.id}
              type="button"
              disabled={ask.isPending}
              onClick={() => send(text, q)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
              title={q.needsBrief ? "Uses the text you typed as the brief" : q.needs ? `Uses the selected item (${q.needs})` : undefined}
            >
              <Sparkles className="size-3" aria-hidden />
              {q.label}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Ask Ichiban, or type a brief for a quick action…"
          className="min-h-[2.75rem] resize-none text-sm"
          aria-label="Message Ichiban"
        />
        <Button type="submit" size="sm" disabled={ask.isPending || !text.trim()} aria-label="Send">
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </aside>
  );
}
