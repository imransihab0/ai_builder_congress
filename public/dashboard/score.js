export const DEFAULT_WEIGHTS = Object.freeze({
  soil: 0.3,
  moisture: 0.25,
  growth: 0.25,
  weather: 0.1,
  tasks: 0.1,
});

const FACTORS = Object.keys(DEFAULT_WEIGHTS);
const STAGE_MIDPOINTS = {
  seedling: 0.1,
  vegetative: 0.3,
  flowering: 0.5,
  fruiting: 0.72,
  harvest: 0.95,
};

function clamp(score) {
  return Math.min(100, Math.max(0, score));
}

export function rangeScore(value, min, max, tolerance) {
  if (![value, min, max, tolerance].every(Number.isFinite) || min > max || tolerance <= 0) {
    throw new RangeError("Range score requires finite bounds and a positive tolerance");
  }
  if (value >= min && value <= max) return 100;
  const distance = value < min ? min - value : value - max;
  return clamp(Math.round(100 - (distance / tolerance) * 100));
}

export function plotHealthScore(subscores, weights = DEFAULT_WEIGHTS) {
  const total = FACTORS.reduce((sum, factor) => {
    if (!Number.isFinite(subscores[factor]) || !Number.isFinite(weights[factor])) {
      throw new TypeError(`Invalid ${factor} score or weight`);
    }
    return sum + clamp(subscores[factor]) * weights[factor];
  }, 0);
  return Math.round(clamp(total) * 100) / 100;
}

export function scoreBand(score) {
  if (!Number.isFinite(score)) throw new TypeError("Score must be finite");
  if (score >= 80) return "healthy";
  if (score >= 55) return "watch";
  return "attention";
}

export function scoreLevel(score) {
  if (!Number.isFinite(score)) throw new TypeError("Score must be finite");
  return Math.max(1, Math.ceil(clamp(score) / 10));
}

export function computeSubscores(
  plot,
  { crop, weather = null, tasks = [], now = new Date().toISOString() },
) {
  const nutrientScore = (value, target) =>
    rangeScore(value, target * 0.85, target * 1.15, target * 0.5);
  const soil = Math.round(
    (nutrientScore(plot.soil.n, crop.nTarget) +
      nutrientScore(plot.soil.p, crop.pTarget) +
      nutrientScore(plot.soil.k, crop.kTarget) +
      rangeScore(plot.soil.ph, 6, 7.5, 1.5)) /
      4,
  );
  const moisture = rangeScore(
    plot.soil.moisture,
    crop.moistureMin,
    crop.moistureMax,
    20,
  );

  const elapsedDays = Math.max(0, Date.parse(now) - Date.parse(plot.plantedAt)) / 86400000;
  const elapsedFraction = Math.min(1, elapsedDays / crop.daysToHarvest);
  const expectedGrowth = STAGE_MIDPOINTS[plot.growthStage];
  const growth = clamp(Math.round(100 - Math.abs(elapsedFraction - expectedGrowth) * 200));

  let weatherScore = 100;
  if (weather) {
    const hourlyRain = Array.isArray(weather.hourly)
      ? Math.max(0, ...weather.hourly.map((hour) => Number(hour.rainProb) || 0))
      : 0;
    if (Math.max(Number(weather.rainProb) || 0, hourlyRain) >= 60) weatherScore -= 20;
    if (Number(weather.tempC) >= 36) weatherScore -= 20;
    if (Number(weather.windKmh) >= 40) weatherScore -= 20;
  }

  const linkedTasks = tasks.filter((task) => task.plotId === plot.id);
  const nowTime = Date.parse(now);
  const taskScore = linkedTasks.length
    ? linkedTasks.reduce((sum, task) => {
        if (task.status === "complete" || !task.dueAt) return sum + 100;
        const dueTime = Date.parse(task.dueAt);
        if (!Number.isFinite(dueTime) || dueTime >= nowTime) return sum + 100;
        const overdueDays = (nowTime - dueTime) / 86400000;
        return sum + clamp(100 - overdueDays * 20);
      }, 0) / linkedTasks.length
    : 100;

  return {
    soil: clamp(soil),
    moisture: clamp(moisture),
    growth: clamp(growth),
    weather: clamp(weatherScore),
    tasks: Math.round(clamp(taskScore) * 100) / 100,
  };
}
