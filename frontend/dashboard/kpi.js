import { derivedStats, subscribe } from "./data.js";
import { fmtNum, onLocaleChange, t } from "./i18n.js";
import { formatArea, getAreaUnit, getConversions, onAreaUnitChange, setAreaUnit, setConversions } from "./units.js";
import { setMapLayer } from "./store.js";
import { countUp, el, icon, toast } from "./ui.js";

const units = ["ha", "bigha", "decimal"];

export function mountKpis(container) {
  const lastValues = new Map();
  let conversionDialog;
  let conversionInput;

  const openConversion = () => {
    conversionInput.value = String(getConversions().decimalPerBigha);
    conversionInput.setCustomValidity("");
    conversionDialog.showModal();
    requestAnimationFrame(() => conversionInput.focus());
  };

  const openMap = (layer, messageKey) => {
    setMapLayer(layer);
    document.getElementById("map-card")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
    toast(t(messageKey));
  };

  function render() {
    const stats = derivedStats() || {};
    const items = [
      { key: "plots", label: "kpi.totalPlots", value: Number(stats.totalPlots || 0), unit: "unit.plots", icon: "plots", action: () => openMap("health", "kpi.plotsMapHint") },
      { key: "crops", label: "kpi.totalCrop", value: Number(stats.totalCrops ?? stats.totalCrop ?? 0), unit: "unit.crops", icon: "leaf", action: () => openMap("health", "kpi.cropMapHint") },
      { key: "area", label: "kpi.totalArea", value: Number(stats.totalAreaM2 || 0), icon: "map", action: openConversion },
      { key: "plants", label: "kpi.totalPlants", value: Number(stats.totalPlants || 0), unit: "unit.plants", icon: "leaf", action: () => openMap("base", "kpi.plantsMapHint") },
    ];

    const cards = items.map((item) => {
      const valueNode = el("strong", { className: "sf-kpi__value" });
      const changed = lastValues.get(item.key) !== item.value;
      const formatter = item.key === "area"
        ? (value) => formatArea(value)
        : (value) => fmtNum(value, { maximumFractionDigits: 0 });
      if (changed) countUp(valueNode, item.value, { format: formatter });
      else valueNode.textContent = formatter(item.value);
      lastValues.set(item.key, item.value);

      const menu = el("button", {
        className: "sf-kpi__menu",
        attrs: { type: "button", "aria-label": `${t("common.moreOptions")}: ${t(item.label)}` },
        on: { click: item.action },
      }, [icon("more")]);

      const areaToggle = item.key === "area" ? el("div", {
        className: "sf-segmented sf-kpi__units",
        attrs: { id: "area-unit-toggle", role: "group", "aria-label": t("unit.areaUnit") },
      }, units.map((unit) => el("button", {
        attrs: { type: "button", "aria-pressed": getAreaUnit() === unit },
        on: { click: () => setAreaUnit(unit) },
        text: t(`unit.${unit}`),
      }))) : null;

      return el("article", { className: `sf-kpi sf-kpi--${item.key}` }, [
        el("div", { className: "sf-kpi__top" }, [
          el("span", { className: "sf-kpi__icon" }, [icon(item.icon)]),
          menu,
        ]),
        el("div", { className: "sf-kpi__metric" }, [
          el("span", { className: "sf-kpi__label", text: t(item.label) }),
          el("div", { className: "sf-kpi__number" }, [
            valueNode,
            item.unit ? el("span", { className: "sf-kpi__unit", text: t(item.unit) }) : null,
          ]),
        ]),
        areaToggle,
      ]);
    });

    conversionInput = el("input", {
      className: "sf-input",
      attrs: { type: "number", min: "1", step: "0.01", required: true },
    });
    const form = el("form", {}, [
      el("div", { className: "sf-dialog__body" }, [
        el("label", { className: "sf-field" }, [
          el("span", { text: t("unit.bighaDecimalLabel") }),
          conversionInput,
        ]),
        el("p", { className: "sf-card-subtitle", text: t("unit.conversionHint") }),
      ]),
      el("div", { className: "sf-dialog__actions" }, [
        el("button", {
          className: "sf-button sf-button--ghost",
          text: t("common.cancel"),
          attrs: { type: "button" },
          on: { click: () => conversionDialog.close() },
        }),
        el("button", {
          className: "sf-button sf-button--accent",
          text: t("common.save"),
          attrs: { type: "submit" },
        }),
      ]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        setConversions({ decimalPerBigha: Number(conversionInput.value) });
        conversionDialog.close();
        render();
        toast(t("unit.conversionSaved"), { tone: "success" });
      } catch {
        conversionInput.setCustomValidity(t("common.error"));
        conversionInput.reportValidity();
      }
    });
    conversionDialog = el("dialog", { className: "sf-dialog sf-kpi-dialog" }, [
      el("div", { className: "sf-dialog__head" }, [
        el("h2", { className: "sf-card-title", text: t("unit.conversionTitle") }),
        el("button", {
          className: "sf-icon-button",
          attrs: { type: "button", "aria-label": t("common.close") },
          on: { click: () => conversionDialog.close() },
        }, [icon("x")]),
      ]),
      form,
    ]);
    conversionDialog.addEventListener("click", (event) => {
      if (event.target === conversionDialog) conversionDialog.close();
    });
    container.replaceChildren(...cards, conversionDialog);
  }

  render();
  const renderUnlessEditing = () => {
    if (!conversionDialog?.open) render();
  };
  const offData = subscribe(renderUnlessEditing);
  const offLocale = onLocaleChange(render);
  const offUnit = onAreaUnitChange(render);
  return () => {
    offData?.();
    offLocale?.();
    offUnit?.();
    container.replaceChildren();
  };
}
