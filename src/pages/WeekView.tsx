import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { classifyCompound, db, getActiveUserId } from "../db/db";
import type { Unit } from "../services/units";
import { toDisplay, fromDisplay, lbToKg } from "../services/units";
import { useLiveQuery } from "dexie-react-hooks";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
} from "chart.js";
import type {
  WeekPlan,
  WorkoutDay,
  PlannedExercise,
  SetEntry,
  ExerciseMeta,
  ExerciseTemplate,
  ExerciseEquipment
} from "../db/types";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

type UserEquipment = "gym" | "home" | "minimal";

type AlternativeOption = {
  templateId: string;
  name: string;
  meta?: ExerciseMeta;
  source: "seeded" | "matched";
};

type ExerciseHistoryPoint = {
  dateISO: string;
  bestWeightKg: number;
  bestE1RMKg?: number;
};

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function normalizeMuscle(value?: string): string {
  return (value ?? "").toLowerCase().trim();
}

function isEquipmentCompatible(userEquipment: UserEquipment, exerciseEquipment?: ExerciseEquipment): boolean {
  if (!exerciseEquipment || exerciseEquipment === "either") return true;
  if (userEquipment === "gym") return true;
  if (userEquipment === "home") return exerciseEquipment === "home" || exerciseEquipment === "minimal";
  return exerciseEquipment === "minimal";
}

function hasLoggedData(ex: PlannedExercise): boolean {
  return ex.sets.some((s) =>
    s.completed ||
    typeof s.actualReps === "number" ||
    typeof s.actualWeightKg === "number"
  );
}

