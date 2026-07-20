"use client";

import * as React from "react";
import { ChevronDown, Clock, Flame, UtensilsCrossed, Info } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  MEAL_FILTERS,
  mealsFor,
  sampleDayFor,
  targetsFor,
  type MealFit,
  type MealTag,
} from "@/lib/nutrition/meals";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * MEAL LIBRARY.
 *
 * Two jobs, in this order:
 *
 *   1. Show the member the targets their plan set and where they came from. A
 *      calorie number with no visible origin reads as a number someone made up.
 *   2. Show them food, ranked against those targets, with the arithmetic done —
 *      "45 g protein is 24% of your day" — so no one has to open a calculator.
 *
 * Nothing here is presented as a clinical instruction. It is a cookbook that
 * knows the member's numbers.
 *
 * Phone-first: every grid declares an explicit base column count, the macro
 * tiles are 2-up at 390px, and the filter strip scrolls rather than wrapping
 * into a wall.
 */

function MacroTile({
  label,
  value,
  unit,
  lead,
}: {
  label: string;
  value: number;
  unit: string;
  lead?: boolean;
}) {
  return (
    <div
      className={cn(
        "hairline rounded-panel border p-3.5",
        lead ? "border-gold-400/25 bg-gold-400/[0.06]" : "bg-ink-900/50",
      )}
    >
      <p className="text-micro uppercase tracking-wide text-ink-500">{label}</p>
      <p className="stat-mono mt-1 text-title font-semibold text-ink-50">
        {value.toLocaleString()}
        <span className="ml-0.5 text-micro font-normal text-ink-400">{unit}</span>
      </p>
    </div>
  );
}

