import { getPlot, getPlots, getTasks, plotScore, subscribe } from "./data.js";
import { fmtNum, getLocale, onLocaleChange, t } from "./i18n.js";
import { scoreBand } from "./score.js";
import { getUI, subscribeUI } from "./store.js";
import { el } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const localText = (value) => typeof value === "string" ? value : value?.[getLocale()] || value?.en || value?.bn || "";

function healthFor(plot) {
  for (const input of [plot, plot?.id]) {
    try {
      const result = plotScore(input);
      const score = Number(result?.score ?? result);
      if (Number.isFinite(score)) return score;
    } catch {}
  }
  return 0;
}

function makeSvg(metrics, overall) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "sf-performance__svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", "performance-chart-title");
  const title = document.createElementNS(SVG_NS, "title");
  title.id = "performance-chart-title";
  title.textContent = t("performance.chartLabel", { score: fmtNum(overall) });
  svg.append(title);
  const track = document.createElementNS(SVG_NS, "circle");
  for (const [key, value] of Object.entries({ cx: 60, cy: 60, r: 45, pathLength: 100 })) track.setAttribute(key, value);
  track.setAttribute("class", "sf-performance__track");
  svg.append(track);
  metrics.forEach((metric, index) => {
    const circle = document.createElementNS(SVG_NS, "circle");
    for (const [key, value] of Object.entries({ cx: 60, cy: 60, r: 45, pathLength: 100 })) circle.setAttribute(key, value);
    circle.setAttribute("class", `sf-performance__arc sf-performance__arc--${metric.key}`);
    circle.setAttribute("stroke-dasharray", `${Math.max(0, Math.min(30, metric.value * 0.3))} 100`);
    circle.setAttribute("stroke-dashoffset", String(index * -33.333));
    circle.setAttribute("transform", "rotate(-90 60 60)");
    const segmentTitle = document.createElementNS(SVG_NS, "title");
    segmentTitle.textContent = `${t(metric.label)} ${fmtNum(metric.value)}%`;
    circle.append(segmentTitle);
    svg.append(circle);
  });
  return svg;
}

function bandKey(score) {
  try {
    const result = scoreBand(score);
    return String(result?.key || result?.band || result || "watch").toLowerCase().replaceAll(" ", "_");
  } catch {
    return "watch";
  }
}

export function mountPerformance(container) {
  function render() {
    const plots = getPlots() || [];
    const selectedId = getUI()?.selectedPlotId;
    const selected = selectedId ? getPlot(selectedId) : null;
    const relevantPlots = selected ? [selected] : plots;
    const allTasks = getTasks() || [];
    const tasks = selected ? allTasks.filter((task) => task.plotId === selected.id) : allTasks;
    const totalArea = relevantPlots.reduce((sum, plot) => sum + Number(plot.areaM2 || 0), 0);
    const plantedArea = relevantPlots.reduce((sum, plot) => sum + (plot.cropId ? Number(plot.areaM2 || 0) : 0), 0);
    const utilization = totalArea ? plantedArea / totalArea * 100 : 0;
    const health = relevantPlots.length ? relevantPlots.reduce((sum, plot) => sum + healthFor(plot), 0) / relevantPlots.length : 0;
    const now = Date.now();
    const onTrack = tasks.length ? tasks.filter((task) => task.status === "complete" || !task.dueAt || new Date(task.dueAt).getTime() >= now).length / tasks.length * 100 : 100;
    const metrics = [
      { key: "utilization", label: "performance.utilization", value: utilization },
      { key: "health", label: "performance.health", value: health },
      { key: "track", label: "performance.onTrack", value: onTrack },
    ];
    const overall = metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length;
    const band = bandKey(overall);

    container.replaceChildren(el("article", { className: "sf-performance sf-card-pad" }, [
      el("div", { className: "sf-card-header" }, [
        el("div", {}, [
          el("h2", { className: "sf-card-title", text: t("performance.title"), attrs: { id: "perf-title" } }),
          el("p", { className: "sf-card-subtitle", text: selected ? localText(selected.name) : t("performance.wholeFarm") }),
        ]),
      ]),
      el("div", { className: "sf-performance__body" }, [
        el("div", { className: "sf-performance__chart" }, [
          makeSvg(metrics, overall),
          el("div", { className: `sf-performance__score sf-performance__score--${band}` }, [
            el("strong", { text: `${fmtNum(overall, { maximumFractionDigits: 0 })}%` }),
            el("span", { text: t(`score.${band}`) }),
          ]),
        ]),
        el("ul", { className: "sf-performance__legend" }, metrics.map((metric) => el("li", {
          attrs: { title: t("performance.metricExplanation", { metric: t(metric.label), value: fmtNum(metric.value) }) },
        }, [
          el("span", { className: `sf-performance__swatch sf-performance__swatch--${metric.key}`, attrs: { "aria-hidden": "true" } }),
          el("span", { text: t(metric.label) }),
          el("strong", { text: `${fmtNum(metric.value, { maximumFractionDigits: 0 })}%` }),
        ]))),
      ]),
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
