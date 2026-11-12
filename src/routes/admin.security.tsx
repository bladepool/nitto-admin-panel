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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, buildQuery, dateLabel, integer } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/security")({
  head: () => ({
    meta: [
      { title: "Security — Racing Legends Race Control" },
      {
        name: "description",
        content: "Flagged accounts, moderation cases and the staff audit trail.",
      },
      { property: "og:title", content: "Security — Racing Legends Race Control" },
      { property: "og:description", content: "Flagged accounts, cases and the staff audit trail." },
    ],
  }),
  component: SecurityPage,
});

type SecurityFlag = {
  id?: number | string;
  accountId?: number;
  username?: string;
  severity?: string;
  kind?: string;
  detail?: string;
  createdAt?: string;
};

type Case = {
  id?: number | string;
  accountId?: number;
  username?: string;
  status?: string;
  subject?: string;
  openedAt?: string;
  assignedTo?: string;
};

type AuditEntry = {
  id?: number | string;
  actor?: string;
  action?: string;
  targetAccountId?: number;
  reason?: string;
  createdAt?: string;
};

function severityTone(severity?: string): PillTone {
  const value = String(severity ?? "").toLowerCase();
  if (value === "critical" || value === "high") return "danger";
  if (value === "medium" || value === "warning") return "warning";
  if (value === "low" || value === "info") return "neutral";
  return "neutral";
}

function caseTone(status?: string): PillTone {
  const value = String(status ?? "").toLowerCase();
  if (value === "open") return "warning";
  if (value === "closed" || value === "resolved") return "success";
  return "neutral";
}

function SecurityPage() {
  const [auditQuery, setAuditQuery] = useState("");
  const [actor, setActor] = useState("");

  const security = useQuery({
    queryKey: ["admin", "security"],
    queryFn: () =>
      api<{ flags?: SecurityFlag[]; items?: SecurityFlag[] }>(
        `/api/admin/security${buildQuery({ limit: 80 })}`,
      ),
    retry: false,
  });

  const cases = useQuery({
    queryKey: ["admin", "cases"],
    queryFn: () => api<{ cases?: Case[]; items?: Case[] }>("/api/admin/cases"),
    retry: false,
  });

  const audit = useQuery({
    queryKey: ["admin", "audit", auditQuery, actor],
    queryFn: () =>
      api<{ entries?: AuditEntry[]; audit?: AuditEntry[]; items?: AuditEntry[] }>(
        `/api/admin/audit${buildQuery({ limit: 100, query: auditQuery, actor })}`,
      ),
    retry: false,
  });

  const flags = security.data?.flags ?? security.data?.items ?? [];
  const caseList = cases.data?.cases ?? cases.data?.items ?? [];
  const auditList = audit.data?.entries ?? audit.data?.audit ?? audit.data?.items ?? [];
  const openCases = caseList.filter((item) => caseTone(item.status) === "warning");
  const criticalFlags = flags.filter((flag) => severityTone(flag.severity) === "danger");

  return (
    <>
      <PageHeading
        title="Security"
        subtitle="Flagged behaviour, open moderation cases and a full record of what staff have done."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="High-severity flags" value={integer(criticalFlags.length)} tone="danger" />
        <StatTile label="Open cases" value={integer(openCases.length)} tone="warning" />
        <StatTile label="Audit entries shown" value={integer(auditList.length)} />
      </div>

      <Tabs defaultValue="flags" className="mt-4">
        <TabsList>
          <TabsTrigger value="flags">Flags ({flags.length})</TabsTrigger>
          <TabsTrigger value="cases">Cases ({caseList.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="mt-3">
          <Panel title="Security flags" count={flags.length}>
            {security.isLoading ? (
              <LoadingState />
            ) : security.isError ? (
              <ErrorState error={security.error} what="the security report" />
            ) : flags.length === 0 ? (
              <EmptyState>Nothing flagged.</EmptyState>
            ) : (
              <DataTable head={["Severity", "Racer", "Signal", "Detail", "When"]}>
                {flags.map((flag, index) => (
                  <Row key={flag.id ?? index}>
                    <Cell>
                      <Pill tone={severityTone(flag.severity)}>{flag.severity || "info"}</Pill>
                    </Cell>
                    <Cell>
                      <span className="font-medium">{flag.username || "—"}</span>
                      {flag.accountId ? (
                        <span className="numeric ml-1.5 text-xs text-muted-foreground">
                          #{flag.accountId}
                        </span>
                      ) : null}
                    </Cell>
                    <Cell className="text-muted-foreground">{flag.kind || "—"}</Cell>
                    <Cell className="max-w-[24rem] break-words text-muted-foreground">
                      {flag.detail || "—"}
                    </Cell>
                    <Cell mono className="text-muted-foreground">
                      {dateLabel(flag.createdAt)}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="cases" className="mt-3">
          <Panel title="Moderation cases" count={caseList.length}>
            {cases.isLoading ? (
              <LoadingState />
            ) : cases.isError ? (
              <ErrorState error={cases.error} what="moderation cases" />
            ) : caseList.length === 0 ? (
              <EmptyState>No cases on file.</EmptyState>
            ) : (
              <DataTable head={["Case", "Subject", "Racer", "State", "Opened"]}>
                {caseList.map((item, index) => (
                  <Row key={item.id ?? index}>
                    <Cell mono className="font-semibold">
                      #{item.id}
                    </Cell>
                    <Cell className="max-w-[22rem] break-words">{item.subject || "—"}</Cell>
                    <Cell className="text-muted-foreground">
                      {item.username || (item.accountId ? `#${item.accountId}` : "—")}
                    </Cell>
                    <Cell>
                      <Pill tone={caseTone(item.status)}>{item.status || "unknown"}</Pill>
                    </Cell>
                    <Cell mono className="text-muted-foreground">
                      {dateLabel(item.openedAt)}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="audit" className="mt-3">
          <Panel title="Staff audit trail" count={auditList.length}>
            <form
              className="mb-3 grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setAuditQuery(String(data.get("query") || ""));
                setActor(String(data.get("actor") || ""));
              }}
            >
              <Field label="Search">
                <Input
                  name="query"
                  defaultValue={auditQuery}
                  placeholder="Action, reason or target"
                />
              </Field>
              <Field label="Staff member">
                <Input name="actor" defaultValue={actor} placeholder="Username" />
              </Field>
              <button type="submit" className="hidden" aria-hidden />
            </form>

            {audit.isLoading ? (
              <LoadingState />
            ) : audit.isError ? (
              <ErrorState error={audit.error} what="the audit trail" />
            ) : auditList.length === 0 ? (
              <EmptyState>No matching audit entries.</EmptyState>
            ) : (
              <DataTable head={["When", "Staff", "Action", "Target", "Reason"]}>
                {auditList.map((entry, index) => (
                  <Row key={entry.id ?? index}>
                    <Cell mono className="text-muted-foreground">
                      {dateLabel(entry.createdAt)}
                    </Cell>
                    <Cell className="font-medium">{entry.actor || "system"}</Cell>
                    <Cell className="text-muted-foreground">{entry.action || "—"}</Cell>
                    <Cell mono className="text-muted-foreground">
                      {entry.targetAccountId ? `#${entry.targetAccountId}` : "—"}
                    </Cell>
                    <Cell className="max-w-[22rem] break-words text-muted-foreground">
                      {entry.reason || "—"}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
