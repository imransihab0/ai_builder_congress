import { getCrop, getPlot, getTasks, getWeatherSnapshot, plotScore, subscribe } from "./data.js";
import { fmtNum, getLocale, onLocaleChange, t } from "./i18n.js";
import { computeSubscores, scoreBand, scoreLevel } from "./score.js";
import { setSelectedPlot } from "./store.js";

const MODE_LIMITS = Object.freeze({
  desktop: Object.freeze({ cropInstances: 140, dpr: 2 }),
  lite: Object.freeze({ cropInstances: 60, dpr: 1 }),
});

const SOIL_LAYERS = Object.freeze([
  Object.freeze({ id: "upper", depth: 0.23, color: 0x8d5c3f }),
  Object.freeze({ id: "middle", depth: 0.25, color: 0xa86c49 }),
  Object.freeze({ id: "lower", depth: 0.27, color: 0x654532 }),
]);

const BAND_BANNER_KEYS = Object.freeze({
  healthy: "plot.bannerHealthy",
  watch: "plot.bannerWatch",
  attention: "plot.bannerAttention",
});

const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const ORBIT_URL = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
const THREE_INTEGRITY = "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
const ORBIT_INTEGRITY = "sha384-wagZhIFgY4hD+7awjQjR4e2E294y6J2HSnd8eTNc15ZubTeQeVRZwhQJ+W6hnBsf";

let activeSession = null;
let openSequence = 0;
let threeRuntimePromise = null;

function loadScript(src, integrity, id, ready) {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const previous = document.querySelector(`script[data-sf-runtime="${id}"]`);
    const script = previous || document.createElement("script");
    const loaded = () => {
      if (ready()) resolve();
      else {
        script.remove();
        reject(new Error(`Runtime unavailable: ${id}`));
      }
    };
    const failed = () => {
      script.remove();
      reject(new Error(`Runtime failed: ${id}`));
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!previous) {
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.integrity = integrity;
      script.dataset.sfRuntime = id;
      document.head.append(script);
    }
  });
}

function ensureThreeRuntime() {
  if (window.THREE?.OrbitControls) return Promise.resolve();
  if (!threeRuntimePromise) {
    threeRuntimePromise = loadScript(THREE_URL, THREE_INTEGRITY, "three", () => Boolean(window.THREE))
      .then(() => loadScript(ORBIT_URL, ORBIT_INTEGRITY, "orbit-controls", () => Boolean(window.THREE?.OrbitControls)))
      .catch((error) => {
        threeRuntimePromise = null;
        throw error;
      });
  }
  return threeRuntimePromise;
}

export async function openPlot3D(plotId) {
  if (typeof plotId !== "string" || !plotId) {
    throw new Error("Cannot open the 3D plot: a non-empty plot id is required.");
  }

  const request = ++openSequence;
  const opener = activeSession?.opener ?? document.activeElement;
  const plot = await getPlot(plotId);
  if (!plot) throw new Error(`Cannot open the 3D plot: plot "${plotId}" was not found.`);

  const [crop, tasks] = await Promise.all([getCrop(plot.cropId), getTasks()]);
  if (!crop) {
    throw new Error(`Cannot open the 3D plot: crop "${plot.cropId}" was not found.`);
  }
  if (request !== openSequence) return;

  const viewModel = createViewModel(plot, crop, tasks);
  const lite = detectLiteMode();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  if (activeSession) closeSession(activeSession, false);
  setSelectedPlot(plot.id);

  const dialog = createDialog();
  const session = {
    dialog,
    refs: collectRefs(dialog),
    viewModel,
    lite,
    reducedMotion,
    coarsePointer,
    opener,
    activeTab: "soil",
    controller: new AbortController(),
    localeUnsubscribe: null,
    dataUnsubscribe: null,
    sceneRuntime: null,
    loading3D: true,
    closed: false,
    restoreFocus: true,
  };

  activeSession = session;
  wireDialog(session);
  localizeSession(session);
  document.body.append(dialog);
  dialog.showModal();
  session.refs.canvasShell.setAttribute("aria-busy", "true");
  session.refs.fallback.hidden = false;

  try {
    await ensureThreeRuntime();
    if (session.closed || activeSession !== session) return;
    session.loading3D = false;
    session.refs.fallback.hidden = true;
    const sceneData = createSceneData(session.viewModel, lite);
    session.sceneRuntime = createSceneRuntime(session, sceneData);
    if (!session.sceneRuntime) activateFallback(session);
  } catch {
    activateFallback(session);
  } finally {
    session.refs.canvasShell.removeAttribute("aria-busy");
  }

}

export function closePlot3D() {
  openSequence += 1;
  if (activeSession) closeSession(activeSession, true);
}

function createViewModel(plot, crop, tasks) {
  const weather = getWeatherSnapshot();
  const subscores = computeSubscores(plot, { crop, tasks, weather });
  const score = plotScore(plot, { crop, tasks, weather });
  if (!Number.isFinite(score)) throw new Error(`Plot "${plot.id}" has an invalid health score.`);

  const band = scoreBand(score);
  const issueKinds = new Set((plot.issues ?? []).map((issue) => issue.kind));
  const waterStress = issueKinds.has("water_stress") || issueKinds.has("flood_risk");
  const pestRisk = issueKinds.has("pest_risk") || issueKinds.has("disease_risk");
  const linkedTasks = tasks.filter((task) => task.plotId === plot.id);
  const average =
    Object.values(subscores).reduce((sum, value) => sum + value, 0) /
    Object.keys(subscores).length;

  return {
    plot,
    crop,
    score,
    band,
    level: scoreLevel(score),
    subscores,
    average,
    linkedTasks,
    factors: {
      moisture: scoreBand(subscores.moisture) === "healthy" && !waterStress,
      growth: scoreBand(subscores.growth) === "healthy" && !pestRisk,
      lowN: issueKinds.has("low_n"),
      pest: pestRisk,
      water: waterStress,
    },
  };
}

function detectLiteMode() {
  const memory = Number(navigator.deviceMemory);
  const cores = Number(navigator.hardwareConcurrency);
  return (Number.isFinite(memory) && memory <= 4) || (Number.isFinite(cores) && cores <= 4);
}

function createDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "sf-plot3d";
  dialog.dataset.source = "written-brief";
  dialog.dataset.fidelity = "stylized-approximation";
  dialog.setAttribute("aria-labelledby", "sf-plot3d-title");
  dialog.innerHTML = `
    <div class="sf-plot3d__surface">
      <header class="sf-plot3d__topbar">
        <div class="sf-plot3d__nav">
          <button class="sf-plot3d__back" type="button" data-close>
            <span data-icon="back" aria-hidden="true"></span>
            <span class="sf-plot3d__back-label" data-back-label></span>
          </button>
          <nav class="sf-plot3d__breadcrumb" data-breadcrumb>
            <span data-farm-label></span>
            <span data-icon="chevron" aria-hidden="true"></span>
            <strong class="sf-plot3d__plot-name" data-plot-name></strong>
          </nav>
          <h1 class="sf-plot3d__sr-only" id="sf-plot3d-title" data-title></h1>
        </div>
        <div class="sf-plot3d__chips">
          <span class="sf-plot3d__chip sf-plot3d__chip--level" data-level></span>
          <span class="sf-plot3d__chip sf-plot3d__chip--lite" data-lite hidden></span>
        </div>
      </header>

      <main class="sf-plot3d__stage">
        <aside class="sf-plot3d__score">
          <h2 class="sf-plot3d__eyebrow" data-score-label></h2>
          <p class="sf-plot3d__score-value" data-score-value></p>
          <div class="sf-plot3d__scale" data-scale>
            <div class="sf-plot3d__scale-track" aria-hidden="true">
              <span class="sf-plot3d__scale-fill"></span>
              <span class="sf-plot3d__scale-marker"></span>
            </div>
            <div class="sf-plot3d__scale-copy">
              <span class="sf-plot3d__scale-max" data-scale-max></span>
              <span class="sf-plot3d__average" data-average></span>
              <span class="sf-plot3d__scale-min" data-scale-min></span>
            </div>
          </div>
        </aside>

        <section class="sf-plot3d__viewer">
          <div
            class="sf-plot3d__canvas-shell"
            data-canvas-shell
            tabindex="0"
            aria-describedby="sf-plot3d-help sf-plot3d-alt"
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - R"
          >
            <div class="sf-plot3d__canvas-host" data-canvas-host></div>
            <span class="sf-plot3d__label" data-label="moisture" hidden>
              <span data-label-text></span><strong data-label-value></strong>
            </span>
            <span class="sf-plot3d__label" data-label="nitrogen" hidden>
              <span data-label-text></span><strong data-label-value></strong>
            </span>
            <span class="sf-plot3d__label" data-label="health" hidden>
              <span data-label-text></span><strong data-label-value></strong>
            </span>
            <div class="sf-plot3d__fallback" data-fallback hidden>
              <div class="sf-plot3d__fallback-inner">
                <svg class="sf-plot3d__fallback-art" viewBox="0 0 520 360" aria-hidden="true">
                  <defs>
                    <linearGradient id="sf-p3d-top" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stop-color="#a8c86a" />
                      <stop offset="1" stop-color="#638d4c" />
                    </linearGradient>
                    <linearGradient id="sf-p3d-rock" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="#78938d" />
                      <stop offset="1" stop-color="#42656d" />
                    </linearGradient>
                    <filter id="sf-p3d-blur" x="-30%" y="-100%" width="160%" height="300%">
                      <feGaussianBlur stdDeviation="14" />
                    </filter>
                  </defs>
                  <ellipse cx="260" cy="319" rx="132" ry="18" fill="#334b39" opacity=".18" filter="url(#sf-p3d-blur)" />
                  <path d="M105 120 268 69 416 127 252 182Z" fill="url(#sf-p3d-top)" />
                  <path d="M105 120 252 182 252 212 105 149Z" fill="#8e5d40" />
                  <path d="M252 182 416 127 416 157 252 212Z" fill="#764b35" />
                  <path d="M105 149 252 212 252 243 105 180Z" fill="#a56c48" />
                  <path d="M252 212 416 157 416 188 252 243Z" fill="#89593e" />
                  <path d="M105 180 252 243 252 270 105 207Z" fill="#654532" />
                  <path d="M252 243 416 188 416 215 252 270Z" fill="#56392c" />
                  <path d="M105 207 252 270 416 215 273 316Z" fill="url(#sf-p3d-rock)" />
                  <path d="M105 207 273 316 252 270Z" fill="#6f8580" />
                  <g fill="#416f3e" stroke="#f2f4e9" stroke-width="2">
                    <path d="M162 117 153 89 169 108 174 78 179 108 194 91 184 120Z" />
                    <path d="M230 96 222 67 238 86 243 56 248 86 262 70 253 100Z" />
                    <path d="M300 111 291 82 307 101 312 70 317 101 332 84 322 115Z" />
                    <path d="M350 132 342 104 358 122 363 93 368 122 381 108 374 138Z" />
                  </g>
                </svg>
                <p class="sf-plot3d__fallback-title" data-fallback-title></p>
                <p class="sf-plot3d__fallback-copy" data-fallback-copy></p>
              </div>
            </div>
          </div>
          <p class="sf-plot3d__sr-only" id="sf-plot3d-help" data-help></p>
        </section>

        <aside class="sf-plot3d__factors">
          <section class="sf-plot3d__factor-group">
            <h2 class="sf-plot3d__factor-heading" data-positive-heading></h2>
            <ul class="sf-plot3d__factor-list">
              <li class="sf-plot3d__factor sf-plot3d__factor--positive" data-factor="moisture">
                <span class="sf-plot3d__factor-icon" data-icon="moisture" aria-hidden="true"></span>
                <span class="sf-plot3d__factor-name" data-factor-name></span>
              </li>
              <li class="sf-plot3d__factor sf-plot3d__factor--positive" data-factor="growth">
                <span class="sf-plot3d__factor-icon" data-icon="growth" aria-hidden="true"></span>
                <span class="sf-plot3d__factor-name" data-factor-name></span>
              </li>
            </ul>
          </section>
          <section class="sf-plot3d__factor-group">
            <h2 class="sf-plot3d__factor-heading" data-negative-heading></h2>
            <ul class="sf-plot3d__factor-list">
              <li class="sf-plot3d__factor sf-plot3d__factor--negative" data-factor="lowN">
                <span class="sf-plot3d__factor-icon" data-icon="nutrient" aria-hidden="true"></span>
                <span class="sf-plot3d__factor-name" data-factor-name></span>
              </li>
              <li class="sf-plot3d__factor sf-plot3d__factor--negative" data-factor="pest">
                <span class="sf-plot3d__factor-icon" data-icon="pest" aria-hidden="true"></span>
                <span class="sf-plot3d__factor-name" data-factor-name></span>
              </li>
              <li class="sf-plot3d__factor sf-plot3d__factor--negative" data-factor="water">
                <span class="sf-plot3d__factor-icon" data-icon="water-stress" aria-hidden="true"></span>
                <span class="sf-plot3d__factor-name" data-factor-name></span>
              </li>
            </ul>
          </section>
        </aside>
      </main>

      <footer class="sf-plot3d__bottom">
        <section class="sf-plot3d__metrics">
          <div class="sf-plot3d__tabs" role="tablist">
            <button
              class="sf-plot3d__tab"
              id="sf-plot3d-tab-soil"
              type="button"
              role="tab"
              aria-controls="sf-plot3d-panel"
              aria-selected="true"
              data-tab="soil"
            ></button>
            <button
              class="sf-plot3d__tab"
              id="sf-plot3d-tab-crop"
              type="button"
              role="tab"
              aria-controls="sf-plot3d-panel"
              aria-selected="false"
              data-tab="crop"
            ></button>
          </div>
          <div
            class="sf-plot3d__panel"
            id="sf-plot3d-panel"
            role="tabpanel"
            aria-labelledby="sf-plot3d-tab-soil"
            data-panel
          ></div>
        </section>
        <div class="sf-plot3d__banner" role="status" data-banner></div>
        <p class="sf-plot3d__sr-only" id="sf-plot3d-alt" data-text-alternative></p>
      </footer>
    </div>
  `;

  dialog.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = iconSvg(element.dataset.icon);
  });
  return dialog;
}

