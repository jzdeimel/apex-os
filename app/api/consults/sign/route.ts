import { runMutation, ConflictError } from "@/lib/api/gateway";
import { appendLedgerRow } from "@/lib/db/repo";
import { getClient, clientName } from "@/lib/mock/clients";
import { getConsult, commitConsultStatus } from "@/lib/mock/consults";
import type { Consult } from "@/lib/consult/types";
import type { Client } from "@/lib/types";
import { staffMap } from "@/lib/mock/staff";

/**
 * PROVIDER CO-SIGN of an existing consult.
 *
 * WHAT WAS WRONG. This took BOTH `consultId` and `clientId` from the request
 * body, scoped authorization to the clientId, and then signed the consultId —
 * without ever loading the consult. So a caller could pair someone else's
 * consult id with a client they legitimately cover and sign a note on a chart
 * they have no access to. Authorization was checked against a relationship the
 * CALLER asserted rather than one the server read.
 *
 * It also never changed the consult's status: it appended a ledger row and
 * returned success, so the sign queue rebuilt with the same item still unsigned
 * and the clinic dashboard kept counting it.
 *
 * Now the consult is LOADED BY ID, the client is derived from the loaded
 * record, `sign:encounter` is checked against that client's care team and
 * location, an already-signed consult is a 409 rather than a second signature,
 * and the status change and the ledger row happen together.
 *
 * DISTINCT FROM /api/consults/draft POST, which is AUTHOR self-sign under
 * write:consult. This is the provider co-sign of somebody else's note under
 * sign:encounter — a different act by a different person, deliberately kept as
 * a separate route rather than overloading one.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  consultId: string;
}

interface Subject {
  consult: Consult;
  client: Client;
}

export async function POST(req: Request) {
  return runMutation<Body, Subject, { consultId: string; ledger: { id: string; seq: number; hash: string } }>(
    req,
    {
      context: "consults.sign",
      capability: "sign:encounter",
      unavailableMessage: "The signature could not be recorded. Please try again.",

      parse: (raw) => {
        const b = (raw ?? {}) as Partial<Body>;
        if (typeof b.consultId !== "string" || !b.consultId) return "consultId is required.";
        // clientId is deliberately NOT read from the body. It comes off the
        // loaded consult, so it cannot be used to redirect the scope check.
        return { consultId: b.consultId };
      },

      loadSubject: (body) => {
        const consult = getConsult(body.consultId);
        if (!consult) return null;
        const client = getClient(consult.clientId);
        if (!client) return null;
        return { consult, client };
      },

      // Scope from the RECORD's client.
      scopeOf: ({ client }) => ({
        coachId: client.coachId,
        providerId: client.providerId,
        locationId: client.locationId,
      }),

      validate: ({ subject }) =>
        subject.consult.status === "Signed"
          ? "This consult is already signed. A second signature is not recorded."
          : null,

      execute: async ({ subject, actor }) => {
        const { consult, client } = subject;
        const me = staffMap[actor.id];

        // Re-check under the write rather than trusting the validate pass: two
        // providers hitting the queue at once must not both sign.
        if (consult.status === "Signed") {
          throw new ConflictError("This consult is already signed.");
        }

        const row = await appendLedgerRow(
          {
            actorId: actor.id,
            actorName: me?.name ?? actor.id,
            actorRole: actor.role,
            action: "sign",
            entity: "note",
            entityId: consult.id,
            subjectId: client.id,
            subjectName: clientName(client),
            locationId: client.locationId,
            reason: "Consult co-signed by provider",
            before: { status: consult.status },
            after: { status: "Signed", immutable: true, consultId: consult.id },
          },
          new Date().toISOString(),
        );

        // Only after the durable witness exists does the read model move, so a
        // failed ledger write cannot leave a consult marked signed with nothing
        // recording who signed it.
        commitConsultStatus(consult.id, "Signed");

        return {
          consultId: consult.id,
          ledger: { id: row.id, seq: row.seq, hash: row.hash },
        };
      },
    },
  );
}
