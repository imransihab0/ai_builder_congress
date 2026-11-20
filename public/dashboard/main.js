import { applyDocumentLang, onLocaleChange, t } from "./i18n.js";
import { mountShell } from "./shell.js";
import { mountHero } from "./hero.js";
import { mountKpis } from "./kpi.js";
import { mountWeather } from "./weather.js";
import { mountSoil } from "./soil.js";
import { mountPerformance } from "./performance.js";
import { mountTasks } from "./tasks.js";
import { mountFarmMap } from "./map.js";
import { closePlot3D, openPlot3D } from "./plot3d.js";
import { el, toast } from "./ui.js";

applyDocumentLang();

const cleanups = [];

function localizeStaticShell() {
  document.title = `${t("dashboard.title")} — AgriSphere`;
  document.querySelector(".skip-link").textContent = t("common.skipContent");
  document.getElementById("rail").setAttribute("aria-label", t("common.primaryNavigation"));
  document.getElementById("bottom-nav").setAttribute("aria-label", t("common.primaryNavigation"));
  document.getElementById("kpi-row").setAttribute("aria-label", t("common.kpiLabel"));
}

localizeStaticShell();
cleanups.push(onLocaleChange(localizeStaticShell));

function mount(containerId, setup) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  try {
    const mounted = setup(container);
    if (typeof mounted === "function") cleanups.push(mounted);
    return mounted;
  } catch (error) {
    console.error(`Dashboard mount failed: ${containerId}`, error);
    container.replaceChildren(el("p", { className: "sf-empty", text: t("common.error") }));
    return null;
  }
}

async function openPlot(plotId) {
  try {
    await openPlot3D(plotId);
  } catch (error) {
    console.error("3D plot failed to open", error);
    toast(t("plot.staticFallback"), { tone: "warning" });
  }
}

mount("rail", (rail) => mountShell({ rail, bottomNav: document.getElementById("bottom-nav") }));
const taskController = mount("task-strip", (container) => mountTasks(container, { onOpenPlot: openPlot }));
if (taskController?.destroy) cleanups.push(taskController.destroy);
mount("hero", (container) => mountHero(container, { onAddTask: taskController?.openCreate }));
mount("kpi-row", mountKpis);
mount("weather-card", mountWeather);
mount("soil-card", mountSoil);
mount("performance-card", mountPerformance);
mount("map-card", (container) => mountFarmMap(container, { onOpenPlot: openPlot }));

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  closePlot3D();
  cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
});
