import { useState } from "react";
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
import { ConfirmButton, GameApiCredential } from "@/components/admin/game-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, dateLabel } from "@/lib/admin-api";
import { AskIchiban } from "@/lib/copilot";

export const Route = createFileRoute("/admin/migrations")({
  head: () => ({
    meta: [
      { title: "Migrations — Racing Legends Race Control" },
      {
        name: "description",
        content:
          "Review rare cars and money from racers' one-time migrations before they are granted.",
      },
      { property: "og:title", content: "Migrations — Racing Legends Race Control" },
      { property: "og:description", content: "Staff review queue for garage imports." },
    ],
  }),
  component: MigrationsPage,
});

type ReviewItem = {
  id: number;
  /**
   * "car" (rare car), "money" (money from the source server, credited only on approval) or "part" (a limited /
   * prize rim or part of an imported car: granted through the award service on approval, the car is already in).
   */
  kind?: "car" | "money" | "part";
  /** kind "part": the prize part, its car and the ordinary part the car has meanwhile. */
  part?: { partId: number; name: string; carName: string; interim: string | null } | null;
  amount?: number | null;
  note?: string | null;
  engine?: string | null;
  status: string;
  reason: string;
  carName: string;
  catalogCarId: number;
  playerId: number;
  player: string;
  source: string;
  sourceHandle: string;
  sourceId: number;
  parts: string[];
  decidedBy: string | null;
  decidedAt: string | null;
  denyReason: string | null;
  ownedCarId: number | null;
  createdAt: string;
};

const gameKey = (...parts: unknown[]) => ["game", "migrations", ...parts];

function statusTone(status?: string): PillTone {
  if (status === "approved") return "success";
  if (status === "denied") return "danger";
  return "warning";
}

