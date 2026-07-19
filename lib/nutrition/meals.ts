import type { Client, Goal } from "@/lib/types";
import type { MacroTarget } from "@/lib/planOfCare/types";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { getClient } from "@/lib/mock/clients";

/**
 * MEAL LIBRARY.
 *
 * The plan engine already tells a member their calorie and protein target. What
 * it does not tell them is what to actually cook on a Tuesday, and that gap is
 * where nutrition plans die — a member who cannot answer "what do I eat" falls
 * back on what they ate before the plan.
 *
 * ── THREE RULES ───────────────────────────────────────────────────────────
 *
 * 1. **THESE ARE RECIPES, NOT PRESCRIPTIONS.** Everything below is ordinary
 *    food with ordinary cooking instructions. Nothing in this file is a
 *    clinical instruction, a dose, or a claim about what food does to a
 *    marker. Recipe macros are nutrition arithmetic, not a medical fact.
 *
 * 2. **RANKING IS RELATIVE TO *THIS* MEMBER.** A 50 g-protein bowl is not
 *    universally "good" — it is good for someone whose plan asks for 190 g of
 *    protein across a day. `mealsFor` scores every recipe against the member's
 *    own `MacroTarget` and shows the share of their day each meal covers, so
 *    the number on the card means something to the person reading it.
 *
 * 3. **NO INVENTED TARGETS.** This module never computes a calorie or protein
 *    target of its own. It reads `buildPlanOfCare(client).macros` and nothing
 *    else. If the plan has no macros the library still renders — unranked,
 *    and honest about why.
 *
 * Macros per recipe are stated per serving and are internally consistent with
 * 4/4/9 kcal per gram to within normal rounding.
 */

export interface Meal {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Hands-on time, in minutes. */
  minutes: number;
  tags: MealTag[];
  ingredients: string[];
  steps: string[];
  /** Goals this recipe is a natural fit for. Used as a ranking bonus only. */
  fitsGoal: Goal[];
}

export type MealTag =
  | "Breakfast"
  | "Lunch"
  | "Dinner"
  | "Snack"
  | "High protein"
  | "Carb-forward"
  | "Lower carb"
  | "One pan"
  | "Meal prep"
  | "Under 20 min"
  | "Plant-based"
  | "Budget";