function MacroBar({ fit }: { fit: MealFit }) {
  const parts = [
    { label: "P", grams: fit.meal.proteinG, tone: "bg-gold-400" },
    { label: "C", grams: fit.meal.carbsG, tone: "bg-low/70" },
    { label: "F", grams: fit.meal.fatG, tone: "bg-watch/70" },
  ];
  const kcal = [fit.meal.proteinG * 4, fit.meal.carbsG * 4, fit.meal.fatG * 9];
  const total = kcal.reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-700/70">
        {parts.map((p, i) => (
          <div key={p.label} className={p.tone} style={{ width: `${(kcal[i] / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.label} className="text-micro text-ink-400">
            <span className="stat-mono font-medium text-ink-100">{p.grams} g</span>{" "}
            {p.label === "P" ? "protein" : p.label === "C" ? "carbs" : "fat"}
          </span>
        ))}
      </div>
    </div>
  );
}

function MealCard({ fit, index }: { fit: MealFit; index: number }) {
  const [open, setOpen] = React.useState(false);
  const { meal } = fit;
  const panelId = `meal-panel-${meal.id}`;

  return (
    <Card className="motion-safe:animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-display text-heading font-semibold leading-snug text-ink-50">
            {meal.name}
          </h3>
          <span className="stat-mono shrink-0 rounded-control border border-ink-700 px-2 py-0.5 text-micro text-ink-300">
            {meal.kcal} kcal
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="stat-mono">{meal.minutes}</span> min
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5" />
            <span className="stat-mono">{fit.shareOfDay.protein}%</span> of your protein
          </span>
        </div>

        <div className="mt-3.5">
          <MacroBar fit={fit} />
        </div>

        {/* The whole point: what this meal does to THEIR day. */}
        <p className="mt-3 text-detail leading-relaxed text-ink-400">{fit.fitNote}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {fit.matchedGoals.map((g) => (
            <Badge key={g} tone="gold">
              {g}
            </Badge>
          ))}
          {meal.tags.slice(0, 3).map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-control text-detail font-medium text-gold-300 hover:text-gold-200"
        >
          {open ? "Hide the recipe" : "How to make it"}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>

        {open && (
          <div id={panelId} className="mt-4 grid grid-cols-1 gap-5 border-t border-ink-700/70 pt-4 sm:grid-cols-2">
            <div>
              <p className="label-eyebrow">What you need</p>
              <ul className="mt-2 space-y-1.5">
                {meal.ingredients.map((ing) => (
                  <li key={ing} className="flex gap-2 text-detail leading-relaxed text-ink-300">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-500" />
                    {ing}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label-eyebrow">How to make it</p>
              <ol className="mt-2 space-y-2.5">
                {meal.steps.map((step, i) => (
                  <li key={step} className="flex gap-2.5 text-detail leading-relaxed text-ink-300">
                    <span className="stat-mono mt-px shrink-0 text-micro font-semibold text-gold-300">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MealLibrary({ client }: { client: Client }) {
  const [filter, setFilter] = React.useState<MealTag | "All">("All");

  const targets = targetsFor(client.id);
  const ranked = mealsFor(client.id);
  const day = sampleDayFor(client.id);

  const shown = filter === "All" ? ranked : ranked.filter((f) => f.meal.tags.includes(filter));

  if (!targets || ranked.length === 0) {
    return (
      <EmptyState
        title="We don't have your targets yet"
        hint="Once your plan is built, this page ranks every recipe against your own numbers."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Targets, with their origin ------------------------------------- */}
      <Card>
        <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-gold-300" />
            <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
              What your day is aiming at
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <MacroTile lead label="Calories" value={targets.calories} unit="kcal" />
            <MacroTile label="Protein" value={targets.proteinG} unit="g" />
            <MacroTile label="Carbs" value={targets.carbsG} unit="g" />
            <MacroTile label="Fat" value={targets.fatG} unit="g" />
          </div>

          {/* The basis renders verbatim — a target you cannot trace is a
              target you argue with. */}
          <p className="mt-3.5 flex items-start gap-2 text-detail leading-relaxed text-ink-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
            {targets.basis}
          </p>
        </CardContent>
      </Card>

      {/* A worked day ---------------------------------------------------- */}
      {day.meals.length > 0 && (
        <Card>
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
            <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
              What a day could look like
            </h2>
            <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
              Your four best-fitting meals, one from each part of the day. This is a shape to copy, not a
              plan you have to follow — swap anything for anything else in the list below.
            </p>

            <ul className="mt-4 space-y-2">
              {day.meals.map((f) => (
                <li
                  key={f.meal.id}
                  className="hairline flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-panel border bg-ink-900/50 p-3.5"
                >
                  <span className="min-w-0 text-detail text-ink-100">{f.meal.name}</span>
                  <span className="stat-mono shrink-0 text-detail text-ink-400">
                    {f.meal.kcal} kcal · {f.meal.proteinG} g protein
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-panel border border-ink-700 bg-ink-900 p-3.5">
              <span className="text-detail font-medium text-ink-50">That day totals</span>
              <span className="stat-mono shrink-0 text-body font-semibold text-ink-50">
                {day.totals.kcal.toLocaleString()} kcal · {day.totals.proteinG} g protein
              </span>
            </div>
            {/* State the comparison rather than asserting it is close. A day
                that lands 600 kcal short is a normal thing for a four-meal
                example to do, and pretending otherwise is how a member ends up
                undereating while believing they followed the page. */}
            <p className="mt-2 text-micro leading-relaxed text-ink-500">
              Your targets are {targets.calories.toLocaleString()} kcal and {targets.proteinG} g protein, so
              this day runs{" "}
              <span className="stat-mono text-ink-300">
                {Math.abs(day.totals.kcal - targets.calories).toLocaleString()} kcal{" "}
                {day.totals.kcal < targets.calories ? "under" : "over"}
              </span>{" "}
              and{" "}
              <span className="stat-mono text-ink-300">
                {Math.abs(day.totals.proteinG - targets.proteinG)} g{" "}
                {day.totals.proteinG < targets.proteinG ? "under" : "over"}
              </span>{" "}
              on protein. Nobody hits it to the gram — close the gap with the sides and portions you
              already like, or ask your coach what they would add.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters ---------------------------------------------------------- */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(["All", ...MEAL_FILTERS] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t as MealTag | "All")}
            className={cn(
              "focus-ring shrink-0 rounded-control border px-3.5 py-1.5 text-detail font-medium transition-colors motion-reduce:transition-none",
              filter === t
                ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* The library ------------------------------------------------------ */}
      <div>
        <p className="text-detail text-ink-500">
          <span className="stat-mono text-ink-300">{shown.length}</span> recipes, best fit for your targets
          first.
        </p>
        {shown.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing under that filter yet" hint="Try another one — the library is still growing." />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {shown.map((f, i) => (
              <MealCard key={f.meal.id} fit={f} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
