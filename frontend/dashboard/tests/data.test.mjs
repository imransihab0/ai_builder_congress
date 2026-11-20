import test from "node:test";
import assert from "node:assert/strict";
import {
  completeTask,
  createTask,
  derivedStats,
  getCrop,
  getCrops,
  getPlot,
  getPlots,
  getTasks,
  plotScore,
  setWeatherSnapshot,
  updateTask,
} from "../data.js";
import { computeSubscores } from "../score.js";

test("seed totals match the dashboard contract", () => {
  assert.equal(getPlots().length, 12);
  assert.equal(getCrops().length, 6);
  assert.equal(getTasks().length, 22);
  assert.deepEqual(
    { complete: derivedStats().tasksCompleted, pending: derivedStats().tasksPending },
    { complete: 10, pending: 12 },
  );
});

test("completing a linked task raises its task subscore and plot score", async () => {
  const task = getTasks().find((item) => item.plotId && item.status !== "complete");
  const original = { status: task.status, dueAt: task.dueAt };
  const plot = getPlot(task.plotId);
  const crop = getCrop(plot.cropId);
  await updateTask(task.id, { status: "waiting", dueAt: new Date(Date.now() - 2 * 86400000).toISOString() });
  const beforeTasks = getTasks();
  const beforeSubscore = computeSubscores(plot, { crop, tasks: beforeTasks }).tasks;
  const beforeScore = plotScore(plot);

  try {
    await completeTask(task.id);
    assert.ok(computeSubscores(plot, { crop, tasks: getTasks() }).tasks > beforeSubscore);
    assert.ok(plotScore(plot) > beforeScore);
  } finally {
    await updateTask(task.id, original);
  }
});

test("future work remains on time", () => {
  const plot = getPlot("plot-1");
  const crop = getCrop(plot.cropId);
  const futureTask = {
    id: "future-task",
    plotId: plot.id,
    status: "waiting",
    dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  assert.equal(computeSubscores(plot, { crop, tasks: [futureTask] }).tasks, 100);
});

test("live weather changes the shared plot score", () => {
  const plot = getPlot("plot-1");
  const calm = plotScore(plot, { weather: null });
  try {
    setWeatherSnapshot({ tempC: 38, windKmh: 45, rainProb: 80, hourly: [] });
    assert.ok(plotScore(plot) < calm);
  } finally {
    setWeatherSnapshot(null);
  }
});

test("derived task counts update after mutations", async () => {
  const before = derivedStats();
  const task = await createTask({
    title: { bn: "পরীক্ষামূলক কাজ", en: "Test task" },
    status: "waiting",
    createdBy: "farmer",
  });
  assert.equal(derivedStats().tasksPending, before.tasksPending + 1);

  await completeTask(task.id);
  assert.equal(derivedStats().tasksCompleted, before.tasksCompleted + 1);
  assert.equal(derivedStats().tasksPending, before.tasksPending);
});