/** The tags worth offering as filters, in the order a member would scan them. */
export const MEAL_FILTERS: MealTag[] = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "High protein",
  "Under 20 min",
  "Meal prep",
  "Lower carb",
  "Plant-based",
];

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const MEALS: Meal[] = [
  {
    id: "meal-01",
    name: "Overnight protein oats with berries",
    kcal: 470,
    proteinG: 45,
    carbsG: 52,
    fatG: 9,
    minutes: 5,
    tags: ["Breakfast", "High protein", "Meal prep", "Under 20 min", "Budget"],
    ingredients: [
      "60 g rolled oats",
      "200 g non-fat Greek yogurt",
      "1 scoop (30 g) vanilla whey protein",
      "150 ml skim milk",
      "100 g mixed berries",
      "1 tsp chia seeds",
      "Pinch of salt",
    ],
    steps: [
      "Stir the oats, chia, salt and milk together in a jar until there is no dry oat left.",
      "Whisk the whey into the yogurt separately first — dumping powder straight onto oats is what makes it gritty.",
      "Fold the yogurt mixture through the oats, then top with the berries.",
      "Lid on, fridge overnight. It keeps three days, so make three at once.",
      "Eat cold, straight from the jar.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain", "Energy"],
  },
  {
    id: "meal-02",
    name: "Steak and egg breakfast skillet",
    kcal: 450,
    proteinG: 44,
    carbsG: 18,
    fatG: 22,
    minutes: 18,
    tags: ["Breakfast", "High protein", "One pan", "Under 20 min"],
    ingredients: [
      "140 g sirloin steak, sliced thin",
      "2 whole eggs",
      "120 g baby potatoes, quartered and par-boiled",
      "Half a red onion, sliced",
      "1 tsp olive oil",
      "Salt, black pepper, smoked paprika",
    ],
    steps: [
      "Get the pan properly hot before the steak goes near it — a lukewarm pan steams the meat grey.",
      "Sear the steak 60–90 seconds a side, then lift it out onto a plate to rest.",
      "Same pan: potatoes cut-side down with the onion until the edges catch, about 6 minutes.",
      "Push everything to one side, crack the eggs into the space, cover for 2 minutes.",
      "Slide the steak back in with its resting juices and season.",
    ],
    fitsGoal: ["Muscle gain", "Energy", "Fat loss"],
  },
  {
    id: "meal-03",
    name: "Cottage cheese and egg white scramble",
    kcal: 280,
    proteinG: 42,
    carbsG: 10,
    fatG: 8,
    minutes: 10,
    tags: ["Breakfast", "High protein", "Lower carb", "Under 20 min", "Budget"],
    ingredients: [
      "200 g liquid egg whites",
      "100 g low-fat cottage cheese",
      "2 large handfuls of spinach",
      "2 spring onions, sliced",
      "1 tsp butter",
      "Salt, pepper, hot sauce",
    ],
    steps: [
      "Wilt the spinach in a dry pan first and tip out the water it releases, or the scramble goes soupy.",
      "Melt the butter on a low heat — egg whites turn rubbery fast on high.",
      "Add the whites and push them around slowly with a spatula.",
      "When they are still slightly wet, take the pan off the heat and fold in the cottage cheese.",
      "Return the spinach, season, finish with hot sauce.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain"],
  },
  {
    id: "meal-04",
    name: "Sheet-pan chicken thighs, potatoes and broccoli",
    kcal: 555,
    proteinG: 52,
    carbsG: 46,
    fatG: 18,
    minutes: 40,
    tags: ["Dinner", "High protein", "One pan", "Meal prep", "Budget"],
    ingredients: [
      "220 g boneless skinless chicken thighs",
      "250 g baby potatoes, halved",
      "200 g broccoli florets",
      "1 tbsp olive oil",
      "3 garlic cloves, smashed",
      "1 lemon",
      "Salt, pepper, dried oregano",
    ],
    steps: [
      "Heat the oven to 220°C / 425°F with the tray already inside — food hitting a cold tray sticks and steams.",
      "Toss the potatoes in half the oil, salt and oregano. Roast 15 minutes alone; they need the head start.",
      "Add the chicken and garlic, roast another 12 minutes.",
      "Add the broccoli with the remaining oil, roast 8 minutes more until the florets are browning at the tips.",
      "Squeeze the lemon over the whole tray off the heat.",
    ],
    fitsGoal: ["Muscle gain", "Fat loss", "Recovery"],
  },
  {
    id: "meal-05",
    name: "Grilled chicken burrito bowl",
    kcal: 575,
    proteinG: 50,
    carbsG: 62,
    fatG: 14,
    minutes: 25,
    tags: ["Lunch", "Dinner", "High protein", "Carb-forward", "Meal prep"],
    ingredients: [
      "200 g chicken breast",
      "150 g cooked white rice",
      "120 g black beans, rinsed",
      "80 g corn",
      "Half an avocado (50 g)",
      "Pico de gallo, lime, coriander",
      "1 tsp oil, cumin, chilli powder, salt",
    ],
    steps: [
      "Butterfly the breast so it is an even thickness — that single step is why restaurant chicken is not dry.",
      "Rub with oil, cumin, chilli and salt. Grill or pan-sear 4–5 minutes a side.",
      "Rest it 5 minutes before slicing. Cutting early dumps the juice on the board.",
      "Warm the beans and corn together with a pinch of cumin.",
      "Build: rice, beans and corn, sliced chicken, avocado, pico, lime over everything.",
    ],
    fitsGoal: ["Muscle gain", "Energy", "Fat loss"],
  },
  {
    id: "meal-06",
    name: "Seared salmon with jasmine rice and asparagus",
    kcal: 575,
    proteinG: 44,
    carbsG: 55,
    fatG: 20,
    minutes: 25,
    tags: ["Dinner", "High protein", "Carb-forward"],
    ingredients: [
      "180 g salmon fillet, skin on",
      "150 g cooked jasmine rice",
      "150 g asparagus, woody ends snapped off",
      "1 tsp olive oil",
      "1 tbsp soy sauce",
      "1 tsp honey",
      "Lemon, salt, pepper",
    ],
    steps: [
      "Dry the skin hard with paper towel. Wet skin will not crisp, it will only stick.",
      "Salt the skin, lay it into a hot oiled pan skin-down and press flat for 10 seconds.",
      "Leave it alone for 5–6 minutes. Flip for 90 seconds and take it out.",
      "Asparagus into the same pan for 3 minutes, then the soy and honey off the heat to glaze.",
      "Serve over the rice with a squeeze of lemon.",
    ],
    fitsGoal: ["Recovery", "Muscle gain", "Cognition"],
  },
  {
    id: "meal-07",
    name: "Big-batch turkey chilli",
    kcal: 490,
    proteinG: 48,
    carbsG: 48,
    fatG: 12,
    minutes: 45,
    tags: ["Dinner", "High protein", "Meal prep", "One pan", "Budget"],
    ingredients: [
      "500 g 93% lean ground turkey (serves 3)",
      "1 tin (400 g) kidney beans, rinsed",
      "1 tin (400 g) chopped tomatoes",
      "1 onion, 1 red pepper, 3 garlic cloves, all diced",
      "2 tbsp tomato paste",
      "1 tbsp chilli powder, 2 tsp cumin, 1 tsp smoked paprika, 1 tsp oregano",
      "250 ml chicken stock, salt",
    ],
    steps: [
      "Brown the turkey in a dry hot pot and do not stir it for the first two minutes — that crust is most of the flavour.",
      "Add the onion, pepper and garlic and cook until soft, 6 minutes.",
      "Stir the tomato paste and spices into the dry bits for 60 seconds until they smell toasted.",
      "Tomatoes, beans and stock in. Simmer uncovered 25 minutes, stirring occasionally.",
      "Season at the end, not the start. Divide into three containers; it is better on day two.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain", "Energy"],
  },
  {
    id: "meal-08",
    name: "Lean beef and pepper stir-fry",
    kcal: 540,
    proteinG: 46,
    carbsG: 58,
    fatG: 14,
    minutes: 20,
    tags: ["Dinner", "High protein", "Carb-forward", "Under 20 min", "One pan"],
    ingredients: [
      "180 g flank steak, sliced against the grain",
      "150 g cooked jasmine rice",
      "1 red pepper, 1 head of pak choi, 100 g sugar snap peas",
      "2 garlic cloves and a thumb of ginger, both minced",
      "2 tbsp soy sauce, 1 tsp sesame oil, 1 tsp cornflour",
      "1 tsp neutral oil",
    ],
    steps: [
      "Toss the beef with the cornflour and half the soy — this is velveting, and it is why takeaway beef is tender.",
      "Get the wok or widest pan smoking hot. Sear the beef in one layer for 90 seconds, then remove.",
      "Vegetables in with the garlic and ginger, 3 minutes, still on high.",
      "Beef back in with the rest of the soy and the sesame oil, toss 30 seconds.",
      "Straight onto the rice — stir-fry waits for nobody.",
    ],
    fitsGoal: ["Muscle gain", "Energy"],
  },
  {
    id: "meal-09",
    name: "Garlic shrimp rice bowl",
    kcal: 500,
    proteinG: 42,
    carbsG: 60,
    fatG: 10,
    minutes: 15,
    tags: ["Lunch", "Dinner", "High protein", "Carb-forward", "Under 20 min"],
    ingredients: [
      "220 g raw peeled shrimp",
      "160 g cooked rice",
      "4 garlic cloves, thinly sliced",
      "150 g green beans",
      "1 tsp olive oil, 1 tsp butter",
      "Chilli flakes, parsley, lemon, salt",
    ],
    steps: [
      "Pat the shrimp dry and salt them. Wet shrimp poach instead of searing.",
      "Warm the garlic slowly in the oil until pale gold — burnt garlic is bitter and unrecoverable.",
      "Shrimp in on a high heat, 90 seconds a side, no longer. They are done the moment they curl into a C.",
      "Green beans in the same pan with the butter, 3 minutes.",
      "Over rice with chilli, parsley and a hard squeeze of lemon.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain"],
  },
  {
    id: "meal-10",
    name: "Cod with white beans and kale",
    kcal: 425,
    proteinG: 45,
    carbsG: 34,
    fatG: 12,
    minutes: 25,
    tags: ["Dinner", "High protein", "One pan"],
    ingredients: [
      "200 g cod loin",
      "150 g cannellini beans, rinsed",
      "100 g kale, stems stripped",
      "2 garlic cloves, sliced",
      "150 ml chicken stock",
      "1 tbsp olive oil, lemon zest, salt, pepper",
    ],
    steps: [
      "Salt the cod and let it sit 10 minutes while you start the base — it firms the flesh so it does not fall apart.",
      "Soften the garlic in the oil, add the kale and a splash of stock, cover 4 minutes.",
      "Stir in the beans and the rest of the stock and bring to a bare simmer.",
      "Nestle the cod on top, lid on, 8 minutes. Do not stir it once the fish is in.",
      "Lemon zest and pepper over the top.",
    ],
    fitsGoal: ["Fat loss", "Recovery"],
  },
  {
    id: "meal-11",
    name: "Greek chicken salad with feta",
    kcal: 420,
    proteinG: 44,
    carbsG: 16,
    fatG: 20,
    minutes: 15,
    tags: ["Lunch", "High protein", "Lower carb", "Under 20 min", "Meal prep"],
    ingredients: [
      "180 g grilled chicken breast, sliced",
      "40 g feta",
      "1 cucumber, 200 g cherry tomatoes, half a red onion",
      "60 g Kalamata olives",
      "1 tbsp olive oil, 1 tbsp red wine vinegar, dried oregano",
      "Romaine, salt, pepper",
    ],
    steps: [
      "Salt the cucumber and tomatoes in a colander for 10 minutes and drain — otherwise the dressing turns to water by lunchtime.",
      "Soak the sliced onion in cold water for 5 minutes to take the harsh edge off.",
      "Whisk oil, vinegar and oregano with a good pinch of salt.",
      "Toss everything except the feta and chicken, then lay those on top.",
      "If you are packing this for tomorrow, keep the dressing in a separate pot.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain"],
  },
  {
    id: "meal-12",
    name: "Tuna and white bean lunch box",
    kcal: 360,
    proteinG: 40,
    carbsG: 30,
    fatG: 9,
    minutes: 8,
    tags: ["Lunch", "High protein", "Under 20 min", "Meal prep", "Budget"],
    ingredients: [
      "2 tins (280 g drained) tuna in water",
      "150 g cannellini beans, rinsed",
      "Half a red onion, finely diced",
      "1 celery stick, diced",
      "1 tbsp capers, chopped parsley",
      "Juice of a lemon, 1 tsp olive oil, black pepper",
    ],
    steps: [
      "Drain the tuna properly and flake it with a fork rather than mashing it.",
      "Rinse the beans until the water runs clear or the whole box tastes tinny.",
      "Combine everything and dress with the lemon and oil.",
      "Let it sit 10 minutes before eating — the onion and capers need a moment to mellow.",
      "Keeps two days in the fridge and needs no reheating, which is the point.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain"],
  },
  {
    id: "meal-13",
    name: "Bison and sweet potato hash",
    kcal: 490,
    proteinG: 42,
    carbsG: 44,
    fatG: 16,
    minutes: 30,
    tags: ["Breakfast", "Dinner", "High protein", "One pan", "Meal prep"],
    ingredients: [
      "180 g ground bison (or 90% lean beef)",
      "250 g sweet potato, 1 cm dice",
      "1 onion, diced",
      "1 red pepper, diced",
      "1 tsp olive oil, smoked paprika, cumin, salt",
      "Handful of coriander",
    ],
    steps: [
      "Par-cook the sweet potato in the microwave for 4 minutes. Raw dice will burn outside and stay hard inside.",
      "Brown the bison in a dry pan, break it up, then remove it and leave the fat behind.",
      "Sweet potato, onion and pepper into that fat with the oil, 10 minutes undisturbed to get colour.",
      "Meat back in with the spices, toss 2 minutes.",
      "Coriander over the top off the heat.",
    ],
    fitsGoal: ["Muscle gain", "Energy", "Recovery"],
  },
  {
    id: "meal-14",
    name: "Slow-cooker shredded chicken tacos",
    kcal: 460,
    proteinG: 46,
    carbsG: 40,
    fatG: 13,
    minutes: 15,
    tags: ["Dinner", "High protein", "Meal prep", "Budget"],
    ingredients: [
      "800 g chicken breast (serves 4)",
      "1 jar (350 g) salsa verde",
      "1 tsp cumin, 1 tsp oregano, salt",
      "8 corn tortillas",
      "Cabbage, radish, coriander, lime",
      "60 g crumbled queso fresco",
    ],
    steps: [
      "Chicken, salsa and spices into the slow cooker. No liquid beyond the salsa — the breast releases plenty.",
      "Low for 4 hours. Shred with two forks directly in the pot so it drinks the sauce back up.",
      "Char the tortillas over a flame or in a dry pan for 20 seconds a side.",
      "Two tortillas per taco if they are thin; one will tear and you will lose the filling.",
      "Top with shredded cabbage, radish, coriander, cheese and a hard squeeze of lime.",
    ],
    fitsGoal: ["Muscle gain", "Fat loss"],
  },
  {
    id: "meal-15",
    name: "Post-training protein shake",
    kcal: 460,
    proteinG: 42,
    carbsG: 46,
    fatG: 12,
    minutes: 3,
    tags: ["Snack", "High protein", "Under 20 min", "Carb-forward"],
    ingredients: [
      "1.5 scoops (45 g) whey protein",
      "1 ripe banana",
      "300 ml skim milk",
      "1 tbsp peanut butter",
      "80 g frozen berries",
      "Handful of ice",
    ],
    steps: [
      "Liquid into the blender first — powder on the bottom cements itself to the blade.",
      "Banana, peanut butter and berries next, protein last.",
      "Blend 30 seconds. If it is too thick, add milk 30 ml at a time.",
      "Drink it within the hour rather than saving it; it separates.",
    ],
    fitsGoal: ["Muscle gain", "Recovery", "Energy"],
  },
  {
    id: "meal-16",
    name: "Cottage cheese bowl with pineapple and pumpkin seeds",
    kcal: 305,
    proteinG: 32,
    carbsG: 24,
    fatG: 9,
    minutes: 3,
    tags: ["Snack", "Breakfast", "High protein", "Under 20 min", "Budget"],
    ingredients: [
      "250 g low-fat cottage cheese",
      "120 g fresh pineapple, diced",
      "15 g pumpkin seeds",
      "Cracked black pepper",
      "Optional: chilli flakes",
    ],
    steps: [
      "Toast the pumpkin seeds in a dry pan for 2 minutes until they start popping.",
      "Spoon the cottage cheese into a bowl and top with the pineapple.",
      "Seeds over the top while still warm.",
      "Black pepper. It sounds wrong on fruit and it is the thing that makes this work.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain", "Sleep"],
  },
  {
    id: "meal-17",
    name: "Turkey meatballs with marinara and zucchini",
    kcal: 400,
    proteinG: 46,
    carbsG: 18,
    fatG: 16,
    minutes: 35,
    tags: ["Dinner", "High protein", "Lower carb", "Meal prep"],
    ingredients: [
      "220 g 93% lean ground turkey",
      "1 egg white, 20 g grated parmesan, 15 g breadcrumbs",
      "2 garlic cloves, minced; oregano; salt; pepper",
      "300 ml marinara sauce",
      "2 zucchini, spiralised or ribboned",
      "1 tsp olive oil",
    ],
    steps: [
      "Mix the meatball ingredients with a light hand. Overworking the mince makes the meatballs bouncy.",
      "Roll into 8 balls and chill them 10 minutes so they hold together in the pan.",
      "Brown all over in the oil, 5 minutes, then pour the marinara in and simmer covered 12 minutes.",
      "Salt the zucchini ribbons and let them drain while the sauce cooks, then dry them.",
      "Toss the zucchini through the hot sauce for 60 seconds only — any longer and it goes limp.",
    ],
    fitsGoal: ["Fat loss", "Muscle gain"],
  },
  {
    id: "meal-18",
    name: "Pork tenderloin with quinoa and roast carrots",
    kcal: 485,
    proteinG: 48,
    carbsG: 46,
    fatG: 12,
    minutes: 35,
    tags: ["Dinner", "High protein", "Meal prep"],
    ingredients: [
      "200 g pork tenderloin",
      "150 g cooked quinoa",
      "250 g carrots, cut into batons",
      "1 tbsp Dijon mustard, 1 tsp honey",
      "1 tsp olive oil, thyme, salt, pepper",
    ],
    steps: [
      "Trim the silverskin off the tenderloin — it does not render and it will curl the meat in the pan.",
      "Sear the loin on all four sides in a hot ovenproof pan, about 6 minutes total.",
      "Brush with the mustard and honey, add the carrots and thyme around it, roast at 200°C / 400°F for 15 minutes.",
      "Rest the pork 8 minutes before slicing. This one is not optional; tenderloin is unforgiving.",
      "Slice thickly and serve over the quinoa with the pan juices.",
    ],
    fitsGoal: ["Muscle gain", "Fat loss"],
  },
  {
    id: "meal-19",
    name: "Tofu and edamame stir-fry",
    kcal: 470,
    proteinG: 34,
    carbsG: 48,
    fatG: 16,
    minutes: 25,
    tags: ["Dinner", "Plant-based", "Carb-forward", "Budget"],
    ingredients: [
      "250 g extra-firm tofu, pressed and cubed",
      "120 g shelled edamame",
      "150 g cooked brown rice",
      "1 head broccoli, small florets",
      "2 tbsp soy sauce, 1 tbsp rice vinegar, 1 tsp sesame oil, 1 tsp cornflour",
      "Garlic, ginger, spring onion",
    ],
    steps: [
      "Press the tofu under something heavy for 20 minutes. Skipping this is why home tofu steams instead of crisping.",
      "Toss the cubes in cornflour and fry in a hot pan without moving them for 3 minutes a side.",
      "Remove the tofu, then broccoli and edamame in with the garlic and ginger and a splash of water, lid on 3 minutes.",
      "Sauce in, tofu back, toss 30 seconds so it glazes rather than soaks.",
      "Over the rice with spring onion.",
    ],
    fitsGoal: ["Fat loss", "Energy"],
  },
  {
    id: "meal-20",
    name: "Sirloin steak salad",
    kcal: 410,
    proteinG: 48,
    carbsG: 14,
    fatG: 18,
    minutes: 20,
    tags: ["Dinner", "Lunch", "High protein", "Lower carb", "Under 20 min"],
    ingredients: [
      "200 g sirloin steak",
      "Mixed leaves, 150 g cherry tomatoes, half a red onion",
      "30 g blue cheese",
      "1 tbsp olive oil, 1 tbsp balsamic vinegar, 1 tsp Dijon",
      "Salt, coarse black pepper",
    ],
    steps: [
      "Take the steak out of the fridge 30 minutes early and salt it heavily on both sides.",
      "Very hot dry pan, 3 minutes a side for medium-rare on a 2 cm steak. Press it flat only once.",
      "Rest 8 minutes on a board. Slice against the grain — you can see which way the fibres run.",
      "Whisk the oil, balsamic and Dijon and dress the leaves lightly.",
      "Steak and its board juices over the top, then the blue cheese.",
    ],
    fitsGoal: ["Muscle gain", "Fat loss", "Libido"],
  },
  {
    id: "meal-21",
    name: "Almond-crumb chicken parm",
    kcal: 450,
    proteinG: 52,
    carbsG: 20,
    fatG: 18,
    minutes: 30,
    tags: ["Dinner", "High protein", "Lower carb"],
    ingredients: [
      "220 g chicken breast, butterflied",
      "40 g ground almonds, 20 g parmesan",
      "1 egg white",
      "200 ml marinara",
      "40 g low-moisture mozzarella",
      "Oregano, salt, pepper, oil spray",
    ],
    steps: [
      "Pound the butterflied breast to an even 1 cm. Uneven thickness is the only reason chicken parm goes dry.",
      "Egg white first, then the almond and parmesan mix pressed on firmly.",
      "Bake on a wire rack at 200°C / 400°F for 15 minutes. A rack, not a tray — the underside needs air or it steams.",
      "Spoon over the marinara, add the mozzarella, back in for 6 minutes.",
      "Rest 3 minutes so the cheese sets enough to cut.",
    ],
    fitsGoal: ["Muscle gain", "Fat loss"],
  },
  {
    id: "meal-22",
    name: "Egg and turkey bacon breakfast burrito",
    kcal: 415,
    proteinG: 38,
    carbsG: 34,
    fatG: 14,
    minutes: 15,
    tags: ["Breakfast", "High protein", "Meal prep", "Under 20 min", "Budget"],
    ingredients: [
      "2 whole eggs + 120 g egg whites",
      "3 rashers turkey bacon",
      "1 large flour tortilla",
      "30 g reduced-fat cheddar",
      "Handful of spinach, salsa",
      "Salt, pepper",
    ],
    steps: [
      "Crisp the turkey bacon first and chop it; leave the rendered fat in the pan.",
      "Scramble the eggs low and slow in that pan and pull them while still glossy.",
      "Warm the tortilla for 15 seconds a side so it folds instead of cracking.",
      "Fill in a line just below centre: eggs, bacon, cheese, spinach, salsa. Overfilling is why burritos burst.",
      "Fold the sides in, roll tight, then sear the seam-side down for 30 seconds to seal it.",
    ],
    fitsGoal: ["Muscle gain", "Energy", "Fat loss"],
  },
];

