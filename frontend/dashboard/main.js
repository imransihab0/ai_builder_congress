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
import { initializeData, refreshData } from "./data.js";

applyDocumentLang();

const cleanups = [];
let destroyed = false;

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

function mountDashboard() {
  mount("rail", (rail) => mountShell({ rail, bottomNav: document.getElementById("bottom-nav") }));
  const taskController = mount("task-strip", (container) => mountTasks(container, { onOpenPlot: openPlot }));
  if (taskController?.destroy) cleanups.push(taskController.destroy);
  mount("hero", (container) => mountHero(container, { onAddTask: taskController?.openCreate }));
  mount("kpi-row", mountKpis);
  mount("weather-card", mountWeather);
  mount("soil-card", mountSoil);
  mount("performance-card", mountPerformance);
  mount("map-card", (container) => mountFarmMap(container, { onOpenPlot: openPlot }));
}

async function start() {
  const root = document.getElementById("sf-root");
  root?.setAttribute("aria-busy", "true");
  let online = false;
  try {
    await initializeData();
    online = true;
  } catch (error) {
    console.warn("Dashboard backend initialization failed", error);
  }
  if (destroyed) return;

  mountDashboard();
  root?.removeAttribute("aria-busy");
  if (!online) {
    toast(t("common.backendUnavailable"), { tone: "warning" });
    return;
  }

  let refreshing = false;
  const poll = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      await refreshData();
    } catch (error) {
      console.warn("Dashboard refresh failed", error);
    } finally {
      refreshing = false;
    }
  };
  const interval = window.setInterval(poll, 10000);
  const onVisibilityChange = () => {
    if (!document.hidden) poll();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  cleanups.push(() => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}

start();

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  destroyed = true;
  closePlot3D();
  cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
});
