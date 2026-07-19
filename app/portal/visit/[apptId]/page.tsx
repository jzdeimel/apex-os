"use client";

/**
 * /portal/visit/[apptId] — the telehealth room for one appointment.
 *
 * Its own route rather than a modal on the home screen, deliberately: the join
 * link a member gets by text has to land somewhere specific and survive being
 * reopened, and a member fumbling for a modal two minutes before their visit is
 * the failure this whole feature exists to remove.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalHeader";
import { VisitRoom } from "@/components/portal/VisitRoom";

export default function VisitRoomPage() {
  const params = useParams<{ apptId: string }>();
  const apptId = Array.isArray(params?.apptId) ? params.apptId[0] : params?.apptId;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6">
      <Link
        href="/portal/book-visit"
        className="inline-flex items-center gap-1.5 rounded-lg text-[13px] text-ink-400 transition-colors hover:text-ink-100 focus-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Appointments
      </Link>

      <PortalPageHeader
        eyebrow="Telehealth"
        title="Your visit room"
        subtitle="Run the checks, then join. Your plan and what you talked about last time are on this screen so the visit doesn't start from scratch."
      />

      <VisitRoom apptId={apptId ?? ""} />
    </div>
  );
}