function MigrationsPage() {
  const queryClient = useQueryClient();
  const [denyReason, setDenyReason] = useState<Record<number, string>>({});
  const [credit, setCredit] = useState<Record<number, string>>({});

  const pending = useQuery({
    queryKey: gameKey("pending"),
    queryFn: () => api<{ items: ReviewItem[] }>("/api/admin/migrations/review?status=pending"),
    retry: false,
  });
  const all = useQuery({
    queryKey: gameKey("all"),
    queryFn: () => api<{ items: ReviewItem[] }>("/api/admin/migrations/review?status=all"),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: ({
      id,
      verb,
      reason,
      amount,
    }: {
      id: number;
      verb: "approve" | "deny";
      reason?: string;
      amount?: number;
      money?: boolean;
      part?: boolean;
    }) =>
      api(`/api/admin/migrations/review/${id}/${verb}`, {
        method: "POST",
        body: verb === "deny" ? { reason } : amount != null ? { amount } : {},
      }),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.verb === "deny"
          ? "Denied."
          : variables.money
            ? `Approved: ${(variables.amount ?? 0).toLocaleString()} money credited through the ledger.`
            : variables.part
              ? "Approved: the part was granted."
              : "Approved: the car was granted.",
      );
      queryClient.invalidateQueries({ queryKey: gameKey() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const queue = pending.data?.items ?? [];
  const decided = (all.data?.items ?? []).filter((item) => item.status !== "pending");

  return (
    <>
      <PageHeading
        title="Migrations"
        subtitle="Rare cars from one-time migrations (trophy, award-only, limited, dev or unverified catalogue matches), limited or prize parts (the car is already imported) and money racers declared from the other server wait here. Cars and parts are granted through the award service, so supply caps hold. Money is credited through the economy ledger, once, by an admin; you may credit less than declared, never more."
      />

      <GameApiCredential />

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Review queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-3">
          <Panel title="Waiting for a decision" count={queue.length}>
            {pending.isLoading ? (
              <LoadingState label="Reading the queue" />
            ) : pending.isError ? (
              <ErrorState error={pending.error} what="the import review queue" />
            ) : queue.length === 0 ? (
              <EmptyState>Queue is clear.</EmptyState>
            ) : (
              <DataTable
                head={["Racer", "Item", "Why review", "Source account", "Asked", "Decision"]}
              >
                {queue.map((item) => {
                  const isMoney = item.kind === "money";
                  const isPart = item.kind === "part";
                  const declared = Number(item.amount ?? 0);
                  const creditRaw = credit[item.id] ?? String(declared);
                  const creditAmount = Number(creditRaw.replace(/[,\s]/g, ""));
                  const creditOk =
                    Number.isInteger(creditAmount) && creditAmount > 0 && creditAmount <= declared;
                  return (
                    <Row key={item.id}>
                      <Cell>
                        <span className="font-medium">{item.player}</span>
                        <span className="numeric ml-1.5 text-xs text-muted-foreground">
                          #{item.playerId}
                        </span>
                      </Cell>
                      <Cell>
                        {isMoney ? (
                          <>
                            <div className="font-medium">
                              Money: <span className="numeric">{declared.toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              declared by the racer (not public on the source)
                            </div>
                            {item.note && (
                              <div className="mt-0.5 break-all text-xs text-muted-foreground">
                                Note: {item.note}
                              </div>
                            )}
                          </>
                        ) : isPart ? (
                          <>
                            <div className="font-medium">Part: {item.part?.name ?? item.carName}</div>
                            <div className="text-xs text-muted-foreground">
                              on {item.part?.carName ?? `catalog car ${item.catalogCarId}`}
                              {item.ownedCarId ? ` (car #${item.ownedCarId}, already imported)` : " (car in review)"}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Meanwhile: {item.part?.interim ?? "stock part"}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium">{item.carName}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              catalog {item.catalogCarId}
                            </div>
                            {item.engine && (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                Engine swap: {item.engine}
                              </div>
                            )}
                            {item.parts.length > 0 && (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {item.parts.length} part(s): {item.parts.join(", ")}
                              </div>
                            )}
                          </>
                        )}
                      </Cell>
                      <Cell className="text-xs">{item.reason}</Cell>
                      <Cell className="text-xs">
                        {item.sourceHandle}
                        <span className="numeric ml-1 text-muted-foreground">
                          {item.source} #{item.sourceId}
                        </span>
                      </Cell>
                      <Cell mono className="text-muted-foreground">
                        {dateLabel(item.createdAt)}
                      </Cell>
                      <Cell>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1.5">
                            <AskIchiban
                              select={{
                                type: "migrationReview",
                                id: item.id,
                                label: `Import #${item.id}: ${item.carName} for ${item.player}`,
                              }}
                            />
                            {isMoney ? (
                              <ConfirmButton
                                variant="default"
                                destructive={false}
                                title={`Credit ${creditOk ? creditAmount.toLocaleString() : "?"} money to ${item.player}?`}
                                description={`Credited through the economy ledger with idempotency key migrate-money:${item.id}, so it can only happen once. The racer declared ${declared.toLocaleString()}. Admins only.`}
                                confirmLabel="Approve and credit"
                                disabled={decide.isPending || !creditOk}
                                onConfirm={() =>
                                  decide.mutate({
                                    id: item.id,
                                    verb: "approve",
                                    amount: creditAmount,
                                    money: true,
                                  })
                                }
                              >
                                <Check className="size-3.5" aria-hidden />
                                Credit
                              </ConfirmButton>
                            ) : isPart ? (
                              <ConfirmButton
                                variant="default"
                                destructive={false}
                                title={`Grant “${item.part?.name ?? item.carName}” to ${item.player}?`}
                                description={`The part is granted through the award service with idempotency key migrate-part:${item.id}, so it can only happen once and a limited part fails if its supply is used up. It replaces the stand-in on the imported car, or goes to the racer's spare parts.`}
                                confirmLabel="Approve and grant"
                                disabled={decide.isPending}
                                onConfirm={() => decide.mutate({ id: item.id, verb: "approve", part: true })}
                              >
                                <Check className="size-3.5" aria-hidden />
                                Approve
                              </ConfirmButton>
                            ) : (
                              <ConfirmButton
                                variant="default"
                                destructive={false}
                                title={`Grant “${item.carName}” to ${item.player}?`}
                                description="The car is granted through the award service: a limited car fails if its supply is used up. The racer's imported parts are applied unless it has a frozen trophy build."
                                confirmLabel="Approve and grant"
                                disabled={decide.isPending}
                                onConfirm={() => decide.mutate({ id: item.id, verb: "approve" })}
                              >
                                <Check className="size-3.5" aria-hidden />
                                Approve
                              </ConfirmButton>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={decide.isPending || !(denyReason[item.id] ?? "").trim()}
                              onClick={() =>
                                decide.mutate({
                                  id: item.id,
                                  verb: "deny",
                                  reason: denyReason[item.id] ?? "",
                                })
                              }
                            >
                              <X className="size-3.5" aria-hidden />
                              Deny
                            </Button>
                          </div>
                          {isMoney && (
                            <Input
                              className="h-8 text-xs"
                              inputMode="numeric"
                              aria-label="Amount to credit"
                              placeholder={`Amount to credit (max ${declared.toLocaleString()})`}
                              value={creditRaw}
                              onChange={(event) =>
                                setCredit((cur) => ({ ...cur, [item.id]: event.target.value }))
                              }
                            />
                          )}
                          <Input
                            className="h-8 text-xs"
                            placeholder="Reason (required to deny)"
                            value={denyReason[item.id] ?? ""}
                            onChange={(event) =>
                              setDenyReason((cur) => ({ ...cur, [item.id]: event.target.value }))
                            }
                          />
                        </div>
                      </Cell>
                    </Row>
                  );
                })}
              </DataTable>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="decided" className="mt-3">
          <Panel title="Recently decided" count={decided.length}>
            {all.isLoading ? (
              <LoadingState />
            ) : all.isError ? (
              <ErrorState error={all.error} what="decided imports" />
            ) : decided.length === 0 ? (
              <EmptyState>Nothing decided yet.</EmptyState>
            ) : (
              <DataTable head={["Racer", "Car", "State", "Decided"]}>
                {decided.map((item) => (
                  <Row key={item.id}>
                    <Cell className="font-medium">{item.player}</Cell>
                    <Cell>
                      {item.kind === "money"
                        ? `Money: ${Number(item.amount ?? 0).toLocaleString()}`
                        : item.carName}
                      {item.ownedCarId ? (
                        <span className="numeric ml-1.5 text-xs text-muted-foreground">
                          car #{item.ownedCarId}
                        </span>
                      ) : null}
                    </Cell>
                    <Cell>
                      <Pill tone={statusTone(item.status)}>{item.status}</Pill>
                      {item.denyReason && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {item.denyReason}
                        </div>
                      )}
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
