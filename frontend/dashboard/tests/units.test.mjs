import test from "node:test";
import assert from "node:assert/strict";
import { setLocale } from "../i18n.js";
import {
  convertArea,
  formatArea,
  getConversions,
  setAreaUnit,
  setConversions,
  unitLabel,
} from "../units.js";

test("area conversions use configurable Bangladesh land units", () => {
  assert.equal(convertArea(10000, "ha"), 1);
  assert.equal(convertArea(4047, "decimal"), 100);

  const conversion = getConversions();
  const m2 = 2 * conversion.decimalPerBigha * conversion.m2PerDecimal;
  const bigha = convertArea(m2, "bigha", conversion);
  assert.equal(bigha, 2);
  assert.equal(bigha * conversion.decimalPerBigha * conversion.m2PerDecimal, m2);

  const original = getConversions();
  try {
    setConversions({ decimalPerBigha: 32 });
    assert.equal(convertArea(32 * original.m2PerDecimal, "bigha"), 1);
  } finally {
    setConversions(original);
  }
});

test("formatted areas contain the localized unit", () => {
  try {
    setLocale("bn");
    assert.ok(formatArea(10000, "ha").includes(unitLabel("ha")));
    setLocale("en");
    assert.ok(formatArea(4047, "decimal").includes(unitLabel("decimal")));
  } finally {
    setLocale("bn");
    setAreaUnit("ha");
  }
});