function iconSvg(name) {
  const icons = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    moisture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z"/><path d="M9.2 15.2c.5 1.3 1.5 2 3 2"/></svg>',
    growth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M12 13c-4.8 0-7-2.6-7-7 4.8 0 7 2.6 7 7Z"/><path d="M12 10c4.8 0 7-2.6 7-7-4.8 0-7 2.6-7 7Z"/></svg>',
    nutrient: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.3 10.8 6.3-3.5M8.3 13.2l6.3 3.5"/></svg>',
    pest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9h8v7a4 4 0 0 1-8 0V9Z"/><path d="M9 6.5a3 3 0 0 1 6 0V9M4 12h4m8 0h4M5 18l3-2m11 2-3-2M7 7 5 5m12 2 2-2M12 9v11"/></svg>',
    "water-stress": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s5.5 6 5.5 10.5a5.5 5.5 0 0 1-9.8 3.4"/><path d="M5 5l14 14"/></svg>',
  };
  return icons[name] ?? "";
}

function collectRefs(dialog) {
  const one = (selector) => dialog.querySelector(selector);
  const labels = Object.fromEntries(
    [...dialog.querySelectorAll("[data-label]")].map((element) => [element.dataset.label, element]),
  );
  const factors = Object.fromEntries(
    [...dialog.querySelectorAll("[data-factor]")].map((element) => [element.dataset.factor, element]),
  );
  const tabs = Object.fromEntries(
    [...dialog.querySelectorAll("[data-tab]")].map((element) => [element.dataset.tab, element]),
  );

  return {
    close: one("[data-close]"),
    backLabel: one("[data-back-label]"),
    breadcrumb: one("[data-breadcrumb]"),
    farmLabel: one("[data-farm-label]"),
    plotName: one("[data-plot-name]"),
    title: one("[data-title]"),
    level: one("[data-level]"),
    lite: one("[data-lite]"),
    scoreLabel: one("[data-score-label]"),
    scoreValue: one("[data-score-value]"),
    scale: one("[data-scale]"),
    scaleMax: one("[data-scale-max]"),
    scaleMin: one("[data-scale-min]"),
    average: one("[data-average]"),
    canvasShell: one("[data-canvas-shell]"),
    host: one("[data-canvas-host]"),
    labels,
    fallback: one("[data-fallback]"),
    fallbackTitle: one("[data-fallback-title]"),
    fallbackCopy: one("[data-fallback-copy]"),
    help: one("[data-help]"),
    positiveHeading: one("[data-positive-heading]"),
    negativeHeading: one("[data-negative-heading]"),
    factors,
    tabs,
    panel: one("[data-panel]"),
    banner: one("[data-banner]"),
    textAlternative: one("[data-text-alternative]"),
  };
}

function wireDialog(session) {
  const { signal } = session.controller;
  session.refs.close.addEventListener("click", closePlot3D, { signal });
  session.dialog.addEventListener("close", () => finalizeSession(session), { signal });
  session.dialog.addEventListener("cancel", () => session.sceneRuntime?.noteInput(), { signal });
  Object.values(session.refs.tabs).forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(session, tab.dataset.tab), { signal });
  });
  session.localeUnsubscribe = onLocaleChange(() => localizeSession(session));
  session.dataUnsubscribe = subscribe(() => refreshSessionData(session));
}

function refreshSessionData(session) {
  if (session.closed) return;
  const plot = getPlot(session.viewModel.plot.id);
  const crop = plot ? getCrop(plot.cropId) : null;
  if (!plot || !crop) return;
  session.viewModel = createViewModel(plot, crop, getTasks());
  localizeSession(session);
  session.sceneRuntime?.updateData(session.viewModel);
}

function closeSession(session, restoreFocus) {
  if (session.closed) return;
  session.restoreFocus = restoreFocus;
  if (session.dialog.open) session.dialog.close();
  else finalizeSession(session);
}

function finalizeSession(session) {
  if (session.closed) return;
  session.closed = true;
  session.sceneRuntime?.dispose();
  session.sceneRuntime = null;
  session.localeUnsubscribe?.();
  session.dataUnsubscribe?.();
  session.controller.abort();
  session.dialog.remove();
  if (activeSession === session) activeSession = null;

  if (session.restoreFocus && session.opener?.isConnected && typeof session.opener.focus === "function") {
    session.opener.focus({ preventScroll: true });
  }
}