function computeExerciseHistory(
  weeks: WeekPlan[],
  exerciseName: string,
  options?: {
    onlyCompletedSets?: boolean;
    useE1RMRepRangeFilter?: boolean;
  }
): ExerciseHistoryPoint[] {
  const byDate = new Map<string, { bestWeightKg?: number; bestE1RMKg?: number }>();
  const targetName = normalizeText(exerciseName);
  const onlyCompletedSets = options?.onlyCompletedSets ?? true;
  const useE1RMRepRangeFilter = options?.useE1RMRepRangeFilter ?? true;

  for (const week of weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (normalizeText(ex.name) !== targetName) continue;

        for (const set of ex.sets) {
          if (onlyCompletedSets && !set.completed) continue;
          if (typeof set.actualWeightKg !== "number") continue;

          const current = byDate.get(day.dateISO) ?? {};
          current.bestWeightKg =
            typeof current.bestWeightKg === "number"
              ? Math.max(current.bestWeightKg, set.actualWeightKg)
              : set.actualWeightKg;

          const reps = set.actualReps;
          const validRepsForE1RM =
            typeof reps === "number" &&
            (!useE1RMRepRangeFilter || (reps >= 3 && reps <= 10));
          if (validRepsForE1RM) {
            const e1RM = set.actualWeightKg * (1 + reps / 30);
            current.bestE1RMKg =
              typeof current.bestE1RMKg === "number"
                ? Math.max(current.bestE1RMKg, e1RM)
                : e1RM;
          }
          byDate.set(day.dateISO, current);
        }
      }
    }
  }

  return Array.from(byDate.entries())
    .filter(([, stats]) => typeof stats.bestWeightKg === "number")
    .map(([dateISO, stats]) => ({
      dateISO,
      bestWeightKg: stats.bestWeightKg as number,
      bestE1RMKg: stats.bestE1RMKg
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

function getExerciseAlternatives(params: {
  sourceExerciseName: string;
  dayExercises: PlannedExercise[];
  userEquipment: UserEquipment;
  exerciseTemplates: ExerciseTemplate[];
  exerciseTemplateIdByName: Map<string, string>;
  exerciseMetaByTemplateId: Map<string, ExerciseMeta>;
}): AlternativeOption[] {
  const {
    sourceExerciseName,
    dayExercises,
    userEquipment,
    exerciseTemplates,
    exerciseTemplateIdByName,
    exerciseMetaByTemplateId
  } = params;

  const currentTemplateId = exerciseTemplateIdByName.get(sourceExerciseName);
  const currentMeta = currentTemplateId ? exerciseMetaByTemplateId.get(currentTemplateId) : undefined;
  const templateById = new Map(exerciseTemplates.map((t) => [t.id, t]));

  const blockedNames = new Set(dayExercises.map((e) => normalizeText(e.name)));
  blockedNames.delete(normalizeText(sourceExerciseName));

  const results: AlternativeOption[] = [];
  const seenTemplateIds = new Set<string>();
  const seenNames = new Set<string>();

  const pushOption = (templateId: string, source: "seeded" | "matched") => {
    if (seenTemplateIds.has(templateId)) return;
    const template = templateById.get(templateId);
    if (!template) return;
    const normalizedTemplateName = normalizeText(template.name);
    if (normalizedTemplateName === normalizeText(sourceExerciseName)) return;
    if (blockedNames.has(normalizedTemplateName)) return;
    if (seenNames.has(normalizedTemplateName)) return;

    const meta = exerciseMetaByTemplateId.get(templateId);
    if (!isEquipmentCompatible(userEquipment, meta?.equipment)) return;

    seenTemplateIds.add(templateId);
    seenNames.add(normalizedTemplateName);
    results.push({ templateId, name: template.name, meta, source });
  };

  for (const altId of currentMeta?.alternatives ?? []) {
    pushOption(altId, "seeded");
    if (results.length >= 5) return results;
  }

  if (!currentMeta) return results.slice(0, 5);

  const primaryMuscle = normalizeMuscle(currentMeta.primaryMuscles[0]);

  const matched = exerciseTemplates
    .map((template) => ({ template, meta: exerciseMetaByTemplateId.get(template.id) }))
    .filter((row) => !!row.meta)
    .filter(({ template }) => normalizeText(template.name) !== normalizeText(sourceExerciseName))
    .filter(({ template }) => !blockedNames.has(normalizeText(template.name)))
    .filter(({ meta }) => normalizeMuscle(meta!.primaryMuscles[0]) === primaryMuscle)
    .filter(({ meta }) => meta!.movementPattern === currentMeta.movementPattern)
    .filter(({ meta }) => meta!.type === currentMeta.type)
    .filter(({ meta }) => isEquipmentCompatible(userEquipment, meta!.equipment))
    .sort((a, b) => a.template.name.localeCompare(b.template.name));

  for (const item of matched) {
    pushOption(item.template.id, "matched");
    if (results.length >= 5) break;
  }

  return results.slice(0, 5);
}

function dedupeDayExercisesByName(exercises: PlannedExercise[]): PlannedExercise[] {
  const seen = new Set<string>();
  const unique: PlannedExercise[] = [];

  for (const ex of exercises) {
    const key = normalizeText(ex.name);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ex);
  }

  return unique;
}

function lastNonEmptyActualWeightKg(ex: PlannedExercise): number | undefined {
  for (let i = ex.sets.length - 1; i >= 0; i -= 1) {
    const w = ex.sets[i].actualWeightKg;
    if (typeof w === "number") return w;
  }
  return undefined;
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function rampIncrementKg(unit: Unit): number {
  const raw = unit === "kg" ? 2.5 : lbToKg(5);
  return roundToNearest(raw, 0.5);
}

function getDayAccentColor(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("push")) return "#3b82f6";
  if (lower.includes("pull")) return "#f97316";
  if (lower.includes("leg")) return "#10b981";
  return "#8b5cf6";
}

export default function WeekView({ week }: { week: WeekPlan }) {
  const [infoExerciseName, setInfoExerciseName] = useState<string | null>(null);
  const [historyExerciseName, setHistoryExerciseName] = useState<string | null>(null);
  const [alternativePicker, setAlternativePicker] = useState<{
    dayId: string;
    exId: string;
    exerciseName: string;
    dayExercises: PlannedExercise[];
  } | null>(null);

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");
  const userEquipment = useLiveQuery(async () => {
    if (!activeUserId) return "gym" as UserEquipment;
    const profile = await db.userProfiles.get(activeUserId);
    return (profile?.equipment ?? "gym") as UserEquipment;
  }, [activeUserId], "gym" as UserEquipment);
  const allUserWeeks = useLiveQuery(
    async () => (activeUserId ? db.weekPlans.where("userId").equals(activeUserId).toArray() : []),
    [activeUserId],
    [] as WeekPlan[]
  );

  const daysSorted = useMemo(
    () => week.days.slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [week.days]
  );
  const exerciseTemplates = useLiveQuery(() => db.exerciseTemplates.toArray(), [], [] as ExerciseTemplate[]);
  const exerciseMetaRows = useLiveQuery(() => db.exerciseMeta.toArray(), [], [] as ExerciseMeta[]);

  const exerciseTemplateIdByName = useMemo(
    () => new Map(exerciseTemplates.map((t) => [t.name, t.id])),
    [exerciseTemplates]
  );
  const exerciseMetaByTemplateId = useMemo(
    () => new Map(exerciseMetaRows.map((m) => [m.exerciseTemplateId, m])),
    [exerciseMetaRows]
  );

  const selectedExerciseTemplateId = infoExerciseName ? exerciseTemplateIdByName.get(infoExerciseName) : undefined;
  const selectedExerciseMeta = selectedExerciseTemplateId
    ? exerciseMetaByTemplateId.get(selectedExerciseTemplateId)
    : undefined;
  const selectedHistoryTemplateId = historyExerciseName
    ? exerciseTemplateIdByName.get(historyExerciseName)
    : undefined;
  const selectedHistoryMeta = selectedHistoryTemplateId
    ? exerciseMetaByTemplateId.get(selectedHistoryTemplateId)
    : undefined;
  const alternativeOptions = useMemo(() => {
    if (!alternativePicker) return [];
    return getExerciseAlternatives({
      sourceExerciseName: alternativePicker.exerciseName,
      dayExercises: alternativePicker.dayExercises,
      userEquipment,
      exerciseTemplates,
      exerciseTemplateIdByName,
      exerciseMetaByTemplateId
    });
  }, [
    alternativePicker,
    userEquipment,
    exerciseTemplates,
    exerciseTemplateIdByName,
    exerciseMetaByTemplateId
  ]);

  async function updateWeek(updated: WeekPlan) {
    await db.weekPlans.update(week.id, updated);
  }

  function setDayComplete(dayId: string, val: boolean) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => (d.id === dayId ? { ...d, isComplete: val } : d))
    };
    void updateWeek(updated);
  }

  function updateSet(dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId) return ex;
            return {
              ...ex,
              sets: ex.sets.map((s) => (s.setNumber === setNumber ? { ...s, ...patch } : s))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  // Base planned weight is separate from per-set planned weights. Quick actions copy it into sets.
  function updateExerciseBasePlannedWeight(dayId: string, exId: string, weightKg?: number) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => (
            ex.id !== exId
              ? ex
              : {
                  ...ex,
                  plannedWeightKg: weightKg
                }
          ))
        };
      })
    };
    void updateWeek(updated);
  }

  function applyBasePlannedWeightToAllSets(dayId: string, exId: string) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId) return ex;
            return {
              ...ex,
              sets: ex.sets.map((s) => ({ ...s, plannedWeightKg: ex.plannedWeightKg }))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  function applyRampPlannedWeights(dayId: string, exId: string) {
    const incrementKg = rampIncrementKg(unit);
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId || typeof ex.plannedWeightKg !== "number") return ex;
            const baseKg = ex.plannedWeightKg;
            const splitIndex = Math.ceil(ex.sets.length / 2);
            return {
              ...ex,
              sets: ex.sets.map((s, idx) => ({
                ...s,
                plannedWeightKg:
                  idx < splitIndex
                    ? baseKg
                    : roundToNearest(baseKg + incrementKg, 0.5)
              }))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  function setPlanToLastActual(dayId: string, exId: string) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId) return ex;
            const lastActual = lastNonEmptyActualWeightKg(ex);
            if (typeof lastActual !== "number") return ex;
            return {
              ...ex,
              plannedWeightKg: lastActual,
              sets: ex.sets.map((s) => ({ ...s, plannedWeightKg: lastActual }))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  function swapExerciseInDay(dayId: string, exId: string, nextExerciseName: string) {
    const sourceDay = week.days.find((d) => d.id === dayId);
    const currentExercise = sourceDay?.exercises.find((e) => e.id === exId);
    if (!sourceDay || !currentExercise) return;

    const duplicateExists = sourceDay.exercises.some((e) =>
      e.id !== exId && normalizeText(e.name) === normalizeText(nextExerciseName)
    );
    if (duplicateExists) {
      window.alert("That exercise is already in this day.");
      return;
    }

    if (hasLoggedData(currentExercise)) {
      const confirmed = window.confirm(
        `This exercise already has logged reps/weights. Swap to "${nextExerciseName}" and clear logged actuals for this exercise?`
      );
      if (!confirmed) return;
    }

    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        const swapped = d.exercises.map((ex) => {
          if (ex.id !== exId) return ex;
          return {
            ...ex,
            name: nextExerciseName,
            sets: ex.sets.map((s) => ({
              ...s,
              actualReps: undefined,
              actualWeightKg: undefined,
              completed: false
            }))
          };
        });
        return {
          ...d,
          exercises: dedupeDayExercisesByName(swapped)
        };
      })
    };

    void updateWeek(updated);
    setAlternativePicker(null);
  }

  const completedCount = week.days.filter((d) => d.isComplete).length;
  const totalCount = week.days.length;

  return (
    <div className="list">
      {/* Week info bar */}
      <div className="week-info-bar">
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Week {week.weekNumber}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 8 }}>{week.startDateISO}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="week-progress-segs">
            {week.days.map((d, i) => (
              <div
                key={i}
                className={`week-progress-seg ${d.isComplete ? "filled" : ""}`}
              />
            ))}
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      {daysSorted.map((day) => (
        <DayCard
          key={day.id}
          defaultExpanded={day.id === daysSorted[0]?.id}
          day={day}
          unit={unit}
          isLocked={week.isLocked}
          onDayComplete={setDayComplete}
          onSetUpdate={updateSet}
          onExerciseBasePlanUpdate={updateExerciseBasePlannedWeight}
          onApplyBaseToAllSets={applyBasePlannedWeightToAllSets}
          onRampPlanFromBase={applyRampPlannedWeights}
          onSetPlanToLastActual={setPlanToLastActual}
          onExerciseInfoOpen={setInfoExerciseName}
          onExerciseAlternativesOpen={(dayId, ex, dayExercises) => {
            setAlternativePicker({
              dayId,
              exId: ex.id,
              exerciseName: ex.name,
              dayExercises
            });
          }}
        />
      ))}

      <ExerciseInfoModal
        exerciseName={infoExerciseName}
        meta={selectedExerciseMeta}
        onOpenHistory={(exerciseName) => {
          setHistoryExerciseName(exerciseName);
          setInfoExerciseName(null);
        }}
        onClose={() => setInfoExerciseName(null)}
      />
      <ExerciseHistoryModal
        exerciseName={historyExerciseName}
        meta={selectedHistoryMeta}
        weeks={allUserWeeks}
        unit={unit}
        onClose={() => setHistoryExerciseName(null)}
      />
      <ExerciseAlternativesModal
        openItem={alternativePicker}
        options={alternativeOptions}
        onClose={() => setAlternativePicker(null)}
        onSelect={(option) => {
          if (!alternativePicker) return;
          swapExerciseInDay(alternativePicker.dayId, alternativePicker.exId, option.name);
        }}
      />
    </div>
  );
}

