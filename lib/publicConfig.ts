function truthy(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

/**
 * Browser-visible feature flags only.
 *
 * Keep this separate from lib/config.ts so client components never import the
 * server-side APEX_DEMO_MODE flag by accident. Anything exported here is baked
 * into the browser bundle and must be safe for a member/staff device to know.
 */
export const IS_DEMO_UI = truthy(process.env.NEXT_PUBLIC_APEX_DEMO_MODE);
