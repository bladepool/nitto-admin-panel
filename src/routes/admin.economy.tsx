import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
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
  type PillTone,
} from "@/components/admin/primitives";
import { ConfirmButton, NativeSelect } from "@/components/admin/game-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, buildQuery, dateLabel, integer } from "@/lib/admin-api";
import { useAdminSession } from "@/lib/use-admin-session";

export const Route = createFileRoute("/admin/economy")({
  head: () => ({
    meta: [
      { title: "Economy — Racing Legends Race Control" },
      {
        name: "description",
        content: "Activation codes for points and membership packages, and the store price list.",
      },
      { property: "og:title", content: "Economy — Racing Legends Race Control" },
      { property: "og:description", content: "Activation codes and point packages." },
    ],
  }),
  component: EconomyPage,
});

/*
 * Points and membership are delivered ONLY through single-use activation codes (game API
 * legacy/activation.ts): a code is minted for a store package, redeemed in game ("Activate your
 * Purchase!"), and only its hash is stored, so the plain code is shown exactly once, right after
 * generating. Generating and voiding need an admin; listing is open to staff.
 */
type Package = {
  key: string;
  kind: "points" | "membership";
  name: string;
  priceCents: number;
  points: number;
  months: number;
  bonusPoints: number;
  channel: string;
  aliasOf?: string;
};

type Code = {
  id: number;
  hint: string;
  kind: string;
  packageKey: string;
  points: number;
  months: number;
  bonusPoints: number;
  createdBy: string;
  createdAt: string;
  batch: string | null;
  note: string | null;
  redeemedBy: number | null;
  redeemedByName: string | null;
  redeemedAt: string | null;
  revoked: boolean;
  revokedBy: string | null;
  status: "unused" | "redeemed" | "revoked";
};

type Generated = { package: Package; batch: string; codes: { id: number; code: string; hint: string }[] };

