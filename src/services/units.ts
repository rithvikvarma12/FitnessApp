export type Unit = "kg" | "lb";
const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number) {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number) {
  return lb * KG_PER_LB;
}

export type EquipmentType = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";

// Equipment-aware rounding: stack-loaded gear (machines, cables) typically
// jumps in larger increments than free-weight plates.
export function roundToEquipmentIncrement(
  displayWeight: number,
  unit: Unit,
  equipment: EquipmentType
): number {
  let increment: number;

  if (unit === "lb") {
    switch (equipment) {
      case "machine":
      case "cable":
        increment = 10;
        break;
      case "dumbbell":
        increment = 5;
        break;
      case "barbell":
      default:
        increment = 5;
        break;
    }
  } else {
    switch (equipment) {
      case "machine":
      case "cable":
        increment = 5;
        break;
      case "dumbbell":
        increment = 2.5;
        break;
      case "barbell":
      default:
        increment = 2.5;
        break;
    }
  }

  return Math.round(displayWeight / increment) * increment;
}

// Best-effort classification by exercise name. Falls back to "barbell" when
// no keyword matches (the most conservative — smallest increment).
export function inferEquipmentFromName(name: string): EquipmentType {
  const n = name.toLowerCase();
  if (n.includes("cable") || n.includes("pressdown") || n.includes("pulldown") || n.includes("crossover")) return "cable";
  if (n.includes("machine") || n.includes("smith")) return "machine";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "dumbbell";
  if (n.includes("pull-up") || n.includes("chin-up") || n.includes("dip") || n.includes("push-up") || n.includes("bodyweight")) return "bodyweight";
  return "barbell";
}

export function toDisplay(valueKg: number, unit: Unit) {
  return unit === "kg" ? valueKg : kgToLb(valueKg);
}

// Plate-rounded display value as a number (for exercise input values).
export function toDisplayRounded(
  valueKg: number,
  unit: Unit,
  equipment: EquipmentType = "barbell"
): number {
  return roundToEquipmentIncrement(toDisplay(valueKg, unit), unit, equipment);
}

// Body-weight formatter — 1-decimal precision; do NOT plate-round (a scale reads
// 75.3 kg, not 75 kg).
export function formatWeight(value: number, unit: Unit) {
  return unit === "kg" ? value.toFixed(1) : kgToLb(value).toFixed(1);
}

export function fromDisplay(value: number, unit: Unit) {
  return unit === "kg" ? value : lbToKg(value);
}