import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PatientRecordRequests } from "@/components/patient/PatientRecordRequests";

export const dynamic = "force-dynamic";

export default function PatientRecordsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/patient" className="mb-8 inline-flex items-center gap-2 text-detail text-teal-300 hover:text-teal-200">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to patient home
      </Link>
      <PatientRecordRequests />
    </main>
  );
}
