import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Ticket } from "lucide-react";

import { PageHeading } from "@/components/admin/shell";
import {
  Cell,
  DataTable,
  EmptyState,
  Field,
  LoadingState,
  Panel,
  Pill,
  Row,
  StatTile,
  type PillTone,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, buildQuery, dateLabel, integer } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/access")({
  head: () => ({
    meta: [
      { title: "Access Codes — 1320 Legends Race Control" },
      {
        name: "description",
        content: "Generate invite codes and track which have been claimed and accepted the terms.",
      },
      { property: "og:title", content: "Access Codes — 1320 Legends Race Control" },
      {
        property: "og:description",
        content: "Generate invite codes and track claims and terms acceptance.",
      },
    ],
  }),
  component: AccessCodesPage,
});

type AccessCode = {
  code: string;
  batch?: string | null;
  createdAt?: string;
  claimedAt?: string | null;
  claimedByPlayerId?: number | null;
  termsAccepted?: boolean;
};

const SAMPLE: AccessCode[] = [
  { code: "RL92K7", batch: "launch-1", createdAt: "2026-11-01T10:00:00Z", claimedAt: "2026-11-06T18:22:00Z", claimedByPlayerId: 119, termsAccepted: true },
  { code: "TRQ4MX", batch: "launch-1", createdAt: "2026-11-01T10:00:00Z", claimedAt: null, claimedByPlayerId: null, termsAccepted: false },
  { code: "V7HN2P", batch: "launch-1", createdAt: "2026-11-01T10:00:00Z", claimedAt: null, claimedByPlayerId: null, termsAccepted: false },
  { code: "K3DMZ9", batch: "og-wave", createdAt: "2026-11-04T09:00:00Z", claimedAt: "2026-11-07T12:10:00Z", claimedByPlayerId: 326, termsAccepted: true },
  { code: "XN8GC5", batch: "og-wave", createdAt: "2026-11-04T09:00:00Z", claimedAt: null, claimedByPlayerId: null, termsAccepted: false },
];

function claimTone(code: AccessCode): PillTone {
  return code.claimedAt ? "success" : "neutral";
}

function AccessCodesPage() {
  const queryClient = useQueryClient();
  const [count, setCount] = useState(25);
  const [batch, setBatch] = useState("");

  const list = useQuery({
    queryKey: ["admin", "access", "list"],
    queryFn: () => api<{ codes?: AccessCode[]; items?: AccessCode[] }>(`/api/admin/access/list${buildQuery({ limit: 200 })}`),
    retry: false,
  });

  const usingSample = list.isError || !list.data;
  const codes = usingSample ? SAMPLE : (list.data?.codes ?? list.data?.items ?? []);

  const generate = useMutation({
    mutationFn: (payload: { count: number; batch?: string }) =>
      api<{ ok: boolean; codes?: string[] }>("/api/admin/access/generate", { method: "POST", body: payload }),
    onSuccess: (data) => {
      toast.success(`Generated ${data.codes?.length ?? count} access code${count === 1 ? "" : "s"}.`);
      queryClient.invalidateQueries({ queryKey: ["admin", "access", "list"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Couldn't generate codes.");
    },
  });

  const claimed = codes.filter((c) => Boolean(c.claimedAt));
  const accepted = codes.filter((c) => c.termsAccepted);

  function copy(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => toast(`Copied ${code}`),
      () => toast.error("Clipboard blocked — select the code manually."),
    );
  }

  return (
    <>
      <PageHeading
        title="Access Codes"
        subtitle="Invitation-only beta. Each code works once; claiming it records the player and their acceptance of the terms."
        actions={usingSample ? <Pill tone="warning">Sample data</Pill> : <Pill tone="success">Live</Pill>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Codes" value={integer(codes.length)} tone="primary" />
        <StatTile label="Claimed" value={integer(claimed.length)} hint={`${codes.length - claimed.length} open`} />
        <StatTile label="Terms accepted" value={integer(accepted.length)} tone="success" />
        <StatTile
          label="Claim rate"
          value={codes.length ? `${Math.round((claimed.length / codes.length) * 100)}%` : "—"}
        />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Ticket className="size-4 text-primary" aria-hidden /> Generate codes
          </span>
        }
        className="mt-4"
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            generate.mutate({ count, batch: batch.trim() || undefined });
          }}
        >
          <Field label="How many" className="w-28">
            <Input
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              className="numeric"
            />
          </Field>
          <Field label="Batch label (optional)" className="w-56">
            <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. launch-2" />
          </Field>
          <Button type="submit" disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : `Generate ${count}`}
          </Button>
        </form>
      </Panel>

      <Panel title="All codes" count={codes.length} className="mt-4">
        {list.isLoading ? (
          <LoadingState label="Reading codes" />
        ) : codes.length === 0 ? (
          <EmptyState>No codes yet. Generate a batch to start inviting racers.</EmptyState>
        ) : (
          <DataTable head={["Code", "Batch", "Status", "Claimed by", "Terms", "Created"]}>
            {codes.map((c, index) => (
              <Row key={c.code ?? index}>
                <Cell mono className="font-semibold">
                  <button
                    type="button"
                    onClick={() => copy(c.code)}
                    className="inline-flex items-center gap-1.5 hover:text-primary"
                    title="Copy code"
                  >
                    {c.code}
                    <Copy className="size-3 opacity-50" aria-hidden />
                  </button>
                </Cell>
                <Cell className="text-muted-foreground">{c.batch || "—"}</Cell>
                <Cell>
                  <Pill tone={claimTone(c)}>{c.claimedAt ? "claimed" : "open"}</Pill>
                </Cell>
                <Cell mono className="text-muted-foreground">
                  {c.claimedByPlayerId ? `#${c.claimedByPlayerId}` : "—"}
                </Cell>
                <Cell>
                  {c.termsAccepted ? <Pill tone="success">accepted</Pill> : <span className="text-muted-foreground">—</span>}
                </Cell>
                <Cell mono className="text-muted-foreground">
                  {dateLabel(c.createdAt)}
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