function localizeSession(session) {
  if (session.closed) return;
  const { refs, viewModel } = session;
  const { plot, crop, score, band, level, average } = viewModel;
  const plotName = localizedName(plot);
  const cropName = localizedName(crop);
  const scoreText = fmtNum(score, 2);
  const statusText = t(`plot.${band}`);

  refs.backLabel.textContent = t("plot.back");
  refs.close.setAttribute("aria-label", t("plot.back"));
  refs.breadcrumb.setAttribute("aria-label", t("plot.breadcrumbFarm"));
  refs.farmLabel.textContent = t("plot.breadcrumbFarm");
  refs.plotName.textContent = plotName;
  refs.title.textContent = `${t("plot.score")}: ${plotName}`;
  refs.level.textContent = `${t("plot.level", { level: fmtNum(level) })} · ${statusText}`;
  refs.lite.hidden = !session.lite;
  refs.lite.textContent = t("plot.liteMode");
  refs.scoreLabel.textContent = t("plot.score");
  refs.scoreValue.textContent = scoreText;
  refs.scale.style.setProperty("--score", String(clamp(score, 0, 100)));
  refs.scale.style.setProperty("--average", String(clamp(average, 8, 92)));
  refs.scale.setAttribute("aria-label", `${t("plot.score")}: ${scoreText}`);
  refs.scaleMax.textContent = fmtNum(100);
  refs.scaleMin.textContent = fmtNum(0);
  refs.average.textContent = `${t("plot.average")} ${fmtNum(average, 1)}`;
  refs.canvasShell.setAttribute("aria-label", `${plotName}: ${t("plot.rotateHelp")}`);
  refs.help.textContent = `${t("plot.rotateHelp")}. + / - / R`;
  refs.fallbackTitle.textContent = t(session.loading3D ? "common.loading" : "common.error");
  refs.fallbackCopy.textContent = session.loading3D ? "" : t("plot.staticFallback");
  refs.positiveHeading.textContent = t("plot.positive");
  refs.negativeHeading.textContent = t("plot.negative");

  setFactor(session, "moisture", t("plot.moisture"), viewModel.factors.moisture);
  setFactor(session, "growth", t("plot.goodGrowth"), viewModel.factors.growth);
  setFactor(session, "lowN", t("plot.lowN"), viewModel.factors.lowN);
  setFactor(session, "pest", t("plot.pestRisk"), viewModel.factors.pest);
  setFactor(session, "water", lowValueLabel(t("plot.moisture")), viewModel.factors.water);

  refs.tabs.soil.textContent = t("plot.soilMetrics");
  refs.tabs.crop.textContent = t("plot.cropMetrics");
  refs.banner.textContent = t(BAND_BANNER_KEYS[band]);
  refs.banner.dataset.band = band;

  setSceneLabel(refs.labels.moisture, t("plot.moisture"), `${fmtNum(plot.soil.moisture)}%`);
  setSceneLabel(refs.labels.nitrogen, t("soil.nitrogen"), `${fmtNum(plot.soil.n)} ${t("unit.ppm")}`);
  setSceneLabel(refs.labels.health, t("performance.health"), `${scoreText}%`);

  renderMetricPanel(session);
  refs.textAlternative.textContent = buildTextAlternative(viewModel, plotName, cropName);
}

function localizedName(entity) {
  return entity.name?.[getLocale()] ?? "";
}

function lowValueLabel(label) {
  return getLocale() === "bn" ? `${label} ${t("soil.low")}` : `${t("soil.low")} ${label}`;
}

function setFactor(session, id, label, active) {
  const element = session.refs.factors[id];
  element.querySelector("[data-factor-name]").textContent = label;
  element.classList.toggle("is-active", active);
  element.classList.toggle("is-inactive", !active);
  element.dataset.active = String(active);
}

function setSceneLabel(element, label, value) {
  element.querySelector("[data-label-text]").textContent = label;
  element.querySelector("[data-label-value]").textContent = value;
}

function renderMetricPanel(session) {
  const { viewModel, refs, activeTab } = session;
  const { plot, crop, score, subscores, linkedTasks } = viewModel;
  const metrics =
    activeTab === "soil"
      ? [
          [t("plot.moisture"), `${fmtNum(plot.soil.moisture)}%`],
          [t("soil.nitrogen"), `${fmtNum(plot.soil.n)} ${t("unit.ppm")}`],
          [t("soil.phosphorus"), `${fmtNum(plot.soil.p)} ${t("unit.ppm")}`],
          [t("soil.potassium"), `${fmtNum(plot.soil.k)} ${t("unit.ppm")}`],
        ]
      : [
          [t("kpi.totalCrop"), localizedName(crop)],
          [t("kpi.totalPlants"), fmtNum(plot.plantCount)],
          [t("performance.health"), `${fmtNum(subscores.growth)}%`],
          [t("task.complete"), fmtNum(linkedTasks.filter((task) => task.status === "complete").length)],
          [t("task.waiting"), fmtNum(linkedTasks.filter((task) => task.status !== "complete").length)],
        ];

  const list = document.createElement("dl");
  list.className = "sf-plot3d__metric-grid";
  metrics.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "sf-plot3d__metric";
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    item.append(term, description);
    list.append(item);
  });
  refs.panel.replaceChildren(list);
  refs.panel.setAttribute("aria-labelledby", refs.tabs[activeTab].id);
  refs.panel.setAttribute("aria-label", `${t(activeTab === "soil" ? "plot.soilMetrics" : "plot.cropMetrics")}: ${fmtNum(score, 2)}`);
}

function buildTextAlternative(viewModel, plotName, cropName) {
  const { plot, score, band } = viewModel;
  const issues = (plot.issues ?? []).map((issue) => issueLabel(issue.kind));
  const issueText = issues.length ? issues.join(", ") : fmtNum(0);
  return [
    plotName,
    `${t("kpi.totalCrop")}: ${cropName}`,
    `${t("plot.score")}: ${fmtNum(score, 2)} (${t(`plot.${band}`)})`,
    `${t("plot.moisture")}: ${fmtNum(plot.soil.moisture)}%`,
    `${t("soil.nitrogen")}: ${fmtNum(plot.soil.n)} ${t("unit.ppm")}`,
    `${t("soil.phosphorus")}: ${fmtNum(plot.soil.p)} ${t("unit.ppm")}`,
    `${t("soil.potassium")}: ${fmtNum(plot.soil.k)} ${t("unit.ppm")}`,
    `${t("plot.negative")}: ${issueText}`,
  ].join(". ");
}

function issueLabel(kind) {
  if (kind === "low_n") return t("plot.lowN");
  if (kind === "low_p") return lowValueLabel(t("soil.phosphorus"));
  if (kind === "low_k") return lowValueLabel(t("soil.potassium"));
  if (kind === "pest_risk" || kind === "disease_risk") return t("plot.pestRisk");
  if (kind === "water_stress" || kind === "flood_risk") return lowValueLabel(t("plot.moisture"));
  return t("plot.negative");
}

function setActiveTab(session, tab) {
  if (tab !== "soil" && tab !== "crop") return;
  session.activeTab = tab;
  Object.entries(session.refs.tabs).forEach(([id, element]) => {
    element.setAttribute("aria-selected", String(id === tab));
  });
  renderMetricPanel(session);
  session.sceneRuntime?.setAction(tab);
}

function activateFallback(session) {
  if (session.closed) return;
  session.loading3D = false;
  session.sceneRuntime?.dispose();
  session.sceneRuntime = null;
  session.refs.host.hidden = true;
  session.refs.fallback.hidden = false;
  Object.values(session.refs.labels).forEach((label) => {
    label.hidden = true;
  });
  localizeSession(session);
}

