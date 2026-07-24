import postgres, { type TransactionSql } from "postgres";

const TABLES = [
  "Appointment",
  "AppointmentAmendment",
  "AppointmentTemplate",
  "IntakeForm",
  "PackageSubscription",
  "Invoice",
  "InvoiceLine",
  "InventoryItem",
  "Lot",
  "InventoryEvent",
  "OutboundMedia",
  "Document",
] as const;

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

async function audit(tx: TransactionSql) {
  const columns = await tx<{
    table: string;
    column: string;
    type: string;
    nullable: string;
  }[]>`
    select table_name as table, column_name as column, data_type as type, is_nullable as nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = any(${TABLES})
    order by table_name, ordinal_position
  `;

  const counts: Array<{ table: string; count: number }> = [];
  for (const table of TABLES) {
    const exists = columns.some((column) => column.table === table);
    if (!exists) continue;
    const [row] = await tx.unsafe<{ count: number }[]>(
      `select count(*)::int as count from public."${table.replaceAll('"', '""')}"`,
    );
    counts.push({ table, count: Number(row?.count ?? 0) });
  }

  return {
    readOnly: true,
    containsNoRowValues: true,
    counts,
    columns,
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

void main().catch((error) => {
  console.error(JSON.stringify({ operation: "failed", error: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
