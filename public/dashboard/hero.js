import { getAlerts, getFarm, getPlots, getTasks, derivedStats, plotScore, plotsNeedingAttention, subscribe } from "./data.js";
import { fmtNum, getLocale, onLocaleChange, t } from "./i18n.js";
import { setTaskFilter } from "./store.js";
import { el, glassPill, icon, toast } from "./ui.js";

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

export function mountHero(container, { onAddTask } = {}) {
  let composing = false;
  let pendingRender = false;

  function renderWhenIdle() {
    if (composing || container.contains(document.activeElement)) {
      pendingRender = true;
      return;
    }
    pendingRender = false;
    render();
  }

  function render() {
    const previousCommand = container.querySelector("#hero-command")?.value || "";
    const restoreCommandFocus = document.activeElement?.id === "hero-command";
    const farm = getFarm();
    const plots = getPlots() || [];
    const tasks = getTasks() || [];
    const alerts = getAlerts() || [];
    const stats = derivedStats() || {};
    const completed = Number(stats.tasksCompleted ?? tasks.filter((task) => task.status === "complete").length);
    const pending = Number(stats.tasksPending ?? tasks.length - completed);
    const attentionResult = plotsNeedingAttention();
    const attention = Array.isArray(attentionResult) ? attentionResult.length : Number(attentionResult || 0);
    const health = plots.length ? plots.reduce((sum, plot) => sum + scoreFor(plot), 0) / plots.length : 0;

    const farmSelect = el("select", {
      className: "sf-hero__farm-select",
      attrs: { "aria-label": t("dashboard.farmSelector") },
    }, [el("option", { text: localText(farm?.name), attrs: { value: farm?.id || "" } })]);

    const command = el("input", {
      className: "sf-hero__command-input",
      attrs: {
        id: "hero-command",
        type: "search",
        placeholder: t("agent.placeholder"),
        "aria-label": t("agent.commandLabel"),
        autocomplete: "off",
      },
      on: {
        compositionstart: () => { composing = true; },
        compositionend: () => { composing = false; },
        keydown: (event) => {
          if (event.key !== "Enter" || !event.currentTarget.value.trim()) return;
          event.preventDefault();
          toast(t("agent.commandReceived"));
        },
      },
    });
    command.value = previousCommand;

    const bellLabel = alerts.length ? t("alerts.count", { count: alerts.length }) : t("alerts.none");
    const bell = el("button", {
      className: "sf-icon-button sf-hero__bell",
      attrs: { type: "button", "aria-label": bellLabel },
      on: {
        click: () => toast(alerts.length ? localText(alerts[0].message) : t("alerts.none"), {
          tone: alerts.length ? "warning" : "neutral",
        }),
      },
    }, [icon("bell"), alerts.length ? el("span", { className: "sf-hero__badge", text: fmtNum(alerts.length) }) : null]);

    const taskButton = (kind, label, value) => el("button", {
      className: "sf-hero__task-filter",
      attrs: { type: "button", "aria-label": `${label} ${fmtNum(value)}` },
      on: {
        click: () => {
          const taskStrip = document.getElementById("task-strip");
          // shortcut: the store has no aggregate pending value, remove this bridge when it does.
          setTaskFilter(kind === "pending" ? "waiting" : kind);
          if (taskStrip) taskStrip.dataset.heroFilter = kind;
          window.dispatchEvent(new CustomEvent("sf:task-filter", { detail: kind }));
          taskStrip?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
        },
      },
    }, [el("span", { text: label }), el("strong", { text: fmtNum(value) })]);

    const preview = el("div", { className: "sf-farm-preview", attrs: { "aria-hidden": "true" } }, [
      el("div", { className: "sf-farm-preview__shadow" }),
      el("div", { className: "sf-farm-preview__land" }, [
        el("span", { className: "sf-farm-preview__field sf-farm-preview__field--one" }),
        el("span", { className: "sf-farm-preview__field sf-farm-preview__field--two" }),
        el("span", { className: "sf-farm-preview__field sf-farm-preview__field--three" }),
        el("span", { className: "sf-farm-preview__water" }),
        el("span", { className: "sf-farm-preview__barn" }),
        el("span", { className: "sf-farm-preview__tree sf-farm-preview__tree--one" }),
        el("span", { className: "sf-farm-preview__tree sf-farm-preview__tree--two" }),
      ]),
    ]);

    container.replaceChildren(el("article", { className: "sf-hero" }, [
      el("div", { className: "sf-hero__orb", attrs: { "aria-hidden": "true" } }),
      el("div", { className: "sf-hero__main" }, [
        el("div", { className: "sf-hero__heading" }, [
          el("div", { className: "sf-hero__eyebrow" }, [icon("leaf"), farmSelect]),
          el("h1", { className: "sf-hero__title", text: t("dashboard.title"), attrs: { id: "hero-title" } }),
          el("p", { className: "sf-hero__subtitle", text: t("dashboard.subtitle") }),
        ]),
        el("label", { className: "sf-hero__command" }, [
          el("span", { className: "sf-visually-hidden", text: t("agent.commandLabel") }),
          icon("search"),
          command,
        ]),
        el("div", { className: "sf-hero__task-row" }, [
          el("div", { className: "sf-hero__task-pill" }, [
            taskButton("complete", t("task.completed"), completed),
            taskButton("pending", t("task.pending"), pending),
          ]),
          el("button", {
            className: "sf-button sf-hero__add",
            attrs: { type: "button" },
            on: { click: () => onAddTask?.() },
          }, [icon("plus"), el("span", { text: t("task.add") })]),
        ]),
      ]),
      el("div", { className: "sf-hero__visual" }, [bell, preview,
        el("div", { className: "sf-hero__stats" }, [
          glassPill(t("dashboard.farmHealth"), `${fmtNum(health, { maximumFractionDigits: 0 })}%`),
          glassPill(t("dashboard.needsAttention"), fmtNum(attention)),
        ]),
      ]),
    ]));
    if (restoreCommandFocus) {
      requestAnimationFrame(() => {
        command.focus();
        command.setSelectionRange(command.value.length, command.value.length);
      });
    }
  }

  const onFocusOut = () => {
    if (pendingRender) queueMicrotask(renderWhenIdle);
  };
  container.addEventListener("focusout", onFocusOut);
  render();
  const offData = subscribe(renderWhenIdle);
  const offLocale = onLocaleChange(renderWhenIdle);
  return () => {
    offData?.();
    offLocale?.();
    container.removeEventListener("focusout", onFocusOut);
    container.replaceChildren();
  };
}
