import { notFound } from "next/navigation";

import DemoGuidePage from "@/components/entry/DemoGuidePage";
import { IS_DEMO } from "@/lib/config";

export default function DemoRoute() {
  if (!IS_DEMO) notFound();
  return <DemoGuidePage />;
}
