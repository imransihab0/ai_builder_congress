const SVG_NS = "http://www.w3.org/2000/svg";

const paths = {
  dashboard: [["rect", { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ["rect", { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ["rect", { x: 3, y: 14, width: 7, height: 7, rx: 1 }], ["rect", { x: 14, y: 14, width: 7, height: 7, rx: 1 }]],
  plots: [["path", { d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" }]],
  map: [["path", { d: "m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" }], ["path", { d: "M8 3v15M16 6v15" }]],
  tasks: [["path", { d: "M9 5h6M9 3h6v4H9zM6 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1" }], ["path", { d: "m8 13 2 2 5-5" }]],
  bot: [["rect", { x: 4, y: 7, width: 16, height: 12, rx: 4 }], ["path", { d: "M12 3v4M8 12h.01M16 12h.01M8 16h8" }]],
  settings: [["path", { d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" }], ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.58 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.05 1.52 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.82 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" }]],
  help: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M9.6 9a2.5 2.5 0 1 1 3.2 2.4c-.8.3-.8 1-.8 1.6M12 17h.01" }]],
  logout: [["path", { d: "M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" }]],
  bell: [["path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" }]],
  search: [["circle", { cx: 11, cy: 11, r: 7 }], ["path", { d: "m20 20-4-4" }]],
  plus: [["path", { d: "M12 5v14M5 12h14" }]],
  chevron: [["path", { d: "m9 18 6-6-6-6" }]],
  drop: [["path", { d: "M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11Z" }]],
  leaf: [["path", { d: "M20 4C10 4 5 9 5 15c0 3 2 5 5 5 6 0 10-6 10-16Z" }], ["path", { d: "M4 21c3-6 7-9 13-12" }]],
  thermometer: [["path", { d: "M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0Z" }], ["path", { d: "M10 7v9" }]],
  wind: [["path", { d: "M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" }]],
  humidity: [["path", { d: "M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11Z" }], ["path", { d: "M9 15c.7 1.3 1.7 2 3 2" }]],
  sun: [["circle", { cx: 12, cy: 12, r: 4 }], ["path", { d: "M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" }]],
  cloud: [["path", { d: "M17.5 19H6a4 4 0 0 1-.4-8A6.5 6.5 0 0 1 18 9a5 5 0 0 1-.5 10Z" }]],
  rain: [["path", { d: "M17.5 15H6a4 4 0 0 1-.4-8A6.5 6.5 0 0 1 18 5a5 5 0 0 1-.5 10Z" }], ["path", { d: "m8 19-1 2M13 19l-1 2M18 19l-1 2" }]],
  alert: [["path", { d: "M10.3 3.7 2.6 17A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" }], ["path", { d: "M12 9v4M12 17h.01" }]],
  check: [["path", { d: "m5 12 4 4L19 6" }]],
  clock: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 7v5l3 2" }]],
  x: [["path", { d: "M18 6 6 18M6 6l12 12" }]],
  more: [["circle", { cx: 5, cy: 12, r: 1 }], ["circle", { cx: 12, cy: 12, r: 1 }], ["circle", { cx: 19, cy: 12, r: 1 }]],
  layers: [["path", { d: "m12 2 9 5-9 5-9-5 9-5Z" }], ["path", { d: "m3 12 9 5 9-5M3 17l9 5 9-5" }]],
  zoomIn: [["circle", { cx: 10.5, cy: 10.5, r: 7.5 }], ["path", { d: "M10.5 7v7M7 10.5h7M16 16l5 5" }]],
  zoomOut: [["circle", { cx: 10.5, cy: 10.5, r: 7.5 }], ["path", { d: "M7 10.5h7M16 16l5 5" }]],
  compass: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "m15.5 8.5-2 5-5 2 2-5 5-2Z" }]],
  maximize: [["path", { d: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" }]],
  language: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" }]],
  external: [["path", { d: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]],
};

function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function el(tag, { className, text, html, attrs, dataset, on } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  if (html != null) node.innerHTML = html;
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    if (typeof value === "boolean" && name.startsWith("aria-")) {
      node.setAttribute(name, String(value));
      continue;
    }
    if (value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [name, value] of Object.entries(dataset || {})) node.dataset[name] = String(value);
  for (const [name, handler] of Object.entries(on || {})) node.addEventListener(name, handler);
  appendChildren(node, children);
  return node;
}

export function icon(name, className = "sf-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [tag, attrs] of paths[name] || paths.help) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, String(value));
    svg.append(part);
  }
  return svg;
}

export function glassPill(label, value) {
  return el("div", { className: "sf-glass-pill" }, [
    el("span", { className: "sf-glass-pill__label", text: label }),
    el("strong", { className: "sf-glass-pill__value", text: value }),
  ]);
}

const countFrames = new WeakMap();

export function countUp(node, to, { decimals = 0, duration = 650, format } = {}) {
  const target = Number(to);
  if (!Number.isFinite(target)) return;
  const previous = countFrames.get(node);
  if (previous) cancelAnimationFrame(previous);
  const print = (value) => {
    node.textContent = format ? format(value) : value.toFixed(decimals);
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || duration <= 0) {
    print(target);
    return;
  }
  let started = null;
  const frame = (now) => {
    if (started === null || now < started) started = now;
    const progress = Math.max(0, Math.min(1, (now - started) / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    print(target * eased);
    if (progress < 1) countFrames.set(node, requestAnimationFrame(frame));
    else countFrames.delete(node);
  };
  countFrames.set(node, requestAnimationFrame(frame));
}

export function toast(message, { tone = "neutral", timeout = 2800 } = {}) {
  const region = document.getElementById("toast-region");
  if (!region || !message) return;
  const item = el("div", { className: `sf-toast sf-toast--${tone}`, text: message });
  region.append(item);
  window.setTimeout(() => {
    item.classList.add("is-leaving");
    window.setTimeout(() => item.remove(), 180);
  }, timeout);
}
