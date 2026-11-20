import { getLocale, onLocaleChange, setLocale, t } from "./i18n.js";
import { el, icon, toast } from "./ui.js";

const desktopItems = [
  ["dashboard", "nav.dashboard", "hero"],
  ["plots", "nav.plots", "map-card"],
  ["map", "nav.map", "map-card"],
  ["tasks", "nav.tasks", "task-strip"],
  ["bot", "nav.agent", "hero-command"],
  ["settings", "nav.settings", "area-unit-toggle"],
];

const mobileItems = [
  ["dashboard", "nav.dashboard", "hero"],
  ["map", "nav.map", "map-card"],
  ["tasks", "nav.tasks", "task-strip"],
  ["bot", "nav.agent", "hero-command"],
];

export function mountShell({ rail, bottomNav }) {
  let active = "dashboard";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  const visit = (name, targetId) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    active = name;
    render();
    if (!target.matches("button,input,select,textarea,a[href],[tabindex]")) target.setAttribute("tabindex", "-1");
    target.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const navButton = ([name, labelKey, targetId], mobile = false) => {
    const label = t(labelKey);
    return el("button", {
      className: mobile ? "sf-bottomnav-btn" : "sf-rail-btn",
      attrs: {
        type: "button",
        "aria-label": label,
        "aria-current": active === name ? "page" : null,
        "data-tooltip": mobile ? null : label,
      },
      on: { click: () => visit(name, targetId) },
    }, [icon(name), mobile ? el("span", { text: label }) : null]);
  };

  const localeButton = (mobile = false) => {
    const nextLocale = getLocale() === "bn" ? "en" : "bn";
    const shortLabel = t(nextLocale === "bn" ? "common.bnShort" : "common.enShort");
    const label = t("common.switchLanguage");
    return el("button", {
      className: mobile ? "sf-bottomnav-btn sf-locale-button" : "sf-rail-btn sf-locale-button",
      attrs: { type: "button", "aria-label": label, "data-tooltip": mobile ? null : label },
      on: { click: () => setLocale(nextLocale) },
    }, [icon("language"), el("span", { className: mobile ? "" : "sf-locale-short", text: shortLabel })]);
  };

  const utilityButton = (name, key) => {
    const label = t(key);
    return el("button", {
      className: "sf-rail-btn",
      attrs: { type: "button", "aria-label": label, "data-tooltip": label },
      on: { click: () => toast(t(`${key}Notice`)) },
    }, [icon(name)]);
  };

  function render() {
    rail.replaceChildren(
      el("button", {
        className: "sf-rail-logo",
        attrs: { type: "button", "aria-label": t("common.brand") },
        on: { click: () => visit("dashboard", "hero") },
      }, [icon("leaf", "sf-rail-logo__icon")]),
      el("div", { className: "sf-rail-nav" }, desktopItems.map((item) => navButton(item))),
      el("div", { className: "sf-rail-foot" }, [
        localeButton(),
        utilityButton("help", "nav.help"),
        utilityButton("logout", "nav.logout"),
      ]),
    );
    bottomNav.replaceChildren(...mobileItems.map((item) => navButton(item, true)), localeButton(true));
  }

  render();
  const offLocale = onLocaleChange(render);
  return () => {
    offLocale?.();
    rail.replaceChildren();
    bottomNav.replaceChildren();
  };
}
