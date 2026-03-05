import Dexie from "dexie";
import type { Table } from "dexie";
import { deriveAutoCardio } from "../services/cardio";
import type {
  PlanTemplate,
  WeekPlan,
  WeightEntry,
  ExerciseTemplate,
  UserProfile,
  ExerciseMeta,
  ExerciseMetaType,
  CustomExercise,
  NutritionSettings,
  DailyNutritionLog
} from "./types";

export type Setting = { key: string; value: string };
const uid = () => crypto.randomUUID();

function makeDefaultProfile(id: string, unit: "kg" | "lb"): UserProfile {
  const cardio = deriveAutoCardio("cut", 5);
  return {
    id,
    name: "Default",
    unit,
    daysPerWeek: 5,
    goalMode: "cut",
    goal: "cut",
    experience: "beginner",
    equipment: "gym",
    cardioGoalAuto: cardio.cardioGoalAuto,
    cardioType: cardio.cardioType,
    cardioSessionsPerWeek: cardio.cardioSessionsPerWeek,
    cardioMinutesPerSession: cardio.cardioMinutesPerSession,
    createdAtISO: new Date().toISOString()
  };
}

export class AppDB extends Dexie {
  planTemplates!: Table<PlanTemplate, string>;
  exerciseTemplates!: Table<ExerciseTemplate, string>;
  exerciseMeta!: Table<ExerciseMeta, string>;
  customExercises!: Table<CustomExercise, string>;
  nutritionSettings!: Table<NutritionSettings, string>;
  dailyNutritionLogs!: Table<DailyNutritionLog, string>;
  weekPlans!: Table<WeekPlan, string>;
  weightEntries!: Table<WeightEntry, string>;
  userProfiles!: Table<UserProfile, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super("cutGymDB");

    // v1 (existing)
    this.version(1).stores({
      planTemplates: "id, name",
      exerciseTemplates: "id, name",
      weekPlans: "id, weekNumber, startDateISO, createdAtISO",
      weightEntries: "id, dateISO, createdAtISO"
    });

    // v2 (add settings)
    this.version(2).stores({
      planTemplates: "id, name",
      exerciseTemplates: "id, name",
      weekPlans: "id, weekNumber, startDateISO, createdAtISO",
      weightEntries: "id, dateISO, createdAtISO",
      settings: "key"
    });

    // v3 (multi-user profiles + user-scoped weeks/weights)
    this.version(3)
      .stores({
        planTemplates: "id, name",
        exerciseTemplates: "id, name",
        weekPlans: "id, userId, weekNumber, startDateISO, createdAtISO, [userId+weekNumber]",
        weightEntries: "id, userId, dateISO, createdAtISO, [userId+dateISO]",
        settings: "key",
        userProfiles: "id, createdAtISO"
      })
      .upgrade(async (tx) => {
        const settingsTable = tx.table("settings") as Table<Setting, string>;
        const userProfilesTable = tx.table("userProfiles") as Table<UserProfile, string>;
        const weekPlansTable = tx.table("weekPlans") as Table<WeekPlan, string>;
        const weightEntriesTable = tx.table("weightEntries") as Table<WeightEntry, string>;

        const activeUserSetting = await settingsTable.get("activeUserId");
        let activeUserId = activeUserSetting?.value;

        const existingWeekCount = await weekPlansTable.count();
        const existingWeightCount = await weightEntriesTable.count();
        const hasLegacyData = existingWeekCount > 0 || existingWeightCount > 0;

        if (!activeUserId && hasLegacyData) {
          const existingProfile = await userProfilesTable.toCollection().first();
          if (existingProfile) {
            activeUserId = existingProfile.id;
          } else {
            const unitSetting = await settingsTable.get("unit");
            const profileUnit = unitSetting?.value === "lb" ? "lb" : "kg";
            activeUserId = uid();
            await userProfilesTable.add(makeDefaultProfile(activeUserId, profileUnit));
          }

          await settingsTable.put({ key: "activeUserId", value: activeUserId });
        }

        if (activeUserId) {
          await weekPlansTable.toCollection().modify((week) => {
            if (!week.userId) week.userId = activeUserId!;
          });

          await weightEntriesTable.toCollection().modify((entry) => {
            if (!entry.userId) entry.userId = activeUserId!;
          });
        }
      });

    // v4 (exercise metadata)
    this.version(4).stores({
      planTemplates: "id, name",
      exerciseTemplates: "id, name",
      exerciseMeta: "exerciseTemplateId",
      weekPlans: "id, userId, weekNumber, startDateISO, createdAtISO, [userId+weekNumber]",
      weightEntries: "id, userId, dateISO, createdAtISO, [userId+dateISO]",
      settings: "key",
      userProfiles: "id, createdAtISO"
    });