function createSceneData(viewModel, lite) {
  const footprint = normalizeFootprint(viewModel.plot.polygon);
  const limits = lite ? MODE_LIMITS.lite : MODE_LIMITS.desktop;
  const count = Math.min(
    limits.cropInstances,
    Math.max(0, Math.round(Number(viewModel.plot.plantCount) || 0)),
  );
  const random = mulberry32(hashString(viewModel.plot.id));
  const placements = sampleInsideFootprint(footprint, count, random);
  const fallbackPoint = interiorPoint(footprint, random);
  const points = placements.length ? placements : [fallbackPoint];

  return {
    footprint,
    placements,
    cropModel: viewModel.crop.model,
    cropColor: viewModel.crop.color,
    health: clamp(viewModel.score / 100, 0, 1),
    moisture: clamp(Number(viewModel.plot.soil.moisture) / 100, 0, 1),
    hotspots: [
      { id: "moisture", tab: "soil", ...points[0] },
      { id: "nitrogen", tab: "soil", ...points[Math.floor((points.length - 1) / 2)] },
      { id: "health", tab: "crop", ...points[points.length - 1] },
    ],
  };
}

function normalizeFootprint(polygon) {
  const ring = polygon?.type === "Polygon" ? polygon.coordinates?.[0] : null;
  if (!Array.isArray(ring)) throw new TypeError("Plot geometry must be a GeoJSON Polygon.");

  const coordinates = ring
    .map((point) => [Number(point?.[0]), Number(point?.[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (
    coordinates.length > 1 &&
    coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
    coordinates[0][1] === coordinates[coordinates.length - 1][1]
  ) {
    coordinates.pop();
  }
  if (coordinates.length < 3) throw new TypeError("Plot polygon needs at least three valid points.");

  const centroid = polygonCentroid(coordinates);
  const latitudeScale = 110540;
  const longitudeScale = 111320 * Math.cos((centroid[1] * Math.PI) / 180);
  const metrePoints = coordinates.map(([lng, lat]) => ({
    x: (lng - centroid[0]) * longitudeScale,
    z: (lat - centroid[1]) * latitudeScale,
  }));
  const metreBounds = boundsOf(metrePoints);
  const largestSpan = Math.max(metreBounds.width, metreBounds.depth);
  if (largestSpan <= 0) throw new TypeError("Plot polygon has no usable area.");

  const scale = 5.2 / largestSpan;
  const points = metrePoints.map((point) => ({ x: point.x * scale, z: point.z * scale }));
  return { points, bounds: boundsOf(points) };
}

function polygonCentroid(points) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function boundsOf(points) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function sampleInsideFootprint(footprint, count, random) {
  const placements = [];
  const { bounds, points } = footprint;
  const maxAttempts = Math.max(80, count * 80);
  let attempts = 0;
  while (placements.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = bounds.minX + random() * bounds.width;
    const z = bounds.minZ + random() * bounds.depth;
    if (!pointInPolygon(x, z, points)) continue;
    placements.push({
      x,
      z,
      yaw: random() * Math.PI * 2,
      scale: 0.82 + random() * 0.34,
    });
  }
  return placements;
}

function interiorPoint(footprint, random) {
  const centre = {
    x: (footprint.bounds.minX + footprint.bounds.maxX) / 2,
    z: (footprint.bounds.minZ + footprint.bounds.maxZ) / 2,
    yaw: 0,
    scale: 1,
  };
  if (pointInPolygon(centre.x, centre.z, footprint.points)) return centre;
  return sampleInsideFootprint(footprint, 1, random)[0] ?? {
    x: footprint.points[0].x,
    z: footprint.points[0].z,
    yaw: 0,
    scale: 1,
  };
}

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const a = points[current];
    const b = points[previous];
    const crosses = a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSceneRuntime(session, sceneData) {
  const THREE = window.THREE;
  const OrbitControls = THREE?.OrbitControls;
  if (!THREE || !OrbitControls || !window.WebGLRenderingContext) return null;

  const canvas = document.createElement("canvas");
  const contextAttributes = { alpha: true, antialias: !session.lite, powerPreference: "high-performance" };
  let context;
  try {
    context = canvas.getContext("webgl2", contextAttributes) || canvas.getContext("webgl", contextAttributes);
  } catch {
    return null;
  }
  if (!context) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context, ...contextAttributes });
  } catch {
    return null;
  }

  const runtimeController = new AbortController();
  const { signal } = runtimeController;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const initialCameraPosition = new THREE.Vector3(7.2, 3.8, 8.1);
  const initialTarget = new THREE.Vector3(0, -0.28, 0);
  camera.position.copy(initialCameraPosition);

  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = !session.lite;
  if (!session.lite) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.tabIndex = -1;
  session.refs.host.hidden = false;
  session.refs.host.append(renderer.domElement);

  let model;
  try {
    model = buildSceneObjects(THREE, sceneData, session.lite);
    model.anchors.forEach((anchor) => {
      anchor.element = session.refs.labels[anchor.id];
    });
    scene.add(model.root, createLighting(THREE, session.lite), createContactShadow(THREE, session.lite));
  } catch (error) {
    renderer.dispose();
    renderer.domElement.remove();
    throw error;
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.target.copy(initialTarget);
  const defaultDistance = camera.position.distanceTo(controls.target);
  controls.minDistance = defaultDistance * 0.75;
  controls.maxDistance = defaultDistance * 1.25;
  controls.minPolarAngle = Math.PI / 4;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.autoRotateSpeed = 0.42;
  controls.update();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const clock = new THREE.Clock();
  const size = new THREE.Vector2();
  let raf = 0;
  let disposed = false;
  let dragging = false;
  let lastInput = performance.now();
  let hoverYaw = 0;
  let hoverPitch = 0;
  let keyboardYaw = 0;
  let keyboardPitch = 0;
  let soilAction = session.activeTab === "soil" ? 1 : 0;
  let cropAction = session.activeTab === "crop" ? 1 : 0;
  let pointerDown = null;

  const noteInput = () => {
    lastInput = performance.now();
    controls.autoRotate = false;
    scheduleFrame();
  };

  const controlStart = () => {
    dragging = true;
    noteInput();
  };
  const controlEnd = () => {
    dragging = false;
    noteInput();
  };
  controls.addEventListener("start", controlStart);
  controls.addEventListener("end", controlEnd);

  const updatePointer = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  };

  const hitHotspot = (event) => {
    if (!updatePointer(event)) return null;
    model.root.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(model.clickTargets, false)[0]?.object ?? null;
  };

  const pointerMove = (event) => {
    noteInput();
    if (!session.coarsePointer && !dragging && updatePointer(event)) {
      hoverYaw = pointer.x * 0.6;
      hoverPitch = -pointer.y * 0.25;
      session.refs.canvasShell.dataset.hotspot = String(Boolean(hitHotspot(event)));
    }
  };
  const pointerLeave = () => {
    hoverYaw = 0;
    hoverPitch = 0;
    session.refs.canvasShell.dataset.hotspot = "false";
  };
  const pointerDownHandler = (event) => {
    noteInput();
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const pointerUpHandler = (event) => {
    noteInput();
    const start = pointerDown;
    pointerDown = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    const hotspot = hitHotspot(event);
    if (hotspot?.userData.tab) setActiveTab(session, hotspot.userData.tab);
  };
  const wheelHandler = () => noteInput();

  const keyDown = (event) => {
    let handled = true;
    if (event.key === "ArrowLeft") keyboardYaw -= 0.12;
    else if (event.key === "ArrowRight") keyboardYaw += 0.12;
    else if (event.key === "ArrowUp") keyboardPitch = clamp(keyboardPitch - 0.1, -0.25, 0.25);
    else if (event.key === "ArrowDown") keyboardPitch = clamp(keyboardPitch + 0.1, -0.25, 0.25);
    else if (event.key === "+" || event.key === "=") zoomCamera(camera, controls, 0.9);
    else if (event.key === "-" || event.key === "_") zoomCamera(camera, controls, 1.1);
    else if (event.key.toLowerCase() === "r") {
      keyboardYaw = 0;
      keyboardPitch = 0;
      hoverYaw = 0;
      hoverPitch = 0;
      model.root.rotation.set(0, 0, 0);
      camera.position.copy(initialCameraPosition);
      controls.target.copy(initialTarget);
      controls.update();
    } else handled = false;
    if (!handled) return;
    event.preventDefault();
    noteInput();
  };

  session.refs.canvasShell.addEventListener("pointermove", pointerMove, { signal });
  session.refs.canvasShell.addEventListener("pointerleave", pointerLeave, { signal });
  session.refs.canvasShell.addEventListener("pointerdown", pointerDownHandler, { signal });
  session.refs.canvasShell.addEventListener("pointerup", pointerUpHandler, { signal });
  session.refs.canvasShell.addEventListener("wheel", wheelHandler, { signal, passive: true });
  session.refs.canvasShell.addEventListener("keydown", keyDown, { signal });

  const resize = () => {
    const rect = session.refs.canvasShell.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dprLimit = session.lite ? MODE_LIMITS.lite.dpr : MODE_LIMITS.desktop.dpr;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprLimit));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    scheduleFrame();
  };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(session.refs.canvasShell);
  else window.addEventListener("resize", resize, { signal });
  resize();

  const visibilityChange = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clock.stop();
    } else if (!disposed && session.dialog.open) {
      clock.start();
      scheduleFrame();
    }
  };
  document.addEventListener("visibilitychange", visibilityChange, { signal });

  const contextLost = (event) => {
    event.preventDefault();
    if (disposed) return;
    queueMicrotask(() => {
      if (session.closed || session.sceneRuntime !== runtime) return;
      session.sceneRuntime = null;
      runtime.dispose(false);
      activateFallback(session);
    });
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost, { signal });

  function scheduleFrame() {
    if (!raf && !disposed && session.dialog.open && !document.hidden) {
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(time) {
    raf = 0;
    if (disposed || !session.dialog.open || document.hidden) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    const idle = performance.now() - lastInput > 3000;
    controls.autoRotate = !session.reducedMotion && idle && !dragging;

    if (!dragging) {
      const hoverActive = !session.coarsePointer && !idle;
      const targetYaw = keyboardYaw + (hoverActive ? hoverYaw : 0);
      const targetPitch = keyboardPitch + (hoverActive ? hoverPitch : 0);
      model.root.rotation.y = damp(model.root.rotation.y, targetYaw, 4, delta);
      model.root.rotation.x = damp(model.root.rotation.x, targetPitch, 4, delta);
    }
    model.root.position.y = session.reducedMotion ? 0 : Math.sin(time * 0.0009) * 0.055;

    model.soilLayers.forEach((layer, index) => {
      const targetY = layer.userData.restY - index * 0.08 * soilAction;
      layer.position.y = damp(layer.position.y, targetY, 7, delta);
    });
    model.underside.position.y = damp(
      model.underside.position.y,
      model.underside.userData.restY - 0.16 * soilAction,
      7,
      delta,
    );
    const cropScale = damp(model.crops.scale.x, 1 + cropAction * 0.065, 6, delta);
    model.crops.scale.setScalar(cropScale);
    model.cropMaterials.forEach((material) => {
      material.emissiveIntensity = damp(material.emissiveIntensity, cropAction * 0.2, 6, delta);
    });

    controls.update();
    projectLabels(THREE, model.anchors, camera, session.refs.canvasShell, size);
    renderer.render(scene, camera);
    if (!session.reducedMotion || dragging || performance.now() - lastInput < 500) scheduleFrame();
  }

  const runtime = {
    noteInput,
    setAction(tab) {
      noteInput();
      soilAction = tab === "soil" ? 1 : 0;
      cropAction = tab === "crop" ? 1 : 0;
    },
    updateData(viewModel) {
      const healthy = new THREE.Color(0x638d43);
      const stressed = new THREE.Color(0xb77a3e);
      const cropColor = stressed.lerp(healthy, clamp(viewModel.score / 100, 0, 1));
      model.cropMaterials.forEach((material) => {
        if (material.name === "material-crop-foliage") material.color.copy(cropColor);
        if (material.name === "material-crop-stem") material.color.copy(cropColor).multiplyScalar(0.72);
      });
      const dry = new THREE.Color(0xc47a3f);
      const wet = new THREE.Color(0x417c9a);
      model.underside.material.color.copy(dry.lerp(wet, clamp(viewModel.plot.soil.moisture / 100, 0, 1)));
      noteInput();
    },
    dispose(forceContextLoss = true) {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      runtimeController.abort();
      resizeObserver?.disconnect();
      controls.removeEventListener("start", controlStart);
      controls.removeEventListener("end", controlEnd);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      if (forceContextLoss) renderer.forceContextLoss?.();
      renderer.domElement.remove();
      session.refs.canvasShell.dataset.hotspot = "false";
    },
  };

  scheduleFrame();
  return runtime;
}

function buildSceneObjects(THREE, sceneData, lite) {
  const root = markPart(new THREE.Group(), "root");
  const island = markPart(new THREE.Group(), "island");
  const topPlate = markPart(new THREE.Group(), "topPlate");
  const soilLayersGroup = markPart(new THREE.Group(), "soilLayers");
  const undersideGroup = markPart(new THREE.Group(), "underside");
  const crops = markPart(new THREE.Group(), "crops");
  const hotspots = markPart(new THREE.Group(), "hotspots");
  root.add(island);
  island.add(topPlate, soilLayersGroup, undersideGroup, crops, hotspots);

  const shape = footprintShape(THREE, sceneData.footprint.points);
  const topY = 1.2;
  const plateDepth = 0.18;
  const topGeometry = extrudedShapeGeometry(THREE, shape, plateDepth, true);
  const topMaterial = namedMaterial(
    THREE,
    "material-top-soil",
    { color: 0x769a4b, roughness: 0.86, metalness: 0 },
  );
  const topMesh = markPart(new THREE.Mesh(topGeometry, topMaterial), "topPlate.visual");
  topMesh.position.y = topY;
  topMesh.castShadow = !lite;
  topMesh.receiveShadow = !lite;
  topPlate.add(topMesh);

  const soilLayers = [];
  let layerTop = topY - plateDepth;
  SOIL_LAYERS.forEach((definition, index) => {
    const pivot = markPart(new THREE.Group(), `soilLayers.${definition.id}`);
    pivot.position.y = layerTop;
    pivot.userData.restY = layerTop;
    const geometry = extrudedShapeGeometry(THREE, shape, definition.depth, false);
    const material = namedMaterial(
      THREE,
      `material-soil-${definition.id}`,
      { color: definition.color, roughness: 0.96, metalness: 0, flatShading: true },
    );
    const mesh = markPart(new THREE.Mesh(geometry, material), `soilLayers.${definition.id}.visual`);
    mesh.castShadow = !lite;
    mesh.receiveShadow = !lite;
    pivot.add(mesh);
    soilLayersGroup.add(pivot);
    soilLayers.push(pivot);
    layerTop -= definition.depth;
    pivot.userData.layerIndex = index;
  });

  const { width, depth } = sceneData.footprint.bounds;
  const widest = Math.max(width, depth);
  const rockHeight = 2.45;
  const rockGeometry = new THREE.ConeGeometry(widest * 0.53, rockHeight, 7, 2, false);
  const dry = new THREE.Color(0xc47a3f);
  const wet = new THREE.Color(0x417c9a);
  const rockColor = dry.clone().lerp(wet, sceneData.moisture);
  const rockMaterial = namedMaterial(
    THREE,
    "material-underside-moisture",
    { color: rockColor, roughness: 0.72, metalness: 0.04, flatShading: true },
  );
  const rockMesh = markPart(new THREE.Mesh(rockGeometry, rockMaterial), "underside.visual");
  rockMesh.rotation.z = Math.PI;
  rockMesh.scale.set(width / widest, 1, depth / widest);
  rockMesh.position.y = layerTop - rockHeight / 2;
  rockMesh.userData.restY = rockMesh.position.y;
  rockMesh.castShadow = !lite;
  rockMesh.receiveShadow = !lite;
  undersideGroup.add(rockMesh);

  crops.position.y = topY + 0.025;
  const cropMaterials = buildCrops(THREE, crops, sceneData, lite);

  hotspots.position.y = topY + 0.08;
  const hotspotMaterial = namedMaterial(
    THREE,
    "material-hotspot",
    {
      color: 0xf7f8e9,
      roughness: 0.32,
      metalness: 0,
      emissive: new THREE.Color(0x8ebc43),
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.92,
    },
  );
  const clickTargets = [];
  const anchors = [];
  sceneData.hotspots.forEach((definition) => {
    const hotspot = markPart(
      new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 5), hotspotMaterial),
      `hotspots.${definition.id}`,
    );
    hotspot.position.set(definition.x, 0.12, definition.z);
    hotspot.userData.tab = definition.tab;
    hotspot.castShadow = !lite;
    const anchor = markPart(new THREE.Object3D(), `anchor-${definition.id}`);
    anchor.position.y = 0.48;
    hotspot.add(anchor);
    hotspots.add(hotspot);
    clickTargets.push(hotspot);
    anchors.push({ id: definition.id, object: anchor, screen: new THREE.Vector3() });
  });

  root.userData.sculptRuntime = {
    nodes: { root, island, topPlate, soilLayers: soilLayersGroup, underside: undersideGroup, crops, hotspots },
    actionAnchors: Object.fromEntries(anchors.map((anchor) => [anchor.id, anchor.object])),
    clickTargets,
    destructionGroups: { island: ["topPlate", "soilLayers", "underside", "crops"] },
    colliderIntent: { type: "compound", proxies: ["topPlate", "underside"] },
    plantInstances: sceneData.placements.length,
  };

  return {
    root,
    soilLayers,
    underside: rockMesh,
    crops,
    cropMaterials,
    clickTargets,
    anchors,
  };
}

