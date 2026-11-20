import { getFarm, getPlots, plotScore, subscribe } from "./data.js";
import { fmtNum, getLocale, onLocaleChange, t } from "./i18n.js";
import { getUI, setMapLayer, setSelectedPlot, subscribeUI } from "./store.js";
import { el, glassPill, icon } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const localText = (value) => typeof value === "string" ? value : value?.[getLocale()] || value?.en || value?.bn || "";

function scoreFor(plot) {
  for (const input of [plot, plot?.id]) {
    try {
      const result = plotScore(input);
      const score = Number(result?.score ?? result);
      if (Number.isFinite(score)) return score;
    } catch {}
  }
  return 0;
}

function featureCollection(plots, selectedId) {
  return {
    type: "FeatureCollection",
    features: plots.filter((plot) => plot.polygon).flatMap((plot) => {
      const ring = plot.polygon.coordinates?.[0] || [];
      const points = ring.length > 1 ? ring.slice(0, -1) : ring;
      const center = points.length
        ? [
            points.reduce((sum, point) => sum + Number(point[0]), 0) / points.length,
            points.reduce((sum, point) => sum + Number(point[1]), 0) / points.length,
          ]
        : null;
      const properties = {
        id: plot.id,
        name: localText(plot.name),
        health: scoreFor(plot),
        moisture: Number(plot.soil?.moisture || 0),
        selected: plot.id === selectedId,
      };
      const polygon = { type: "Feature", id: plot.id, properties, geometry: plot.polygon };
      return center ? [polygon, { type: "Feature", id: `${plot.id}-marker`, properties, geometry: { type: "Point", coordinates: center } }] : [polygon];
    }),
  };
}

function fillExpression(layer) {
  if (layer === "moisture") {
    return ["interpolate", ["linear"], ["get", "moisture"], 0, "#E9A23B", 45, "#A6E22E", 100, "#5E8FA3"];
  }
  if (layer === "health") {
    return ["interpolate", ["linear"], ["get", "health"], 0, "#E4675B", 55, "#E9A23B", 80, "#3E7B3A"];
  }
  return "#A6E22E";
}

function fallbackColor(plot, layer) {
  if (layer === "moisture") {
    const moisture = Number(plot.soil?.moisture || 0);
    return moisture < 35 ? "#E9A23B" : moisture < 70 ? "#A6E22E" : "#5E8FA3";
  }
  if (layer === "health") {
    const score = scoreFor(plot);
    return score < 55 ? "#E4675B" : score < 80 ? "#E9A23B" : "#3E7B3A";
  }
  return "#A6E22E";
}