    // v5 (cardio profile preferences)
    this.version(5)
      .stores({
        planTemplates: "id, name",
        exerciseTemplates: "id, name",
        exerciseMeta: "exerciseTemplateId",
        weekPlans: "id, userId, weekNumber, startDateISO, createdAtISO, [userId+weekNumber]",
        weightEntries: "id, userId, dateISO, createdAtISO, [userId+dateISO]",
        settings: "key",
        userProfiles: "id, createdAtISO"
      })
      .upgrade(async (tx) => {
        const userProfilesTable = tx.table("userProfiles") as Table<UserProfile, string>;
        await userProfilesTable.toCollection().modify((profile) => {
          const cardioGoal = profile.goalMode ?? (profile.goal === "gain" ? "bulk" : profile.goal) ?? "maintain";
          const cardio = deriveAutoCardio(cardioGoal, profile.daysPerWeek ?? 4);
          if (typeof profile.cardioGoalAuto !== "boolean") profile.cardioGoalAuto = true;
          if (!profile.cardioType) profile.cardioType = cardio.cardioType;
          if (!Number.isFinite(profile.cardioSessionsPerWeek)) {
            profile.cardioSessionsPerWeek = cardio.cardioSessionsPerWeek;
          }
          if (!Number.isFinite(profile.cardioMinutesPerSession)) {
            profile.cardioMinutesPerSession = cardio.cardioMinutesPerSession;
          }
        });
      });

    // v6 (goalMode + onboarding weights)
    this.version(6)
      .stores({
        planTemplates: "id, name",
        exerciseTemplates: "id, name",
        exerciseMeta: "exerciseTemplateId",
        weekPlans: "id, userId, weekNumber, startDateISO, createdAtISO, [userId+weekNumber]",
        weightEntries: "id, userId, dateISO, createdAtISO, [userId+dateISO]",
        settings: "key",
        userProfiles: "id, createdAtISO"
      })
      .upgrade(async (tx) => {
        const userProfilesTable = tx.table("userProfiles") as Table<UserProfile, string>;
        await userProfilesTable.toCollection().modify((profile) => {
          if (!profile.goalMode) {
            profile.goalMode = profile.goal === "gain" ? "bulk" : profile.goal ?? "maintain";
          }
          if (!profile.goal) {
            profile.goal = profile.goalMode === "bulk" ? "gain" : profile.goalMode;
          }
        });
      });

    // v7 (custom exercises per user)
    this.version(7).stores({
      planTemplates: "id, name",
      exerciseTemplates: "id, name",
      exerciseMeta: "exerciseTemplateId",
      customExercises: "id, userId, name",
      weekPlans: "id, userId, weekNumber, startDateISO, createdAtISO, [userId+weekNumber]",
      weightEntries: "id, userId, dateISO, createdAtISO, [userId+dateISO]",
      settings: "key",
      userProfiles: "id, createdAtISO"
    });

    // v8 (nutrition tracking)
    this.version(8).stores({
      planTemplates: "id, name",
      exerciseTemplates: "id, name",
      exerciseMeta: "exerciseTemplateId",
      customExercises: "id, userId, name",
      nutritionSettings: "id, userId",
      dailyNutritionLogs: "id, userId, dateISO, [userId+dateISO]",
      weekPlans: "id, userId, weekNumber, startDateISO, createdAtISO, [userId+weekNumber]",
      weightEntries: "id, userId, dateISO, createdAtISO, [userId+dateISO]",
      settings: "key",
      userProfiles: "id, createdAtISO"
    });
  }
}

export const db = new AppDB();

export async function getActiveUserId(): Promise<string | undefined> {
  const existing = await db.settings.get("activeUserId");
  if (existing?.value) return existing.value;

  const firstProfile = await db.userProfiles.orderBy("createdAtISO").first();
  if (firstProfile) {
    await db.settings.put({ key: "activeUserId", value: firstProfile.id });
    return firstProfile.id;
  }
  return undefined;
}

export async function getExerciseMeta(exerciseTemplateId: string): Promise<ExerciseMeta | undefined> {
  return db.exerciseMeta.get(exerciseTemplateId);
}

export function classifyCompound(name: string): ExerciseMetaType {
  const n = name.toLowerCase();
  const compoundKeywords = [
    "bench",
    "press",
    "row",
    "pulldown",
    "pull-up",
    "pull up",
    "chin-up",
    "chin up",
    "squat",
    "deadlift",
    "rdl",
    "lunge",
    "leg press",
    "carry",
    "push-up",
    "push up"
  ];

  const isolationKeywords = [
    "crossover",
    "fly",
    "curl",
    "raise",
    "pressdown",
    "extension",
    "plank"
  ];

  if (isolationKeywords.some((k) => n.includes(k))) return "isolation";
  if (compoundKeywords.some((k) => n.includes(k))) return "compound";
  return "isolation";
}
