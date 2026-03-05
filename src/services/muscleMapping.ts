export type MuscleTarget = {
  primary: string[];
  secondary: string[];
};

// Rules checked in order — first match wins
const RULES: Array<{ keywords: string[]; primary: string[]; secondary: string[] }> = [
  // ─── Chest ──────────────────────────────────────────────────────────────────
  { keywords: ["incline bench", "incline press"],
    primary: ["chest", "front_delts"], secondary: ["triceps"] },
  { keywords: ["decline bench", "decline press"],
    primary: ["chest"], secondary: ["triceps"] },
  { keywords: ["bench press", "chest press", "push-up", "push up", "floor press"],
    primary: ["chest", "front_delts"], secondary: ["triceps"] },
  { keywords: ["fly", "flye", "crossover", "pec deck", "pec"],
    primary: ["chest"], secondary: ["front_delts"] },

  // ─── Back ───────────────────────────────────────────────────────────────────
  { keywords: ["lat pulldown", "pulldown"],
    primary: ["back_lats"], secondary: ["biceps", "rear_delts"] },
  { keywords: ["pull-up", "pull up", "chin-up", "chin up", "pullup", "chinup"],
    primary: ["back_lats", "biceps"], secondary: ["rear_delts"] },
  { keywords: ["romanian deadlift", "rdl", "stiff leg deadlift"],
    primary: ["hamstrings", "glutes"], secondary: ["lower_back"] },
  { keywords: ["deadlift"],
    primary: ["back_lats", "lower_back", "hamstrings", "glutes"], secondary: ["traps", "forearms"] },
  { keywords: ["row", "cable row", "seated row"],
    primary: ["back_lats", "rear_delts"], secondary: ["biceps"] },
  { keywords: ["shrug"],
    primary: ["traps"], secondary: [] },

  // ─── Shoulders ──────────────────────────────────────────────────────────────
  { keywords: ["shoulder press", "overhead press", "military press", "ohp", "arnold press"],
    primary: ["front_delts", "side_delts"], secondary: ["triceps", "traps"] },
  { keywords: ["lateral raise", "side raise", "cable lateral"],
    primary: ["side_delts"], secondary: ["traps"] },
  { keywords: ["front raise"],
    primary: ["front_delts"], secondary: ["side_delts"] },
  { keywords: ["rear delt", "reverse fly", "reverse flye", "face pull"],
    primary: ["rear_delts"], secondary: ["traps", "back_lats"] },

  // ─── Arms ───────────────────────────────────────────────────────────────────
  { keywords: ["bicep curl", "biceps curl", "barbell curl", "dumbbell curl",
               "hammer curl", "preacher curl", "cable curl", "ez curl", "ez-curl"],
    primary: ["biceps"], secondary: ["forearms"] },
  { keywords: ["skull crusher", "lying tricep", "overhead extension", "tricep extension",
               "pressdown", "pushdown", "tricep pushdown", "tricep pulldown"],
    primary: ["triceps"], secondary: [] },
  { keywords: ["tricep", "triceps"],
    primary: ["triceps"], secondary: [] },
  { keywords: ["dip"],
    primary: ["triceps", "chest"], secondary: ["front_delts"] },
  { keywords: ["wrist curl", "forearm curl", "forearm"],
    primary: ["forearms"], secondary: [] },

  // ─── Legs ───────────────────────────────────────────────────────────────────
  { keywords: ["hip thrust", "glute bridge", "glute drive"],
    primary: ["glutes"], secondary: ["hamstrings"] },
  { keywords: ["leg curl", "hamstring curl", "lying curl", "seated curl"],
    primary: ["hamstrings"], secondary: [] },
  { keywords: ["leg extension", "quad extension"],
    primary: ["quads"], secondary: [] },
  { keywords: ["calf raise", "calf press", "standing calf", "seated calf"],
    primary: ["calves"], secondary: [] },
  { keywords: ["lunge", "split squat", "bulgarian"],
    primary: ["quads", "glutes"], secondary: ["hamstrings"] },
  { keywords: ["squat", "leg press", "hack squat"],
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core"] },

  // ─── Core ───────────────────────────────────────────────────────────────────
  { keywords: ["plank", "crunch", "sit-up", "sit up", "situp", "ab rollout",
               "ab wheel", "russian twist", "cable crunch", "hanging leg"],
    primary: ["core"], secondary: ["hip_flexors"] },
];

const MUSCLE_GROUP_FALLBACK: Record<string, MuscleTarget> = {
  chest:     { primary: ["chest"], secondary: [] },
  back:      { primary: ["back_lats"], secondary: [] },
  shoulders: { primary: ["side_delts", "front_delts"], secondary: [] },
  legs:      { primary: ["quads", "glutes"], secondary: [] },
  biceps:    { primary: ["biceps"], secondary: [] },
  triceps:   { primary: ["triceps"], secondary: [] },
  core:      { primary: ["core"], secondary: [] },
};

/** Map an exercise name (and optional custom muscleGroup) to SVG muscle IDs. */
export function getMuscleTargets(exerciseName: string, muscleGroup?: string): MuscleTarget {
  const lower = exerciseName.toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return { primary: rule.primary, secondary: rule.secondary };
    }
  }

  if (muscleGroup) {
    return MUSCLE_GROUP_FALLBACK[muscleGroup.toLowerCase()] ?? { primary: [], secondary: [] };
  }

  return { primary: [], secondary: [] };
}

/** Map broad ProgressPage group names to SVG muscle IDs. */
export const PROGRESS_GROUP_TO_MUSCLES: Record<string, string[]> = {
  Chest:     ["chest"],
  Back:      ["back_lats", "lower_back", "traps"],
  Shoulders: ["front_delts", "side_delts", "rear_delts"],
  Legs:      ["quads", "hamstrings", "glutes", "calves"],
  Biceps:    ["biceps"],
  Triceps:   ["triceps"],
  Core:      ["core", "hip_flexors"],
};
