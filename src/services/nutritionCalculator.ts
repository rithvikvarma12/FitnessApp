import type { UserProfile, NutritionSettings } from "../db/types";
import { db } from "../db/db";

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

export function caloricTarget(
  tdee: number,
  goalMode: "cut" | "maintain" | "bulk",
  gender: "male" | "female"
): number {
  if (goalMode === "cut") {
    const deficit = gender === "female" ? 400 : 500;
    const minimum = gender === "female" ? 1200 : 1500;
    return Math.max(minimum, tdee - deficit);
  }
  if (goalMode === "bulk") return tdee + (gender === "female" ? 200 : 300);
  return tdee;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function proteinRateGPerKg(goalMode: "cut" | "maintain" | "bulk", gender: "male" | "female"): number {
  if (gender === "male") {
    if (goalMode === "cut")  return 2.3;
    if (goalMode === "bulk") return 1.8;
    return 2.0;
  }
  if (goalMode === "cut") return 2.0;
  return 1.6; // female maintain or bulk
}

function carbFatRatio(
  goalMode: "cut" | "maintain" | "bulk",
  gender: "male" | "female"
): { carbs: number; fat: number } {
  if (gender === "female") {
    if (goalMode === "cut")      return { carbs: 0.45, fat: 0.55 };
    if (goalMode === "bulk")     return { carbs: 0.55, fat: 0.45 };
    return { carbs: 0.50, fat: 0.50 };
  }
  if (goalMode === "cut")        return { carbs: 0.55, fat: 0.45 };
  if (goalMode === "bulk")       return { carbs: 0.65, fat: 0.35 };
  return { carbs: 0.60, fat: 0.40 };
}

function fatFloorGrams(weightKg: number, calories: number, gender: "male" | "female"): number {
  const perKg   = gender === "female" ? 0.8 : 0.6;
  const pctCals = gender === "female" ? 0.25 : 0.20;
  return Math.ceil(Math.max(perKg * weightKg, (pctCals * calories) / 9));
}

// ─── Macro Split ──────────────────────────────────────────────────────────────

export function calculateMacros(
  tdee: number,
  goalMode: "cut" | "maintain" | "bulk",
  gender: "male" | "female",
  weightKg: number
): { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number } {
  const calories     = caloricTarget(tdee, goalMode, gender);
  const proteinGrams = Math.round(weightKg * proteinRateGPerKg(goalMode, gender));
  const proteinCals  = proteinGrams * 4;
  const remaining    = Math.max(0, calories - proteinCals);

  const ratio    = carbFatRatio(goalMode, gender);
  let carbsGrams = Math.round((remaining * ratio.carbs) / 4);
  let fatGrams   = Math.round((remaining * ratio.fat)   / 9);

  // Apply fat floor — if ratio gives less than the minimum, bump fat and reduce carbs
  const fatFloor = fatFloorGrams(weightKg, calories, gender);
  if (fatGrams < fatFloor) {
    const extraFatCals = (fatFloor - fatGrams) * 9;
    fatGrams   = fatFloor;
    carbsGrams = Math.max(0, Math.round(carbsGrams - extraFatCals / 4));
  }

  return { calories, proteinGrams, carbsGrams, fatGrams };
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
  const macros = calculateMacros(tdee, goalMode, gender, weightKg);

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

// ─── Auto-recalculate helper ──────────────────────────────────────────────────
// Silently recalculates nutrition settings when isCustom=false.
// Skips if settings don't exist, are custom, or body stats are missing.
export async function recalculateNutritionIfAuto(
  userId: string,
  options?: { goalMode?: "cut" | "maintain" | "bulk"; weightKg?: number }
): Promise<void> {
  const [ns, profile] = await Promise.all([
    db.nutritionSettings.get(userId),
    db.userProfiles.get(userId),
  ]);
  if (!ns || ns.isCustom || !profile) return;

  const goalMode = options?.goalMode ?? profile.goalMode;

  let weightKg = options?.weightKg;
  if (!weightKg) {
    const entries = await db.weightEntries.where("userId").equals(userId).toArray();
    entries.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
    weightKg = entries[0]?.weightKg ?? profile.currentWeightKg;
  }
  if (!weightKg) return;

  const recalc = generateNutritionSettings({ ...profile, goalMode }, weightKg);
  if (!recalc) return;

  await db.nutritionSettings.put({
    ...recalc,
    enabled: ns.enabled,
    trackProtein: ns.trackProtein,
    trackCarbs: ns.trackCarbs,
    trackFat: ns.trackFat,
    isCustom: false,
  });
}
