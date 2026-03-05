import type { UserProfile, NutritionSettings } from "../db/types";

// ─── Activity Multiplier Defaults ────────────────────────────────────────────

export function defaultActivityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 1) return 1.2;
  if (daysPerWeek <= 3) return 1.375;
  if (daysPerWeek <= 5) return 1.55;
  return 1.725;
}

// ─── TDEE (Mifflin-St Jeor) ──────────────────────────────────────────────────

export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: "male" | "female",
  activityMultiplier: number
): number {
  const bmr =
    gender === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  return Math.round(bmr * activityMultiplier);
}

// ─── Caloric Target ───────────────────────────────────────────────────────────

export function caloricTarget(tdee: number, goalMode: "cut" | "maintain" | "bulk"): number {
  if (goalMode === "cut") return Math.max(1200, tdee - 500);
  if (goalMode === "bulk") return tdee + 300;
  return tdee;
}

// ─── Macro Split ──────────────────────────────────────────────────────────────

const MACRO_SPLIT: Record<"cut" | "maintain" | "bulk", { protein: number; carbs: number; fat: number }> = {
  cut:      { protein: 0.40, carbs: 0.35, fat: 0.25 },
  maintain: { protein: 0.30, carbs: 0.40, fat: 0.30 },
  bulk:     { protein: 0.25, carbs: 0.50, fat: 0.25 },
};

export function calculateMacros(
  tdee: number,
  goalMode: "cut" | "maintain" | "bulk"
): { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number } {
  const calories = caloricTarget(tdee, goalMode);
  const split = MACRO_SPLIT[goalMode];
  return {
    calories,
    proteinGrams: Math.round((calories * split.protein) / 4),
    carbsGrams:   Math.round((calories * split.carbs) / 4),
    fatGrams:     Math.round((calories * split.fat) / 9),
  };
}

// ─── Full Settings Builder ────────────────────────────────────────────────────

export function generateNutritionSettings(
  profile: UserProfile,
  weightKg: number
): NutritionSettings | null {
  const { heightCm, age, gender, activityMultiplier, daysPerWeek, goalMode, id } = profile;
  if (!heightCm || !age || !gender) return null;

  const multiplier = activityMultiplier ?? defaultActivityMultiplier(daysPerWeek);
  const tdee = calculateTDEE(weightKg, heightCm, age, gender, multiplier);
  const macros = calculateMacros(tdee, goalMode);

  return {
    id,
    userId: id,
    enabled: true,
    calorieTarget: macros.calories,
    proteinGrams: macros.proteinGrams,
    carbsGrams: macros.carbsGrams,
    fatGrams: macros.fatGrams,
    trackProtein: true,
    trackCarbs: true,
    trackFat: true,
    isCustom: false,
    calculatedTDEE: tdee,
  };
}
