import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Pill } from "@/components/admin/primitives";
import { api, sessionUsable, type AdminSession } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Staff sign in — 1320 Legends Race Control" },
      {
        name: "description",
        content:
          "Sign in to the 1320 Legends staff console to manage racers, events and approvals.",
      },
      { property: "og:title", content: "Staff sign in — 1320 Legends Race Control" },
      {
        property: "og:description",
        content: "Sign in to the 1320 Legends staff console.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

type Tone = "" | "error" | "success";

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, apiOffline, isLoading } = useAdminSession();
  const [status, setStatus] = useState<{ text: string; tone: Tone }>({ text: "", tone: "" });
  const [discordEnabled, setDiscordEnabled] = useState(false);

  // Is staff Discord sign-in configured on the game API? Also surface an error the callback sent back.
  useEffect(() => {
    api<{ enabled?: boolean }>("/api/admin/auth/discord/status")
      .then((r) => setDiscordEnabled(Boolean(r.enabled)))
      .catch(() => setDiscordEnabled(false));
    const code = new URLSearchParams(window.location.search).get("discord");
    if (code) {
      const messages: Record<string, string> = {
        "not-linked":
          "That Discord account isn't linked to a racer. Link it on the racer site's Account page first.",
        "not-staff": "That Discord account's racer isn't staff (Moderator and up).",
        banned: "That racer is banned.",
        denied: "Discord sign-in was cancelled.",
        state: "Discord sign-in expired or came from another tab. Try again.",
        discord: "Discord didn't answer. Try again in a moment.",
      };
      setStatus({ text: messages[code] ?? "Discord sign-in failed.", tone: "error" });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // An already-approved session shouldn't sit on the sign-in screen.
  useEffect(() => {
    if (session && sessionUsable(session)) {
      navigate({ to: "/admin", replace: true });
    } else if (session) {
      setStatus({
        text:
          String(session.accessStatus) === "denied"
            ? "Access denied. Ask an owner to restore your admin access."
            : "Signed in. Your staff access is waiting for owner approval.",
        tone: String(session.accessStatus) === "denied" ? "error" : "",
      });
    }
  }, [session, navigate]);

  const login = useMutation({
    mutationFn: async (values: { username: string; password: string }) => {
      return api<{ session?: AdminSession; accessStatus?: string }>("/api/admin/auth/login", {
        method: "POST",
        body: values,
      });
    },
    onSuccess: async (payload) => {
      const next = payload.session;
      if (!next || !sessionUsable(next)) {
        const state = String(next?.accessStatus || payload.accessStatus || "pending");
        setStatus({
          text:
            state === "denied"
              ? "Access denied. Ask an owner to restore your admin access."
              : "Signed in. Your staff access is waiting for owner approval.",
          tone: state === "denied" ? "error" : "",
        });
        return;
      }
      setStatus({ text: "Access granted.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "session"] });
      navigate({ to: "/admin", replace: true });
    },
    onError: (error: Error) => setStatus({ text: error.message, tone: "error" }),
  });

  return (
    <div className="carbon-grid flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/brand/1320-legends-logo.png"
            alt="1320 Legends"
            className="size-11 shrink-0 object-contain"
          />
          <div>
            <h1 className="font-display text-lg font-bold tracking-wide">1320 LEGENDS</h1>
            <p className="label-eyebrow">Race control — staff only</p>
          </div>
        </div>

        <form
          className="rounded-xl border border-border bg-card p-5 shadow-panel"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setStatus({ text: "Checking access…", tone: "" });
            login.mutate({
              username: String(data.get("username") || "").trim(),
              password: String(data.get("password") || ""),
            });
          }}
        >
          <div className="flex flex-col gap-4">
            {discordEnabled && (
              <>
                <Button
                  type="button"
                  className="w-full bg-[#5865F2] text-white hover:bg-[#4752C4]"
                  onClick={() => {
                    setStatus({ text: "Opening Discord…", tone: "" });
                    window.location.assign("/api/admin/auth/discord/start");
                  }}
                >
                  Sign in with Discord
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  or use a one-time game code
                </p>
              </>
            )}
            <Field label="Username">
              <Input name="username" autoComplete="username" required placeholder="Your handle" />
            </Field>
            <Field label="Game code or password">
              <Input name="password" type="password" autoComplete="one-time-code" required />
            </Field>

            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="size-4" aria-hidden />
              )}
              {login.isPending ? "Checking access" : "Enter race control"}
            </Button>

            {status.text && (
              <p
                aria-live="polite"
                className={
                  status.tone === "error"
                    ? "text-sm text-destructive"
                    : status.tone === "success"
                      ? "text-sm text-success"
                      : "text-sm text-muted-foreground"
                }
              >
                {status.text}
              </p>
            )}

            {!isLoading && apiOffline && (
              <div className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs text-muted-foreground">
                <Pill tone="warning">API offline</Pill>
                <p className="mt-2">
                  The game server isn't reachable from here, so sign-in will fail until it's
                  connected. You can still open the console to review the layout.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => navigate({ to: "/admin" })}
                >
                  Open console anyway
                </Button>
              </div>
            )}
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Moderators and up only. Every action is written to the audit log.
        </p>
      </div>
    </div>
  );
}
