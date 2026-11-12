import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Pill } from "@/components/admin/primitives";
import { Lockup } from "@/components/admin/brand";
import { api, sessionUsable, type AdminSession } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Racing Legends Race Control" },
      {
        name: "description",
        content:
          "Sign in to the Racing Legends staff console to manage racers, events and approvals.",
      },
      { property: "og:title", content: "Staff sign in — Racing Legends Race Control" },
      {
        property: "og:description",
        content: "Sign in to the Racing Legends staff console.",
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(255_59_47/0.22),transparent_60%)] px-4 pt-10 pb-16">
      <div aria-hidden className="checkered-strip pointer-events-none absolute inset-x-0 bottom-0 h-3.5 opacity-55" />
      <div className="relative z-10 grid w-full max-w-[380px] gap-[22px]">
        <div className="grid justify-items-center gap-2.5 text-center">
          <h1 className="sr-only">Racing Legends Race Control</h1>
          <Lockup className="h-auto w-full max-w-[320px]" />
          <p className="font-display text-xs font-semibold tracking-[0.32em] text-muted-foreground uppercase">
            <span className="text-primary">Race Control</span> · Staff only
          </p>
        </div>

        <form
          className="rounded-xl border border-border bg-gradient-to-b from-card to-[#12161c] p-5 shadow-panel"
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
          <div className="flex flex-col gap-3.5">
            {discordEnabled && (
              <>
                <Button
                  type="button"
                  className="h-11 w-full bg-[#5865F2] text-[0.9375rem] font-semibold text-white hover:bg-[#4752C4]"
                  onClick={() => {
                    setStatus({ text: "Opening Discord…", tone: "" });
                    window.location.assign("/api/admin/auth/discord/start");
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-5">
                    <path fill="#fff" d="M19.6 5.4A16.6 16.6 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.6 16.6 0 0 0-4.1 1.4C1.8 9.3 1.1 13.1 1.4 16.9a16.8 16.8 0 0 0 5 2.6l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.7 16.7 0 0 0 5-2.6c.4-4.4-.7-8.2-3-11.5ZM8.7 14.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
                  </svg>
                  Sign in with Discord
                </Button>
                <p className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 text-xs text-muted-foreground before:h-px before:bg-border before:content-[''] after:h-px after:bg-border after:content-['']">
                  or use a one-time game code
                </p>
              </>
            )}
            <Field label="Racer name">
              <Input name="username" autoComplete="username" required placeholder="Your handle" className="h-[42px] bg-[#0b0e12] text-[0.9375rem]" />
            </Field>
            <Field label="Game code">
              <Input name="password" type="password" autoComplete="one-time-code" required placeholder="8-character code from /code" className="h-[42px] bg-[#0b0e12] text-[0.9375rem]" />
            </Field>

            <button
              type="submit"
              disabled={login.isPending}
              className="btn-chrome-red inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-lg text-xl disabled:opacity-70"
            >
              {login.isPending && <Loader2 className="size-5 animate-spin" aria-hidden />}
              {login.isPending ? "Checking access" : "Enter race control"}
            </button>

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

        <p className="text-center text-xs text-muted-foreground">
          <b className="font-semibold text-foreground">Moderators and up.</b> Every action is written to the audit log.
        </p>
      </div>
    </div>
  );
}
