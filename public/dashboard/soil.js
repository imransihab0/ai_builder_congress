import { getCrop, getPlot, getPlots, subscribe } from "./data.js";
import { fmtNum, getLocale, onLocaleChange, t } from "./i18n.js";
import { getUI, subscribeUI } from "./store.js";
import { el, icon } from "./ui.js";

const localText = (value) => typeof value === "string" ? value : value?.[getLocale()] || value?.en || value?.bn || "";

function averageSoil(plots) {
  if (!plots.length) return { n: 0, p: 0, k: 0 };
  return ["n", "p", "k"].reduce((result, key) => {
    result[key] = plots.reduce((sum, plot) => sum + Number(plot.soil?.[key] || 0), 0) / plots.length;
    return result;
  }, {});
}

function normalizeTarget(value) {
  if (Array.isArray(value) && value.length >= 2) return { min: Number(value[0]), max: Number(value[1]) };
  if (Number.isFinite(Number(value?.min)) && Number.isFinite(Number(value?.max))) return { min: Number(value.min), max: Number(value.max) };
  if (Number.isFinite(Number(value))) return { min: Number(value), max: Number(value) };
  return null;
}

function targetFor(plot, crop, key) {
  const candidates = [
    plot?.soilTargets?.[key],
    plot?.targets?.soil?.[key],
    crop?.soilTargets?.[key],
    crop?.targets?.soil?.[key],
    crop?.targets?.[key],
    crop?.target?.[key],
  ];
  for (const candidate of candidates) {
    const target = normalizeTarget(candidate);
    if (target && Number.isFinite(target.min) && Number.isFinite(target.max)) return target;
  }
  return null;
}

function readingState(value, target) {
  if (!target) return "good";
  if (value >= target.min && value <= target.max) return "good";
  const distance = value < target.min ? target.min - value : value - target.max;
  const span = Math.max(target.max - target.min, target.min * 0.35, 1);
  return distance > span ? "danger" : "low";
}

export function mountSoil(container) {
  function render() {
    const plots = getPlots() || [];
    const selectedId = getUI()?.selectedPlotId;
    const selected = selectedId ? getPlot(selectedId) : null;
    const crop = selected?.cropId ? getCrop(selected.cropId) : null;
    const soil = selected?.soil || averageSoil(plots);
    const cropName = localText(crop?.name);
    const context = selected ? localText(selected.name) : t("soil.farmAverage");

    const rows = [
      ["n", "soil.nitrogen"],
      ["p", "soil.phosphorus"],
      ["k", "soil.potassium"],
    ].map(([key, labelKey]) => {
      const value = Number(soil?.[key] || 0);
      const target = targetFor(selected, crop, key);
      const state = readingState(value, target);
      const scale = Math.max(value * 1.25, Number(target?.max || 0) * 1.25, 1);
      const fill = Math.min(100, value / scale * 100);
      const marker = target ? Math.min(100, ((target.min + target.max) / 2) / scale * 100) : null;
      const nutrient = t(labelKey);
      const tooltip = crop
        ? t(`soil.${state}Explanation`, { nutrient, crop: cropName, value: fmtNum(value) })
        : `${nutrient}: ${fmtNum(value)} ${t("unit.ppm")} - ${context}`;

      return el("div", { className: "sf-soil__row", attrs: { title: tooltip, tabindex: 0 } }, [
        el("div", { className: "sf-soil__label" }, [
          el("span", {}, [el("b", { text: key.toUpperCase() }), el("small", { text: nutrient })]),
          el("strong", { text: `${fmtNum(value, { maximumFractionDigits: 1 })} ${t("unit.ppm")}` }),
        ]),
        el("div", {
          className: "sf-soil__track",
          attrs: {
            role: "progressbar",
            "aria-label": nutrient,
            "aria-valuemin": 0,
            "aria-valuemax": Math.ceil(scale),
            "aria-valuenow": value,
            "aria-valuetext": tooltip,
          },
        }, [
          el("span", { className: `sf-soil__fill sf-soil__fill--${state}`, attrs: { style: `--sf-fill:${fill}%` } }),
          marker == null ? null : el("span", { className: "sf-soil__target", attrs: { style: `--sf-target:${marker}%`, title: t("soil.target") } }),
        ]),
      ]);
    });

    container.replaceChildren(el("article", { className: "sf-soil sf-card-pad" }, [
      el("div", { className: "sf-card-header" }, [
        el("div", {}, [
          el("h2", { className: "sf-card-title", text: t("soil.title"), attrs: { id: "soil-title" } }),
          el("p", { className: "sf-card-subtitle", text: context }),
        ]),
        el("span", { className: "sf-soil__leaf" }, [icon("leaf")]),
      ]),
      plots.length ? el("div", { className: "sf-soil__rows" }, rows) : el("div", { className: "sf-empty" }, [icon("leaf"), el("span", { text: t("soil.noReadings") })]),
    ]));
  }

  render();
  const offData = subscribe(render);
  const offUI = subscribeUI(render);
  const offLocale = onLocaleChange(render);
  return () => {
    offData?.();
    offUI?.();
    offLocale?.();
    container.replaceChildren();
  };
}
