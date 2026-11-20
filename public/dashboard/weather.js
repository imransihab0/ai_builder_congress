import { getFarm, setWeatherSnapshot, subscribe } from "./data.js";
import { fmtNum, onLocaleChange, t } from "./i18n.js";
import { el, icon } from "./ui.js";

const CACHE_MS = 10 * 60 * 1000;

function conditionFor(code) {
  if (code === 0) return ["weather.clear", "sun"];
  if (code <= 3) return ["weather.cloudy", "cloud"];
  if (code === 45 || code === 48) return ["weather.fog", "cloud"];
  return ["weather.rain", "rain"];
}

function normalizeWeather(data) {
  const current = data?.current || {};
  const hourly = data?.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const temperatures = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const rain = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
  if (!Number.isFinite(Number(current.temperature_2m)) || !times.length) throw new Error("invalid-weather-payload");
  return {
    tempC: Number(current.temperature_2m),
    humidity: Number(current.relative_humidity_2m || 0),
    windKmh: Number(current.wind_speed_10m || 0),
    code: Number(current.weather_code || 0),
    currentTime: current.time || times[0],
    updatedAt: new Date().toISOString(),
    hourly: times.map((time, index) => ({
      time,
      tempC: Number(temperatures[index]),
      rainProb: Number(rain[index] || 0),
    })).filter((item) => Number.isFinite(item.tempC)),
  };
}

function readCache(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    const valid = Number.isFinite(Number(value?.savedAt))
      && Number.isFinite(Number(value?.weather?.tempC))
      && Array.isArray(value?.weather?.hourly)
      && value.weather.hourly.length;
    return valid ? value : null;
  } catch {
    return null;
  }
}

function writeCache(key, weather) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), weather }));
  } catch {}
}

