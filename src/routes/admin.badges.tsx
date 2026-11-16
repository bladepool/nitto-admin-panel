import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
import {
  ConfirmButton,
  GameApiCredential,
  NativeSelect,
  RacerPicker,
} from "@/components/admin/game-api";
import { formText } from "@/lib/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, integer, type RacerCard } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/badges")({
  head: () => ({
    meta: [
      { title: "Badges — Racing Legends Race Control" },
      {
        name: "description",
        content: "Badge definitions, auto-award rules, and staff grants and revokes.",
      },
      { property: "og:title", content: "Badges — Racing Legends Race Control" },
      { property: "og:description", content: "Badge definitions and staff grants." },
    ],
  }),
  component: BadgesPage,
});

type BadgeDef = {
  key: string;
  name: string;
  description: string | null;
  auto: boolean;
  rule: string | null;
  icon: string | null;
  active: boolean;
};

type InventoryItem = {
  id: number;
  description: string;
  category: string;
  confirmed: boolean;
  assignedTo: string | null;
};

/** Rule kinds understood by awards.ts (auto) and legacy/badges.ts (city). */
const RULE_KINDS = [
  { value: "", label: "No rule (manual)", hint: "" },
  { value: "challengeWins", label: "Challenge wins ≥ N", hint: "N wins" },
  { value: "score", label: "Street Credit ≥ N", hint: "N score" },
  { value: "rank", label: "Rank title", hint: "e.g. Legend" },
  { value: "winStreak", label: "Win streak ≥ N", hint: "N consecutive wins" },
  { value: "reaction", label: "Reaction within MS of perfect", hint: "ms, 1 = .499" },
  { value: "netWorth", label: "Net worth ≥ N", hint: "money + car value" },
  { value: "city", label: "Home city (shown while living there)", hint: "100..500" },
];

const gameKey = (...parts: unknown[]) => ["game", "badges", ...parts];

/*
 * Badge art exactly as the client draws it (decompiled classes/Badges.as + TrophyRoom.as):
 *  - profile / roster strip: the small badges.swf bitmap, 43 x 43, each next badge drawn `width - 4`
 *    to the right (a 4 px overlap), tooltip = the badge name (Lookup.badgeAltText);
 *  - trophy room: the large bitmap, 150 x 150 in a 150 px grid, tooltip = name + description.
 * The PNGs are the client's own badges.swf exports, shipped as static staff assets in public/badges/<id>.png
 * (the large art; the browser scales it to the strip size like the client's small copy).
 */
export const BADGE_STRIP_PX = 43;
const BADGE_OVERLAP_PX = 4;
const badgeArtUrl = (id: string | number) => `/badges/${encodeURIComponent(String(id))}.png`;

function BadgeArt({
  icon,
  size = BADGE_STRIP_PX,
  title,
  dim = false,
  className,
}: {
  icon: string | number | null;
  size?: number | undefined;
  title?: string | undefined;
  dim?: boolean | undefined;
  className?: string | undefined;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (icon == null || icon === "" || broken) {
    return (
      <span
        title={title ?? (icon != null && icon !== "" ? `No art for badge #${icon}` : "No icon")}
        style={style}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30 text-[0.625rem] text-muted-foreground",
          className,
        )}
      >
        {icon != null && icon !== "" ? `#${icon}` : "—"}
      </span>
    );
  }
  return (
    <img
      src={badgeArtUrl(icon)}
      alt={title ?? `Badge ${icon}`}
      title={title}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
      style={style}
      className={cn(
        "shrink-0 select-none object-contain",
        dim && "opacity-40 grayscale",
        className,
      )}
    />
  );
}

/** The client's badge strip: 43 px badges, each overlapping the previous by 4 px, name on hover. */
function BadgeStrip({ items }: { items: { key: string; icon: string | null; name: string; dim?: boolean | undefined }[] }) {
  return (
    <div className="flex flex-wrap items-center" style={{ paddingLeft: BADGE_OVERLAP_PX }}>
      {items.map((item) => (
        <span key={item.key} style={{ marginLeft: -BADGE_OVERLAP_PX }} className="inline-flex">
          <BadgeArt icon={item.icon} title={item.name} dim={item.dim} />
        </span>
      ))}
    </div>
  );
}

function BadgesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BadgeDef | "new" | null>(null);

  const defs = useQuery({
    queryKey: gameKey("defs"),
    queryFn: () => api<{ badges: BadgeDef[] }>("/api/admin/badges"),
    retry: false,
  });
  const inventory = useQuery({
    queryKey: gameKey("inventory"),
    queryFn: () => api<{ badges: InventoryItem[] }>("/api/admin/badges/inventory"),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (key: string) =>
      api(`/api/admin/badges/${encodeURIComponent(key)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Badge definition deleted.");
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const list = defs.data?.badges ?? [];
  const items = inventory.data?.badges ?? [];
  const free = items.filter((item) => !item.assignedTo).length;

  return (
    <>
      <PageHeading
        title="Badges"
        subtitle="Badge definitions shown in the client, their auto-award rules, and manual grants."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            New badge
          </Button>
        }
      />

      <GameApiCredential />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Definitions" value={integer(list.length)} tone="primary" />
        <StatTile label="Auto-awarded" value={integer(list.filter((d) => d.auto).length)} />
        <StatTile label="Inactive" value={integer(list.filter((d) => !d.active).length)} />
        <StatTile label="Unused images" value={integer(free)} hint={`of ${items.length}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Badge definitions" count={list.length}>
          {defs.isLoading ? (
            <LoadingState label="Reading badges" />
          ) : defs.isError ? (
            <ErrorState error={defs.error} what="badges" />
          ) : list.length === 0 ? (
            <EmptyState>No badge definitions.</EmptyState>
          ) : (
            <DataTable head={["Icon", "Badge", "Rule", "Auto", "Status", ""]}>
              {list.map((def) => (
                <Row key={def.key} className={def.active ? "" : "opacity-60"}>
                  <Cell>
                    <BadgeArt icon={def.icon} title={def.name} dim={!def.active} />
                  </Cell>
                  <Cell>
                    <div className="font-medium">{def.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{def.key}</div>
                    {def.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{def.description}</div>
                    )}
                  </Cell>
                  <Cell mono className="text-xs">
                    {def.rule || "—"}
                  </Cell>
                  <Cell>{def.auto ? <Pill tone="info">auto</Pill> : <Pill>manual</Pill>}</Cell>
                  <Cell>
                    <Pill tone={def.active ? "success" : "neutral"}>
                      {def.active ? "active" : "inactive"}
                    </Pill>
                  </Cell>
                  <Cell>
                    <div className="flex gap-1.5">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Edit badge"
                        onClick={() => setEditing(def)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <ConfirmButton
                        size="icon"
                        variant="destructive"
                        label="Delete badge"
                        title={`Delete “${def.key}”?`}
                        description="The server refuses while any racer holds this badge; revoke it or set it inactive instead."
                        confirmLabel="Delete"
                        disabled={remove.isPending}
                        onConfirm={() => remove.mutate(def.key)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </ConfirmButton>
                    </div>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>

        <GrantPanel defs={list} />
      </div>

      <div className="mt-4">
        <InventoryPanel
          items={items}
          isLoading={inventory.isLoading}
          error={inventory.isError ? inventory.error : null}
        />
      </div>

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {editing != null && (
            <BadgeForm
              def={editing === "new" ? null : editing}
              inventory={items}
              inventoryError={inventory.isError ? inventory.error : null}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Trophy-room scale for the gallery: the client's 150 px large art at half size. */
const GALLERY_PX = 75;

/** Every badge in the client's badges.swf, drawn from its own art; greyed when no definition awards it. */
function InventoryPanel({
  items,
  isLoading,
  error,
}: {
  items: InventoryItem[];
  isLoading: boolean;
  error: unknown;
}) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const needle = search.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (!category || item.category === category) &&
      (!onlyFree || !item.assignedTo) &&
      (!needle ||
        String(item.id) === needle ||
        item.description.toLowerCase().includes(needle) ||
        (item.assignedTo ?? "").toLowerCase().includes(needle)),
  );
  const used = items.filter((item) => item.assignedTo).length;

  return (
    <Panel
      title="Client badge inventory"
      count={visible.length}
      note={`badges.swf art · ${used} backed by a definition · grey = not awarded by any definition`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, id or definition key"
          aria-label="Search client badges"
          className="w-full sm:w-64"
        />
        <NativeSelect
          className="w-full sm:w-44"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={[
            { value: "", label: "All categories" },
            ...categories.map((value) => ({ value, label: value })),
          ]}
        />
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={onlyFree} onCheckedChange={setOnlyFree} />
          Unused only
        </label>
      </div>
      {isLoading ? (
        <LoadingState label="Reading badges.swf inventory" />
      ) : error ? (
        <ErrorState error={error} what="the badge inventory" />
      ) : visible.length === 0 ? (
        <EmptyState>No badges in this view.</EmptyState>
      ) : (
        <div
          className="scroll-slim grid max-h-[34rem] gap-1 overflow-y-auto rounded-md bg-[#1a1a1a] p-2"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${GALLERY_PX + 8}px, 1fr))` }}
        >
          {visible.map((item) => (
            <figure
              key={item.id}
              className="flex flex-col items-center gap-0.5 rounded p-1 hover:bg-white/5"
              title={`${item.description}${item.assignedTo ? ` · definition “${item.assignedTo}”` : " · no definition"}${item.confirmed ? "" : " (name unconfirmed)"}`}
            >
              <BadgeArt
                icon={item.id}
                size={GALLERY_PX}
                title={item.description}
                dim={!item.assignedTo}
              />
              <figcaption className="numeric w-full truncate text-center text-[0.625rem] text-white/60">
                #{item.id}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Panel>
  );
}

function splitRule(rule: string | null | undefined): { kind: string; arg: string } {
  if (!rule) return { kind: "", arg: "" };
  const at = rule.indexOf(":");
  return at < 0 ? { kind: rule, arg: "" } : { kind: rule.slice(0, at), arg: rule.slice(at + 1) };
}

function BadgeForm({
  def,
  inventory,
  inventoryError,
  onDone,
}: {
  def: BadgeDef | null;
  inventory: InventoryItem[];
  inventoryError: unknown;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const initial = splitRule(def?.rule);
  const [ruleKind, setRuleKind] = useState(initial.kind);
  const [ruleArg, setRuleArg] = useState(initial.arg);
  const [auto, setAuto] = useState(def?.auto ?? false);
  const [active, setActive] = useState(def?.active ?? true);
  const [icon, setIcon] = useState<string>(def?.icon ?? "");
  const [category, setCategory] = useState("");
  const [showUsed, setShowUsed] = useState(false);

  const categories = useMemo(
    () => [...new Set(inventory.map((item) => item.category))].sort(),
    [inventory],
  );
  const visible = inventory.filter(
    (item) =>
      (!category || item.category === category) &&
      (showUsed || !item.assignedTo || item.assignedTo === def?.key || String(item.id) === icon),
  );
  const selected = inventory.find((item) => String(item.id) === icon);
  const kindInfo = RULE_KINDS.find((kind) => kind.value === ruleKind);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ badge: BadgeDef }>("/api/admin/badges", { method: "POST", body }),
    onSuccess: (data) => {
      toast.success(`Badge “${data.badge.key}” saved.`);
      queryClient.invalidateQueries({ queryKey: gameKey() });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{def ? `Edit badge “${def.key}”` : "New badge"}</DialogTitle>
        <DialogDescription>
          The icon must be an image from the client&apos;s badge inventory, and each image can back
          only one badge.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const rule = ruleKind ? `${ruleKind}${ruleArg.trim() ? `:${ruleArg.trim()}` : ""}` : null;
          save.mutate({
            key: def?.key ?? formText(data, "key"),
            name: formText(data, "name"),
            description: formText(data, "description") || null,
            rule,
            auto,
            active,
            icon: icon || null,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Key (stable slug)">
            <Input
              name="key"
              required
              pattern="[a-z0-9_.\-]+"
              placeholder="e.g. legend"
              defaultValue={def?.key ?? ""}
              disabled={Boolean(def)}
            />
          </Field>
          <Field label="Name">
            <Input name="name" required defaultValue={def?.name ?? ""} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea name="description" rows={2} defaultValue={def?.description ?? ""} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label="Rule">
            <NativeSelect
              value={ruleKind}
              onChange={(event) => setRuleKind(event.target.value)}
              options={RULE_KINDS.map(({ value, label }) => ({ value, label }))}
            />
          </Field>
          <Field label="Argument">
            <Input
              value={ruleArg}
              disabled={!ruleKind}
              placeholder={kindInfo?.hint ?? ""}
              list={ruleKind === "rank" ? "rank-titles" : undefined}
              onChange={(event) => setRuleArg(event.target.value)}
            />
            <datalist id="rank-titles">
              {["Noob", "Novice", "Rookie", "Pro", "Champion", "Legend"].map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={auto} onCheckedChange={setAuto} />
            Auto-award when the rule holds
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Active
          </label>
        </div>

        <fieldset className="rounded-lg border border-border p-3">
          <legend className="label-eyebrow px-1">Icon</legend>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <BadgeArt icon={icon || null} size={150} title={selected?.description} className="rounded-md bg-[#1a1a1a]" />
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              {selected
                ? `#${selected.id} · ${selected.description} · ${selected.category}${selected.confirmed ? "" : " (unconfirmed)"}`
                : icon
                  ? `#${icon}`
                  : "No icon selected"}
            </div>
            <NativeSelect
              className="w-40"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={[
                { value: "", label: "All categories" },
                ...categories.map((value) => ({ value, label: value })),
              ]}
            />
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={showUsed} onCheckedChange={setShowUsed} />
              Show used
            </label>
            {icon && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setIcon("")}>
                Clear
              </Button>
            )}
          </div>
          {inventoryError ? (
            <ErrorState error={inventoryError} what="the badge inventory" />
          ) : visible.length === 0 ? (
            <EmptyState>No images in this view.</EmptyState>
          ) : (
            <div className="scroll-slim grid max-h-64 grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5 overflow-y-auto">
              {visible.map((item) => {
                const taken = Boolean(item.assignedTo) && item.assignedTo !== def?.key;
                const isSelected = String(item.id) === icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={taken}
                    title={`#${item.id} ${item.description}${taken ? ` (used by ${item.assignedTo})` : ""}`}
                    onClick={() => setIcon(String(item.id))}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-md border p-1 transition-colors",
                      isSelected
                        ? "border-primary bg-primary/15"
                        : "border-border hover:bg-surface-raised/60",
                      taken && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <BadgeArt icon={item.id} title={item.description} />
                    <span className="numeric text-[0.625rem] text-muted-foreground">{item.id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {def ? "Save badge" : "Create badge"}
          </Button>
        </div>
      </form>
    </>
  );
}

function GrantPanel({ defs }: { defs: BadgeDef[] }) {
  const [racer, setRacer] = useState<RacerCard | null>(null);
  const [badgeKey, setBadgeKey] = useState("");
  const [reason, setReason] = useState("");
  const [held, setHeld] = useState<string[] | null>(null);

  const current = held ?? racer?.badges ?? [];

  const action = useMutation({
    mutationFn: (verb: "grant" | "revoke") =>
      api<{ applied: boolean; badges: string[] }>(`/api/admin/badges/${verb}`, {
        method: "POST",
        body: {
          accountId: racer?.id,
          badgeKey,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      }),
    onSuccess: (data, verb) => {
      setHeld(data.badges ?? null);
      if (data.applied) toast.success(`Badge ${verb === "grant" ? "granted" : "revoked"}.`);
      else toast(`Nothing changed: ${verb === "grant" ? "already held" : "not held"}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const evaluate = useMutation({
    mutationFn: () =>
      api<{ granted: string[] }>("/api/admin/badges/evaluate", {
        method: "POST",
        body: { accountId: racer?.id },
      }),
    onSuccess: (data) => {
      if (data.granted.length) {
        toast.success(`Auto-granted: ${data.granted.join(", ")}`);
        setHeld([...new Set([...current, ...data.granted])]);
      } else toast("No new auto badges earned.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel title="Grant / revoke" note="Staff cannot grant themselves">
      <div className="flex flex-col gap-3">
        <RacerPicker
          value={racer}
          onChange={(next) => {
            setRacer(next);
            setHeld(null);
          }}
        />
        <Field label="Badge">
          <NativeSelect
            value={badgeKey}
            onChange={(event) => setBadgeKey(event.target.value)}
            options={[
              { value: "", label: "Choose a badge" },
              ...defs.map((def) => ({ value: def.key, label: `${def.name} (${def.key})` })),
            ]}
          />
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            placeholder="staff grant"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={!racer || !badgeKey || action.isPending}
            onClick={() => action.mutate("grant")}
          >
            Grant
          </Button>
          <ConfirmButton
            variant="outline"
            size="default"
            title="Revoke badge?"
            description={`Remove “${badgeKey}” from ${racer?.username ?? "this racer"}.`}
            confirmLabel="Revoke"
            disabled={!racer || !badgeKey || action.isPending}
            onConfirm={() => action.mutate("revoke")}
          >
            Revoke
          </ConfirmButton>
        </div>
        <Button
          variant="secondary"
          disabled={!racer || evaluate.isPending}
          onClick={() => evaluate.mutate()}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Run auto-badge evaluation
        </Button>

        {racer && (
          <div>
            <p className="label-eyebrow mb-1.5">Holds {current.length}</p>
            {current.length === 0 ? (
              <p className="text-xs text-muted-foreground">No badges.</p>
            ) : (
              <>
                <div className="rounded-md bg-[#1a1a1a] p-1.5">
                  <BadgeStrip
                    items={current.map((key) => {
                      const def = defs.find((item) => item.key === key);
                      return { key, icon: def?.icon ?? null, name: def?.name ?? key, dim: def ? !def.active : true };
                    })}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {current
                    .map((key) => defs.find((item) => item.key === key)?.name ?? key)
                    .join(" · ")}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
