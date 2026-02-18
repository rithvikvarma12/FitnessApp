import Dexie from "dexie";
import type { Table } from "dexie";
import type { PlanTemplate, WeekPlan, WeightEntry, ExerciseTemplate } from "./types";

export type Setting = { key: string; value: string };

export class AppDB extends Dexie {
  planTemplates!: Table<PlanTemplate, string>;
  exerciseTemplates!: Table<ExerciseTemplate, string>;
  weekPlans!: Table<WeekPlan, string>;
  weightEntries!: Table<WeightEntry, string>;
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
  }
}

export const db = new AppDB();