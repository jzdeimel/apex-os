"use client";

/**
 * The Education Centre.
 *
 * Ordering is the whole design, and it is deliberate: recommended-for-you
 * first with the reason visible, then browse by topic, then everything. A
 * member arrives with a question about their own results, not a desire to
 * browse a content library — so the first thing on the screen is six pieces
 * chosen from their labs, symptoms, goals and journey step, each carrying the
 * sentence that explains why it is there. Strip those reasons out and this is
 * a blog; that single line is the difference between a clinic and a content
 * farm, so it is never truncated and never hidden behind a hover.
 *
 * Three smaller decisions worth recording:
 *
 *  - OPPOSITE-TRACK CONTENT IS HIDDEN, NOT DOWN-RANKED (see articlesForSex).
 *    Showing a male member four perimenopause articles at rank 30 is not
 *    inclusive, it is noise. The track exists in the data, so we use it.
 *  - THE READER IS IN-PAGE, NOT A ROUTE. Reading an article should never cost
 *    a member their scroll position in a list they were part-way through.
 *  - SEARCH REPLACES THE WHOLE VIEW rather than filtering one section, because
 *    a search that quietly only looked at "everything" and missed a
 *    recommended item is a search a member stops trusting.
 */

import { useMemo, useState } from "react";
import {
  ARTICLES,
  TOPICS,
  YOUTUBE_HANDLE,
  articlesForSex,
  recommendedFor,
  searchArticles,
  type Article,
  type EducationProfile,
  type Topic,
} from "@/lib/education/library";
import { Card, CardContent, Badge, Button, Input, EmptyState } from "@/components/ui/primitives";
import { Stagger, StaggerItem, SwitchView, FadeIn } from "@/components/portal/still";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Clock,
  PlayCircle,
  Search,
  Sparkles,
  Youtube,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** Reading time appears on every card and at the top of every article. */
function ReadTime({ a }: { a: Article }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-micro text-ink-500">
      {a.format === "video" ? (
        <PlayCircle aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <Clock aria-hidden className="h-3.5 w-3.5" />
      )}
      <span className="stat-mono">{a.readMinutes}</span>
      {a.format === "video" ? " min watch" : " min read"}
    </span>
  );
}

