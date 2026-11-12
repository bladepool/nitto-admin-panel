import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import { PageHeading } from "@/components/admin/shell";
import {
  Cell,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  Pill,
  Row,
  StatTile,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { api, dateLabel, integer, isOwner, relativeLabel, roleName } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Overview — Racing Legends Race Control" },
      { name: "description", content: "Live server health, online racers and pending approvals." },
      { property: "og:title", content: "Overview — Racing Legends Race Control" },
      {
        property: "og:description",
        content: "Live server health, online racers and pending approvals.",
      },
    ],
  }),
  component: OverviewPage,
});

type Health = {
  uptimeSeconds?: number;
  memoryMb?: number;
  version?: string;
  status?: string;
};

type OnlinePlayer = {
  accountId?: number;
  username?: string;
  roleClass?: number;
  room?: string;
  // Real backend shape (GET /api/admin/online) sends these instead of `room`/`since`.
  roomName?: string | number;
  connectedAt?: string;
  since?: string;
};

type OnlinePayload = { players?: OnlinePlayer[]; total?: number };

type ApprovalItem = {
  id?: string;
  action?: string;
  requestedBy?: string;
  requestedAt?: string;
  status?: string;
};

function OverviewPage() {
  const { session } = useAdminSession();
  const owner = isOwner(session);

  const health = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api<{ health?: Health } & Health>("/api/admin/health"),
    retry: false,
    refetchInterval: 30_000,
  });

  const online = useQuery({
    queryKey: ["admin", "online"],
    queryFn: () => api<OnlinePayload>("/api/admin/online"),
    retry: false,
    refetchInterval: 15_000,
  });

  const actions = useQuery({
    queryKey: ["admin", "action-approvals"],
    queryFn: () =>
      api<{ pending?: ApprovalItem[]; items?: ApprovalItem[] }>("/api/admin/action-approvals"),
    retry: false,
  });

  const staffRequests = useQuery({
    queryKey: ["admin", "staff-access", "requests"],
    queryFn: () =>
      api<{ requests?: { accessStatus?: string }[] }>("/api/admin/staff-access/requests"),
    retry: false,
    enabled: owner,
  });

  const healthData = (health.data?.health ?? health.data) as Health | undefined;
  const players = online.data?.players ?? [];
  const pendingActions = (actions.data?.pending ?? actions.data?.items ?? []).filter(
    (item) => !item.status || item.status === "pending",
  );
  const pendingStaff = (staffRequests.data?.requests ?? []).filter(
    (request) => String(request.accessStatus ?? "pending") === "pending",
  );

  return (
    <>
      <PageHeading
        title="Race control"
        subtitle={
          session
            ? `Signed in as ${session.username} · ${roleName(session.roleClass)}`
            : "Live picture of the server, the paddock and anything waiting on a decision."
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/approvals">
              Review approvals
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Racers online"
          value={online.isError ? "—" : integer(online.data?.total ?? players.length)}
          hint={online.isError ? "Not reporting" : "Refreshes every 15s"}
          tone="primary"
        />
        <StatTile
          label="Actions awaiting approval"
          value={actions.isError ? "—" : integer(pendingActions.length)}
          hint="Queued staff changes"
          tone={pendingActions.length ? "warning" : "neutral"}
        />
        <StatTile
          label="Staff access requests"
          value={
            owner ? (staffRequests.isError ? "—" : integer(pendingStaff.length)) : "Owner only"
          }
          hint={owner ? "Pending owner decision" : "Visible to owners"}
          tone={pendingStaff.length ? "warning" : "neutral"}
        />
        <StatTile
          label="Server"
          value={health.isError ? "Offline" : (healthData?.status ?? "Running")}
          hint={
            healthData?.uptimeSeconds
              ? `Up ${Math.round(Number(healthData.uptimeSeconds) / 3600)}h`
              : healthData?.version
                ? `Build ${healthData.version}`
                : "Process health"
          }
          tone={health.isError ? "danger" : "success"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Who's on track"
          count={players.length}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/live">Live ops</Link>
            </Button>
          }
        >
          {online.isLoading ? (
            <LoadingState label="Reading the paddock" />
          ) : online.isError ? (
            <ErrorState error={online.error} what="the online list" />
          ) : players.length === 0 ? (
            <EmptyState>Nobody is online right now.</EmptyState>
          ) : (
            <DataTable head={["Racer", "Role", "Room", "Since"]}>
              {players.slice(0, 12).map((player, index) => (
                <Row key={`${player.accountId}-${index}`}>
                  <Cell>
                    <span className="font-medium">{player.username || "unknown"}</span>
                    <span className="numeric ml-1.5 text-xs text-muted-foreground">
                      #{player.accountId}
                    </span>
                  </Cell>
                  <Cell>
                    <Pill tone={Number(player.roleClass ?? 0) > 0 ? "accent" : "neutral"}>
                      {roleName(player.roleClass)}
                    </Pill>
                  </Cell>
                  <Cell className="text-muted-foreground">
                    {player.room || player.roomName || "lobby"}
                  </Cell>
                  <Cell mono className="text-muted-foreground">
                    {relativeLabel(player.since || player.connectedAt)}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel title="Waiting on a decision" count={pendingActions.length}>
          {actions.isLoading ? (
            <LoadingState label="Reading the queue" />
          ) : actions.isError ? (
            <ErrorState error={actions.error} what="the approval queue" />
          ) : pendingActions.length === 0 ? (
            <EmptyState>Queue is clear.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendingActions.slice(0, 8).map((item, index) => (
                <li
                  key={item.id ?? index}
                  className="rounded-lg border border-border bg-surface/70 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.action || "Staff change"}</span>
                    <Pill tone="warning">Pending</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.requestedBy || "unknown"} · {dateLabel(item.requestedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
