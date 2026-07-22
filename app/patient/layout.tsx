import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
  if (!subject) redirect("/patient-sign-in");
  return children;
}
