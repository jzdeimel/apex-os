import postgres, { type TransactionSql } from "postgres";
import { ROSTER } from "@/lib/mock/roster";

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function connection(url: string) {
  const parsed = new URL(url);
  for (const key of ["connection_limit", "pool_timeout"]) parsed.searchParams.delete(key);
  return postgres(parsed.toString(), {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 20,
    ssl: parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" ? false : "require",
    onnotice: () => {},
  });
}

type DistributionRow = { matches: number; records: number };

async function candidateDistribution(tx: TransactionSql, source: "clients" | "touches" | "purchases" | "routedOrders") {
  if (source === "clients") {
    return tx<DistributionRow[]>`
      select candidates.matches, count(*)::int as records
      from public."ClientProfile" c
      cross join lateral (
        select count(*)::int as matches from public."User" u
        where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(c."assignedCoach"), '[^a-z0-9]', '', 'g')
      ) candidates
      where trim(coalesce(c."assignedCoach", '')) <> ''
      group by candidates.matches order by candidates.matches
    `;
  }
  if (source === "touches") {
    return tx<DistributionRow[]>`
      select candidates.matches, count(*)::int as records
      from public."ClientTouch" t
      cross join lateral (
        select count(*)::int as matches from public."User" u
        where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(t.coach), '[^a-z0-9]', '', 'g')
      ) candidates
      where trim(coalesce(t.coach, '')) <> ''
      group by candidates.matches order by candidates.matches
    `;
  }
  if (source === "purchases") {
    return tx<DistributionRow[]>`
      select candidates.matches, count(*)::int as records
      from public."Purchase" p
      cross join lateral (
        select count(*)::int as matches from public."User" u
        where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(p.coach), '[^a-z0-9]', '', 'g')
      ) candidates
      where trim(coalesce(p.coach, '')) <> ''
      group by candidates.matches order by candidates.matches
    `;
  }
  return tx<DistributionRow[]>`
    select candidates.matches, count(*)::int as records
    from public."RoutedOrder" r
    cross join lateral (
      select count(*)::int as matches from public."User" u
      where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
            regexp_replace(lower(r.coach), '[^a-z0-9]', '', 'g')
    ) candidates
    where trim(coalesce(r.coach, '')) <> ''
    group by candidates.matches order by candidates.matches
  `;
}

async function audit(tx: TransactionSql) {
  const collisionGroups = await tx<{
    normalizedName: string;
    users: number;
    distinctEmails: number;
    distinctRoles: number;
    distinctLocations: number;
    officialDomainUsers: number;
  }[]>`
    select regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as "normalizedName",
           count(*)::int as users,
           count(distinct lower(trim(email))) filter (where trim(coalesce(email, '')) <> '')::int as "distinctEmails",
           count(distinct role)::int as "distinctRoles",
           count(distinct lower(trim(coalesce(location, ''))))::int as "distinctLocations",
           count(*) filter (where lower(trim(email)) like '%@goalphahealth.com')::int as "officialDomainUsers"
    from public."User"
    where regexp_replace(lower(name), '[^a-z0-9]', '', 'g') <> ''
    group by regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
    having count(*) > 1
  `;
  const rosterNames = new Set(ROSTER.map((person) => normalizedName(`${person.firstName}${person.lastName}`)));
  const collisionUsers = await tx<{
    normalizedName: string;
    email: string;
    role: string;
    location: string | null;
  }[]>`
    with duplicate_names as (
      select regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as normalized_name
      from public."User"
      group by regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
      having count(*) > 1
    )
    select regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') as "normalizedName",
           u.email, u.role, u.location
    from public."User" u
    join duplicate_names d
      on d.normalized_name = regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g')
  `;
  let officialDomainUnique = 0;
  let rosterLocationFallbackUnique = 0;
  let unresolvedByCanonicalPolicy = 0;
  for (const group of collisionGroups) {
    const users = collisionUsers.filter((user) => user.normalizedName === group.normalizedName);
    const official = users.filter((user) => user.email.trim().toLowerCase().endsWith("@goalphahealth.com"));
    if (official.length === 1) {
      officialDomainUnique++;
      continue;
    }
    const roster = ROSTER.find((person) => normalizedName(`${person.firstName}${person.lastName}`) === group.normalizedName);
    const rosterLocation = roster?.location === "AHQ" ? "ahq" : roster?.location.replaceAll("-", " ");
    const atRosterLocation = rosterLocation
      ? users.filter((user) => normalizedName(user.location ?? "").includes(normalizedName(rosterLocation)))
      : [];
    if (atRosterLocation.length === 1) rosterLocationFallbackUnique++;
    else unresolvedByCanonicalPolicy++;
  }
  const shape = new Map<string, number>();
  for (const group of collisionGroups) {
    const key = [
      group.users,
      group.distinctEmails,
      group.distinctRoles,
      group.distinctLocations,
      group.officialDomainUsers,
    ].join(":");
    shape.set(key, (shape.get(key) ?? 0) + 1);
  }
  return {
    reportContainsNoIdentityValues: true,
    duplicateStaffNames: {
      groups: collisionGroups.length,
      userRows: collisionGroups.reduce((sum, group) => sum + group.users, 0),
      groupsMatchingApprovedRoster: collisionGroups.filter((group) => rosterNames.has(group.normalizedName)).length,
      canonicalResolution: {
        uniqueOfficialDomain: officialDomainUnique,
        uniqueApprovedRosterLocationFallback: rosterLocationFallbackUnique,
        unresolved: unresolvedByCanonicalPolicy,
      },
      shapes: [...shape.entries()].sort().map(([key, groups]) => {
        const [users, distinctEmails, distinctRoles, distinctLocations, officialDomainUsers] = key.split(":").map(Number);
        return { users, distinctEmails, distinctRoles, distinctLocations, officialDomainUsers, groups };
      }),
    },
    labelCandidateDistributions: {
      clients: await candidateDistribution(tx, "clients"),
      touches: await candidateDistribution(tx, "touches"),
      purchases: await candidateDistribution(tx, "purchases"),
      routedOrders: await candidateDistribution(tx, "routedOrders"),
    },
  };
}

async function main() {
  const sourceUrl = process.env.V1_DATABASE_URL;
  if (!sourceUrl) throw new Error("V1_DATABASE_URL is required");
  const source = connection(sourceUrl);
  try {
    const result = await source.begin("isolation level repeatable read read only", audit);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await source.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ operation: "failed", error: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
