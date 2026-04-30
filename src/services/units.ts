export type Unit = "kg" | "lb";
const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number) {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number) {
  return lb * KG_PER_LB;
}

// Round a display weight to the nearest plate-friendly increment.
// 2.5 lb is the smallest standard plate combo in the US; 1 kg is the
// smallest commonly-stocked metric increment.
export function roundToPlateIncrement(displayWeight: number, unit: Unit): number {
  const increment = unit === "lb" ? 2.5 : 1;
  return Math.round(displayWeight / increment) * increment;
}

export function toDisplay(valueKg: number, unit: Unit) {
  return unit === "kg" ? valueKg : kgToLb(valueKg);
}

// Plate-rounded display value as a number (for input values).
export function toDisplayRounded(valueKg: number, unit: Unit): number {
  return roundToPlateIncrement(toDisplay(valueKg, unit), unit);
}

export function formatWeight(valueKg: number, unit: Unit) {
  const rounded = toDisplayRounded(valueKg, unit);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function fromDisplay(value: number, unit: Unit) {
  return unit === "kg" ? value : lbToKg(value);
}