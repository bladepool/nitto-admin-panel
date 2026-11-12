import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  dateLabel,
  integer,
  money,
  relativeLabel,
  roleName,
  ROLE_NAMES,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Racing Legends Race Control" },
      {
        name: "description",
        content: "Search racers, adjust balances, and manage bans and roles.",
      },
      { property: "og:title", content: "Accounts — Racing Legends Race Control" },
      { property: "og:description", content: "Search racers and manage their account state." },
    ],
  }),
  component: AccountsPage,
});

type Account = {
  id?: number;
  accountId?: number;
  username?: string;
  roleClass?: number;
  money?: number;
  points?: number;
  membership?: boolean;
  membershipExpiresAt?: string;
  chatBanned?: boolean;
  chatMuted?: boolean;
  permanentBan?: boolean;
  purchaseCount?: number;
  sparePartCount?: number;
  garageCars?: unknown[];
  team?: { name?: string } | null;
  activityAt?: string;
  activityKind?: string;
};

type TimelineEntry = { at?: string; label?: string; detail?: string; kind?: string };
type Purchase = {
  id?: number;
  kind?: string;
  priceUsd?: number;
  points?: number;
  createdAt?: string;
};

function accountId(account: Account | null): number {
  return Number(account?.id ?? account?.accountId ?? 0);
}

function AccountsPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const queryClient = useQueryClient();

  const search = useQuery({
    queryKey: ["admin", "accounts", submitted],
    queryFn: () =>
      api<{ accounts?: Account[] }>(`/api/admin/accounts?query=${encodeURIComponent(submitted)}`),
    enabled: submitted.length > 0,
    retry: false,
  });

  const id = accountId(selected);

  const purchases = useQuery({
    queryKey: ["admin", "accounts", id, "purchases"],
    queryFn: () => api<{ purchases?: Purchase[] }>(`/api/admin/accounts/${id}/purchases`),
    enabled: id > 0,
    retry: false,
  });

  const timeline = useQuery({
    queryKey: ["admin", "accounts", id, "timeline"],
    queryFn: () =>
      api<{ entries?: TimelineEntry[]; timeline?: TimelineEntry[] }>(
        `/api/admin/accounts/${id}/timeline?limit=80`,
      ),
    enabled: id > 0,
    retry: false,
  });

  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: Record<string, unknown> }) =>
      api<{ account?: Account }>(`/api/admin/accounts/${id}/${path}`, { method: "POST", body }),
    onSuccess: (payload) => {
      if (payload.account) setSelected(payload.account);
      toast.success("Change recorded in the audit log.");
      queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accounts = search.data?.accounts ?? [];
  const entries = timeline.data?.entries ?? timeline.data?.timeline ?? [];

  return (
    <>
      <PageHeading
        title="Accounts"
        subtitle="Find a racer, then adjust balance, VIP, role or moderation state. Every change needs a reason and lands in the audit log."
      />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title="Racer lookup" count={accounts.length}>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(query.trim());
            }}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Username or account ID"
              aria-label="Search racers"
            />
            <Button type="submit" size="icon" aria-label="Search">
              <Search className="size-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-3">
            {!submitted ? (
              <EmptyState>Search by username or ID to begin.</EmptyState>
            ) : search.isLoading ? (
              <LoadingState label="Searching" />
            ) : search.isError ? (
              <ErrorState error={search.error} what="account search" />
            ) : accounts.length === 0 ? (
              <EmptyState>No racers matched “{submitted}”.</EmptyState>
            ) : (
              <ul className="scroll-slim flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
                {accounts.map((account) => {
                  const isActive = accountId(account) === id;
                  return (
                    <li key={accountId(account)}>
                      <button
                        type="button"
                        onClick={() => setSelected(account)}
                        className={
                          "w-full rounded-lg border px-3 py-2 text-left transition-colors " +
                          (isActive
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-surface/60 hover:border-border-strong")
                        }
                      >
                        <span className="block text-sm font-medium">{account.username}</span>
                        <span className="numeric block text-xs text-muted-foreground">
                          #{accountId(account)} · {roleName(account.roleClass)}
                          {account.team?.name ? ` · ${account.team.name}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          {!selected ? (
            <Panel title="Racer detail">
              <EmptyState>Pick a racer from the lookup to see their file.</EmptyState>
            </Panel>
          ) : (
            <>
              <Panel
                title={`${selected.username} #${id}`}
                actions={
                  <>
                    <Pill tone={selected.membership ? "accent" : "neutral"}>
                      {selected.membership ? "VIP" : "No VIP"}
                    </Pill>
                    <Pill
                      tone={
                        selected.permanentBan
                          ? "danger"
                          : selected.chatBanned
                            ? "warning"
                            : "success"
                      }
                    >
                      {selected.permanentBan
                        ? "Permanent ban"
                        : selected.chatBanned
                          ? "Banned"
                          : "Clear"}
                    </Pill>
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatTile label="Role" value={roleName(selected.roleClass)} />
                  <StatTile label="Cash" value={money(selected.money)} tone="primary" />
                  <StatTile label="Points" value={integer(selected.points)} tone="primary" />
                  <StatTile
                    label="VIP expires"
                    value={
                      selected.membershipExpiresAt ? dateLabel(selected.membershipExpiresAt) : "—"
                    }
                  />
                  <StatTile
                    label="Garage"
                    value={integer(selected.garageCars?.length ?? 0)}
                    hint="cars"
                  />
                  <StatTile
                    label="Spares"
                    value={integer(selected.sparePartCount ?? 0)}
                    hint="parts"
                  />
                  <StatTile
                    label="Purchases"
                    value={integer(selected.purchaseCount ?? 0)}
                    hint="orders"
                  />
                  <StatTile
                    label="Last activity"
                    value={relativeLabel(selected.activityAt)}
                    hint={selected.activityKind === "login" ? "last login" : "last seen"}
                  />
                </div>
              </Panel>

              <Tabs defaultValue="actions">
                <TabsList>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                  <TabsTrigger value="purchases">Purchases</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="actions" className="mt-3 grid gap-4 lg:grid-cols-2">
                  <Panel title="Balance">
                    <ActionForm
                      pending={action.isPending}
                      submitLabel="Apply balance change"
                      onSubmit={(data) =>
                        action.mutate({
                          path: "balance",
                          body: {
                            currency: String(data.get("currency") || "money"),
                            delta: Number(data.get("delta") || 0),
                            reason: String(data.get("reason") || ""),
                          },
                        })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Currency">
                          <select
                            name="currency"
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="money">Cash</option>
                            <option value="points">Points</option>
                          </select>
                        </Field>
                        <Field label="Change (+/-)">
                          <Input name="delta" type="number" required placeholder="-500" />
                        </Field>
                      </div>
                    </ActionForm>
                  </Panel>

                  <Panel title="VIP membership">
                    <ActionForm
                      pending={action.isPending}
                      submitLabel="Update VIP"
                      onSubmit={(data) =>
                        action.mutate({
                          path: "membership",
                          body: {
                            enabled: String(data.get("enabled")) === "1",
                            reason: String(data.get("reason") || ""),
                          },
                        })
                      }
                    >
                      <Field label="VIP state">
                        <select
                          name="enabled"
                          defaultValue={selected.membership ? "1" : "0"}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="1">On</option>
                          <option value="0">Off</option>
                        </select>
                      </Field>
                    </ActionForm>
                  </Panel>

                  <Panel title="Role">
                    <ActionForm
                      pending={action.isPending}
                      submitLabel="Update role"
                      onSubmit={(data) =>
                        action.mutate({
                          path: "role",
                          body: {
                            roleClass: Number(data.get("roleClass") || 0),
                            reason: String(data.get("reason") || ""),
                          },
                        })
                      }
                    >
                      <Field label="Role">
                        <select
                          name="roleClass"
                          defaultValue={String(selected.roleClass ?? 0)}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {Object.entries(ROLE_NAMES).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </ActionForm>
                  </Panel>

                  <Panel title="Moderation">
                    <ActionForm
                      pending={action.isPending}
                      submitLabel="Apply moderation"
                      destructive
                      onSubmit={(data) =>
                        action.mutate({
                          path: "moderation",
                          body: {
                            banned: String(data.get("banned")) === "1",
                            permanentBan: String(data.get("permanentBan")) === "1",
                            reason: String(data.get("reason") || ""),
                          },
                        })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Ban">
                          <select
                            name="banned"
                            defaultValue={selected.chatBanned ? "1" : "0"}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="1">Banned</option>
                            <option value="0">Not banned</option>
                          </select>
                        </Field>
                        <Field label="Permanent">
                          <select
                            name="permanentBan"
                            defaultValue={selected.permanentBan ? "1" : "0"}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="1">On</option>
                            <option value="0">Off</option>
                          </select>
                        </Field>
                      </div>
                    </ActionForm>
                  </Panel>
                </TabsContent>

                <TabsContent value="purchases" className="mt-3">
                  <Panel title="Purchase history" count={purchases.data?.purchases?.length ?? 0}>
                    {purchases.isLoading ? (
                      <LoadingState />
                    ) : purchases.isError ? (
                      <ErrorState error={purchases.error} what="purchases" />
                    ) : (purchases.data?.purchases ?? []).length === 0 ? (
                      <EmptyState>No purchases on this account.</EmptyState>
                    ) : (
                      <DataTable head={["When", "Kind", "Points", "Paid"]}>
                        {(purchases.data?.purchases ?? []).map((purchase, index) => (
                          <Row key={purchase.id ?? index}>
                            <Cell mono className="text-muted-foreground">
                              {dateLabel(purchase.createdAt)}
                            </Cell>
                            <Cell>{purchase.kind === "membership" ? "Membership" : "Points"}</Cell>
                            <Cell mono>{integer(purchase.points)}</Cell>
                            <Cell mono>${Number(purchase.priceUsd ?? 0).toFixed(2)}</Cell>
                          </Row>
                        ))}
                      </DataTable>
                    )}
                  </Panel>
                </TabsContent>

                <TabsContent value="timeline" className="mt-3">
                  <Panel title="Account timeline" count={entries.length}>
                    {timeline.isLoading ? (
                      <LoadingState />
                    ) : timeline.isError ? (
                      <ErrorState error={timeline.error} what="the timeline" />
                    ) : entries.length === 0 ? (
                      <EmptyState>Nothing recorded yet.</EmptyState>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {entries.map((entry, index) => (
                          <li
                            key={index}
                            className="rounded-lg border border-border bg-surface/60 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                {entry.label || entry.kind}
                              </span>
                              <span className="numeric text-xs text-muted-foreground">
                                {dateLabel(entry.at)}
                              </span>
                            </div>
                            {entry.detail && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </Panel>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ActionForm({
  children,
  onSubmit,
  submitLabel,
  pending,
  destructive,
}: {
  children: React.ReactNode;
  onSubmit: (data: FormData) => void;
  submitLabel: string;
  pending: boolean;
  destructive?: boolean;
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      {children}
      <Field label="Reason (required)">
        <Textarea name="reason" required rows={2} placeholder="Why this change is being made" />
      </Field>
      <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