function ArticleCard({
  a,
  reason,
  onOpen,
}: {
  a: Article;
  /** Present only on the recommended shelf. Rendered in full, never truncated. */
  reason?: string;
  onOpen: (a: Article) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      className={cn(
        "focus-ring group flex h-full w-full flex-col rounded-panel border border-ink-700/70 bg-ink-850/60 p-4 text-left transition-colors hover:border-ink-600 hover:bg-ink-850 sm:p-5",
        reason && "border-gold-400/25",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={a.format === "video" ? "info" : "neutral"}>
          {a.format === "video" ? "Video" : a.topic}
        </Badge>
        {a.format === "video" && (
          <span className="text-micro text-ink-500">{a.topic}</span>
        )}
      </div>

      <h3 className="mt-3 font-display text-body font-semibold leading-snug text-ink-50 group-hover:text-white sm:text-body">
        {a.title}
      </h3>
      <p className="mt-2 text-detail leading-relaxed text-ink-400">{a.summary}</p>

      {reason && (
        <p className="mt-3 flex items-start gap-2 rounded-panel bg-gold-400/8 px-3 py-2.5 text-micro leading-relaxed text-gold-200">
          <Sparkles aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{reason}</span>
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 pt-1">
        <ReadTime a={a} />
        <span className="text-micro font-medium text-ink-500 group-hover:text-gold-300">
          Read <span aria-hidden>→</span>
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

function Reader({ a, onBack }: { a: Article; onBack: () => void }) {
  return (
    <FadeIn className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Back to the library
      </Button>

      <article className="max-w-prose">
        <p className="label-eyebrow">{a.topic}</p>
        <h2 className="mt-2 font-display text-title font-semibold leading-tight tracking-tight text-ink-50 sm:text-display">
          {a.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ReadTime a={a} />
          {a.track !== "all" && (
            <Badge tone="neutral">{a.track === "men" ? "Men's health" : "Women's health"}</Badge>
          )}
        </div>

        <p className="mt-5 text-body font-medium leading-relaxed text-ink-200">{a.summary}</p>

        {/* Video entries reference the clinic's channel. Nothing third-party is
            embedded on a surface that also renders a member's health data. */}
        {a.format === "video" && a.videoNote && (
          <p className="mt-5 flex items-start gap-2.5 rounded-panel border border-ink-700/70 bg-ink-850/60 px-4 py-3.5 text-detail leading-relaxed text-ink-300">
            <Youtube aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            <span>{a.videoNote}</span>
          </p>
        )}

        <div className="mt-6 space-y-4">
          {a.body.map((p, i) => (
            <p key={i} className="text-body leading-[1.75] text-ink-300">
              {p}
            </p>
          ))}
        </div>

        {/* Standing disclaimer. Education is not advice, and the member's own
            provider is the one holding their full picture. */}
        <p className="mt-8 border-t border-ink-700/70 pt-5 text-micro leading-relaxed text-ink-500">
          This is general education, not medical advice, and it cannot account for your history,
          medications or results. Anything here that sounds like it applies to you is a good question
          for your next visit — your provider and coach are reading your full picture.
        </p>
      </article>
    </FadeIn>
  );
}

// ---------------------------------------------------------------------------
// Centre
// ---------------------------------------------------------------------------

export function EducationCentre({ profile }: { profile: EducationProfile }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [reading, setReading] = useState<Article | null>(null);

  // Everything this member is eligible to see. Falls back to the full library
  // if the id somehow does not resolve — an empty education page would be a
  // worse failure than showing one extra track.
  const pool = useMemo(
    () =>
      profile.sex === "male" || profile.sex === "female"
        ? articlesForSex(profile.sex)
        : ARTICLES,
    [profile.sex],
  );

  const recommended = useMemo(() => recommendedFor(profile), [profile]);

  // Ids on the shelf, so "everything" does not repeat them immediately below.
  const shelfIds = useMemo(
    () => new Set(recommended.map((r) => r.article.id)),
    [recommended],
  );

  const results = useMemo(() => searchArticles(query, pool), [query, pool]);

  // Topics that actually have content for this member — an empty chip is a
  // dead end, and the women's topics are empty for a male member by design.
  const topics = useMemo(
    () => TOPICS.filter((t) => pool.some((a) => a.topic === t)),
    [pool],
  );

  const browse = useMemo(
    () => (topic === "all" ? pool : pool.filter((a) => a.topic === topic)),
    [pool, topic],
  );

  const open = (a: Article) => setReading(a);
  const back = () => setReading(null);

  if (reading) {
    return (
      <SwitchView k={reading.id}>
        <Reader a={reading} onBack={back} />
      </SwitchView>
    );
  }

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-10">
      {/* Search ------------------------------------------------------------ */}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library — try “thyroid”, “protein”, “peptides”"
          aria-label="Search the education library"
          className="h-11 pl-9"
        />
      </div>

      {searching ? (
        <SwitchView k="search" className="space-y-4">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-heading font-semibold text-ink-50">Results</h2>
            <span className="stat-mono text-detail text-ink-500">{results.length}</span>
          </div>
          {results.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title={`Nothing in the library matches “${query.trim()}”`}
              hint="Try a broader word — or message your coach, who can answer it directly."
            />
          ) : (
            <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {results.map((a) => (
                <StaggerItem key={a.id} className="h-full">
                  <ArticleCard a={a} onOpen={open} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </SwitchView>
      ) : (
        <>
          {/* Recommended --------------------------------------------------- */}
          {recommended.length > 0 && (
            <section className="space-y-4">
              <div>
                <p className="label-eyebrow">Picked for you</p>
                <h2 className="mt-2 font-display text-title font-semibold text-ink-50 sm:text-title">
                  Start here
                </h2>
                <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
                  Chosen from your own results, the symptoms you told us about, your goals and where
                  you are in the process. Each one says why.
                </p>
              </div>

              {/* Explicit base grid-cols-1 — an implicit column sizes to content
                  and overflows a 390px viewport. */}
              <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recommended.map((r) => (
                  <StaggerItem key={r.article.id} className="h-full">
                    <ArticleCard a={r.article} reason={r.reason} onOpen={open} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          {/* Browse by topic ------------------------------------------------ */}
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-title font-semibold text-ink-50 sm:text-title">
                Browse by topic
              </h2>
              <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
                The same topics the clinic teaches, plus the foundations that sit underneath every
                plan. Videos are on the clinic&rsquo;s channel,{" "}
                <span className="text-ink-300">{YOUTUBE_HANDLE}</span>.
              </p>
            </div>

            {/* Chips rather than tabs: fifteen topics in a tab strip is a
                horizontal scroll nobody discovers the end of. */}
            <div className="flex flex-wrap gap-2">
              <TopicChip
                label="Everything"
                count={pool.length}
                active={topic === "all"}
                onClick={() => setTopic("all")}
              />
              {topics.map((t) => (
                <TopicChip
                  key={t}
                  label={t}
                  count={pool.filter((a) => a.topic === t).length}
                  active={topic === t}
                  onClick={() => setTopic(t)}
                />
              ))}
            </div>

            <SwitchView k={topic}>
              <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {browse.map((a) => (
                  <StaggerItem key={a.id} className="h-full">
                    <ArticleCard a={a} onOpen={open} />
                  </StaggerItem>
                ))}
              </Stagger>
            </SwitchView>

            {/* Only meaningful on the unfiltered view — the shelf items are
                already in `browse` above, this just names the overlap honestly. */}
            {topic === "all" && shelfIds.size > 0 && (
              <p className="text-micro leading-relaxed text-ink-500">
                <span className="stat-mono">{shelfIds.size}</span> of these are also on your
                picked-for-you shelf above.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TopicChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-detail font-medium transition-colors",
        active
          ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
          : "border-ink-700 bg-ink-850/60 text-ink-300 hover:border-ink-600 hover:text-ink-100",
      )}
    >
      {label}
      <span className={cn("stat-mono text-micro", active ? "text-gold-300" : "text-ink-500")}>
        {count}
      </span>
    </button>
  );
}
