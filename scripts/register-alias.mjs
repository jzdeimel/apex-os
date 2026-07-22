import { register } from "node:module";

/**
 * Registers the `@/` resolver for `node --import ./scripts/register-alias.mjs`.
 * Split from the hooks themselves because Node loads hooks on a separate
 * thread — they cannot be registered from inside the file that defines them.
 */
register("./alias-hooks.mjs", import.meta.url);
