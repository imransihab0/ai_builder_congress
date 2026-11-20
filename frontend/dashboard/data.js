import { computeSubscores, plotHealthScore, scoreBand } from "./score.js";

const DAY = 86400000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();
const daysFromNow = (days) => new Date(Date.now() + days * DAY).toISOString();
const clone = (value) => structuredClone(value);

function rectanglePolygon(lng, lat, widthM, heightM) {
  const halfLng = widthM / (2 * 111320 * Math.cos((lat * Math.PI) / 180));
  const halfLat = heightM / (2 * 111320);
  const west = lng - halfLng;
  const east = lng + halfLng;
  const south = lat - halfLat;
  const north = lat + halfLat;
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

const farm = {
  id: "farm-savar",
  name: { bn: "সাভার সবুজ খামার", en: "Savar Green Farm" },
  center: [90.285, 23.91],
  timezone: "Asia/Dhaka",
};

// Agronomic targets are UI placeholders requiring BARC/SRDI/BRRI review.
const crops = [
  { id: "rice", name: { bn: "ধান", en: "Rice" }, model: "rice", color: "#84a83d", nTarget: 28, pTarget: 16, kTarget: 24, moistureMin: 65, moistureMax: 80, daysToHarvest: 120 },
  { id: "tomato", name: { bn: "টমেটো", en: "Tomato" }, model: "tomato", color: "#d95f45", nTarget: 32, pTarget: 18, kTarget: 28, moistureMin: 55, moistureMax: 70, daysToHarvest: 100 },
  { id: "brinjal", name: { bn: "বেগুন", en: "Brinjal" }, model: "brinjal", color: "#73528c", nTarget: 30, pTarget: 17, kTarget: 26, moistureMin: 55, moistureMax: 70, daysToHarvest: 120 },
  { id: "jute", name: { bn: "পাট", en: "Jute" }, model: "jute", color: "#558b56", nTarget: 26, pTarget: 14, kTarget: 22, moistureMin: 60, moistureMax: 75, daysToHarvest: 120 },
  { id: "potato", name: { bn: "আলু", en: "Potato" }, model: "potato", color: "#b68b4c", nTarget: 34, pTarget: 20, kTarget: 30, moistureMin: 60, moistureMax: 75, daysToHarvest: 95 },
  { id: "chili", name: { bn: "মরিচ", en: "Chili" }, model: "chili", color: "#c7473a", nTarget: 30, pTarget: 18, kTarget: 28, moistureMin: 50, moistureMax: 65, daysToHarvest: 130 },
].map((crop) => ({
  ...crop,
  soilTargets: {
    n: [crop.nTarget * 0.85, crop.nTarget * 1.15],
    p: [crop.pTarget * 0.85, crop.pTarget * 1.15],
    k: [crop.kTarget * 0.85, crop.kTarget * 1.15],
  },
}));

function makePlot({ id, bn, en, lng, lat, width, height, cropId, plantCount, soil, growthStage, issues = [], plantedDaysAgo }) {
  return {
    id,
    name: { bn, en },
    polygon: rectanglePolygon(lng, lat, width, height),
    cropId,
    plantCount,
    areaM2: width * height,
    soil: { ...soil, updatedAt: daysAgo(0.25) },
    growthStage,
    issues,
    plantedAt: daysAgo(plantedDaysAgo),
  };
}

const plots = [
  makePlot({ id: "plot-1", bn: "প্লট ১", en: "Plot 1", lng: 90.276, lat: 23.901, width: 42, height: 34, cropId: "rice", plantCount: 3100, soil: { n: 29, p: 16, k: 25, ph: 6.6, moisture: 72 }, growthStage: "vegetative", plantedDaysAgo: 36 }),
  makePlot({ id: "plot-2", bn: "প্লট ২", en: "Plot 2", lng: 90.282, lat: 23.904, width: 55, height: 38, cropId: "rice", plantCount: 4600, soil: { n: 27, p: 15, k: 23, ph: 6.4, moisture: 69 }, growthStage: "flowering", plantedDaysAgo: 60 }),
  makePlot({ id: "plot-3", bn: "প্লট ৩", en: "Plot 3", lng: 90.289, lat: 23.907, width: 36, height: 30, cropId: "tomato", plantCount: 820, soil: { n: 33, p: 18, k: 29, ph: 6.5, moisture: 62 }, growthStage: "fruiting", plantedDaysAgo: 72 }),
  makePlot({ id: "plot-4", bn: "প্লট ৪", en: "Plot 4", lng: 90.296, lat: 23.91, width: 48, height: 32, cropId: "brinjal", plantCount: 940, soil: { n: 29, p: 17, k: 27, ph: 6.7, moisture: 64 }, growthStage: "flowering", plantedDaysAgo: 60 }),
  makePlot({ id: "plot-5", bn: "প্লট ৫", en: "Plot 5", lng: 90.303, lat: 23.914, width: 60, height: 40, cropId: "jute", plantCount: 5200, soil: { n: 26, p: 15, k: 21, ph: 6.3, moisture: 68 }, growthStage: "vegetative", plantedDaysAgo: 36 }),
  makePlot({ id: "plot-6", bn: "প্লট ৬", en: "Plot 6", lng: 90.309, lat: 23.918, width: 44, height: 35, cropId: "potato", plantCount: 1800, soil: { n: 35, p: 19, k: 31, ph: 6.4, moisture: 67 }, growthStage: "flowering", plantedDaysAgo: 48 }),
  makePlot({ id: "plot-7", bn: "প্লট ৭", en: "Plot 7", lng: 90.314, lat: 23.923, width: 50, height: 36, cropId: "chili", plantCount: 1300, soil: { n: 31, p: 18, k: 27, ph: 6.8, moisture: 58 }, growthStage: "fruiting", plantedDaysAgo: 94 }),
  makePlot({ id: "plot-8", bn: "প্লট ৮", en: "Plot 8", lng: 90.269, lat: 23.928, width: 40, height: 28, cropId: "potato", plantCount: 1250, soil: { n: 20, p: 13, k: 19, ph: 5.7, moisture: 50 }, growthStage: "fruiting", issues: [{ id: "issue-8-n", kind: "low_n", severity: 2 }, { id: "issue-8-water", kind: "water_stress", severity: 1 }], plantedDaysAgo: 55 }),
  makePlot({ id: "plot-9", bn: "প্লট ৯", en: "Plot 9", lng: 90.278, lat: 23.934, width: 34, height: 26, cropId: "chili", plantCount: 680, soil: { n: 21, p: 14, k: 22, ph: 5.9, moisture: 42 }, growthStage: "flowering", issues: [{ id: "issue-9-water", kind: "water_stress", severity: 2 }], plantedDaysAgo: 65 }),
  makePlot({ id: "plot-10", bn: "প্লট ১০", en: "Plot 10", lng: 90.289, lat: 23.94, width: 46, height: 30, cropId: "rice", plantCount: 2900, soil: { n: 18, p: 10, k: 17, ph: 5.8, moisture: 57 }, growthStage: "vegetative", issues: [{ id: "issue-10-n", kind: "low_n", severity: 2 }, { id: "issue-10-p", kind: "low_p", severity: 1 }], plantedDaysAgo: 50 }),
  makePlot({ id: "plot-11", bn: "প্লট ১১", en: "Plot 11", lng: 90.302, lat: 23.946, width: 38, height: 24, cropId: "rice", plantCount: 1700, soil: { n: 9, p: 5, k: 8, ph: 5.1, moisture: 30 }, growthStage: "vegetative", issues: [{ id: "issue-11-n", kind: "low_n", severity: 3 }, { id: "issue-11-water", kind: "water_stress", severity: 3 }, { id: "issue-11-pest", kind: "pest_risk", severity: 2 }], plantedDaysAgo: 100 }),
  makePlot({ id: "plot-12", bn: "প্লট ১২", en: "Plot 12", lng: 90.32, lat: 23.951, width: 32, height: 22, cropId: "tomato", plantCount: 430, soil: { n: 12, p: 7, k: 11, ph: 5.3, moisture: 85 }, growthStage: "seedling", issues: [{ id: "issue-12-n", kind: "low_n", severity: 3 }, { id: "issue-12-flood", kind: "flood_risk", severity: 3 }, { id: "issue-12-disease", kind: "disease_risk", severity: 2 }], plantedDaysAgo: 85 }),
];

let tasks = [
  { id: "task-1", title: { bn: "সেচ লাইন পরীক্ষা", en: "Check irrigation line" }, plotId: "plot-1", status: "complete", dueAt: daysAgo(6), createdBy: "farmer" },
  { id: "task-2", title: { bn: "জৈব পদার্থ প্রয়োগ", en: "Apply organic matter" }, plotId: "plot-2", status: "complete", dueAt: daysAgo(5), createdBy: "farmer" },
  { id: "task-3", title: { bn: "টমেটোর খুঁটি বাঁধা", en: "Tie tomato supports" }, plotId: "plot-3", status: "complete", dueAt: daysAgo(4), createdBy: "farmer" },
  { id: "task-4", title: { bn: "পোকা পর্যবেক্ষণ", en: "Scout for pests" }, plotId: "plot-4", status: "complete", dueAt: daysAgo(3), createdBy: "agent" },
  { id: "task-5", title: { bn: "নালা পরিষ্কার", en: "Clear drainage channel" }, plotId: "plot-5", status: "complete", dueAt: daysAgo(3), createdBy: "farmer" },
  { id: "task-6", title: { bn: "আগাছা পরিষ্কার", en: "Clear row weeds" }, plotId: "plot-6", status: "complete", dueAt: daysAgo(2), createdBy: "farmer" },
  { id: "task-7", title: { bn: "ফসল তোলার প্রস্তুতি", en: "Prepare for harvest" }, plotId: "plot-7", status: "complete", dueAt: daysAgo(2), createdBy: "farmer" },
  { id: "task-8", title: { bn: "মাটি পরীক্ষা", en: "Test soil" }, plotId: "plot-1", status: "complete", dueAt: daysAgo(1), createdBy: "agent" },
  { id: "task-9", title: { bn: "পানির স্তর দেখা", en: "Check water level" }, plotId: "plot-2", status: "complete", dueAt: daysAgo(1), createdBy: "farmer" },
  { id: "task-10", title: { bn: "বৃদ্ধি নথিভুক্ত", en: "Record crop growth" }, plotId: "plot-3", status: "complete", dueAt: daysAgo(1), createdBy: "agent" },
  { id: "task-11", title: { bn: "নাইট্রোজেন ঘাটতি পরীক্ষা", en: "Check nitrogen deficiency" }, plotId: "plot-8", status: "waiting", dueAt: daysFromNow(1), createdBy: "agent" },
  { id: "task-12", title: { bn: "মাটির আর্দ্রতা পরীক্ষা", en: "Inspect soil moisture" }, plotId: "plot-9", status: "waiting", dueAt: daysFromNow(1), createdBy: "agent" },
  { id: "task-13", title: { bn: "মাটির নমুনা সংগ্রহ", en: "Collect soil sample" }, plotId: "plot-10", status: "waiting", dueAt: daysFromNow(2), createdBy: "farmer" },
  { id: "task-14", title: { bn: "কৃষি কর্মকর্তার সাথে কথা", en: "Contact agriculture officer" }, plotId: "plot-11", status: "waiting", dueAt: daysFromNow(1), createdBy: "agent" },
  { id: "task-15", title: { bn: "গাছের চাপ পরিদর্শন", en: "Inspect crop stress" }, plotId: "plot-12", status: "waiting", dueAt: daysFromNow(1), createdBy: "agent" },
  { id: "task-16", title: { bn: "পাতায় পোকা খোঁজা", en: "Check leaves for pests" }, plotId: "plot-4", status: "waiting", dueAt: daysFromNow(3), createdBy: "farmer" },
  { id: "task-17", title: { bn: "বীজের মজুত দেখা", en: "Review seed stock" }, status: "waiting", dueAt: daysFromNow(4), createdBy: "farmer" },
  { id: "task-18", title: { bn: "সেচ সমন্বয়", en: "Adjust irrigation" }, plotId: "plot-8", status: "progress", dueAt: daysFromNow(1), createdBy: "agent" },
  { id: "task-19", title: { bn: "মালচ বিছানো", en: "Lay mulch" }, plotId: "plot-9", status: "progress", dueAt: daysFromNow(2), createdBy: "farmer" },
  { id: "task-20", title: { bn: "নিষ্কাশন পরীক্ষা", en: "Inspect drainage" }, plotId: "plot-10", status: "progress", dueAt: daysFromNow(2), createdBy: "farmer" },
  { id: "task-21", title: { bn: "সেন্সর যাচাই", en: "Verify sensor reading" }, plotId: "plot-11", status: "progress", dueAt: daysFromNow(1), createdBy: "agent" },
  { id: "task-22", title: { bn: "আগাছা সরানো", en: "Remove weeds" }, plotId: "plot-12", status: "progress", dueAt: daysFromNow(3), createdBy: "farmer" },
];

const alerts = [
  { id: "alert-rain", kind: "rain", startsAt: daysFromNow(0.25), message: { bn: "সন্ধ্যায় ভারী বৃষ্টির সম্ভাবনা আছে।", en: "Heavy rain is possible this evening." } },
  { id: "alert-heat", kind: "heat", startsAt: daysFromNow(1), message: { bn: "আগামীকাল দুপুরে তাপমাত্রা বেশি থাকতে পারে।", en: "High temperatures are possible tomorrow afternoon." } },
];

let weatherSnapshot = null;

const listeners = new Set();
const TASK_STATUSES = ["waiting", "progress", "complete"];
let nextTaskId = 23;

function validateTask(task) {
  if (!task.title || typeof task.title.bn !== "string" || !task.title.bn.trim() || typeof task.title.en !== "string" || !task.title.en.trim()) {
    throw new TypeError("Task title must include non-empty bn and en text");
  }
  if (!TASK_STATUSES.includes(task.status)) throw new RangeError(`Unsupported task status: ${task.status}`);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function getFarm() {
  return clone(farm);
}

export function getPlots() {
  return clone(plots);
}

export function getPlot(id) {
  const plot = plots.find((item) => item.id === id);
  return plot ? clone(plot) : undefined;
}

export function getCrops() {
  return clone(crops);
}

export function getCrop(id) {
  const crop = crops.find((item) => item.id === id);
  return crop ? clone(crop) : undefined;
}

export function getTasks() {
  return clone(tasks);
}

export function getAlerts() {
  return clone(alerts);
}

export function getWeatherSnapshot() {
  return weatherSnapshot ? clone(weatherSnapshot) : null;
}

export function setWeatherSnapshot(snapshot) {
  if (snapshot !== null && (!Number.isFinite(snapshot?.tempC) || !Number.isFinite(snapshot?.windKmh))) {
    throw new TypeError("Weather snapshot requires finite temperature and wind values");
  }
  weatherSnapshot = snapshot ? clone(snapshot) : null;
  notify();
  return getWeatherSnapshot();
}

export async function createTask(input) {
  const task = { ...clone(input), id: `task-${nextTaskId}`, createdBy: input.createdBy ?? "farmer" };
  validateTask(task);
  nextTaskId += 1;
  tasks.push(task);
  notify();
  return clone(task);
}

export async function updateTask(id, patch) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error(`Task not found: ${id}`);
  const updated = { ...tasks[index], ...clone(patch), id };
  validateTask(updated);
  tasks[index] = updated;
  notify();
  return clone(updated);
}

export async function completeTask(id) {
  return updateTask(id, { status: "complete" });
}

export function subscribe(listener) {
  if (typeof listener !== "function") throw new TypeError("Data listener must be a function");
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function plotScore(plot, context = {}) {
  const crop = context.crop ?? crops.find((item) => item.id === plot.cropId);
  if (!crop) throw new Error(`Crop not found: ${plot.cropId}`);
  const subscores = computeSubscores(plot, {
    crop,
    weather: Object.hasOwn(context, "weather") ? context.weather : weatherSnapshot,
    tasks: context.tasks ?? tasks,
    now: context.now ?? new Date().toISOString(),
  });
  return plotHealthScore(subscores, context.weights);
}

export function plotsNeedingAttention() {
  return clone(plots.filter((plot) => scoreBand(plotScore(plot)) === "attention"));
}

export function derivedStats() {
  return {
    totalPlots: plots.length,
    totalCrops: new Set(plots.map((plot) => plot.cropId)).size,
    totalAreaM2: plots.reduce((total, plot) => total + plot.areaM2, 0),
    totalPlants: plots.reduce((total, plot) => total + plot.plantCount, 0),
    tasksCompleted: tasks.filter((task) => task.status === "complete").length,
    tasksPending: tasks.filter((task) => task.status !== "complete").length,
    plotsNeedingAttention: plotsNeedingAttention().length,
  };
}
