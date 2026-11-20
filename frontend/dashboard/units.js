import { fmtNum, t } from "./i18n.js";

export const AREA_UNITS = Object.freeze(["ha", "bigha", "decimal"]);
export const DEFAULT_CONVERSIONS = Object.freeze({
  m2PerDecimal: 40.47,
  decimalPerBigha: 33,
});

let conversions = { ...DEFAULT_CONVERSIONS };
let areaUnit = "ha";
const listeners = new Set();

function assertUnit(unit) {
  if (!AREA_UNITS.includes(unit)) throw new RangeError(`Unsupported area unit: ${unit}`);
}

function validateConversions(value) {
  for (const key of Object.keys(DEFAULT_CONVERSIONS)) {
    if (!Number.isFinite(value[key]) || value[key] <= 0) {
      throw new RangeError(`${key} must be a finite positive number`);
    }
  }
}

export function getConversions() {
  return { ...conversions };
}

export function setConversions(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Conversion patch must be an object");
  }
  const unknown = Object.keys(patch).find((key) => !(key in DEFAULT_CONVERSIONS));
  if (unknown) throw new RangeError(`Unsupported conversion: ${unknown}`);

  const next = { ...conversions, ...patch };
  validateConversions(next);
  conversions = next;
  return getConversions();
}

export function convertArea(m2, unit, conv = getConversions()) {
  assertUnit(unit);
  if (!Number.isFinite(m2) || m2 < 0) throw new RangeError("Area must be a finite non-negative number");
  validateConversions(conv);

  if (unit === "ha") return m2 / 10000;
  const decimal = m2 / conv.m2PerDecimal;
  return unit === "decimal" ? decimal : decimal / conv.decimalPerBigha;
}

export function formatArea(m2, unit = getAreaUnit()) {
  return `${fmtNum(convertArea(m2, unit), 2)} ${unitLabel(unit)}`;
}

export function unitLabel(unit) {
  assertUnit(unit);
  return t(`unit.${unit}`);
}

export function getAreaUnit() {
  return areaUnit;
}

export function setAreaUnit(unit) {
  assertUnit(unit);
  if (areaUnit === unit) return areaUnit;
  areaUnit = unit;
  listeners.forEach((listener) => listener(areaUnit));
  return areaUnit;
}

export function onAreaUnitChange(listener) {
  if (typeof listener !== "function") throw new TypeError("Area unit listener must be a function");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
