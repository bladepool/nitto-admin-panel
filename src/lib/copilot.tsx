/*
 * Ichiban copilot context: which admin page is showing and which item staff selected on it. Pages tell
 * the dock about a row with <AskIchiban select={...} />; the dock sends {page, selected} with every
 * question so the game API can load the right READ-ONLY live data for it. Nothing here is a security
 * control: the server re-checks the session, the role and every id.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type CopilotSelected = {
  type: "tournamentSlot" | "tournamentEvent" | "migrationReview" | "discordCase" | "badge" | "racer" | "news" | "invite";
  id?: number | string;
  key?: string;
  handle?: string;
  label: string;
};

export type ActionCard = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: Record<string, unknown>;
  minRole: number;
  allowed: boolean;
  danger: boolean;
  confirmLabel: string;
  recommended?: boolean;
};

export type QuickAction = {
  id: string;
  label: string;
  kind: "assist" | "ask";
  needsBrief?: boolean;
  needs?: string;
};

type Ctx = {
  page: string;
  selected: CopilotSelected | null;
  setSelected: (s: CopilotSelected | null) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  /** Select an item and open the dock on it. */
  askAbout: (s: CopilotSelected) => void;
};

const CopilotContext = createContext<Ctx | null>(null);

/** /admin -> overview, /admin/migrations -> migrations, ... (the API's page keys). */
export function pageKey(pathname: string): string {
  const seg = pathname.replace(/\/+$/, "").split("/")[2] ?? "";
  return seg || "overview";
}

export function CopilotProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const page = pageKey(pathname);
  const [state, setState] = useState<{ page: string; selected: CopilotSelected | null }>({ page, selected: null });
  const [open, setOpen] = useState(false);
  // A selection belongs to the page it was made on.
  const selected = state.page === page ? state.selected : null;
  const setSelected = useCallback((s: CopilotSelected | null) => setState({ page, selected: s }), [page]);
  const askAbout = useCallback(
    (s: CopilotSelected) => {
      setState({ page, selected: s });
      setOpen(true);
    },
    [page],
  );
  const value = useMemo(() => ({ page, selected, setSelected, open, setOpen, askAbout }), [page, selected, setSelected, open, askAbout]);
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): Ctx {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    return { page: "overview", selected: null, setSelected: () => {}, open: false, setOpen: () => {}, askAbout: () => {} };
  }
  return ctx;
}

/** Small per-row button: "ask Ichiban about this". */
export function AskIchiban({ select, className }: { select: CopilotSelected; className?: string }) {
  const { askAbout, selected } = useCopilot();
  const active = selected?.type === select.type && String(selected?.id ?? selected?.key) === String(select.id ?? select.key);
  return (
    <button
      type="button"
      onClick={() => askAbout(select)}
      title={`Ask Ichiban about ${select.label}`}
      aria-label={`Ask Ichiban about ${select.label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em] transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden />
      Ichiban
    </button>
  );
}
