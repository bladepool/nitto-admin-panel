import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  BadgeCheck,
  BookOpen,
  CarFront,
  Coins,
  Crosshair,
  Gauge,
  Gift,
  LogOut,
  MessagesSquare,
  Radio,
  Send,
  ShieldAlert,
  Ticket,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/admin/primitives";
import { Emblem } from "@/components/admin/brand";
import { CopilotDock } from "@/components/admin/copilot-dock";
import { api, isOwner, roleName, type AdminSession } from "@/lib/admin-api";
import { CopilotProvider } from "@/lib/copilot";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Overview", hint: "Race control", icon: Gauge },
  { to: "/admin/accounts", label: "Accounts", hint: "Racer lookup", icon: Users },
  { to: "/admin/teams", label: "Teams", hint: "Roster search", icon: UsersRound },
  { to: "/admin/economy", label: "Economy", hint: "Points & codes", icon: Coins },
  { to: "/admin/access", label: "Access Codes", hint: "Invites & terms", icon: Ticket },
  { to: "/admin/tournaments", label: "Tournaments", hint: "Schedule & brackets", icon: Trophy },
  { to: "/admin/badges", label: "Badges", hint: "Definitions & grants", icon: Award },
  { to: "/admin/events", label: "Events", hint: "Prizes & supply", icon: Gift },
  { to: "/admin/migrations", label: "Garage Imports", hint: "Rare-car review", icon: CarFront },
  { to: "/admin/live", label: "Live ops", hint: "Online & broadcast", icon: Radio },
  { to: "/admin/approvals", label: "Approvals", hint: "Staff & actions", icon: BadgeCheck },
  { to: "/admin/anticheat", label: "Anti-Cheat", hint: "Thresholds & review", icon: Crosshair },
  { to: "/admin/discord", label: "Discord", hint: "Ichiban review queue", icon: MessagesSquare },
  { to: "/admin/invites", label: "Discord Invites", hint: "Invites & mirror", icon: Send },
  { to: "/admin/security", label: "Security", hint: "Cases & flags", icon: ShieldAlert },
  { to: "/admin/knowledge", label: "Ichiban Knowledge", hint: "Q&A & unanswered", icon: BookOpen },
  {
    to: "/admin/observability",
    label: "Observability",
    hint: "Events & runtime",
    icon: Activity,
    ownerOnly: true,
  },
];

export function AdminShell({
  session,
  banner,
  children,
}: {
  session: AdminSession | null;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const owner = isOwner(session);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    try {
      await api("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Signing out locally still matters even if the call fails.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    toast("Signed out of race control.");
    navigate({ to: "/", replace: true });
  }

  return (
    <CopilotProvider>
    <div className="carbon-grid min-h-screen">
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-sidebar-border bg-sidebar/90 backdrop-blur lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 px-5 py-5" aria-label="Racing Legends Race Control">
            <Emblem className="size-10 shrink-0" />
            <div className="leading-none">
              <p className="font-display text-[0.8125rem] font-bold tracking-[0.32em] text-chrome">RACING</p>
              <p className="font-wordmark text-xl font-extrabold italic tracking-[0.04em] text-primary">LEGENDS</p>
              <p className="mt-1 font-mono text-[0.59rem] tracking-[0.16em] text-muted-foreground">RACE CONTROL</p>
            </div>
          </div>

          <nav
            aria-label="Admin sections"
            className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible"
          >
            {NAV.filter((item) => owner || !item.ownerOnly).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/admin" }}
                className={cn(
                  "group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                activeProps={{
                  className:
                    "bg-primary/15 text-primary shadow-[inset_2px_0_0_0_var(--color-primary)] hover:bg-primary/20 hover:text-primary",
                }}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                <span className="flex flex-col leading-tight">
                  {item.label}
                  <span className="hidden text-[0.6875rem] font-normal text-muted-foreground lg:block">
                    {item.hint}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/85 px-5 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              {session ? (
                <>
                  <span className="rounded-md border border-[#6b1d18] bg-[#2a0f0d] px-2 py-0.5 font-display text-[0.6875rem] font-semibold tracking-[0.2em] text-[#ffb4ae] uppercase">
                    {roleName(session.roleClass)}
                  </span>
                  <span className="numeric text-sm text-muted-foreground">
                    {session.username} #{session.accountId}
                  </span>
                </>
              ) : (
                <Pill tone="neutral">No session</Pill>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
            </div>
          </header>

          {banner}

          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">{children}</main>
        </div>
      </div>
      {session && <CopilotDock role={Number(session.roleClass ?? 0)} />}
    </div>
    </CopilotProvider>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[1.75rem] leading-none font-semibold tracking-[0.04em] uppercase">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
