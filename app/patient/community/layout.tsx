import { cookies } from "next/headers";

import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { memberFeatureLayout } from "@/lib/features/gate";

export default memberFeatureLayout("community", async () => {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
  return subject?.clientId ?? null;
});
