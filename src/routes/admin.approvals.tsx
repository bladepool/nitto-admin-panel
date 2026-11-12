import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

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
  type PillTone,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, dateLabel, isOwner, roleName, ROLE_NAMES } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/admin/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Racing Legends Race Control" },
      {
        name: "description",
        content: "Approve staff access requests and review queued staff actions.",
      },
      { property: "og:title", content: "Approvals — Racing Legends Race Control" },
      { property: "og:description", content: "Approve staff access and queued staff actions." },
    ],
  }),
  component: ApprovalsPage,
});

type StaffRequest = {
  accountId?: number;
  username?: string;
  roleClass?: number;
  accessStatus?: string;
  requestedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
};

type ActionRequest = {
  id?: string;
  action?: string;
  route?: string;
  requestedBy?: string;
  requestedAt?: string;
  reason?: string;
  status?: string;
  decidedBy?: string;
  decidedAt?: string;
};

function statusTone(status?: string): PillTone {
  const value = String(status ?? "pending").toLowerCase();
  if (value === "approved") return "success";
  if (value === "denied" || value === "revoked") return "danger";
  if (value === "cancelled" || value === "canceled") return "neutral";
  return "warning";
}

function ApprovalsPage() {
  const { session } = useAdminSession();
  const owner = isOwner(session);
  const queryClient = useQueryClient();

  const staff = useQuery({
    queryKey: ["admin", "staff-access", "requests"],
    queryFn: () =>
      api<{ requests?: StaffRequest[]; staff?: StaffRequest[] }>(
        "/api/admin/staff-access/requests",
      ),
    retry: false,
    enabled: owner,
  });

  const actions = useQuery({
    queryKey: ["admin", "action-approvals"],
    queryFn: () =>
      api<{ pending?: ActionRequest[]; decided?: ActionRequest[]; items?: ActionRequest[] }>(
        "/api/admin/action-approvals",
      ),
    retry: false,
  });

  const staffDecision = useMutation({
    mutationFn: ({
      verb,
      accountId,
      roleClass,
    }: {
      verb: "approve" | "deny" | "revoke";
      accountId: number;
      roleClass?: number;
    }) =>
      api(`/api/admin/staff-access/${verb}`, {
        method: "POST",
        body: roleClass === undefined ? { accountId } : { accountId, roleClass },
      }),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.verb === "approve"
          ? "Staff access approved."
          : variables.verb === "deny"
            ? "Request denied."
            : "Access revoked.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "staff-access"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actionDecision = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: "approve" | "deny" | "cancel" }) =>
      api(`/api/admin/action-approvals/${encodeURIComponent(id)}/${verb}`, { method: "POST" }),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.verb === "approve"
          ? "Approved — the action ran."
          : variables.verb === "deny"
            ? "Denied."
            : "Request cancelled.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "action-approvals"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const staffList = staff.data?.requests ?? staff.data?.staff ?? [];
  const staffPending = staffList.filter(
    (item) => String(item.accessStatus ?? "pending") === "pending",
  );
  const staffDecided = staffList.filter(
    (item) => String(item.accessStatus ?? "pending") !== "pending",
  );

  const allActions = actions.data?.pending ?? actions.data?.items ?? [];
  const actionPending = allActions.filter((item) => !item.status || item.status === "pending");
  const actionDecided =
    actions.data?.decided ?? allActions.filter((item) => item.status && item.status !== "pending");

  return (
    <>
      <PageHeading
        title="Approvals"
        subtitle={
          owner
            ? "Staff access requests and queued staff changes both land here for an owner decision."
            : "Changes you make that need an owner's sign-off appear here until they're decided."
        }
      />

      <Tabs defaultValue={owner ? "staff" : "actions"}>
        <TabsList>
          {owner && <TabsTrigger value="staff">Staff access ({staffPending.length})</TabsTrigger>}
          <TabsTrigger value="actions">Queued actions ({actionPending.length})</TabsTrigger>
        </TabsList>

        {owner && (
          <TabsContent value="staff" className="mt-3 flex flex-col gap-4">
            <Panel title="Pending staff-access requests" count={staffPending.length}>
              {staff.isLoading ? (
                <LoadingState />
              ) : staff.isError ? (
                <ErrorState error={staff.error} what="staff-access requests" />
              ) : staffPending.length === 0 ? (
                <EmptyState>No pending requests.</EmptyState>
              ) : (
                <DataTable head={["Account", "Requested role", "Asked", "Decision"]}>
                  {staffPending.map((request) => (
                    <Row key={request.accountId}>
                      <Cell>
                        <span className="font-medium">{request.username}</span>
                        <span className="numeric ml-1.5 text-xs text-muted-foreground">
                          #{request.accountId}
                        </span>
                      </Cell>
                      <Cell>
                        <select
                          defaultValue={String(request.roleClass ?? 1)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          onChange={(event) => {
                            event.currentTarget.dataset["role"] = event.currentTarget.value;
                          }}
                          data-role={String(request.roleClass ?? 1)}
                          id={`role-${request.accountId}`}
                        >
                          {Object.entries(ROLE_NAMES)
                            .filter(([value]) => Number(value) >= 1)
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </Cell>
                      <Cell mono className="text-muted-foreground">
                        {dateLabel(request.requestedAt)}
                      </Cell>
                      <Cell>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            disabled={staffDecision.isPending}
                            onClick={() => {
                              const select = document.getElementById(
                                `role-${request.accountId}`,
                              ) as HTMLSelectElement | null;
                              staffDecision.mutate({
                                verb: "approve",
                                accountId: Number(request.accountId),
                                roleClass: Number(select?.value ?? request.roleClass ?? 1),
                              });
                            }}
                          >
                            <Check className="size-3.5" aria-hidden />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={staffDecision.isPending}
                            onClick={() =>
                              staffDecision.mutate({
                                verb: "deny",
                                accountId: Number(request.accountId),
                              })
                            }
                          >
                            <X className="size-3.5" aria-hidden />
                            Deny
                          </Button>
                        </div>
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
            </Panel>

            <Panel title="Already decided" count={staffDecided.length}>
              {staffDecided.length === 0 ? (
                <EmptyState>No decisions recorded yet.</EmptyState>
              ) : (
                <DataTable head={["Account", "Role", "State", "Decided", ""]}>
                  {staffDecided.map((request) => (
                    <Row key={request.accountId}>
                      <Cell>
                        <span className="font-medium">{request.username}</span>
                        <span className="numeric ml-1.5 text-xs text-muted-foreground">
                          #{request.accountId}
                        </span>
                      </Cell>
                      <Cell>{roleName(request.roleClass)}</Cell>
                      <Cell>
                        <Pill tone={statusTone(request.accessStatus)}>{request.accessStatus}</Pill>
                      </Cell>
                      <Cell mono className="text-muted-foreground">
                        {dateLabel(request.decidedAt)}
                        {request.decidedBy ? ` · ${request.decidedBy}` : ""}
                      </Cell>
                      <Cell>
                        {String(request.accessStatus) === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={staffDecision.isPending}
                            onClick={() =>
                              staffDecision.mutate({
                                verb: "revoke",
                                accountId: Number(request.accountId),
                              })
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
            </Panel>
          </TabsContent>
        )}

        <TabsContent value="actions" className="mt-3 flex flex-col gap-4">
          <Panel
            title={owner ? "Queued staff changes" : "Your queued changes"}
            count={actionPending.length}
          >
            {actions.isLoading ? (
              <LoadingState />
            ) : actions.isError ? (
              <ErrorState error={actions.error} what="the approval queue" />
            ) : actionPending.length === 0 ? (
              <EmptyState>Queue is clear.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {actionPending.map((item, index) => (
                  <li
                    key={item.id ?? index}
                    className="rounded-lg border border-border bg-surface/60 px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.action || "Staff change"}</p>
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">
                          {item.route ? `${item.route} · ` : ""}
                          {item.requestedBy || "unknown"} · {dateLabel(item.requestedAt)}
                        </p>
                        {item.reason && (
                          <p className="mt-1.5 break-words rounded-md bg-muted/50 px-2 py-1 text-xs">
                            “{item.reason}”
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {owner ? (
                          <>
                            <Button
                              size="sm"
                              disabled={actionDecision.isPending || !item.id}
                              onClick={() =>
                                actionDecision.mutate({ id: String(item.id), verb: "approve" })
                              }
                            >
                              <Check className="size-3.5" aria-hidden />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={actionDecision.isPending || !item.id}
                              onClick={() =>
                                actionDecision.mutate({ id: String(item.id), verb: "deny" })
                              }
                            >
                              <X className="size-3.5" aria-hidden />
                              Deny
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionDecision.isPending || !item.id}
                            onClick={() =>
                              actionDecision.mutate({ id: String(item.id), verb: "cancel" })
                            }
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recently decided" count={actionDecided.length}>
            {actionDecided.length === 0 ? (
              <EmptyState>Nothing decided yet.</EmptyState>
            ) : (
              <DataTable head={["Action", "By", "State", "Decided"]}>
                {actionDecided.map((item, index) => (
                  <Row key={item.id ?? index}>
                    <Cell className="font-medium">{item.action}</Cell>
                    <Cell className="text-muted-foreground">{item.requestedBy}</Cell>
                    <Cell>
                      <Pill tone={statusTone(item.status)}>{item.status}</Pill>
                    </Cell>
                    <Cell mono className="text-muted-foreground">
                      {dateLabel(item.decidedAt)}
                      {item.decidedBy ? ` · ${item.decidedBy}` : ""}
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
