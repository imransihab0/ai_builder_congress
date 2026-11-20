import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WEIGHTS, plotHealthScore, rangeScore, scoreBand } from "../score.js";

test("default weights and weighted scores are exact", () => {
  assert.equal(Object.values(DEFAULT_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
  assert.equal(plotHealthScore({ soil: 100, moisture: 100, growth: 100, weather: 100, tasks: 100 }), 100);
  assert.equal(
    plotHealthScore(
      { soil: 17, moisture: 42, growth: 63, weather: 81, tasks: 37.25 },
      { soil: 0, moisture: 0, growth: 0, weather: 0, tasks: 1 },
    ),
    37.25,
  );
});

test("range and band boundaries are inclusive", () => {
  assert.equal(rangeScore(10, 10, 20, 5), 100);
  assert.equal(rangeScore(20, 10, 20, 5), 100);
  assert.equal(rangeScore(7.5, 10, 20, 5), 50);
  assert.equal(rangeScore(25, 10, 20, 5), 0);
  assert.equal(scoreBand(80), "healthy");
  assert.equal(scoreBand(79.99), "watch");
  assert.equal(scoreBand(55), "watch");
  assert.equal(scoreBand(54.99), "attention");
});
