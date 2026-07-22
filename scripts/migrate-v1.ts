import { randomUUID } from "node:crypto";
import postgres, { type Sql, type TransactionSql } from "postgres";
import {
  V1_SOURCE_SYSTEM,
  bindingId,
  extractSummary,
  sameDatabase,
  sha256,
  type MappedRecord,
  type V1AppointmentRow,
  type V1Extract,
  type V1LocationRow,
  type V1PersonRow,
  type V1StaffRow,
} from "@/lib/migration/v1";

type Mode = "baseline" | "delta" | "rehearsal";

interface Options {
  apply: boolean;
  reconcileOnly: boolean;
  mode: Mode;
  watermark: Date | null;
  initiatedBy: string | null;
  targetLabel: string | null;
}

function parseDate(value: string, flag: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${flag} must be an ISO-8601 timestamp`);
  return date;
}

export function parseOptions(argv: string[]): Options {
  const value = (name: string) => argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  const mode = (value("--mode") ?? "rehearsal") as Mode;
  if (!(["baseline", "delta", "rehearsal"] as string[]).includes(mode)) {
    throw new Error("--mode must be baseline, delta, or rehearsal");
  }
  const watermarkRaw = value("--watermark");
  const options: Options = {
    apply: argv.includes("--apply"),
    reconcileOnly: argv.includes("--reconcile-only"),
    mode,
    watermark: watermarkRaw ? parseDate(watermarkRaw, "--watermark") : null,
    initiatedBy: value("--initiated-by") ?? process.env.MIGRATION_INITIATED_BY ?? null,
    targetLabel: value("--confirm-target") ?? null,
  };
  if (options.mode === "delta" && !options.watermark) {
    throw new Error("delta mode requires --watermark=<last successful nextWatermark>");
  }
  if (options.apply && options.reconcileOnly) {
    throw new Error("--apply and --reconcile-only are mutually exclusive");
  }
  return options;
}

function connection(url: string) {
  const parsed = new URL(url);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  return postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 20,
    ssl: local || process.env.MIGRATION_SSL === "disable" ? false : "require",
    onnotice: () => {},
  });
}

async function extractV1(source: Sql, from: Date | null, forceFull: boolean) {
  return source.begin("isolation level repeatable read read only", async (tx) => {
    const [{ nextWatermark }] = await tx<{ nextWatermark: Date }[]>`
      select transaction_timestamp() as "nextWatermark"
    `;
    const locations = (await tx`
      select id, code, name, address1, city, state, zip, timezone, active, "createdAt"
      from clinic."Location"
      order by id
    `) as unknown as V1LocationRow[];
    const staff = (await tx`
      select id, name, email, role::text as role, title, npi, active, "locationId", "createdAt"
      from clinic."Staff"
      order by id
    `) as unknown as V1StaffRow[];
    const people = (forceFull || !from
      ? await tx`
          select id, mrn, "firstName", "lastName", "preferredName", dob, sex::text as sex,
                 email, phone, address1, address2, city, state, zip, status::text as status,
                 "isProspect", "assignedCoachId", "locationId", "createdAt", "updatedAt"
          from clinic."Person"
          where "updatedAt" <= ${nextWatermark}
          order by id
        `
      : await tx`
          select id, mrn, "firstName", "lastName", "preferredName", dob, sex::text as sex,
                 email, phone, address1, address2, city, state, zip, status::text as status,
                 "isProspect", "assignedCoachId", "locationId", "createdAt", "updatedAt"
          from clinic."Person"
          where "updatedAt" > ${from} and "updatedAt" <= ${nextWatermark}
          order by id
        `) as unknown as V1PersonRow[];
    const appointments = (forceFull || !from
      ? await tx`
          select id, "personId", "providerId", "locationId", type::text as type,
                 status::text as status, "startAt", "endAt", resource, reason, notes,
                 "createdAt", "updatedAt"
          from clinic."Appointment"
          where "updatedAt" <= ${nextWatermark}
          order by id
        `
      : await tx`
          select id, "personId", "providerId", "locationId", type::text as type,
                 status::text as status, "startAt", "endAt", resource, reason, notes,
                 "createdAt", "updatedAt"
          from clinic."Appointment"
          where "updatedAt" > ${from} and "updatedAt" <= ${nextWatermark}
          order by id
        `) as unknown as V1AppointmentRow[];

    return {
      extract: { locations, staff, people, appointments } satisfies V1Extract,
      nextWatermark: new Date(nextWatermark),
    };
  });
}

function chunks<T>(items: T[], size = 400): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function upsertLocations(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data))) {
    await tx`
      insert into clinic_location ${tx(batch)}
      on conflict (id) do update set
        code = excluded.code, name = excluded.name, address1 = excluded.address1,
        city = excluded.city, state = excluded.state, zip = excluded.zip,
        timezone = excluded.timezone, active = excluded.active,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
    `;
  }
}

async function upsertStaff(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data))) {
    await tx`
      insert into staff ${tx(batch)}
      on conflict (id) do update set
        email = excluded.email, name = excluded.name, department = excluded.department,
        title = excluded.title, role = excluded.role, location_ids = excluded.location_ids,
        credentials = excluded.credentials, can_approve = excluded.can_approve,
        exclude_from_scheduling = excluded.exclude_from_scheduling, active = excluded.active,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
    `;
  }
}

async function upsertPeople(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 250)) {
    await tx`
      insert into client ${tx(batch)}
      on conflict (id) do update set
        mrn = excluded.mrn, first_name = excluded.first_name, last_name = excluded.last_name,
        preferred_name = excluded.preferred_name, date_of_birth = excluded.date_of_birth,
        sex = excluded.sex, email = excluded.email, phone = excluded.phone,
        address1 = excluded.address1, address2 = excluded.address2, city = excluded.city,
        state = excluded.state, zip = excluded.zip, status = excluded.status,
        is_prospect = excluded.is_prospect, home_location_id = excluded.home_location_id,
        assigned_coach_id = excluded.assigned_coach_id,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
    `;
  }
}

async function upsertAppointments(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 250)) {
    await tx`
      insert into appointment ${tx(batch)}
      on conflict (id) do update set
        client_id = excluded.client_id, staff_id = excluded.staff_id,
        location_id = excluded.location_id, visit_type = excluded.visit_type,
        modality = excluded.modality, start_at = excluded.start_at, end_at = excluded.end_at,
        status = excluded.status, room = excluded.room, reason = excluded.reason,
        notes = excluded.notes, completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at, source_system = excluded.source_system,
        source_id = excluded.source_id, source_updated_at = excluded.source_updated_at
    `;
  }
}

async function upsertBindings(
  tx: TransactionSql,
  runId: string,
  records: MappedRecord<Record<string, unknown>>[],
) {
  const values = records.map((record) => ({
    id: bindingId(record.entityType, record.sourceId),
    source_system: V1_SOURCE_SYSTEM,
    entity_type: record.entityType,
    source_id: record.sourceId,
    target_id: record.targetId,
    source_updated_at: record.sourceUpdatedAt,
    checksum: record.checksum,
    first_run_id: runId,
    last_run_id: runId,
    imported_at: new Date(),
  }));
  for (const batch of chunks(values, 300)) {
    await tx`
      insert into import_binding ${tx(batch)}
      on conflict (source_system, entity_type, source_id) do update set
        target_id = excluded.target_id, source_updated_at = excluded.source_updated_at,
        checksum = excluded.checksum, last_run_id = excluded.last_run_id,
        imported_at = excluded.imported_at
    `;
  }
}

async function applyExtract(
  target: Sql,
  runId: string,
  mapped: ReturnType<typeof extractSummary>["mapped"],
) {
  await target.begin("isolation level serializable read write", async (tx) => {
    await upsertLocations(tx, mapped.locations);
    await upsertStaff(tx, mapped.staff);
    await upsertPeople(tx, mapped.people);
    await upsertAppointments(tx, mapped.appointments);
    await upsertBindings(tx, runId, [
      ...mapped.locations,
      ...mapped.staff,
      ...mapped.people,
      ...mapped.appointments,
    ]);
  });
}

interface Reconciliation {
  scope: "full" | "delta";
  expected: number;
  bound: number;
  targetRows: number;
  missing: number;
  mismatched: number;
  extra: number;
  expectedChecksum: string;
  bindingChecksum: string;
  ok: boolean;
}

async function reconcile(
  target: Sql,
  mapped: ReturnType<typeof extractSummary>["mapped"],
  scope: "full" | "delta" = "full",
): Promise<Reconciliation> {
  const expectedRows = Object.values(mapped).flat();
  const actual = await target<{ entityType: string; sourceId: string; checksum: string }[]>`
    select entity_type as "entityType", source_id as "sourceId", checksum
    from import_binding
    where source_system = ${V1_SOURCE_SYSTEM}
  `;
  const targetCounts = await target<{ count: number }[]>`
    select sum(n)::int as count from (
      select count(*)::int as n from clinic_location where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from staff where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from client where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from appointment where source_system = ${V1_SOURCE_SYSTEM}
    ) counts
  `;
  const expected = new Map(expectedRows.map((row) => [`${row.entityType}:${row.sourceId}`, row.checksum]));
  const bound = new Map(actual.map((row) => [`${row.entityType}:${row.sourceId}`, row.checksum]));
  let missing = 0;
  let mismatched = 0;
  for (const [key, checksum] of expected) {
    if (!bound.has(key)) missing++;
    else if (bound.get(key) !== checksum) mismatched++;
  }
  let extra = 0;
  for (const key of bound.keys()) if (!expected.has(key)) extra++;
  const expectedChecksum = sha256([...expected.values()].sort());
  const relevantBindingChecksums = [...expected.keys()]
    .map((key) => bound.get(key))
    .filter((checksum): checksum is string => Boolean(checksum));
  const bindingChecksum = sha256(relevantBindingChecksums.sort());
  const targetRows = Number(targetCounts[0]?.count ?? 0);
  return {
    scope,
    expected: expected.size,
    bound: bound.size,
    targetRows,
    missing,
    mismatched,
    extra,
    expectedChecksum,
    bindingChecksum,
    ok:
      missing === 0 &&
      mismatched === 0 &&
      (scope === "delta" || extra === 0) &&
      (scope === "delta" || expected.size === bound.size) &&
      (scope === "delta" || expected.size === targetRows) &&
      expectedChecksum === bindingChecksum,
  };
}

function requireApplyAuthorization(options: Options) {
  if (process.env.MIGRATION_AUTHORIZED !== "true") {
    throw new Error("apply refused: set MIGRATION_AUTHORIZED=true in the controlled migration job");
  }
  if (!options.initiatedBy) throw new Error("apply refused: --initiated-by is required");
  const expectedLabel = process.env.MIGRATION_TARGET_LABEL;
  if (!expectedLabel || !options.targetLabel || options.targetLabel !== expectedLabel) {
    throw new Error("apply refused: --confirm-target must match MIGRATION_TARGET_LABEL");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sourceUrl = process.env.V1_DATABASE_URL;
  const targetUrl = process.env.APEX_MIGRATION_DATABASE_URL;
  if (!sourceUrl) throw new Error("V1_DATABASE_URL is required");
  if ((options.apply || options.reconcileOnly) && !targetUrl) {
    throw new Error("APEX_MIGRATION_DATABASE_URL is required for apply or reconciliation");
  }
  if (targetUrl && sameDatabase(sourceUrl, targetUrl)) {
    throw new Error("source and target resolve to the same database; migration refused");
  }
  if (options.apply) requireApplyAuthorization(options);

  const source = connection(sourceUrl);
  const target = targetUrl ? connection(targetUrl) : null;
  try {
    const forceFull = options.mode !== "delta" || options.reconcileOnly;
    const { extract, nextWatermark } = await extractV1(source, options.watermark, forceFull);
    const summary = extractSummary(extract);
    if ((options.apply || options.reconcileOnly) && summary.counts.people === 0) {
      throw new Error("source contains zero people; refusing a cutover operation against an empty extract");
    }

    let runId: string | null = null;
    let reconciliation: Reconciliation | null = null;
    if (options.apply && target) {
      runId = randomUUID();
      await target`
        insert into migration_run (
          id, source_system, mode, status, source_watermark, next_watermark,
          counts, checksum, initiated_by
        ) values (
          ${runId}, ${V1_SOURCE_SYSTEM}, ${options.mode}, 'running', ${options.watermark},
          ${nextWatermark}, ${target.json(summary.counts)}, ${summary.checksum}, ${options.initiatedBy!}
        )
      `;
      try {
        await applyExtract(target, runId, summary.mapped);
        await target`
          update migration_run
          set status = 'applied', completed_at = now()
          where id = ${runId}
        `;
      } catch (error) {
        await target`
          update migration_run
          set status = 'failed', completed_at = now(), error_code = 'apply_failed'
          where id = ${runId}
        `;
        throw error;
      }
    }
    if ((options.apply || options.reconcileOnly) && target) {
      reconciliation = await reconcile(
        target,
        summary.mapped,
        options.mode === "delta" && !options.reconcileOnly ? "delta" : "full",
      );
      if (options.apply && runId) {
        await target`
          update migration_run
          set status = ${reconciliation.ok ? "reconciled" : "reconciliation_failed"},
              completed_at = now()
          where id = ${runId}
        `;
      }
    }

    const report = {
      operation: options.reconcileOnly ? "reconcile" : options.apply ? "apply" : "dry-run",
      mode: options.mode,
      runId,
      sourceWatermark: options.watermark?.toISOString() ?? null,
      nextWatermark: nextWatermark.toISOString(),
      counts: summary.counts,
      checksum: summary.checksum,
      reconciliation,
    };
    console.log(JSON.stringify(report, null, 2));
    if (reconciliation && !reconciliation.ok) process.exitCode = 2;
  } finally {
    await source.end({ timeout: 5 });
    if (target) await target.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("migrate-v1.ts")) {
  main().catch((error) => {
    console.error(JSON.stringify({ operation: "failed", error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  });
}