const STATUS_TONE: Record<Code["status"], PillTone> = {
  unused: "success",
  redeemed: "info",
  revoked: "neutral",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function EconomyPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [fresh, setFresh] = useState<Generated | null>(null);
  const { session } = useAdminSession();
  const canMint = Number(session?.roleClass ?? 0) >= 4;

  const packages = useQuery({
    queryKey: ["admin", "activation", "packages"],
    queryFn: () => api<{ packages: Package[] }>("/api/admin/activation/packages"),
    retry: false,
  });

  const codes = useQuery({
    queryKey: ["admin", "activation", "codes", status],
    queryFn: () =>
      api<{ codes: Code[] }>(`/api/admin/activation/codes${buildQuery({ status, limit: 200 })}`),
    retry: false,
  });

  const generate = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Generated>("/api/admin/activation/generate", { method: "POST", body }),
    onSuccess: (data) => {
      setFresh(data);
      toast.success(`${data.codes.length} code(s) generated. Copy them now: they are not shown again.`);
      queryClient.invalidateQueries({ queryKey: ["admin", "activation", "codes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (id: number) =>
      api<{ revoked: number[]; skipped: number[] }>("/api/admin/activation/revoke", {
        method: "POST",
        body: { id, reason: "voided from Race Control" },
      }),
    onSuccess: (data) => {
      if (data.revoked.length) toast.success("Code voided.");
      else toast("Nothing changed: the code was already redeemed or voided.");
      queryClient.invalidateQueries({ queryKey: ["admin", "activation", "codes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const packageList = packages.data?.packages ?? [];
  const codeList = codes.data?.codes ?? [];
  const byKey = new Map(packageList.map((item) => [item.key, item]));

  return (
    <>
      <PageHeading
        title="Economy"
        subtitle="Points and memberships are sold as single-use activation codes, one per store package."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Unused codes shown"
          value={integer(codeList.filter((code) => code.status === "unused").length)}
          tone="primary"
        />
        <StatTile
          label="Redeemed shown"
          value={integer(codeList.filter((code) => code.status === "redeemed").length)}
        />
        <StatTile label="Store packages" value={integer(packageList.length)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Activation codes"
          count={codeList.length}
          actions={
            <NativeSelect
              className="w-36"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              options={[
                { value: "", label: "All codes" },
                { value: "unused", label: "Unused" },
                { value: "redeemed", label: "Redeemed" },
                { value: "revoked", label: "Voided" },
              ]}
            />
          }
        >
          {codes.isLoading ? (
            <LoadingState />
          ) : codes.isError ? (
            <ErrorState error={codes.error} what="activation codes" />
          ) : codeList.length === 0 ? (
            <EmptyState>No activation codes yet.</EmptyState>
          ) : (
            <DataTable head={["Code", "Package", "Batch", "Created", "State", ""]}>
              {codeList.map((code) => (
                <Row key={code.id}>
                  <Cell mono className="whitespace-nowrap font-semibold" >
                    <span title="Only the last 4 characters are stored in clear">…{code.hint}</span>
                  </Cell>
                  <Cell className="text-muted-foreground">
                    {byKey.get(code.packageKey)?.name ?? code.packageKey}
                  </Cell>
                  <Cell mono className="text-xs text-muted-foreground">
                    {code.batch ?? "—"}
                  </Cell>
                  <Cell mono className="text-muted-foreground">
                    <span className="whitespace-nowrap">{dateLabel(code.createdAt)}</span>
                    <span className="block text-xs">{code.createdBy}</span>
                  </Cell>
                  <Cell>
                    <Pill tone={STATUS_TONE[code.status]}>
                      {code.status === "revoked" ? "voided" : code.status}
                    </Pill>
                    {code.status === "redeemed" && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {code.redeemedByName ?? `#${code.redeemedBy}`} · {dateLabel(code.redeemedAt)}
                      </span>
                    )}
                  </Cell>
                  <Cell>
                    {code.status === "unused" && canMint && (
                      <ConfirmButton
                        size="sm"
                        variant="outline"
                        title="Void this code?"
                        description="A voided code can never be redeemed. This cannot be undone."
                        confirmLabel="Void code"
                        disabled={revoke.isPending}
                        onConfirm={() => revoke.mutate(code.id)}
                      >
                        Void
                      </ConfirmButton>
                    )}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Generate codes" note={canMint ? "Admins" : "Admins only: you can view codes"}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                generate.mutate({
                  package: String(data.get("package") || ""),
                  count: Number(data.get("count") || 1),
                  batch: String(data.get("batch") || "").trim(),
                  note: String(data.get("note") || "").trim(),
                });
              }}
            >
              <Field label="Package">
                <select
                  name="package"
                  required
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a package
                  </option>
                  {packageList.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name} · {usd(item.priceCents)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="How many">
                  <Input name="count" type="number" min={1} max={500} defaultValue={1} />
                </Field>
                <Field label="Batch (optional)">
                  <Input name="batch" placeholder="launch-weekend" />
                </Field>
              </div>
              <Field label="Note">
                <Input name="note" required placeholder="Who or what these codes are for" />
              </Field>
              <Button type="submit" disabled={!canMint || generate.isPending || packageList.length === 0}>
                Generate
              </Button>
            </form>

            {fresh && (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-medium">
                  {fresh.package.name} · batch {fresh.batch}. Copy now: only hashes are stored.
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {fresh.codes.map((code) => (
                    <li key={code.id} className="flex items-center justify-between gap-2">
                      <code className="font-mono text-sm">{code.code}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Copy ${code.code}`}
                        onClick={() => {
                          void navigator.clipboard?.writeText(code.code).then(
                            () => toast.success("Copied."),
                            () => toast.error("Copy failed; select the code instead."),
                          );
                        }}
                      >
                        <Copy className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFresh(null)}>
                  Done, hide them
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="Store packages" count={packageList.length}>
            {packages.isLoading ? (
              <LoadingState />
            ) : packages.isError ? (
              <ErrorState error={packages.error} what="store packages" />
            ) : packageList.length === 0 ? (
              <EmptyState>No packages configured.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {packageList.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="numeric text-xs text-muted-foreground">
                        {item.kind === "membership"
                          ? `${item.months} month${item.months === 1 ? "" : "s"} VIP + ${integer(item.bonusPoints)} pts`
                          : `${integer(item.points)} pts`}
                        {item.channel === "mobile" ? " · mobile" : ""}
                      </p>
                    </div>
                    <span className="numeric text-sm font-semibold text-primary">
                      {usd(item.priceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
