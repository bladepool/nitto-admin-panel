import { useState, type ComponentProps, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Search } from "lucide-react";
import { toast } from "sonner";

import { Field, Panel, Pill } from "@/components/admin/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAdminSession } from "@/lib/use-admin-session";
import {
  api,
  getGameAuth,
  lookupRacer,
  setGameAuth,
  type GameAuth,
  type RacerCard,
} from "@/lib/admin-api";

/**
 * Fallback credential for the game server's staff routes. Normally the panel's
 * staff cookie (set at sign-in by /api/admin/auth/login) authenticates every
 * call, and this strip renders nothing. It only appears without a cookie
 * session, e.g. to use the server-to-server admin key.
 */
export function GameApiCredential() {
  const { session } = useAdminSession();
  if (session) return null;
  return <GameApiCredentialStrip />;
}

function GameApiCredentialStrip() {
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState<GameAuth | null>(() => getGameAuth());
  const [mode, setMode] = useState<"login" | "key">("login");
  const [busy, setBusy] = useState(false);

  function save(next: GameAuth | null) {
    setGameAuth(next);
    setAuth(next);
    queryClient.invalidateQueries({ queryKey: ["game"] });
  }

  if (auth) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/70 px-3.5 py-2.5 text-xs text-muted-foreground">
        <KeyRound className="size-3.5" aria-hidden />
        <Pill tone="success">Game API connected</Pill>
        <span>
          {auth.mode === "key"
            ? "Admin key"
            : `Staff session${auth.label ? ` (${auth.label})` : ""}`}
          {" · this tab only"}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => save(null)}>
          <LogOut className="size-3.5" aria-hidden />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Panel
      className="mb-4"
      title="Connect to the game API"
      note="Staff routes need a Moderator+ game login or the admin key"
      actions={
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === "login" ? "secondary" : "ghost"}
            onClick={() => setMode("login")}
          >
            Game login
          </Button>
          <Button
            size="sm"
            variant={mode === "key" ? "secondary" : "ghost"}
            onClick={() => setMode("key")}
          >
            Admin key
          </Button>
        </div>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (mode === "key") {
            const token = String(data.get("key") || "").trim();
            if (token) save({ mode: "key", token });
            return;
          }
          const username = String(data.get("username") || "").trim();
          setBusy(true);
          try {
            const res = await api<{ sessionKey: string }>("/api/auth/login", {
              method: "POST",
              body: { username, password: String(data.get("password") || "") },
            });
            save({ mode: "session", token: res.sessionKey, label: username });
            toast.success(`Connected as ${username}.`);
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "login" ? (
          <>
            <Field label="Handle">
              <Input name="username" required autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
          </>
        ) : (
          <Field label="x-admin-key" className="sm:col-span-2">
            <Input name="key" type="password" required autoComplete="off" />
          </Field>
        )}
        <Button type="submit" disabled={busy}>
          Connect
        </Button>
      </form>
    </Panel>
  );
}

/** A plain <select> styled like the shadcn inputs (enough for short fixed option lists). */
export function NativeSelect({
  options,
  className,
  ...props
}: Omit<ComponentProps<"select">, "children"> & {
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-popover">
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A button that asks for confirmation before running a destructive or paying action. */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  disabled,
  children,
  variant = "outline",
  size = "sm",
  destructive = true,
  label,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: "outline" | "destructive" | "default" | "secondary" | "ghost";
  size?: "sm" | "icon" | "default";
  destructive?: boolean;
  label?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Resolve a racer by handle; the resolved card is what grant forms send (its id). */
export function RacerPicker({
  value,
  onChange,
  label = "Racer handle",
}: {
  value: RacerCard | null;
  onChange: (racer: RacerCard | null) => void;
  label?: string;
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    if (!handle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await lookupRacer(handle));
    } catch (err) {
      onChange(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input
          value={handle}
          placeholder="exact handle"
          onChange={(event) => {
            setHandle(event.target.value);
            if (value) onChange(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void find();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => void find()}>
          <Search className="size-3.5" aria-hidden />
          Find
        </Button>
      </div>
      {value ? (
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{value.username}</span> #{value.id} ·{" "}
          {value.rankTitle}
          {value.team ? ` · ${value.team}` : ""}
          {value.banned ? " · BANNED" : ""}
        </span>
      ) : error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </Field>
  );
}