function footprintShape(THREE, points) {
  const vectors = points.map((point) => new THREE.Vector2(point.x, point.z));
  if (!THREE.ShapeUtils.isClockWise(vectors)) vectors.reverse();
  const shape = new THREE.Shape();
  shape.moveTo(vectors[0].x, vectors[0].y);
  vectors.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  return shape;
}

function extrudedShapeGeometry(THREE, shape, depth, bevel) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel,
    bevelSegments: bevel ? 1 : 0,
    bevelSize: bevel ? 0.055 : 0,
    bevelThickness: bevel ? 0.04 : 0,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function namedMaterial(THREE, name, options) {
  const material = new THREE.MeshStandardMaterial(options);
  material.name = name;
  material.userData.partId = name;
  return material;
}

function markPart(object, partId) {
  object.name = partId;
  object.userData.partId = partId;
  return object;
}

function buildCrops(THREE, group, sceneData, lite) {
  const foliageHealthy = new THREE.Color(0x638d43);
  const foliageStressed = new THREE.Color(0xb77a3e);
  const foliageColor = foliageStressed.clone().lerp(foliageHealthy, sceneData.health);
  const foliageMaterial = namedMaterial(
    THREE,
    "material-crop-foliage",
    {
      color: foliageColor,
      roughness: 0.78,
      metalness: 0,
      emissive: foliageColor.clone().multiplyScalar(0.16),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    },
  );
  const fruitColor = new THREE.Color(sceneData.cropColor || 0x9b5b42);
  const fruitMaterial = namedMaterial(
    THREE,
    "material-crop-fruit",
    {
      color: fruitColor,
      roughness: 0.64,
      metalness: 0,
      emissive: fruitColor.clone().multiplyScalar(0.12),
      emissiveIntensity: 0,
    },
  );
  const stemMaterial = namedMaterial(
    THREE,
    "material-crop-stem",
    {
      color: foliageColor.clone().multiplyScalar(0.72),
      roughness: 0.86,
      metalness: 0,
      emissive: foliageColor.clone().multiplyScalar(0.1),
      emissiveIntensity: 0,
    },
  );
  const materials = [foliageMaterial, fruitMaterial, stemMaterial];
  const placements = sceneData.placements;
  const model = sceneData.cropModel;

  if (model === "rice" || model === "jute") {
    const height = model === "jute" ? 1.12 : 0.72;
    const radius = model === "jute" ? 0.085 : 0.13;
    const geometry = tuftGeometry(THREE, height, radius, model === "jute" ? 5 : 7);
    addInstancedPart(THREE, group, `crops.${model}.tuft`, geometry, foliageMaterial, placements, lite);
    return materials;
  }

  if (model === "potato") {
    const foliage = new THREE.IcosahedronGeometry(0.31, 0);
    foliage.scale(1.05, 0.5, 0.9);
    foliage.translate(0, 0.2, 0);
    addInstancedPart(THREE, group, "crops.potato.foliage", foliage, foliageMaterial, placements, lite);
    return materials;
  }

  const stemHeight = model === "chili" ? 0.56 : 0.48;
  const stem = new THREE.CylinderGeometry(0.022, 0.032, stemHeight, 5, 1, false);
  stem.translate(0, stemHeight / 2, 0);
  addInstancedPart(THREE, group, `crops.${model}.stem`, stem, stemMaterial, placements, lite);

  const foliage = new THREE.IcosahedronGeometry(0.29, 0);
  const foliageScale = model === "brinjal" ? [1.12, 0.76, 1] : model === "chili" ? [0.72, 1, 0.72] : [1, 0.86, 1];
  foliage.scale(...foliageScale);
  foliage.translate(0, model === "chili" ? 0.48 : 0.43, 0);
  addInstancedPart(THREE, group, `crops.${model}.foliage`, foliage, foliageMaterial, placements, lite);

  let fruit;
  if (model === "tomato") {
    fruit = new THREE.SphereGeometry(0.085, 6, 4);
    fruit.translate(0.17, 0.36, 0.11);
  } else if (model === "brinjal") {
    fruit = new THREE.SphereGeometry(0.09, 6, 4);
    fruit.scale(0.78, 1.45, 0.78);
    fruit.translate(0.16, 0.33, 0.1);
  } else {
    fruit = new THREE.ConeGeometry(0.05, 0.24, 5, 1, false);
    fruit.rotateZ(-0.34);
    fruit.translate(0.16, 0.33, 0.08);
  }
  addInstancedPart(THREE, group, `crops.${model}.fruit`, fruit, fruitMaterial, placements, lite);
  return materials;
}