export function mountFarmMap(container, { onOpenPlot } = {}) {
  let map = null;
  let popup = null;
  let hoveredId = null;
  let ready = false;
  let destroyed = false;
  let loadTimer;
  let centerKey = "";

  const title = el("h2", { className: "sf-card-title", attrs: { id: "map-title" } });
  const subtitle = el("p", { className: "sf-card-subtitle" });
  const layerLabel = el("span", { className: "sf-visually-hidden" });
  const layerSelect = el("select", {
    className: "sf-map__layer-select",
    on: { change: (event) => setMapLayer(event.currentTarget.value) },
  });
  const mapNode = el("div", { className: "sf-map__canvas", attrs: { "aria-label": "" } });
  const fallback = el("div", { className: "sf-map__fallback", attrs: { hidden: true } });
  const plotList = el("div", { className: "sf-map-list__items" });
  const listSummary = el("summary");
  const list = el("details", { className: "sf-map-list" }, [listSummary, plotList]);
  const root = el("article", { className: "sf-map" }, [
    el("div", { className: "sf-map__head" }, [
      el("div", {}, [title, subtitle]),
      el("label", { className: "sf-map__layer" }, [icon("layers"), layerLabel, layerSelect]),
    ]),
    el("div", { className: "sf-map__body" }, [mapNode, fallback, list]),
  ]);
  container.replaceChildren(root);

  function selectPlot(id, focusNode) {
    setSelectedPlot(id);
    onOpenPlot?.(id);
    focusNode?.focus({ preventScroll: true });
  }

  function renderPlotList() {
    const plots = getPlots() || [];
    const selectedId = getUI()?.selectedPlotId;
    if (!plots.length) {
      plotList.replaceChildren(el("div", { className: "sf-empty" }, [icon("map"), el("span", { text: `${t("map.title")}: ${t("common.error")}` })]));
      return;
    }
    const clearButton = el("button", {
      className: selectedId == null ? "is-selected" : "",
      attrs: { type: "button", "aria-pressed": selectedId == null, "aria-label": t("common.all") },
      on: {
        click: (event) => {
          setSelectedPlot(null);
          event.currentTarget.focus({ preventScroll: true });
        },
      },
    }, [
      el("span", { className: "sf-map-list__dot", attrs: { style: "--sf-plot-color:#A9B09F" } }),
      el("span", { text: t("common.all") }),
    ]);
    plotList.replaceChildren(clearButton, ...plots.map((plot) => {
      const score = scoreFor(plot);
      return el("button", {
        className: plot.id === selectedId ? "is-selected" : "",
        attrs: {
          type: "button",
          "aria-pressed": plot.id === selectedId,
          "aria-label": t("map.openPlot", { plot: localText(plot.name), score: fmtNum(score) }),
        },
        on: { click: (event) => selectPlot(plot.id, event.currentTarget) },
      }, [
        el("span", { className: "sf-map-list__dot", attrs: { style: `--sf-plot-color:${fallbackColor(plot, "health")}` } }),
        el("span", { text: localText(plot.name) }),
        el("strong", { text: `${fmtNum(score, { maximumFractionDigits: 0 })}%` }),
      ]);
    }));
  }

  function renderFallback() {
    const plots = getPlots() || [];
    const layer = getUI()?.mapLayer || "base";
    const coordinates = plots.flatMap((plot) => plot.polygon?.coordinates?.[0] || []);
    const xs = coordinates.map((point) => Number(point[0])).filter(Number.isFinite);
    const ys = coordinates.map((point) => Number(point[1])).filter(Number.isFinite);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 1;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 1;
    const width = Math.max(maxX - minX, 0.00001);
    const height = Math.max(maxY - minY, 0.00001);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 600 320");
    svg.setAttribute("aria-hidden", "true");
    for (let index = 1; index < 8; index += 1) {
      const vertical = document.createElementNS(SVG_NS, "path");
      vertical.setAttribute("d", `M${index * 75} 0V320`);
      vertical.setAttribute("class", "sf-map__grid-line");
      svg.append(vertical);
    }
    for (let index = 1; index < 5; index += 1) {
      const horizontal = document.createElementNS(SVG_NS, "path");
      horizontal.setAttribute("d", `M0 ${index * 64}H600`);
      horizontal.setAttribute("class", "sf-map__grid-line");
      svg.append(horizontal);
    }
    plots.forEach((plot, index) => {
      const ring = plot.polygon?.coordinates?.[0] || [];
      const polygon = document.createElementNS(SVG_NS, "polygon");
      const points = ring.length ? ring.map(([x, y]) => {
        const px = 26 + (Number(x) - minX) / width * 548;
        const py = 294 - (Number(y) - minY) / height * 268;
        return `${px},${py}`;
      }).join(" ") : `${40 + index * 34},60 ${90 + index * 34},60 ${90 + index * 34},120 ${40 + index * 34},120`;
      polygon.setAttribute("points", points);
      polygon.setAttribute("fill", fallbackColor(plot, layer));
      polygon.setAttribute("class", plot.id === getUI()?.selectedPlotId ? "is-selected" : "");
      svg.append(polygon);
    });
    fallback.replaceChildren(svg, el("div", { className: "sf-map__fallback-note" }, [icon("map"), el("span", { text: `${t("common.error")}: ${t("map.title")}` })]));
  }

  function showFallback() {
    if (destroyed) return;
    ready = false;
    mapNode.hidden = true;
    fallback.hidden = false;
    renderFallback();
  }

  function updateMapData() {
    if (!map || !ready) return;
    const source = map.getSource("farm-plots");
    source?.setData(featureCollection(getPlots() || [], getUI()?.selectedPlotId));
  }

  function updateLayer() {
    const layer = getUI()?.mapLayer || "base";
    layerSelect.value = layer;
    if (map && ready && map.getLayer("plot-fill")) map.setPaintProperty("plot-fill", "fill-color", fillExpression(layer));
    if (map && ready && map.getLayer("plot-marker")) map.setPaintProperty("plot-marker", "circle-color", fillExpression(layer));
    renderFallback();
  }

  function updateText() {
    const farm = getFarm();
    title.textContent = t("map.title");
    subtitle.textContent = localText(farm?.name);
    layerLabel.textContent = t("map.layer");
    layerSelect.setAttribute("aria-label", t("map.layer"));
    mapNode.setAttribute("aria-label", t("map.title"));
    const selectedLayer = getUI()?.mapLayer || "base";
    layerSelect.replaceChildren(...["base", "health", "moisture"].map((layer) => el("option", { text: layer === "base" ? t("nav.map") : t(`map.${layer}`), attrs: { value: layer } })));
    layerSelect.value = selectedLayer;
    listSummary.replaceChildren(icon("plots"), el("span", { text: t("nav.plots") }));
    renderPlotList();
    renderFallback();
    localizeMapControls();
  }

  function localizeMapControls() {
    const controls = [
      [".maplibregl-ctrl-zoom-in", "map.zoomIn"],
      [".maplibregl-ctrl-zoom-out", "map.zoomOut"],
      [".maplibregl-ctrl-compass", "map.resetNorth"],
      [".maplibregl-ctrl-fullscreen", "map.fullscreen"],
      [".maplibregl-ctrl-shrink", "map.exitFullscreen"],
    ];
    controls.forEach(([selector, key]) => {
      mapNode.querySelector(selector)?.setAttribute("aria-label", t(key));
      mapNode.querySelector(selector)?.setAttribute("title", t(key));
    });
  }

  function initMap() {
    const maplibregl = window.maplibregl;
    if (!maplibregl?.Map) {
      showFallback();
      return;
    }
    const farm = getFarm();
    const center = farm?.center || [];
    if (!Number.isFinite(Number(center[0])) || !Number.isFinite(Number(center[1]))) {
      showFallback();
      return;
    }
    centerKey = `${center[0]},${center[1]}`;
    const configuredTiles = window.SMART_FARM_TILE_URL;
    const tiles = Array.isArray(configuredTiles) ? configuredTiles : [configuredTiles || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
    try {
      map = new maplibregl.Map({
        container: mapNode,
        center,
        zoom: 15,
        attributionControl: true,
        style: {
          version: 8,
          sources: {
            "base-tiles": {
              type: "raster",
              tiles,
              tileSize: 256,
              attribution: window.SMART_FARM_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors",
            },
          },
          layers: [{ id: "base-map", type: "raster", source: "base-tiles" }],
        },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.FullscreenControl({ container: root }), "top-right");
      localizeMapControls();
      loadTimer = window.setTimeout(() => {
        if (!ready) showFallback();
      }, 4500);
      map.on("load", () => {
        if (destroyed) return;
        window.clearTimeout(loadTimer);
        ready = true;
        mapNode.hidden = false;
        fallback.hidden = true;
        map.addSource("farm-plots", { type: "geojson", data: featureCollection(getPlots() || [], getUI()?.selectedPlotId), generateId: false });
        map.addLayer({
          id: "plot-fill",
          type: "fill",
          source: "farm-plots",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": fillExpression(getUI()?.mapLayer || "base"), "fill-opacity": 0.46 },
        });
        map.addLayer({
          id: "plot-outline",
          type: "line",
          source: "farm-plots",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": ["case", ["==", ["get", "selected"], true], "#141414", "#F7F9F4"],
            "line-width": ["case", ["==", ["get", "selected"], true], 4, ["boolean", ["feature-state", "hover"], false], 3, 1.5],
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: "plot-marker",
          type: "circle",
          source: "farm-plots",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": fillExpression(getUI()?.mapLayer || "base"),
            "circle-radius": ["case", ["==", ["get", "selected"], true], 8, 6],
            "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "#141414", "#F7F9F4"],
            "circle-stroke-width": 2,
            "circle-opacity": 0.95,
          },
        });
        const points = (getPlots() || []).flatMap((plot) => plot.polygon?.coordinates?.[0] || []);
        if (points.length) {
          const lngs = points.map((point) => Number(point[0]));
          const lats = points.map((point) => Number(point[1]));
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 30, maxZoom: 16, duration: 0 },
          );
        }
        const showPopup = (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          map.getCanvas().style.cursor = "pointer";
          if (feature.geometry.type === "Polygon") {
            if (hoveredId != null && hoveredId !== feature.id) map.setFeatureState({ source: "farm-plots", id: hoveredId }, { hover: false });
            hoveredId = feature.id;
            map.setFeatureState({ source: "farm-plots", id: hoveredId }, { hover: true });
          }
          const content = glassPill(feature.properties.name, `${fmtNum(Number(feature.properties.health), { maximumFractionDigits: 0 })}%`);
          if (!popup) popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
        };
        const hidePopup = () => {
          map.getCanvas().style.cursor = "";
          if (hoveredId != null) map.setFeatureState({ source: "farm-plots", id: hoveredId }, { hover: false });
          hoveredId = null;
          popup?.remove();
        };
        for (const layerId of ["plot-fill", "plot-marker"]) {
          map.on("mousemove", layerId, showPopup);
          map.on("mouseleave", layerId, hidePopup);
        }
        map.on("click", (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ["plot-marker", "plot-fill"] })[0];
          if (feature?.properties?.id) selectPlot(feature.properties.id);
          else setSelectedPlot(null);
        });
      });
    } catch {
      showFallback();
    }
  }

  updateText();
  initMap();
  document.addEventListener("fullscreenchange", localizeMapControls);
  const offLocale = onLocaleChange(() => {
    popup?.remove();
    updateText();
    updateMapData();
  });
  const offUI = subscribeUI(() => {
    renderPlotList();
    updateMapData();
    updateLayer();
  });
  const offData = subscribe(() => {
    updateText();
    updateMapData();
    const center = getFarm()?.center || [];
    const nextCenter = `${center[0]},${center[1]}`;
    if (map && ready && nextCenter !== centerKey) {
      centerKey = nextCenter;
      map.setCenter(center);
    }
  });

  return () => {
    destroyed = true;
    window.clearTimeout(loadTimer);
    offLocale?.();
    offUI?.();
    offData?.();
    document.removeEventListener("fullscreenchange", localizeMapControls);
    popup?.remove();
    map?.remove();
    container.replaceChildren();
  };
}