function DayCard({
  defaultExpanded,
  day,
  unit,
  isLocked,
  onDayComplete,
  onSetUpdate,
  onExerciseBasePlanUpdate,
  onApplyBaseToAllSets,
  onRampPlanFromBase,
  onSetPlanToLastActual,
  onExerciseInfoOpen,
  onExerciseAlternativesOpen
}: {
  defaultExpanded: boolean;
  day: WorkoutDay;
  unit: Unit;
  isLocked: boolean;
  onDayComplete: (dayId: string, val: boolean) => void;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onExerciseBasePlanUpdate: (dayId: string, exId: string, weightKg?: number) => void;
  onApplyBaseToAllSets: (dayId: string, exId: string) => void;
  onRampPlanFromBase: (dayId: string, exId: string) => void;
  onSetPlanToLastActual: (dayId: string, exId: string) => void;
  onExerciseInfoOpen: (exerciseName: string) => void;
  onExerciseAlternativesOpen: (dayId: string, ex: PlannedExercise, dayExercises: PlannedExercise[]) => void;
}) {
  const dateLabel = format(parseISO(day.dateISO), "EEE, MMM d");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accentColor = getDayAccentColor(day.title);

  return (
    <div
      className="dayCard"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="dayCardHeader">
        <div className="dayHeaderMain">
          <div className="dayTitle">{day.title}</div>
          <div className="dayDate">{dateLabel}</div>
        </div>

        <div className="dayCardActions">
          <button
            type="button"
            className={`dayCompleteBtn ${day.isComplete ? "done" : ""}`}
            onClick={() => onDayComplete(day.id, !day.isComplete)}
            disabled={isLocked}
          >
            {day.isComplete ? "✓ Done" : "Mark Done"}
          </button>
          <button
            type="button"
            className="dayToggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse day" : "Expand day"}
          >
            <span className={`dayToggleChevron ${expanded ? "expanded" : ""}`} aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <hr />
          {day.cardio ? (
            <div className="cardioBlockCard">
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent-green)" }}>Cardio</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                {day.cardio.modality} • {day.cardio.minutes} min
                {day.cardio.intensity ? ` • ${day.cardio.intensity}` : ""}
              </div>
            </div>
          ) : null}
          <div className="list">
            {day.exercises.map((ex) => (
              <ExerciseCard
                key={ex.id}
                dayId={day.id}
                ex={ex}
                unit={unit}
                isLocked={isLocked}
                onSetUpdate={onSetUpdate}
                onExerciseBasePlanUpdate={onExerciseBasePlanUpdate}
                onApplyBaseToAllSets={onApplyBaseToAllSets}
                onRampPlanFromBase={onRampPlanFromBase}
                onSetPlanToLastActual={onSetPlanToLastActual}
                onExerciseInfoOpen={onExerciseInfoOpen}
                onExerciseAlternativesOpen={onExerciseAlternativesOpen}
                dayExercises={day.exercises}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExerciseCard({
  dayId,
  ex,
  unit,
  isLocked,
  onSetUpdate,
  onExerciseBasePlanUpdate,
  onApplyBaseToAllSets,
  onRampPlanFromBase,
  onSetPlanToLastActual,
  onExerciseInfoOpen,
  onExerciseAlternativesOpen,
  dayExercises
}: {
  dayId: string;
  ex: PlannedExercise;
  dayExercises: PlannedExercise[];
  unit: Unit;
  isLocked: boolean;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onExerciseBasePlanUpdate: (dayId: string, exId: string, weightKg?: number) => void;
  onApplyBaseToAllSets: (dayId: string, exId: string) => void;
  onRampPlanFromBase: (dayId: string, exId: string) => void;
  onSetPlanToLastActual: (dayId: string, exId: string) => void;
  onExerciseInfoOpen: (exerciseName: string) => void;
  onExerciseAlternativesOpen: (dayId: string, ex: PlannedExercise, dayExercises: PlannedExercise[]) => void;
}) {
  const lastActualWeightKg = lastNonEmptyActualWeightKg(ex);

  return (
    <div className="workoutExerciseCard">
      {/* Exercise header */}
      <div className="row exerciseHeaderRow" style={{ alignItems: "flex-start", gap: 10 }}>
        <div className="col">
          <button
            type="button"
            className="exerciseNameButton"
            onClick={() => onExerciseInfoOpen(ex.name)}
            aria-label={`Open info for ${ex.name}`}
          >
            {ex.name}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {ex.plannedSets} sets · {ex.repRange.min}–{ex.repRange.max} reps
          </div>
          <div className="row exerciseActionRow" style={{ gap: 6, marginTop: 8 }}>
            <button
              className="secondary"
              disabled={isLocked}
              onClick={() => onExerciseAlternativesOpen(dayId, ex, dayExercises)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              Swap
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof ex.plannedWeightKg !== "number"}
              onClick={() => onApplyBaseToAllSets(dayId, ex.id)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              Apply all
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof ex.plannedWeightKg !== "number"}
              onClick={() => onRampPlanFromBase(dayId, ex.id)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              Ramp
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof lastActualWeightKg !== "number"}
              onClick={() => onSetPlanToLastActual(dayId, ex.id)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              = Last actual
            </button>
          </div>
        </div>

        <div className="exerciseBaseField">
          <input
            disabled={isLocked}
            inputMode="decimal"
            placeholder={`Base ${unit}`}
            value={typeof ex.plannedWeightKg === "number" ? toDisplay(ex.plannedWeightKg, unit) : ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              const num = v === "" ? undefined : Number(v);
              const kg =
                num === undefined || !Number.isFinite(num)
                  ? undefined
                  : fromDisplay(num, unit);
              onExerciseBasePlanUpdate(dayId, ex.id, kg);
            }}
          />
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Base wt</div>
        </div>
      </div>

      <hr />

      {/* Set grid header */}
      <div className="set-grid set-grid-header">
        <div>#</div>
        <div>{unit}</div>
        <div>reps</div>
        <div />
      </div>

      {/* Set rows */}
      <div style={{ display: "grid", gap: 4 }}>
        {ex.sets.map((s) => {
          const plannedWtPlaceholder =
            typeof s.plannedWeightKg === "number"
              ? String(toDisplay(s.plannedWeightKg, unit))
              : typeof ex.plannedWeightKg === "number"
              ? String(toDisplay(ex.plannedWeightKg, unit))
              : unit;
          return (
            <div key={s.setNumber} className={`set-grid ${s.completed ? "set-row-done" : ""}`}>
              <div className="set-num">{s.setNumber}</div>

              <input
                disabled={isLocked}
                inputMode="decimal"
                placeholder={plannedWtPlaceholder}
                value={typeof s.actualWeightKg === "number" ? toDisplay(s.actualWeightKg, unit) : ""}
                className={s.completed ? "input-done" : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = v === "" ? undefined : Number(v);
                  const kg =
                    num === undefined || !Number.isFinite(num)
                      ? undefined
                      : fromDisplay(num, unit);
                  onSetUpdate(dayId, ex.id, s.setNumber, { actualWeightKg: kg });
                }}
              />

              <input
                disabled={isLocked}
                inputMode="numeric"
                placeholder={`${s.plannedRepsMin}–${s.plannedRepsMax}`}
                value={s.actualReps ?? ""}
                className={s.completed ? "input-done" : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = v === "" ? undefined : Number(v);
                  onSetUpdate(dayId, ex.id, s.setNumber, {
                    actualReps: Number.isFinite(num as number) ? (num as number) : undefined
                  });
                }}
              />

              <button
                type="button"
                className={`set-check-btn ${s.completed ? "done" : ""}`}
                disabled={isLocked}
                onClick={() => onSetUpdate(dayId, ex.id, s.setNumber, { completed: !s.completed })}
                aria-label={s.completed ? "Mark incomplete" : "Mark complete"}
              >
                {s.completed ? "✓" : ""}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExerciseInfoModal({
  exerciseName,
  meta,
  onOpenHistory,
  onClose
}: {
  exerciseName: string | null;
  meta?: ExerciseMeta;
  onOpenHistory: (exerciseName: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!exerciseName) return undefined;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exerciseName, onClose]);

  if (!exerciseName) return null;

  const resolvedType = meta?.type ?? classifyCompound(exerciseName);
  const primaryMuscles = meta?.primaryMuscles ?? [];
  const secondaryMuscles = meta?.secondaryMuscles ?? [];
  const targetedMuscles = [...primaryMuscles, ...secondaryMuscles];

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalCard exerciseInfoModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-info-title"
      >
        <div className="exerciseInfoHeader">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Exercise info</div>
            <h3 id="exercise-info-title" style={{ marginBottom: 6 }}>{exerciseName}</h3>
            <div className="row" style={{ gap: 6 }}>
              <span className="tag tag--blue">{resolvedType}</span>
              {meta?.equipment ? <span className="tag tag--purple">{meta.equipment}</span> : null}
              {meta?.movementPattern ? <span className="tag" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-glass-hover)", color: "var(--text-secondary)" }}>{meta.movementPattern}</span> : null}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => onOpenHistory(exerciseName)}
              aria-label={`Open history for ${exerciseName}`}
            >
              History
            </button>
            <button type="button" className="secondary" onClick={onClose} aria-label="Close exercise info">
              Close
            </button>
          </div>
        </div>

        {meta?.imageUrl ? (
          <img className="exerciseInfoImage" src={meta.imageUrl} alt={`${exerciseName} reference`} />
        ) : (
          <div className="card exerciseInfoImagePlaceholder">
            <div className="small muted">No image added yet</div>
            <div className="small">Targeted muscles</div>
            <div className="muscleChipRow">
              {targetedMuscles.length ? (
                targetedMuscles.map((muscle) => (
                  <span key={`target-${muscle}`} className="muscleChip secondaryMuscleChip">{muscle}</span>
                ))
              ) : (
                <span className="small muted">Not set</span>
              )}
            </div>
          </div>
        )}

        <div className="exerciseInfoGrid">
          <div className="card exerciseInfoSection">
            <div className="small muted">Type</div>
            <div>{resolvedType}</div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Equipment</div>
            <div>{meta?.equipment ?? "Not set"}</div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Primary muscles</div>
            <div className="muscleChipRow">
              {primaryMuscles.length ? (
                primaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscleChip">{muscle}</span>
                ))
              ) : (
                <span>Not set</span>
              )}
            </div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Secondary muscles</div>
            <div className="muscleChipRow">
              {secondaryMuscles.length ? (
                secondaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscleChip secondaryMuscleChip">{muscle}</span>
                ))
              ) : (
                <span>None listed</span>
              )}
            </div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Movement pattern</div>
            <div>{meta?.movementPattern ?? "Not set"}</div>
          </div>
        </div>

        <div className="card exerciseInfoSection">
          <div className="small muted">Cues</div>
          {meta?.cues?.length ? (
            <ul className="exerciseInfoList">
              {meta.cues.map((cue) => (
                <li key={cue}>{cue}</li>
              ))}
            </ul>
          ) : (
            <div className="small muted">No cues added yet.</div>
          )}
        </div>

        {meta?.videoUrl ? (
          <div className="exerciseInfoActions">
            <a
              className="exerciseInfoLinkButton"
              href={meta.videoUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open video
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExerciseHistoryModal({
  exerciseName,
  meta,
  weeks,
  unit,
  onClose
}: {
  exerciseName: string | null;
  meta?: ExerciseMeta;
  weeks: WeekPlan[];
  unit: Unit;
  onClose: () => void;
}) {
  const open = !!exerciseName;
  const resolvedExerciseName = exerciseName ?? "";
  const [onlyCompletedSets, setOnlyCompletedSets] = useState(true);
  const [useE1RMRepRangeFilter, setUseE1RMRepRangeFilter] = useState(true);
  const [compoundChartMode, setCompoundChartMode] = useState<"weight" | "e1rm">("weight");

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const history = useMemo(
    () => (open
      ? computeExerciseHistory(weeks, exerciseName, {
        onlyCompletedSets,
        useE1RMRepRangeFilter
      })
      : []),
    [weeks, open, exerciseName, onlyCompletedSets, useE1RMRepRangeFilter]
  );

  const exerciseType = meta?.type ?? classifyCompound(resolvedExerciseName);
  const isCompound = exerciseType === "compound";
  const labels = history.map((p) => p.dateISO);
  const bestWeightSeries = history.map((p) => Number(toDisplay(p.bestWeightKg, unit).toFixed(2)));
  const bestE1RMSeries = history.map((p) =>
    typeof p.bestE1RMKg === "number" ? Number(toDisplay(p.bestE1RMKg, unit).toFixed(2)) : null
  );

  const commonChartOptions: any = {
    responsive: true,
    plugins: { legend: { labels: { color: "#e5e7eb" } } },
    scales: {
      x: { ticks: { color: "#e5e7eb" }, grid: { color: "#1f2937" } },
      y: {
        ticks: { color: "#e5e7eb" },
        grid: { color: "#1f2937" }
      }
    }
  };

  const weightChartData = {
    labels,
    datasets: [
      {
        label: `Best weight (${unit})`,
        data: bestWeightSeries,
        tension: 0.25,
        borderColor: "#38bdf8",
        backgroundColor: "#38bdf8"
      }
    ]
  };

  const e1rmChartData = {
    labels,
    datasets: [
      {
        label: `Best e1RM (${unit})`,
        data: bestE1RMSeries,
        tension: 0.25,
        borderColor: "#22c55e",
        backgroundColor: "#22c55e"
      }
    ]
  };

  useEffect(() => {
    setCompoundChartMode("weight");
    setOnlyCompletedSets(true);
    setUseE1RMRepRangeFilter(true);
  }, [exerciseName]);

  if (!open) return null;

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalCard exerciseInfoModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-history-title"
      >
        <div className="exerciseInfoHeader">
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Exercise history</div>
            <h3 id="exercise-history-title" style={{ marginBottom: 4 }}>{resolvedExerciseName}</h3>
            <div className="row" style={{ gap: 8 }}>
              <span className="pill">{exerciseType}</span>
              <span className="pill">{unit}</span>
            </div>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {history.length === 0 ? (
          <div className="card exerciseInfoSection">
            <div className="muted">No completed logged sets with actual weights yet for this exercise.</div>
          </div>
        ) : (
          <>
            <div className="card exerciseInfoSection">
              <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={onlyCompletedSets}
                  onChange={(e) => setOnlyCompletedSets(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Only completed sets
              </label>
              {isCompound ? (
                <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={useE1RMRepRangeFilter}
                    onChange={(e) => setUseE1RMRepRangeFilter(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  Use reps 3-10 for e1RM
                </label>
              ) : null}
            </div>

            {isCompound ? (
              <div className="pill" style={{ gap: 6, marginBottom: 4 }}>
                <button
                  type="button"
                  className={compoundChartMode === "weight" ? "" : "secondary"}
                  onClick={() => setCompoundChartMode("weight")}
                >
                  Best Weight
                </button>
                <button
                  type="button"
                  className={compoundChartMode === "e1rm" ? "" : "secondary"}
                  onClick={() => setCompoundChartMode("e1rm")}
                >
                  Estimated 1RM
                </button>
              </div>
            ) : null}

            <div className="card exerciseInfoSection" style={{ background: "#0b1220" }}>
              <div className="small muted" style={{ marginBottom: 8 }}>
                {isCompound
                  ? compoundChartMode === "weight"
                    ? "Best set weight"
                    : "Estimated 1RM (Epley)"
                  : "Best set weight"}
              </div>
              <Line
                data={isCompound && compoundChartMode === "e1rm" ? e1rmChartData : weightChartData}
                options={commonChartOptions}
              />
            </div>

            <div className="card exerciseInfoSection">
              <div className="small muted" style={{ marginBottom: 8 }}>History log</div>
              <div className="list" style={{ gap: 8 }}>
                {history.slice().reverse().map((point) => (
                  <div key={point.dateISO} className="row exerciseHistoryRow">
                    <div className="pill">{point.dateISO}</div>
                    <div style={{ fontWeight: 700 }}>
                      Best: {toDisplay(point.bestWeightKg, unit).toFixed(1)} {unit}
                    </div>
                    {isCompound ? (
                      <div className="small muted">
                        e1RM: {typeof point.bestE1RMKg === "number"
                          ? `${toDisplay(point.bestE1RMKg, unit).toFixed(1)} ${unit}`
                          : "n/a"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExerciseAlternativesModal({
  openItem,
  options,
  onClose,
  onSelect
}: {
  openItem: { exerciseName: string } | null;
  options: AlternativeOption[];
  onClose: () => void;
  onSelect: (option: AlternativeOption) => void;
}) {
  useEffect(() => {
    if (!openItem) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openItem, onClose]);

  if (!openItem) return null;

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalCard exerciseInfoModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-alt-title"
      >
        <div className="exerciseInfoHeader">
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Swap exercise</div>
            <h3 id="exercise-alt-title" style={{ marginBottom: 4 }}>{openItem.exerciseName}</h3>
            <div className="small muted">Choose an alternative for this day</div>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {options.length === 0 ? (
          <div className="card exerciseInfoSection">
            <div className="small muted">
              No good alternatives found
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" disabled>
                Swap
              </button>
            </div>
          </div>
        ) : (
          <div className="list exerciseAltList">
            {options.map((option) => (
              <div key={option.templateId} className="card exerciseAltItem">
                <div className="exerciseAltMain">
                  <div className="exerciseAltName">{option.name}</div>
                  <div className="small muted">
                    {option.meta?.type ?? classifyCompound(option.name)}
                    {option.meta?.movementPattern ? ` • ${option.meta.movementPattern}` : ""}
                    {option.meta?.equipment ? ` • ${option.meta.equipment}` : ""}
                  </div>
                  {option.meta?.primaryMuscles?.length ? (
                    <div className="small muted">
                      {option.meta.primaryMuscles.join(", ")}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={() => onSelect(option)}>
                  Swap
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
