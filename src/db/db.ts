import Dexie from "dexie";
import type { Table } from "dexie";
import type { PlanTemplate, WeekPlan, WeightEntry, ExerciseTemplate, UserProfile } from "./types";

export type Setting = { key: string; value: string };
const uid = () => crypto.randomUUID();

function makeDefaultProfile(id: string, unit: "kg" | "lb"): UserProfile {
  return {
    id,
    name: "Default",
    unit,
    daysPerWeek: 5,
    goal: "cut",
    experience: "beginner",
    equipment: "gym",
    createdAtISO: new Date().toISOString()
  };
}

export class AppDB extends Dexie {
  planTemplates!: Table<PlanTemplate, string>;
  exerciseTemplates!: Table<ExerciseTemplate, string>;
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
