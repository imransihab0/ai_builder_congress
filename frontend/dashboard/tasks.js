import { createTask, getPlots, getTasks, subscribe, updateTask } from "./data.js";
import { fmtDate, fmtNum, getLocale, onLocaleChange, t } from "./i18n.js";
import { getUI, setSelectedPlot, setTaskFilter, subscribeUI } from "./store.js";
import { el, icon, toast } from "./ui.js";

const localText = (value) => typeof value === "string" ? value : value?.[getLocale()] || value?.en || value?.bn || "";
const statuses = ["waiting", "progress", "complete"];

function visualIndex(task, index) {
  return [...String(task.id || index)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
}

export function mountTasks(container, { onOpenPlot } = {}) {
  let editingId = null;
  let saving = false;
  let heroFilter = container.dataset.heroFilter || null;

  const heading = el("h2", { className: "sf-card-title", attrs: { id: "tasks-title" } });
  const subtitle = el("p", { className: "sf-card-subtitle" });
  const filterButton = el("button", {
    className: "sf-task-filter-chip",
    attrs: { type: "button" },
    on: {
      click: () => {
        heroFilter = null;
        delete container.dataset.heroFilter;
        setTaskFilter("all");
        renderTasks();
      },
    },
  });
  const addButton = el("button", {
    className: "sf-icon-button sf-task-add",
    attrs: { type: "button" },
    on: { click: () => openDialog() },
  }, [icon("plus")]);
  const track = el("div", { className: "sf-task-track", attrs: { role: "list" } });
  const root = el("article", { className: "sf-tasks sf-card-pad" }, [
    el("div", { className: "sf-card-header sf-tasks__head" }, [
      el("div", { className: "sf-tasks__title" }, [heading, subtitle]),
      el("div", { className: "sf-tasks__tools" }, [filterButton, addButton]),
    ]),
    track,
  ]);

  const formTitle = el("h3", { className: "sf-card-title" });
  const closeButton = el("button", {
    className: "sf-icon-button",
    attrs: { type: "button" },
    on: { click: () => dialog.close() },
  }, [icon("x")]);
  const titleLabel = el("span");
  const titleInput = el("input", { className: "sf-input", attrs: { type: "text", maxlength: 120, autocomplete: "off" } });
  const titleError = el("p", { className: "sf-field-error", attrs: { "aria-live": "polite" } });
  titleInput.setAttribute("aria-describedby", "task-title-error");
  titleError.id = "task-title-error";
  const plotLabel = el("span");
  const plotSelect = el("select", { className: "sf-select" });
  const statusLabel = el("span");
  const statusSelect = el("select", { className: "sf-select" });
  const dueLabel = el("span");
  const dueInput = el("input", { className: "sf-input", attrs: { type: "date" } });
  const createdBlock = el("div", { className: "sf-task-created" }, [icon("bot"), el("span")]);
  const cancelButton = el("button", { className: "sf-button sf-button--ghost", attrs: { type: "button" }, on: { click: () => dialog.close() } });
  const saveButton = el("button", { className: "sf-button sf-button--accent", attrs: { type: "submit" } });
  const form = el("form", { attrs: { novalidate: true } }, [
    el("div", { className: "sf-dialog__body" }, [
      el("label", { className: "sf-field" }, [titleLabel, titleInput, titleError]),
      el("label", { className: "sf-field" }, [plotLabel, plotSelect]),
      el("label", { className: "sf-field" }, [statusLabel, statusSelect]),
      el("label", { className: "sf-field" }, [dueLabel, dueInput]),
      createdBlock,
    ]),
    el("div", { className: "sf-dialog__actions" }, [cancelButton, saveButton]),
  ]);
  const dialog = el("dialog", { className: "sf-dialog sf-task-dialog" }, [
    el("div", { className: "sf-dialog__head" }, [formTitle, closeButton]),
    form,
  ]);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const title = titleInput.value.trim();
    if (!title) {
      titleError.textContent = `${t("task.titleLabel")}: ${t("common.error")}`;
      titleInput.setAttribute("aria-invalid", "true");
      titleInput.focus();
      return;
    }
    titleError.textContent = "";
    titleInput.removeAttribute("aria-invalid");
    const existing = editingId ? (getTasks() || []).find((task) => task.id === editingId) : null;
    const currentTitle = typeof existing?.title === "object" ? existing.title : {};
    const taskTitle = editingId ? { ...currentTitle, [getLocale()]: title } : { bn: title, en: title };
    const input = {
      title: taskTitle,
      plotId: plotSelect.value || null,
      status: statusSelect.value,
      dueAt: dueInput.value ? `${dueInput.value}T12:00:00+06:00` : null,
    };
    if (!editingId) input.createdBy = "farmer";
    saving = true;
    updateLabels();
    try {
      if (editingId) await Promise.resolve(updateTask(editingId, input));
      else await Promise.resolve(createTask(input));
      dialog.close();
      toast(`${t("task.title")} - ${t("task.save")}`, { tone: "success" });
    } catch {
      titleError.textContent = t("task.saveError");
    } finally {
      saving = false;
      updateLabels();
    }
  });

  function refreshSelects() {
    const selectedPlot = plotSelect.value;
    plotSelect.replaceChildren(
      el("option", { text: t("task.noPlot"), attrs: { value: "" } }),
      ...(getPlots() || []).map((plot) => el("option", { text: localText(plot.name), attrs: { value: plot.id } })),
    );
    if ([...plotSelect.options].some((option) => option.value === selectedPlot)) plotSelect.value = selectedPlot;
    const selectedStatus = statusSelect.value || "waiting";
    statusSelect.replaceChildren(...statuses.map((status) => el("option", { text: t(`task.${status}`), attrs: { value: status } })));
    statusSelect.value = selectedStatus;
  }

  function updateLabels() {
    heading.textContent = t("task.title");
    addButton.setAttribute("aria-label", t("task.add"));
    filterButton.setAttribute("aria-label", t("task.filterAll"));
    const editedTask = editingId ? (getTasks() || []).find((task) => task.id === editingId) : null;
    formTitle.textContent = editedTask ? localText(editedTask.title) : t("task.formTitle");
    if (editedTask) createdBlock.querySelector("span").textContent = t("task.createdBy", {
      creator: t(`task.${editedTask.createdBy || "farmer"}`),
    });
    closeButton.setAttribute("aria-label", t("common.close"));
    titleLabel.textContent = t("task.titleLabel");
    plotLabel.textContent = t("task.plotLabel");
    statusLabel.textContent = t("task.statusLabel");
    dueLabel.textContent = t("task.dueLabel");
    cancelButton.textContent = t("task.cancel");
    saveButton.textContent = t(saving ? "common.loading" : "task.save");
    saveButton.disabled = saving;
    refreshSelects();
    renderTasks();
  }

  function openDialog(task) {
    editingId = task?.id || null;
    titleError.textContent = "";
    titleInput.removeAttribute("aria-invalid");
    titleInput.value = task ? localText(task.title) : "";
    refreshSelects();
    plotSelect.value = task?.plotId || "";
    statusSelect.value = task?.status || "waiting";
    dueInput.value = task?.dueAt ? String(task.dueAt).slice(0, 10) : "";
    createdBlock.hidden = !task;
    if (task) createdBlock.querySelector("span").textContent = t("task.createdBy", {
      creator: t(`task.${task.createdBy || "farmer"}`),
    });
    updateLabels();
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => titleInput.focus());
  }

  function renderTasks() {
    const allTasks = getTasks() || [];
    const filter = heroFilter || getUI()?.taskFilter || "all";
    const tasks = filter === "complete"
      ? allTasks.filter((task) => task.status === "complete")
      : filter === "pending"
        ? allTasks.filter((task) => task.status !== "complete")
        : statuses.includes(filter)
          ? allTasks.filter((task) => task.status === filter)
          : allTasks;
    subtitle.textContent = `${fmtNum(tasks.length)} ${t("task.title")}`;
    filterButton.hidden = filter === "all";
    const filterLabel = filter === "all" ? t("task.filterAll") : t(`task.${filter}`);
    filterButton.replaceChildren(el("span", { text: filterLabel }), icon("x"));

    if (!tasks.length) {
      track.replaceChildren(el("div", { className: "sf-empty sf-task-empty" }, [icon("tasks"), el("span", { text: t("task.empty") })]));
      return;
    }

    track.replaceChildren(...tasks.map((task, index) => {
      const plot = task.plotId ? (getPlots() || []).find((item) => item.id === task.plotId) : null;
      const taskTitle = localText(task.title);
      const openButton = el("button", {
        className: "sf-task-card__open",
        attrs: { type: "button", "aria-label": `${t("common.more")}: ${taskTitle}` },
        on: { click: () => openDialog(task) },
      }, [
        el("div", { className: `sf-task-visual sf-task-visual--${visualIndex(task, index)}`, attrs: { "aria-hidden": "true" } }, [
          el("span", { className: "sf-task-visual__sun" }),
          el("span", { className: "sf-task-visual__field sf-task-visual__field--one" }),
          el("span", { className: "sf-task-visual__field sf-task-visual__field--two" }),
          el("span", { className: "sf-task-visual__shed" }),
        ]),
        el("div", { className: "sf-task-card__copy" }, [
          el("span", { className: `sf-task-status sf-task-status--${task.status}` }, [
            icon(task.status === "complete" ? "check" : task.status === "progress" ? "clock" : "more"),
            el("span", { text: t(`task.${task.status}`) }),
          ]),
          el("h3", { text: taskTitle }),
          task.dueAt ? el("span", { className: "sf-task-card__due" }, [icon("clock"), el("span", { text: fmtDate(task.dueAt) })]) : null,
        ]),
      ]);
      return el("article", { className: "sf-task-card", attrs: { role: "listitem" } }, [
        openButton,
        plot ? el("button", {
          className: "sf-task-card__plot",
          attrs: { type: "button", "aria-label": t("task.openPlot", { plot: localText(plot.name) }) },
          on: {
            click: () => {
              setSelectedPlot(plot.id);
              onOpenPlot?.(plot.id);
            },
          },
        }, [icon("map"), el("span", { text: localText(plot.name) }), icon("chevron")]) : null,
      ]);
    }));
  }

  container.replaceChildren(root, dialog);
  updateLabels();
  const offData = subscribe(() => {
    refreshSelects();
    renderTasks();
  });
  const onHeroFilter = (event) => {
    if (!["all", "pending", ...statuses].includes(event.detail)) return;
    heroFilter = event.detail;
    container.dataset.heroFilter = event.detail;
    renderTasks();
  };
  window.addEventListener("sf:task-filter", onHeroFilter);
  const offUI = subscribeUI(() => {
    if (!container.dataset.heroFilter) heroFilter = null;
    renderTasks();
  });
  const offLocale = onLocaleChange(updateLabels);

  const destroy = () => {
    offData?.();
    offUI?.();
    offLocale?.();
    window.removeEventListener("sf:task-filter", onHeroFilter);
    if (dialog.open) dialog.close();
    container.replaceChildren();
  };
  return { openCreate: () => openDialog(), destroy };
}
