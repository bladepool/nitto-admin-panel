import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { api, dateLabel, integer, money } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/economy")({
  head: () => ({
    meta: [
      { title: "Economy — Racing Legends Race Control" },
      { name: "description", content: "Redeem codes, point packages and store economy tools." },
      { property: "og:title", content: "Economy — Racing Legends Race Control" },
      { property: "og:description", content: "Redeem codes and point packages for Racing Legends." },
    ],
  }),
  component: EconomyPage,
});

type RedeemCode = {
  id?: number;
  code?: string;
  reward?: string;
  points?: number;
  money?: number;
  uses?: number;
  maxUses?: number;
  expiresAt?: string;
  active?: boolean;
};

type Package = {
  id?: number;
  name?: string;
  points?: number;
  priceUsd?: number;
  membershipDays?: number;
  active?: boolean;
};

function EconomyPage() {
  const queryClient = useQueryClient();

  const codes = useQuery({
    queryKey: ["admin", "redeem-codes"],
    queryFn: () =>
      api<{ codes?: RedeemCode[]; redeemCodes?: RedeemCode[] }>("/api/admin/redeem-codes"),
    retry: false,
  });

  const packages = useQuery({
    queryKey: ["admin", "packages"],
    queryFn: () => api<{ packages?: Package[] }>("/api/admin/packages"),
    retry: false,
  });

  const createCode = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/admin/redeem-codes", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Redeem code created.");
      queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const codeList = codes.data?.codes ?? codes.data?.redeemCodes ?? [];
  const packageList = packages.data?.packages ?? [];
  const activeCodes = codeList.filter((code) => code.active !== false);

  return (
    <>
      <PageHeading
        title="Economy"
        subtitle="Point packages, store pricing and the redeem codes that hand out rewards."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Live codes" value={integer(activeCodes.length)} tone="primary" />
        <StatTile label="Total codes" value={integer(codeList.length)} />
        <StatTile label="Store packages" value={integer(packageList.length)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Redeem codes" count={codeList.length}>
          {codes.isLoading ? (
            <LoadingState />
          ) : codes.isError ? (
            <ErrorState error={codes.error} what="redeem codes" />
          ) : codeList.length === 0 ? (
            <EmptyState>No redeem codes yet.</EmptyState>
          ) : (
            <DataTable head={["Code", "Reward", "Uses", "Expires", "State"]}>
              {codeList.map((code, index) => (
                <Row key={code.id ?? index}>
                  <Cell mono className="font-semibold">
                    {code.code}
                  </Cell>
                  <Cell className="text-muted-foreground">
                    {code.reward ||
                      [
                        code.points ? `${integer(code.points)} pts` : "",
                        code.money ? money(code.money) : "",
                      ]
                        .filter(Boolean)
                        .join(" + ") ||
                      "—"}
                  </Cell>
                  <Cell mono>
                    {integer(code.uses)}
                    {code.maxUses ? ` / ${integer(code.maxUses)}` : ""}
                  </Cell>
                  <Cell mono className="text-muted-foreground">
                    {code.expiresAt ? dateLabel(code.expiresAt) : "No expiry"}
                  </Cell>
                  <Cell>
                    <Pill tone={code.active === false ? "neutral" : "success"}>
                      {code.active === false ? "Retired" : "Live"}
                    </Pill>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Create a code">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                createCode.mutate({
                  code: String(data.get("code") || "")
                    .trim()
                    .toUpperCase(),
                  points: Number(data.get("points") || 0),
                  money: Number(data.get("money") || 0),
                  maxUses: Number(data.get("maxUses") || 0),
                  reason: String(data.get("reason") || ""),
                });
                event.currentTarget.reset();
              }}
            >
              <Field label="Code">
                <Input name="code" required placeholder="SUMMERNITRO" className="uppercase" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Points">
                  <Input name="points" type="number" min={0} defaultValue={0} />
                </Field>
                <Field label="Cash">
                  <Input name="money" type="number" min={0} defaultValue={0} />
                </Field>
              </div>
              <Field label="Max uses (0 = unlimited)">
                <Input name="maxUses" type="number" min={0} defaultValue={0} />
              </Field>
              <Field label="Reason">
                <Input name="reason" required placeholder="Promo for launch weekend" />
              </Field>
              <Button type="submit" disabled={createCode.isPending}>
                Create code
              </Button>
            </form>
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
                {packageList.map((item, index) => (
                  <li
                    key={item.id ?? index}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="numeric text-xs text-muted-foreground">
                        {integer(item.points)} pts
                        {item.membershipDays ? ` · ${integer(item.membershipDays)} VIP days` : ""}
                      </p>
                    </div>
                    <span className="numeric text-sm font-semibold text-primary">
                      ${Number(item.priceUsd ?? 0).toFixed(2)}
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
