import { supabase } from "./supabase";
import { db } from "../db/db";

export async function syncFromSupabase(supabaseProfileId: string): Promise<void> {
  try {
    const [
      { data: profileRows },
      { data: weightRows },
      { data: weekRows },
      { data: nutritionLogRows },
      { data: nutritionSettingsRows },
      { data: customExerciseRows },
      { data: injuryRows },
    ] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", supabaseProfileId),
      supabase.from("weight_entries").select("*").eq("user_id", supabaseProfileId),
      supabase.from("week_plans").select("*").eq("user_id", supabaseProfileId),
      supabase.from("daily_nutrition_logs").select("*").eq("user_id", supabaseProfileId),
      supabase.from("nutrition_settings").select("*").eq("user_id", supabaseProfileId),
      supabase.from("custom_exercises").select("*").eq("user_id", supabaseProfileId),
      supabase.from("active_injuries").select("*").eq("user_id", supabaseProfileId),
    ]);

    if (profileRows?.length) {
      await db.userProfiles.bulkPut(profileRows.map((r: any) => ({
        id: r.id,
        name: r.name ?? undefined,
        unit: r.unit,
        daysPerWeek: r.days_per_week,
        goalMode: r.goal_mode,
        goal: r.goal ?? undefined,
        currentWeightKg: r.current_weight_kg ?? undefined,
        targetWeightKg: r.target_weight_kg ?? undefined,
        experience: r.experience,
        equipment: r.equipment,
        cardioGoalAuto: r.cardio_goal_auto,
        cardioType: r.cardio_type,
        cardioSessionsPerWeek: r.cardio_sessions_per_week,
        cardioMinutesPerSession: r.cardio_minutes_per_session,
        notes: r.notes ?? undefined,
        heightCm: r.height_cm ?? undefined,
        age: r.age ?? undefined,
        gender: r.gender ?? undefined,
        activityMultiplier: r.activity_multiplier ?? undefined,
        createdAtISO: r.created_at,
      })));
      await db.settings.put({ key: "activeUserId", value: supabaseProfileId });
    }

    if (weightRows?.length) {
      await db.weightEntries.bulkPut(weightRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        dateISO: r.date_iso,
        weightKg: r.weight_kg,
        createdAtISO: r.created_at,
      })));
    }

    if (weekRows?.length) {
      await db.weekPlans.bulkPut(weekRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        weekNumber: r.week_number,
        startDateISO: r.start_date_iso,
        createdAtISO: r.created_at,
        days: r.days,
        isLocked: r.is_locked,
        notes: r.notes ?? undefined,
        noteChips: r.note_chips ?? undefined,
        nextWeekDays: r.next_week_days ?? undefined,
        isDeload: r.is_deload ?? undefined,
        adaptations: r.adaptations ?? undefined,
        activeInjuriesSnapshot: r.active_injuries_snapshot ?? undefined,
      })));
    }

    if (nutritionLogRows?.length) {
      await db.dailyNutritionLogs.bulkPut(nutritionLogRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        dateISO: r.date_iso,
        calories: r.calories,
        proteinGrams: r.protein_grams,
        carbsGrams: r.carbs_grams,
        fatGrams: r.fat_grams,
        hitTarget: r.hit_target,
        notes: r.notes ?? undefined,
      })));
    }

    if (nutritionSettingsRows?.length) {
      await db.nutritionSettings.bulkPut(nutritionSettingsRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        enabled: r.enabled,
        calorieTarget: r.calorie_target,
        proteinGrams: r.protein_grams,
        carbsGrams: r.carbs_grams,
        fatGrams: r.fat_grams,
        trackProtein: r.track_protein,
        trackCarbs: r.track_carbs,
        trackFat: r.track_fat,
        isCustom: r.is_custom,
        calculatedTDEE: r.calculated_tdee ?? undefined,
      })));
    }

    if (customExerciseRows?.length) {
      await db.customExercises.bulkPut(customExerciseRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        muscleGroup: r.muscle_group,
        type: r.type,
        equipment: r.equipment,
        notes: r.notes ?? undefined,
        createdAtISO: r.created_at,
      })));
    }

    if (injuryRows?.length) {
      await db.activeInjuries.bulkPut(injuryRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        area: r.area,
        severity: r.severity,
        startDateISO: r.start_date_iso,
        lastCheckISO: r.last_check_iso,
        status: r.status,
        weeksSinceStart: r.weeks_since_start,
        notes: r.notes ?? undefined,
      })));
    }
  } catch (err) {
    console.error("syncFromSupabase error:", err);
  }
}
