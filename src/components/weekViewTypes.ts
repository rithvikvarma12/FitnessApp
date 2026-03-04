import type { ExerciseMeta } from "../db/types";

export type UserEquipment = "gym" | "home" | "minimal";

export type AlternativeOption = {
  templateId: string;
  name: string;
  meta?: ExerciseMeta;
  source: "seeded" | "matched";
};

export type ExerciseHistoryPoint = {
  dateISO: string;
  bestWeightKg: number;
  bestE1RMKg?: number;
};
