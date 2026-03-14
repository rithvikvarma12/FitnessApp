export const FREE_FEATURES = {
  maxCustomExercises: 5,
  freeChips: ["deload", "fatigued"] as string[],
  allowHighVolume: false,
  allowNutritionLogging: false,
  allowFullAnalytics: false,
  allowMidWeekRegen: false,
  allowAdjustRemainingDays: false,
};

export function isFeatureAvailable(
  feature: keyof typeof FREE_FEATURES,
  isPro: boolean
): boolean {
  if (isPro) return true;
  const val = FREE_FEATURES[feature];
  if (typeof val === "boolean") return val;
  return false;
}