export function mountWeather(container) {
  let weather = null;
  let status = "loading";
  let centerKey = "";
  let controller;
  let request = 0;

  function renderLoading() {
    container.replaceChildren(el("article", { className: "sf-weather sf-card-pad", attrs: { "aria-busy": "true" } }, [
      el("h2", { className: "sf-visually-hidden", text: t("weather.title"), attrs: { id: "weather-title" } }),
      el("div", { className: "sf-card-header" }, [
        el("div", { className: "sf-skeleton sf-weather__sk-title" }),
        el("div", { className: "sf-skeleton sf-weather__sk-icon" }),
      ]),
      el("div", { className: "sf-skeleton sf-weather__sk-main" }),
      el("div", { className: "sf-skeleton sf-weather__sk-bar" }),
    ]));
  }

  function renderError() {
    container.replaceChildren(el("article", { className: "sf-weather sf-card-pad" }, [
      el("div", { className: "sf-card-header" }, [el("h2", { className: "sf-card-title", text: t("weather.title"), attrs: { id: "weather-title" } })]),
      el("div", { className: "sf-error-state" }, [
        icon("cloud"),
        el("span", { text: t("weather.unavailable") }),
        el("button", { className: "sf-button sf-button--soft", text: t("common.retry"), attrs: { type: "button" }, on: { click: load } }),
      ]),
    ]));
  }

  function renderWeather() {
    const [conditionKey, conditionIcon] = conditionFor(weather.code);
    const dayPrefix = weather.currentTime.slice(0, 10);
    let hours = weather.hourly.filter((hour) => hour.time.startsWith(dayPrefix)).slice(0, 24);
    const currentIndex = Math.max(0, weather.hourly.findIndex((hour) => hour.time >= weather.currentTime));
    if (hours.length < 12) hours = weather.hourly.slice(currentIndex, currentIndex + 24);
    const values = hours.map((hour) => hour.tempC);
    const min = values.length ? Math.min(...values) : weather.tempC;
    const max = values.length ? Math.max(...values) : weather.tempC;
    const nowInDay = Math.max(0, hours.findIndex((hour) => hour.time >= weather.currentTime));
    const marker = hours.length > 1 ? nowInDay / (hours.length - 1) * 100 : 0;
    const nextSix = weather.hourly.slice(currentIndex, currentIndex + 6);
    const rainRisk = nextSix.some((hour) => hour.rainProb >= 60);
    const heatRisk = weather.tempC >= 36;
    const alertKey = heatRisk ? "weather.heatAlert" : rainRisk ? "weather.rainAlert" : null;
    const temp = `${fmtNum(weather.tempC, { maximumFractionDigits: 1 })}${t("unit.celsiusShort")}`;

    container.replaceChildren(el("article", { className: "sf-weather sf-card-pad" }, [
      el("div", { className: "sf-card-header" }, [
        el("div", {}, [
          el("h2", { className: "sf-card-title", text: t("weather.title"), attrs: { id: "weather-title" } }),
          status === "stale" ? el("p", { className: "sf-card-subtitle", text: t("weather.cached") }) : null,
        ]),
        el("span", { className: "sf-weather__condition-icon" }, [icon(conditionIcon)]),
      ]),
      el("div", { className: "sf-weather__current" }, [
        el("div", {}, [
          el("strong", { className: "sf-weather__temp", text: temp }),
          el("span", { className: "sf-weather__condition", text: t(conditionKey) }),
        ]),
        el("div", { className: "sf-weather__facts" }, [
          el("span", {}, [icon("wind"), el("b", { text: `${fmtNum(weather.windKmh, { maximumFractionDigits: 0 })} ${t("unit.kmh")}` })]),
          el("span", {}, [icon("humidity"), el("b", { text: `${fmtNum(weather.humidity, { maximumFractionDigits: 0 })}%` })]),
        ]),
      ]),
      el("div", { className: "sf-weather__range", attrs: { "aria-label": t("weather.temperatureRange", { min: fmtNum(min), max: fmtNum(max) }) } }, [
        el("div", { className: "sf-weather__range-labels" }, [
          el("span", {}, [el("small", { text: t("weather.min") }), el("b", { text: `${fmtNum(min, { maximumFractionDigits: 0 })}${t("unit.celsiusShort")}` })]),
          el("span", {}, [el("small", { text: t("weather.max") }), el("b", { text: `${fmtNum(max, { maximumFractionDigits: 0 })}${t("unit.celsiusShort")}` })]),
        ]),
        el("div", { className: "sf-weather__bar", attrs: { style: `--sf-now:${marker}%` } }, [
          el("span", { className: "sf-weather__now" }, [el("span", { className: "sf-visually-hidden", text: t("weather.now") })]),
        ]),
      ]),
      alertKey ? el("div", { className: "sf-weather__alert" }, [icon("alert"), el("span", { text: t(alertKey) })]) : null,
    ]));
  }

  function render() {
    if (status === "loading" && !weather) renderLoading();
    else if (!weather) renderError();
    else renderWeather();
  }

  async function load() {
    const farm = getFarm();
    const [lng, lat] = farm?.center || [];
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      status = "error";
      render();
      return;
    }
    centerKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
    const cacheKey = `sf-weather:${centerKey}`;
    const cached = readCache(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_MS) {
      weather = cached.weather;
      setWeatherSnapshot(weather);
      status = "ready";
      render();
      return;
    }
    weather = cached?.weather || null;
    setWeatherSnapshot(weather);
    status = weather ? "stale" : "loading";
    render();
    controller?.abort();
    controller = new AbortController();
    const currentRequest = ++request;
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
      hourly: "temperature_2m,precipitation_probability",
      timezone: "Asia/Dhaka",
      forecast_days: "2",
    });
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`weather-${response.status}`);
      const next = normalizeWeather(await response.json());
      if (currentRequest !== request) return;
      weather = next;
      setWeatherSnapshot(next);
      status = "ready";
      writeCache(cacheKey, next);
    } catch (error) {
      if (error.name === "AbortError" || currentRequest !== request) return;
      status = weather ? "stale" : "error";
    }
    render();
  }

  load();
  const offLocale = onLocaleChange(render);
  const offData = subscribe(() => {
    const center = getFarm()?.center || [];
    const nextKey = `${Number(center[1]).toFixed(4)},${Number(center[0]).toFixed(4)}`;
    if (nextKey !== centerKey) load();
  });
  return () => {
    request += 1;
    controller?.abort();
    offLocale?.();
    offData?.();
    container.replaceChildren();
  };
}
