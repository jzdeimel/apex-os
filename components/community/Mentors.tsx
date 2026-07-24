"use client";

import { Compass, GraduationCap, Check, HandHeart, X } from "lucide-react";
import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { useMentors, SPECIALTY_LABEL } from "@/lib/community/mentors";

/**
 * Guides. A newcomer finds someone who's been where they are; an experienced
 * member offers to be that person. Never a substitute for the clinician —
 * companionship for the parts that are lonely rather than medical.
 */
export function Mentors({
  clientId,
  memberActions = true,
}: {
  clientId: string;
  memberActions?: boolean;
}) {
  const { toast } = useToast();
  const {
    guides,
    requestedGuideId,
    volunteering,
    canBeGuide,
    hydrated,
    requestGuide,
    cancelRequest,
    toggleVolunteer,
  } = useMentors(clientId);

  const requested = guides.find((g) => g.clientId === requestedGuideId);

  return (
    <div className="space-y-5">
      <p className="max-w-prose text-body leading-relaxed text-ink-400">
        The most reassuring voice isn&apos;t the clinic — it&apos;s someone who was exactly this anxious
        six months ago and is fine now. Find a guide, or become one.
      </p>

      {/* Your current guide, if requested */}
      {memberActions && hydrated && requested && (
        <Card className="border-emerald/25">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald/12 text-emerald">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <p className="text-body font-medium text-ink-50">{requested.handle} is your guide</p>
                <p className="text-detail text-ink-500">{SPECIALTY_LABEL[requested.specialty]} · {requested.monthsIn} months in</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { cancelRequest(); toast("Request cancelled"); }}
              className="focus-ring inline-flex items-center gap-1 text-micro text-ink-500 hover:text-high"
            >
              <X className="h-3.5 w-3.5" /> End
            </button>
          </CardContent>
        </Card>
      )}

      {/* Become a guide */}
      {memberActions && hydrated && canBeGuide && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-500/12 text-gold-300">
                <HandHeart className="h-5 w-5" />
              </span>
              <div>
                <p className="text-body font-medium text-ink-50">You could guide someone</p>
                <p className="text-detail text-ink-500">You&apos;ve been at this long enough to be the voice you needed early on.</p>
              </div>
            </div>
            <Button
              size="sm"
              variant={volunteering ? "success" : "outline"}
              onClick={() => { toggleVolunteer(); toast(volunteering ? "No longer volunteering" : "You're on the guide list", { desc: volunteering ? undefined : "Newcomers can now request you" }); }}
            >
              {volunteering ? <><Check className="h-3.5 w-3.5" /> Volunteering</> : <>Become a guide</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Available guides */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-heading text-ink-50">
          <Compass className="h-4 w-4 text-gold-400" /> Guides who&apos;ve been there
        </h3>
        {guides.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-detail text-ink-500">No guides available right now — check back soon.</CardContent></Card>
        ) : (
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {guides.map((g) => {
              const isMine = g.clientId === requestedGuideId;
              return (
                <StaggerItem key={g.clientId}>
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 text-micro font-semibold text-ink-200">
                            {g.handle.slice(0, 2)}
                          </span>
                          <div>
                            <p className="text-body font-medium text-ink-50">{g.handle}</p>
                            <p className="text-micro text-ink-500">Level {g.level} · {g.monthsIn} months in</p>
                          </div>
                        </div>
                        <Badge tone="gold">
                          <GraduationCap className="h-3 w-3" />
                          {SPECIALTY_LABEL[g.specialty]}
                        </Badge>
                      </div>
                      <p className="flex-1 text-detail leading-relaxed text-ink-400">“{g.note}”</p>
                      {memberActions ? (
                      <Button
                        size="sm"
                        variant={isMine ? "success" : "primary"}
                        disabled={!!requestedGuideId && !isMine}
                        onClick={() => {
                          if (isMine) return;
                          requestGuide(g.clientId);
                          toast(`${g.handle} is now your guide`, { desc: "Say hi when you're ready" });
                        }}
                      >
                        {isMine ? <><Check className="h-3.5 w-3.5" /> Your guide</> : requestedGuideId ? "Guide chosen" : "Ask to be guided"}
                      </Button>
                      ) : (
                        <Badge tone="neutral">Available to members</Badge>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </div>
    </div>
  );
}
