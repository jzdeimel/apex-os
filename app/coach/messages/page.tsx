import { CoachInbox } from "@/components/messaging/CoachInbox";

export default function CoachMessagesPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">COACH</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">Patient messages</h1>
        <p className="mt-2 max-w-3xl text-body text-ink-400">
          Your assigned patients reach you here. Reply directly, or preserve their exact words and push a clinical question into Medical’s accountable queue.
        </p>
      </header>
      <CoachInbox />
    </div>
  );
}

