import { featureLayout } from "@/lib/features/gate";

/** Gated by the `self-booking` feature. See lib/features/catalog.ts. */
export default featureLayout("self-booking");