function tuftGeometry(THREE, height, radius, blades) {
  const positions = [];
  for (let index = 0; index < blades; index += 1) {
    const angle = (index / blades) * Math.PI * 2;
    const tangentX = Math.cos(angle) * radius;
    const tangentZ = Math.sin(angle) * radius;
    const widthX = Math.cos(angle + Math.PI / 2) * radius * 0.34;
    const widthZ = Math.sin(angle + Math.PI / 2) * radius * 0.34;
    positions.push(
      tangentX - widthX,
      0,
      tangentZ - widthZ,
      tangentX + widthX,
      0,
      tangentZ + widthZ,
      tangentX * 0.3,
      height * (0.86 + (index % 3) * 0.07),
      tangentZ * 0.3,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addInstancedPart(THREE, group, id, geometry, material, placements, lite) {
  const mesh = markPart(new THREE.InstancedMesh(geometry, material, placements.length), id);
  const dummy = new THREE.Object3D();
  placements.forEach((placement, index) => {
    dummy.position.set(placement.x, 0, placement.z);
    dummy.rotation.set(0, placement.yaw, 0);
    dummy.scale.setScalar(placement.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = !lite;
  mesh.receiveShadow = !lite;
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

function createLighting(THREE, lite) {
  const group = markPart(new THREE.Group(), "lighting");
  const hemisphere = new THREE.HemisphereLight(0xfff8df, 0x6f8972, lite ? 1.25 : 1.05);
  hemisphere.name = "lighting.hemisphere";
  const directional = new THREE.DirectionalLight(0xfff4dc, lite ? 1.35 : 1.55);
  directional.name = "lighting.directional";
  directional.position.set(-5, 8, 6);
  directional.castShadow = !lite;
  if (!lite) {
    directional.shadow.mapSize.set(1024, 1024);
    directional.shadow.camera.left = -5;
    directional.shadow.camera.right = 5;
    directional.shadow.camera.top = 5;
    directional.shadow.camera.bottom = -5;
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 18;
    directional.shadow.radius = 4;
  }
  group.add(hemisphere, directional);
  return group;
}

function createContactShadow(THREE, lite) {
  const group = markPart(new THREE.Group(), "contactShadow");
  const layers = lite
    ? [[1.8, 0.48, 0.09], [2.5, 0.72, 0.04]]
    : [[1.55, 0.4, 0.1], [2.15, 0.62, 0.055], [2.8, 0.84, 0.025]];
  layers.forEach(([scaleX, scaleZ, opacity], index) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0x314b38,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    material.name = `material-contact-shadow-${index}`;
    const ellipse = markPart(
      new THREE.Mesh(new THREE.CircleGeometry(1, 24), material),
      `contactShadow.layer-${index}`,
    );
    ellipse.rotation.x = -Math.PI / 2;
    ellipse.scale.set(scaleX, scaleZ, 1);
    ellipse.position.y = -2.38 - index * 0.002;
    group.add(ellipse);
  });
  return group;
}

function projectLabels(THREE, anchors, camera, container, size) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;
  size.set(width, height);
  const projected = [];
  anchors.forEach((anchor) => {
    anchor.object.getWorldPosition(anchor.screen);
    anchor.screen.project(camera);
    const visible = anchor.screen.z > -1 && anchor.screen.z < 1;
    anchor.element.hidden = !visible;
    if (!visible) return;
    projected.push({
      element: anchor.element,
      x: clamp((anchor.screen.x * 0.5 + 0.5) * size.x, 54, size.x - 54),
      y: clamp((-anchor.screen.y * 0.5 + 0.5) * size.y, 24, size.y - 24),
    });
  });

  for (let pass = 0; pass < 2; pass += 1) {
    for (let first = 0; first < projected.length; first += 1) {
      for (let second = first + 1; second < projected.length; second += 1) {
        const a = projected[first];
        const b = projected[second];
        if (Math.abs(a.y - b.y) > 30) continue;
        const minimumGap = a.element.offsetWidth / 2 + b.element.offsetWidth / 2 + 8;
        const overlap = minimumGap - Math.abs(a.x - b.x);
        if (overlap <= 0) continue;
        const direction = a.x <= b.x ? 1 : -1;
        a.x = clamp(a.x - direction * overlap / 2, 54, size.x - 54);
        b.x = clamp(b.x + direction * overlap / 2, 54, size.x - 54);
      }
    }
  }
  projected.forEach(({ element, x, y }) => {
    element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  });
}

function zoomCamera(camera, controls, factor) {
  const offset = camera.position.clone().sub(controls.target);
  const distance = clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  offset.setLength(distance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function damp(current, target, lambda, delta) {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function disposeScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
