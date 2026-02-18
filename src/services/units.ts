export type Unit = "kg" | "lb";
const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number) {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number) {
  return lb * KG_PER_LB;
}

export function formatWeight(value: number, unit: Unit) {
  return unit === "kg" ? value.toFixed(1) : kgToLb(value).toFixed(1);
}

export function toDisplay(valueKg: number, unit: Unit) {
  return unit === "kg" ? valueKg : kgToLb(valueKg);
}

export function fromDisplay(value: number, unit: Unit) {
  return unit === "kg" ? value : lbToKg(value);
}