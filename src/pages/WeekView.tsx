import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { classifyCompound, db, getActiveUserId } from "../db/db";
import type { Unit } from "../services/units";
import { lbToKg } from "../services/units";
import type {
  WeekPlan,
  PlannedExercise,
  SetEntry,
  ExerciseMeta,
  ExerciseTemplate,
  ExerciseEquipment,
  CustomExercise,
  ExerciseMetaType
} from "../db/types";
import { findRecentPRs } from "../services/progressTracker";
import type { PRComparison } from "../services/progressTracker";
import SessionSummary from "../components/SessionSummary";
import DayCard from "../components/DayCard";
import ExerciseInfoModal from "../components/ExerciseInfoModal";
import ExerciseHistoryModal from "../components/ExerciseHistoryModal";
import ExerciseAlternativesModal from "../components/ExerciseAlternativesModal";
import type { UserEquipment, AlternativeOption } from "../components/weekViewTypes";

// ─── Utility helpers ──────────────────────────────────────────────────────────

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

function customEquipToExerciseEquipment(eq: string): ExerciseEquipment {
  if (eq === "barbell" || eq === "cable" || eq === "machine") return "gym";
  if (eq === "dumbbell") return "home";
  if (eq === "bodyweight") return "minimal";
  return "either";
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

// ─── Main component ────────────────────────────────────────────────────────────

export default function WeekView({ week }: { week: WeekPlan }) {
  const [infoExerciseName, setInfoExerciseName] = useState<string | null>(null);
  const [historyExerciseName, setHistoryExerciseName] = useState<string | null>(null);
  const [alternativePicker, setAlternativePicker] = useState<{
    dayId: string;
    exId: string;
    exerciseName: string;
    dayExercises: PlannedExercise[];
  } | null>(null);

  // Rest timer state
  const [timerExerciseName, setTimerExerciseName] = useState<string | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerTotal, setTimerTotal] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session summary state
  const [sessionSummaryDayId, setSessionSummaryDayId] = useState<string | null>(null);
  const [pendingPRs, setPendingPRs] = useState<PRComparison[]>([]);

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
  const rawBuiltinTemplates = useLiveQuery(() => db.exerciseTemplates.toArray(), [], [] as ExerciseTemplate[]);
  const exerciseMetaRows = useLiveQuery(() => db.exerciseMeta.toArray(), [], [] as ExerciseMeta[]);
  const restTimerEnabled = useLiveQuery(async () => {
    const s = await db.settings.get("restTimerEnabled");
    return s?.value !== "false";
  }, [], true);
  const rawCustomExercises = useLiveQuery(
    async () => activeUserId ? db.customExercises.where("userId").equals(activeUserId).toArray() : [],
    [activeUserId], [] as CustomExercise[]
  );

  const exerciseTemplates = useMemo<ExerciseTemplate[]>(() => {
    const customs: ExerciseTemplate[] = (rawCustomExercises ?? []).map((cx) => ({
      id: cx.id,
      name: cx.name,
      defaultSets: cx.type === "compound" ? 4 : 3,
      repRange: cx.type === "compound" ? { min: 6, max: 10 } : { min: 10, max: 15 }
    }));
    return [...(rawBuiltinTemplates ?? []), ...customs];
  }, [rawBuiltinTemplates, rawCustomExercises]);

  const exerciseTemplateIdByName = useMemo(
    () => new Map(exerciseTemplates.map((t) => [t.name, t.id])),
    [exerciseTemplates]
  );
  const exerciseMetaByTemplateId = useMemo(() => {
    const map = new Map(exerciseMetaRows.map((m) => [m.exerciseTemplateId, m]));
    for (const cx of rawCustomExercises ?? []) {
      map.set(cx.id, {
        exerciseTemplateId: cx.id,
        primaryMuscles: [cx.muscleGroup],
        movementPattern: cx.type === "compound" ? "push" : "isolation",
        equipment: customEquipToExerciseEquipment(cx.equipment),
        type: cx.type as ExerciseMetaType
      });
    }
    return map;
  }, [exerciseMetaRows, rawCustomExercises]);

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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (timerDebounceRef.current) clearTimeout(timerDebounceRef.current);
    };
  }, []);

  function startRestTimer(exerciseName: string) {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const type = classifyCompound(exerciseName);
    const total = type === "compound" ? 90 : 60;
    setTimerExerciseName(exerciseName);
    setTimerRemaining(total);
    setTimerTotal(total);
    timerIntervalRef.current = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopRestTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerExerciseName(null);
    setTimerRemaining(0);
    setTimerTotal(0);
  }

  async function updateWeek(updated: WeekPlan) {
    await db.weekPlans.update(week.id, updated);
  }

  function requestDayComplete(dayId: string, val: boolean) {
    if (val) {
      const prs = findRecentPRs(allUserWeeks ?? [], week.weekNumber);
      setPendingPRs(prs);
      setSessionSummaryDayId(dayId);
    } else {
      const updated: WeekPlan = {
        ...week,
        days: week.days.map((d) => (d.id === dayId ? { ...d, isComplete: false } : d))
      };
      void updateWeek(updated);
    }
  }

  function confirmDayComplete() {
    if (!sessionSummaryDayId) return;
    const dayId = sessionSummaryDayId;
    setSessionSummaryDayId(null);
    setPendingPRs([]);
    const targetDay = week.days.find((d) => d.id === dayId);
    const durationMinutes = targetDay?.workoutStartedAt
      ? Math.round((Date.now() - new Date(targetDay.workoutStartedAt).getTime()) / 60000)
      : undefined;
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) =>
        d.id === dayId ? { ...d, isComplete: true, workoutDurationMinutes: durationMinutes } : d
      )
    };
    void updateWeek(updated);
  }

  function updateSet(dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) {
    const targetDay = week.days.find((d) => d.id === dayId);
    const targetEx = targetDay?.exercises.find((e) => e.id === exId);
    const isCompletingSet = patch.completed === true;
    const needsStartTime = isCompletingSet && targetDay && !targetDay.workoutStartedAt;

    if (isCompletingSet && restTimerEnabled && targetEx) {
      if (timerDebounceRef.current) clearTimeout(timerDebounceRef.current);
      timerDebounceRef.current = setTimeout(() => {
        startRestTimer(targetEx.name);
        timerDebounceRef.current = null;
      }, 1500);
    }

    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          workoutStartedAt: needsStartTime ? new Date().toISOString() : d.workoutStartedAt,
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
              : { ...ex, plannedWeightKg: weightKg }
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
          onDayComplete={requestDayComplete}
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
          timerExerciseName={timerExerciseName}
          timerRemaining={timerRemaining}
          timerTotal={timerTotal}
          onRestTimerDismiss={stopRestTimer}
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

      {sessionSummaryDayId && (() => {
        const summaryDay = week.days.find((d) => d.id === sessionSummaryDayId);
        return summaryDay ? (
          <SessionSummary
            day={summaryDay}
            unit={unit}
            prs={pendingPRs}
            onConfirm={confirmDayComplete}
            onCancel={() => { setSessionSummaryDayId(null); setPendingPRs([]); }}
          />
        ) : null;
      })()}
    </div>
  );
}
