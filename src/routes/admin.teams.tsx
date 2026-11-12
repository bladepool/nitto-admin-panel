import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";

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
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, dateLabel, integer, roleName } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/teams")({
  head: () => ({
    meta: [
      { title: "Teams — Racing Legends Race Control" },
      {
        name: "description",
        content: "Search teams and inspect rosters, owners and member counts.",
      },
      { property: "og:title", content: "Teams — Racing Legends Race Control" },
      { property: "og:description", content: "Search teams and inspect their rosters." },
    ],
  }),
  component: TeamsPage,
});

type Member = {
  accountId?: number;
  id?: number;
  username?: string;
  roleClass?: number;
  joinedAt?: string;
};
type Team = {
  id?: number;
  name?: string;
  tag?: string;
  ownerName?: string;
  memberCount?: number;
  createdAt?: string;
  members?: Member[];
};

function TeamsPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [selected, setSelected] = useState<Team | null>(null);

  const search = useQuery({
    queryKey: ["admin", "teams", submitted],
    queryFn: () =>
      api<{ teams?: Team[] }>(`/api/admin/teams?query=${encodeURIComponent(submitted)}`),
    enabled: submitted.length > 0,
    retry: false,
  });

  const teams = search.data?.teams ?? [];
  const members = selected?.members ?? [];

  return (
    <>
      <PageHeading title="Teams" subtitle="Roster lookup for every team in the paddock." />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title="Team search" count={teams.length}>
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
              placeholder="Team name or tag"
              aria-label="Search teams"
            />
            <Button type="submit" size="icon" aria-label="Search">
              <Search className="size-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-3">
            {!submitted ? (
              <EmptyState>Search for a team to see its roster.</EmptyState>
            ) : search.isLoading ? (
              <LoadingState label="Searching" />
            ) : search.isError ? (
              <ErrorState error={search.error} what="team search" />
            ) : teams.length === 0 ? (
              <EmptyState>No teams matched “{submitted}”.</EmptyState>
            ) : (
              <ul className="scroll-slim flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
                {teams.map((team) => (
                  <li key={team.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(team)}
                      className={
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors " +
                        (selected?.id === team.id
                          ? "border-primary/50 bg-primary/10"
                          : "border-border bg-surface/60 hover:border-border-strong")
                      }
                    >
                      <span className="block text-sm font-medium">
                        {team.tag ? `[${team.tag}] ` : ""}
                        {team.name}
                      </span>
                      <span className="numeric block text-xs text-muted-foreground">
                        #{team.id} · {integer(team.memberCount ?? team.members?.length ?? 0)}{" "}
                        members
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel
          title={selected ? `${selected.name} roster` : "Roster"}
          count={selected ? members.length : undefined}
          actions={
            selected?.ownerName ? <Pill tone="accent">Owner {selected.ownerName}</Pill> : undefined
          }
        >
          {!selected ? (
            <EmptyState>Pick a team to see its members.</EmptyState>
          ) : members.length === 0 ? (
            <EmptyState>This team has no members listed.</EmptyState>
          ) : (
            <DataTable head={["Racer", "Role", "Joined"]}>
              {members.map((member, index) => (
                <Row key={member.accountId ?? member.id ?? index}>
                  <Cell>
                    <span className="font-medium">{member.username}</span>
                    <span className="numeric ml-1.5 text-xs text-muted-foreground">
                      #{member.accountId ?? member.id}
                    </span>
                  </Cell>
                  <Cell>
                    <Pill tone={Number(member.roleClass ?? 0) > 0 ? "accent" : "neutral"}>
                      {roleName(member.roleClass)}
                    </Pill>
                  </Cell>
                  <Cell mono className="text-muted-foreground">
                    {dateLabel(member.joinedAt)}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>
    </>
  );
}
