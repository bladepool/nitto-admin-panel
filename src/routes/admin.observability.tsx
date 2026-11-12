import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

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
import { Input } from "@/components/ui/input";
import { api, buildQuery, dateLabel, integer, isOwner, timeLabel } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/admin/observability")({
  head: () => ({
    meta: [
      { title: "Observability — Racing Legends Race Control" },
      {
        name: "description",
        content: "Live event tail, runtime metrics and alerts for the game server.",
      },
      { property: "og:title", content: "Observability — Racing Legends Race Control" },
      {
        property: "og:description",
        content: "Live event tail and runtime metrics for the game server.",
      },
    ],
  }),
  component: ObservabilityPage,
});

const MAX_RENDERED_ROWS = 300;

type Summary = {
  playerEvents?: number;
  alerts?: number;
  logLevel?: string;
  uptimeSeconds?: number;
  eventsPerMinute?: number;
};

type EventRow = {
  id?: number | string;
  at?: string;
  createdAt?: string;
  level?: string;
  type?: string;
  event?: string;
  accountId?: number;
  message?: string;
  detail?: string;
};

type MetricRow = {
  name?: string;
  value?: number | string | Record<string, unknown>;
  unit?: string;
};

// The real backend's "newest" metric carries the whole latest sample object (not a scalar) --
// render its timestamp instead of letting `String(value)` collapse it to "[object Object]".
function metricValueLabel(metric: MetricRow): string {
  const { value } = metric;
  if (value !== null && typeof value === "object") {
    const at = (value as { at?: string }).at;
    return at ? dateLabel(at) : "—";
  }
  return String(value ?? "—");
}

function levelTone(level?: string): PillTone {
  const value = String(level ?? "").toLowerCase();
  if (value === "error" || value === "fatal") return "danger";
  if (value === "warn" || value === "warning") return "warning";
  if (value === "info") return "primary";
  return "neutral";
}

function ObservabilityPage() {
  const { session } = useAdminSession();
  const owner = isOwner(session);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");

  const summary = useQuery({
    queryKey: ["admin", "observability", "summary"],
    queryFn: () => api<Summary>("/api/admin/observability"),
    retry: false,
    enabled: owner,
    refetchInterval: 30_000,
  });

  const events = useQuery({
    queryKey: ["admin", "observability", "events", level, search],
    queryFn: () =>
      api<{ events?: EventRow[]; items?: EventRow[] }>(
        `/api/admin/observability/events${buildQuery({ limit: MAX_RENDERED_ROWS, level, query: search })}`,
      ),
    retry: false,
    enabled: owner,
    refetchInterval: 5_000,
  });

  const metrics = useQuery({
    queryKey: ["admin", "observability", "metrics"],
    queryFn: () =>
      api<{ metrics?: MetricRow[]; items?: MetricRow[] }>("/api/admin/observability/metrics"),
    retry: false,
    enabled: owner,
    refetchInterval: 30_000,
  });

  if (!owner) {
    return (
      <>
        <PageHeading title="Observability" subtitle="Owner-only." />
        <Panel title="Restricted">
          <EmptyState>This section is limited to owners.</EmptyState>
        </Panel>
      </>
    );
  }

  const eventList = (events.data?.events ?? events.data?.items ?? []).slice(0, MAX_RENDERED_ROWS);
  const metricList = metrics.data?.metrics ?? metrics.data?.items ?? [];

  return (
    <>
      <PageHeading
        title="Observability"
        subtitle="A live tail of what the game server is doing, refreshed every few seconds."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Player events"
          value={summary.isError ? "—" : integer(summary.data?.playerEvents)}
          tone="primary"
        />
        <StatTile
          label="Events / minute"
          value={summary.isError ? "—" : integer(summary.data?.eventsPerMinute)}
        />
        <StatTile
          label="Open alerts"
          value={summary.isError ? "—" : integer(summary.data?.alerts)}
          tone={Number(summary.data?.alerts ?? 0) > 0 ? "danger" : "success"}
        />
        <StatTile label="Log level" value={summary.data?.logLevel ?? "—"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="Live event tail" count={eventList.length} note="Refreshes every 5s">
          <form
            className="mb-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setLevel(String(data.get("level") || ""));
              setSearch(String(data.get("query") || ""));
            }}
          >
            <Field label="Level">
              <select
                name="level"
                defaultValue={level}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </Field>
            <Field label="Search">
              <Input name="query" defaultValue={search} placeholder="Message or event type" />
            </Field>
            <button type="submit" className="hidden" aria-hidden />
          </form>

          {events.isLoading ? (
            <LoadingState label="Attaching to the stream" />
          ) : events.isError ? (
            <ErrorState error={events.error} what="the event stream" />
          ) : eventList.length === 0 ? (
            <EmptyState>Stream is quiet.</EmptyState>
          ) : (
            <div className="scroll-slim max-h-[32rem] overflow-y-auto">
              <DataTable head={["Time", "Level", "Event", "Racer", "Message"]}>
                {eventList.map((row, index) => (
                  <Row key={row.id ?? index}>
                    <Cell mono className="text-muted-foreground">
                      {timeLabel(row.at ?? row.createdAt)}
                    </Cell>
                    <Cell>
                      <Pill tone={levelTone(row.level)}>{row.level || "log"}</Pill>
                    </Cell>
                    <Cell className="text-muted-foreground">{row.type || row.event || "—"}</Cell>
                    <Cell mono className="text-muted-foreground">
                      {row.accountId ? `#${row.accountId}` : "—"}
                    </Cell>
                    <Cell className="max-w-[26rem] break-words">
                      {row.message || row.detail || "—"}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            </div>
          )}
        </Panel>

        <Panel title="Runtime metrics" count={metricList.length} note="Refreshes every 30s">
          {metrics.isLoading ? (
            <LoadingState />
          ) : metrics.isError ? (
            <ErrorState error={metrics.error} what="runtime metrics" />
          ) : metricList.length === 0 ? (
            <EmptyState>No metrics reported.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {metricList.map((metric, index) => (
                <li
                  key={metric.name ?? index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{metric.name}</span>
                  <span className="numeric text-sm font-semibold">
                    {metricValueLabel(metric)}
                    {metric.unit ? ` ${metric.unit}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {summary.data?.uptimeSeconds ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Server up since{" "}
              {dateLabel(new Date(Date.now() - summary.data.uptimeSeconds * 1000).toISOString())}
            </p>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
