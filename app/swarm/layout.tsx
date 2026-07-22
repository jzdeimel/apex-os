import { featureLayout } from "@/lib/features/gate";

/** Gated by the `background-agents` feature. See lib/features/catalog.ts. */
export default featureLayout("background-agents");
