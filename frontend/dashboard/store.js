const TASK_FILTERS = ["all", "waiting", "progress", "complete"];
const MAP_LAYERS = ["base", "health", "moisture"];

let ui = {
  selectedPlotId: null,
  taskFilter: "all",
  mapLayer: "base",
};
const listeners = new Set();

function update(key, value) {
  if (ui[key] === value) return getUI();
  ui = { ...ui, [key]: value };
  listeners.forEach((listener) => listener(getUI()));
  return getUI();
}

export function getUI() {
  return { ...ui };
}

export function setSelectedPlot(id) {
  if (id !== null && (typeof id !== "string" || !id)) {
    throw new TypeError("Selected plot must be a non-empty id or null");
  }
  return update("selectedPlotId", id);
}

export function setTaskFilter(filter) {
  if (!TASK_FILTERS.includes(filter)) throw new RangeError(`Unsupported task filter: ${filter}`);
  return update("taskFilter", filter);
}

export function setMapLayer(layer) {
  if (!MAP_LAYERS.includes(layer)) throw new RangeError(`Unsupported map layer: ${layer}`);
  return update("mapLayer", layer);
}

export function subscribeUI(listener) {
  if (typeof listener !== "function") throw new TypeError("UI listener must be a function");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
