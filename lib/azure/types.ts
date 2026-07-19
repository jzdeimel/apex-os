/**
 * AZURE SERVICE LAYER — shared vocabulary.
 *
 * WHAT THE REAL THING IS
 *   Apex is designed to run entirely on Microsoft Azure under Alpha Health's
 *   own tenant and its own BAA. Every module in `lib/azure/*` models exactly one
 *   Azure service and states, in its own header, three things: what the real
 *   service does, what this build does instead, and what would have to change to
 *   make it real.
 *
 * WHAT THIS BUILD DOES
 *   Nothing here opens a socket. There is no `fetch`, no SDK import, no
 *   credential, no endpoint. Every adapter is a pure, deterministic function
 *   over local data, seeded by `seededRandom` and pinned to `NOW`.
 *
 * WHY THE HONESTY MATTERS MORE THAN THE DEMO
 *   A demo adapter that *looks* live is worse than one that says it is a demo.
 *   The failure mode is specific and expensive: a stakeholder sees a plausible
 *   result, believes a capability exists, and commits a date to it. Every
 *   adapter therefore returns `AdapterResult<T>` whose `demo` field is the
 *   literal type `true` — not a boolean that could ever be false in this build.
 *   The compiler enforces the disclosure; a comment could not.
 */

/** Deployment truth for one Azure service, as Settings should render it. */
export type AzureServiceStatus =
  /** Provisioned and carrying real traffic in the target environment. */
  | "wired"
  /** Modelled here as an inert adapter. The seam exists; the wire does not. */
  | "adapter"
  /** Architecturally decided, not yet modelled in code. */
  | "planned";

export interface AzureService {
  /** Stable slug — safe as a React key and as a settings anchor. */
  id: string;
  name: string;
  /** One line: why this service earns its place in the estate. */
  purpose: string;
  status: AzureServiceStatus;
  /**
   * Whether the service is covered by the Microsoft HIPAA BAA.
   *
   * This is not a nice-to-have field. A service outside the BAA may never touch
   * PHI, full stop — so the flag is a routing decision, not documentation. Any
   * service marked `false` here must be architecturally incapable of receiving
   * identified member data, and the surrounding module says how.
   */
  baaCovered: boolean;
  /** The real service, described plainly. */
  whatItDoes: string;
  /** What Apex actually does in this build, with no softening. */
  whatWeDoNow: string;
  /** The concrete delta to production. Not aspirational — actionable. */
  toGoLive: string;
}

/**
 * The return shape of every adapter call.
 *
 * `demo: true` is a literal type, so an adapter physically cannot claim to be
 * live without a code change that a reviewer will see in the diff.
 */
export interface AdapterResult<T> {
  ok: boolean;
  value?: T;
  /** Human-readable failure. Present iff `ok === false`. */
  error?: string;
  /** Always true in this build. See the note above. */
  demo: true;
}

export function adapterOk<T>(value: T): AdapterResult<T> {
  return { ok: true, value, demo: true };
}

export function adapterFail<T>(error: string): AdapterResult<T> {
  return { ok: false, error, demo: true };
}

/**
 * The pinned clock, shared by every adapter so repeated renders are identical.
 * Matches `NOW` in lib/trace/ledger.ts and lib/comms/send.ts.
 */
export const AZURE_NOW = "2026-06-12T09:00:00";
