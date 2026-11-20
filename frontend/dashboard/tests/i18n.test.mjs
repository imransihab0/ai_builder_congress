import test from "node:test";
import assert from "node:assert/strict";
import { fmtNum, setLocale, t } from "../i18n.js";

test("numbers and missing messages follow the active locale", () => {
  try {
    setLocale("bn");
    assert.equal(fmtNum(123), "১২৩");
    assert.equal(t("dashboard.title"), "আমার খামার");
    setLocale("en");
    assert.equal(fmtNum(123), "123");
    assert.equal(t("dashboard.title"), "My Farm");
    assert.equal(t("missing.message"), "missing.message");
  } finally {
    setLocale("bn");
  }
});