export const mealById: Record<string, Meal> = Object.fromEntries(
  MEALS.map((m) => [m.id, m]),
);

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------

/** A recipe scored against one member's own targets. */
export interface MealFit {
  meal: Meal;
  /** 0–100. Only meaningful relative to the other meals in the same list. */
  score: number;
  /** Percentage of the member's daily target this one serving covers. */
  shareOfDay: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  /** One sentence, in the member's own numbers, explaining the placement. */
  fitNote: string;
  /** Goals of theirs this recipe lines up with. */
  matchedGoals: Goal[];
}

/** Grams of protein per 100 kcal — the single number that decides ranking. */
function proteinDensity(proteinG: number, kcal: number): number {
  return kcal > 0 ? (proteinG * 100) / kcal : 0;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Score one recipe against one member's targets.
 *
 * Protein density does the heavy lifting: a member whose plan asks for a lot of
 * protein relative to their calories needs meals built the same way, and every
 * plan this engine produces is protein-forward by construction (2.4 g/kg lean
 * mass). Goal overlap is a modest bonus, not the driver — a recipe tagged
 * "Fat loss" that does not carry protein is still the wrong recipe.
 */
function scoreMeal(meal: Meal, macros: MacroTarget, goals: Goal[]): number {
  const target = proteinDensity(macros.proteinG, macros.calories);
  const actual = proteinDensity(meal.proteinG, meal.kcal);
  const ratio = target > 0 ? actual / target : 1;

  // Clearing the member's own protein-per-calorie ratio is the bar, and it is
  // worth 0.6 on its own. Above the bar the score keeps climbing with
  // diminishing returns, and — deliberately — never saturates: any hard cap
  // flattens the library to one score for members whose plan asks for a modest
  // protein ratio, which is most of them, and a ranking where everything ties
  // is not a ranking. Below the bar it falls away sharply, which is the bar
  // doing its job.
  const over = Math.max(0, ratio - 1) / 2;
  const density = ratio >= 1 ? 0.6 + 0.4 * (1 - 1 / (1 + over)) : 0.6 * ratio;

  const overlap = meal.fitsGoal.filter((g) => goals.includes(g)).length;
  const goalBonus = Math.min(0.15, overlap * 0.05);

  // A single serving that eats more than half the day's calories is awkward to
  // fit around anything else, however good its macros are.
  const share = meal.kcal / macros.calories;
  const sizePenalty = share > 0.5 ? Math.min(0.2, (share - 0.5) * 1.2) : 0;

  return Math.round(Math.max(0, Math.min(1, density * 0.85 + goalBonus - sizePenalty)) * 100);
}

function fitNoteFor(meal: Meal, macros: MacroTarget, share: MealFit["shareOfDay"]): string {
  const remainingProtein = Math.max(0, macros.proteinG - meal.proteinG);
  return (
    `${meal.proteinG} g protein is ${share.protein}% of your ${macros.proteinG} g day, ` +
    `for ${share.calories}% of your calories. Leaves ${remainingProtein} g of protein to find across your other meals.`
  );
}

/**
 * The member's library, ranked.
 *
 * Returns every meal — nothing is hidden, because a filtered library teaches a
 * member that most food is off-limits, which is both untrue and the fastest
 * route to falling off a plan. The ranking is the guidance.
 *
 * Returns an empty array for an unknown client rather than throwing; a portal
 * page should degrade to an empty state, not a crash.
 */
export function mealsFor(clientId: string): MealFit[] {
  const client = getClient(clientId);
  if (!client) return [];

  const plan = buildPlanOfCare(client);
  const macros = plan.macros;
  if (!macros) return [];

  const fits = MEALS.map<MealFit>((meal) => {
    const shareOfDay = {
      calories: pct(meal.kcal, macros.calories),
      protein: pct(meal.proteinG, macros.proteinG),
      carbs: pct(meal.carbsG, macros.carbsG),
      fat: pct(meal.fatG, macros.fatG),
    };
    return {
      meal,
      score: scoreMeal(meal, macros, client.goals),
      shareOfDay,
      fitNote: fitNoteFor(meal, macros, shareOfDay),
      matchedGoals: meal.fitsGoal.filter((g) => client.goals.includes(g)),
    };
  });

  // Ties break on id so the order is identical on every render and machine.
  return fits.sort((a, b) => b.score - a.score || (a.meal.id < b.meal.id ? -1 : 1));
}

/** The macro targets these rankings were computed against, for display. */
export function targetsFor(clientId: string): MacroTarget | undefined {
  const client: Client | undefined = getClient(clientId);
  return client ? buildPlanOfCare(client).macros : undefined;
}

/**
 * Distance from a slot's share of the day.
 *
 * Calories carry twice the weight of protein. This library is uniformly
 * protein-forward, so weighting them equally drags every slot toward the
 * smallest recipe available — technically the closest on protein, and a day
 * that leaves the member 800 kcal short. Energy is the harder constraint to
 * satisfy, so it gets the larger say.
 */
function slotCost(f: MealFit, macros: MacroTarget, share: number): number {
  const kcalTarget = macros.calories * share;
  const proteinTarget = macros.proteinG * share;
  return (
    (2 * Math.abs(f.meal.kcal - kcalTarget)) / kcalTarget +
    Math.abs(f.meal.proteinG - proteinTarget) / proteinTarget
  );
}

/**
 * Typical share of a day's energy per slot. Not a rule — just the shape most
 * people's days already have, which is what makes the sample day copyable.
 */
const SLOTS: { tag: MealTag; share: number }[] = [
  { tag: "Breakfast", share: 0.25 },
  { tag: "Lunch", share: 0.3 },
  { tag: "Dinner", share: 0.35 },
  { tag: "Snack", share: 0.1 },
];

/**
 * A worked example of hitting the day.
 *
 * NOT simply the four highest-ranked meals. Ranking answers "is this a good
 * meal for me"; a day has to answer "does this add up", and stacking the four
 * densest recipes produces a day at 190 g of protein against a 105 g target,
 * which is not a day anybody would eat and is a bad thing to show as an
 * example. Each slot picks the meal closest to that slot's share of the
 * member's calorie AND protein targets, with ranking as the tiebreak.
 */
export function sampleDayFor(clientId: string): { meals: MealFit[]; totals: { kcal: number; proteinG: number; carbsG: number; fatG: number } } {
  const ranked = mealsFor(clientId);
  const macros = targetsFor(clientId);

  const used = new Set<string>();
  const out: MealFit[] = [];

  for (const slot of SLOTS) {
    const candidates = ranked.filter((f) => f.meal.tags.includes(slot.tag) && !used.has(f.meal.id));
    if (candidates.length === 0) continue;

    const best = macros
      ? candidates
          .slice()
          .sort((a, b) => slotCost(a, macros, slot.share) - slotCost(b, macros, slot.share) || b.score - a.score)[0]
      : candidates[0];

    used.add(best.meal.id);
    out.push(best);
  }

  const totals = out.reduce(
    (acc, f) => ({
      kcal: acc.kcal + f.meal.kcal,
      proteinG: acc.proteinG + f.meal.proteinG,
      carbsG: acc.carbsG + f.meal.carbsG,
      fatG: acc.fatG + f.meal.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  return { meals: out, totals };
}
