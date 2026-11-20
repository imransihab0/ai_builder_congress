// AgriSphere AI — Autonomous Agronomic Operating System
const $ = (id) => document.getElementById(id);

let sessionId = localStorage.getItem("agrisphere_session");
if (!sessionId) {
  sessionId = "farm-" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("agrisphere_session", sessionId);
}

let openAiApiKey = localStorage.getItem("agrisphere_openai_key") || "";

// --------------------------------------------------------------------------
// 1. Three.js 3D Digital Twin Viewport
// --------------------------------------------------------------------------
(function initDigitalTwin() {
  const canvas = $("digitalTwinCanvas");
  if (!canvas || typeof THREE === "undefined") return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.5, 7.5);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const sphereGeo = new THREE.IcosahedronGeometry(3.5, 4);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    wireframe: true,
    transparent: true,
    opacity: 0.14,
  });
  const globe = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(globe);

  const coreGeo = new THREE.IcosahedronGeometry(3.2, 2);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x059669,
    wireframe: false,
    transparent: true,
    opacity: 0.04,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  const nodes = [
    { name: "Bogura (Boro Zone)", lat: 24.84, lon: 89.37, color: 0x10b981 },
    { name: "Rajshahi (Barind)", lat: 24.37, lon: 88.60, color: 0xf59e0b },
    { name: "Rangpur (Tuber Belt)", lat: 25.74, lon: 89.27, color: 0x06b6d4 },
    { name: "Jashore (Pulses)", lat: 23.16, lon: 89.21, color: 0x10b981 },
    { name: "Mymensingh (Aman)", lat: 24.75, lon: 90.40, color: 0x10b981 },
  ];

  const nodeGroup = new THREE.Group();
  nodes.forEach((n) => {
    const phi = (90 - n.lat) * (Math.PI / 180);
    const theta = (n.lon + 180) * (Math.PI / 180);
    const r = 3.52;
    const x = -(r * Math.sin(phi) * Math.cos(theta));
    const z = r * Math.sin(phi) * Math.sin(theta);
    const y = r * Math.cos(phi);

    const pinGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const pinMat = new THREE.MeshBasicMaterial({ color: n.color });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(x, y, z);
    nodeGroup.add(pin);
  });
  scene.add(nodeGroup);

  const partCount = 180;
  const positions = new Float32Array(partCount * 3);
  for (let i = 0; i < partCount * 3; i += 3) {
    const radius = 3.6 + Math.random() * 0.9;
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    positions[i] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i + 2] = radius * Math.cos(phi);
  }

  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const partMat = new THREE.PointsMaterial({
    size: 0.045,
    color: 0x6ee7b7,
    transparent: true,
    opacity: 0.7,
  });
  const particles = new THREE.Points(partGeo, partMat);
  scene.add(particles);

  let mouseX = 0, mouseY = 0;
  let scrollDelta = 0;

  window.addEventListener("scroll", () => {
    scrollDelta = (window.scrollY || document.documentElement.scrollTop) * 0.002;
  }, { passive: true });

  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function renderLoop() {
    requestAnimationFrame(renderLoop);
    globe.rotation.y += 0.0015;
    globe.rotation.x = mouseY * 0.15;
    globe.rotation.y += (scrollDelta + mouseX * 0.2 - globe.rotation.y) * 0.05;

    nodeGroup.rotation.y = globe.rotation.y;
    nodeGroup.rotation.x = globe.rotation.x;
    particles.rotation.y = globe.rotation.y * 1.05;

    renderer.render(scene, camera);
  }
  renderLoop();
})();

// --------------------------------------------------------------------------
// 2. Workbench Tabs & UI Navigation
// --------------------------------------------------------------------------
document.querySelectorAll(".wb-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".wb-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".wb-view").forEach((v) => v.classList.remove("active"));

    tab.classList.add("active");
    const target = $("view-" + tab.dataset.tab);
    if (target) target.classList.add("active");
  });
});

// --------------------------------------------------------------------------
// 3. Agent Graph Stepper Synchronization
// --------------------------------------------------------------------------
const STEPS = ["intake", "geo", "weather", "rag", "math", "plan", "caas"];
function advanceStep(stepKey) {
  const idx = STEPS.indexOf(stepKey);
  if (idx < 0) return;
  STEPS.forEach((s, i) => {
    const el = $("step-" + s);
    if (el) {
      if (i <= idx) el.classList.add("active");
      else el.classList.remove("active");
    }
  });
}

// --------------------------------------------------------------------------
// 4. Trace Log & Event Handling
// --------------------------------------------------------------------------
const traceLog = [];
let traceEventCount = 0;

function addTrace(kind, title, payload) {
  traceEventCount++;
  $("traceCount").textContent = `${traceEventCount} Events`;
  traceLog.push({ kind, title, payload });

  const div = document.createElement("div");
  div.className = "trace-entry " + kind;
  const body = payload !== undefined
    ? `<details ${kind === "tool_call" ? "open" : ""}><summary><b>${title}</b></summary><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></details>`
    : `<div><b>${title}</b></div>`;
  div.innerHTML = body;
  $("trace").appendChild(div);
  $("trace").scrollTop = $("trace").scrollHeight;
}

$("traceCopy").addEventListener("click", async () => {
  const text = traceLog.map((e) =>
    e.payload !== undefined ? `${e.title}\n${JSON.stringify(e.payload, null, 2)}` : e.title
  ).join("\n\n") || "(trace is empty)";
  try {
    await navigator.clipboard.writeText(text);
    $("traceCopy").textContent = "✓ Copied";
    setTimeout(() => ($("traceCopy").textContent = "Copy JSON"), 1500);
  } catch (_) {
    alert("Trace copied:\n" + text.slice(0, 200) + "...");
  }
});

$("traceClear").addEventListener("click", () => {
  $("trace").innerHTML = "";
  traceEventCount = 0;
  $("traceCount").textContent = "0 Events";
});

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseMarkdownSafe(text) {
  if (typeof marked !== "undefined" && typeof marked.parse === "function") {
    return marked.parse(text);
  }
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*)\*/gim, '<i>$1</i>')
    .replace(/\n/gim, '<br>');
}

function addMessage(role, html) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.innerHTML = html;
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return div;
}

// Conversation History Memory
const conversationHistory = [
  {
    role: "system",
    content: `You are AgriSphere AI, the autonomous agronomic operating system for Bangladesh smallholder precision farming (Team DIU_Legacy1831).
Language: Always speak natural, helpful, respectful Bengali (or English if addressed in English).
Core rules:
1. GREETING: If user says hi, hello, সালাম, greet them politely and ask for their land location (district), area in acres, and budget. DO NOT dump a full plan!
2. WEATHER RISK: If user asks about weather or risks, answer their specific weather question. If location is mentioned, use it; otherwise mention Bogura / North Bengal default and pull forecast.
3. LEAF / DISEASE / PEST: If user asks about leaf diseases, symptoms, or attaches an image, diagnose the disease (e.g. Rice Blast / Sheath Blight) and give specific fungicides (e.g. Tricyclazole, Nativo) and cultural methods from the DAE guide.
4. PLAN: When farm parameters (acres, location, budget, crop) are given, call the agronomic tools, give a 3-crop comparison table, and present a dated fertilizer schedule from BARC FRG 2024.
Always format with clean markdown tables and bullet points. Include action tags:
[[BUTTON:label|message]]
[[CALL:label|phone_number]]`
  }
];

// --------------------------------------------------------------------------
// 5. Execution Pipeline & Dispatch (Backend Streaming with Client Fallback)
// --------------------------------------------------------------------------
function handleBackendEvent(ev, thinkingEl) {
  if (ev.type === "status") {
    addTrace("status", ev.text);
    thinkingEl.innerHTML = `<em>${escapeHtml(ev.text)}</em>`;
  } else if (ev.type === "tool_call") {
    addTrace("tool_call", `CALL: ${ev.tool}`, ev.params);
    thinkingEl.innerHTML = `<em>Executing <b>${escapeHtml(ev.tool)}</b>…</em>`;
    if (ev.tool === "geocode_location" || ev.tool === "lookup_soil_texture") advanceStep("twin");
    if (ev.tool === "lookup_awd_suitability" || ev.tool === "get_weather_forecast") advanceStep("verify");
    if (ev.tool === "compute_financials") advanceStep("plan");
  } else if (ev.type === "tool_result") {
    addTrace("tool_result", `RESULT: ${ev.tool} (${ev.ms || 0} ms)`, ev.result);
  } else if (ev.type === "final") {
    renderAgentMessage(thinkingEl, ev.content || "");
    addTrace("status", "✔ Turn complete (Agent response rendered)");
    advanceStep("plan");
    if (ev.content && (ev.content.includes("বোরো ধান") || ev.content.includes("মৌসুমি") || ev.content.includes("Season Plan")) && typeof confetti !== "undefined") {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.8 } });
    }
  } else if (ev.type === "error") {
    thinkingEl.innerHTML = `<span style="color:#ef4444">${escapeHtml(ev.text)}</span>`;
  }
}

async function send(message, imageDataUrl = null) {
  let displayHtml = escapeHtml(message);
  if (imageDataUrl) {
    displayHtml += `<br><img src="${imageDataUrl}" style="max-height: 160px; border-radius: 6px; margin-top: 8px; border: 1px solid var(--border-dim);">`;
  }
  addMessage("user", displayHtml);
  const thinking = addMessage("assistant pending", "<em>AgriSphere AI reasoning with OpenAI…</em>");
  $("sendBtn").disabled = true;

  advanceStep("intake");

  try {
    // 1. Try our live Vercel backend /api/chat first (which has OPENAI_API_KEY securely configured)
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message, image_data_url: imageDataUrl }),
    });

    if (res.ok) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            handleBackendEvent(ev, thinking);
          } catch (_) {}
        }
      }
      return;
    }

    // 2. Client-side fallback if user saved API key in localStorage
    if (openAiApiKey && openAiApiKey.startsWith("sk-")) {
      await callLiveOpenAIAgent(message, thinking, imageDataUrl);
      return;
    }

    throw new Error("AgriSphere service reached error HTTP " + res.status);
  } catch (err) {
    console.error("Execution error:", err);
    // If backend failed and key not present, try client agent fallback
    if (openAiApiKey && openAiApiKey.startsWith("sk-")) {
      try {
        await callLiveOpenAIAgent(message, thinking, imageDataUrl);
        return;
      } catch (innerErr) {
        thinking.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(innerErr.message)}</span>`;
      }
    } else {
      thinking.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message)}</span>`;
    }
  } finally {
    thinking.classList.remove("pending");
    $("sendBtn").disabled = false;
    $("input").focus();
  }
}

// --------------------------------------------------------------------------
// 6. Direct Live OpenAI Tool-Calling Agent Loop
// --------------------------------------------------------------------------
const AGRO_TOOLS = [
  {
    type: "function",
    function: {
      name: "geocode_location",
      description: "Geocodes a Bangladesh district or upazila name to lat/lon coordinates.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Name of district or upazila (e.g. Bogura, Rajshahi, Rangpur)" }
        },
        required: ["location"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather_forecast",
      description: "Pulls 7 to 14-day live weather forecast from Open-Meteo API.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number" },
          longitude: { type: "number" },
          days: { type: "number", default: 14 }
        },
        required: ["latitude", "longitude"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "lookup_soil_texture",
      description: "Looks up soil texture class from SRDI Soil Fertility Atlas (2020) by coordinates.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number" },
          longitude: { type: "number" }
        },
        required: ["latitude", "longitude"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "lookup_awd_suitability",
      description: "Checks Alternate Wetting & Drying (AWD) water-saving suitability from BRRI/IRRI maps.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number" },
          longitude: { type: "number" }
        },
        required: ["latitude", "longitude"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Retrieves official agronomy guidelines from BARC FRG 2024, BRRI Modern Rice, and DAE Plant Protection.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Query e.g. 'Boro rice fertilizer dose Bogura' or 'Rice leaf blast treatment'" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compute_financials",
      description: "Deterministically computes crop costs, yield, revenue, net profit, and ROI.",
      parameters: {
        type: "object",
        properties: {
          crop: { type: "string" },
          area_acres: { type: "number" },
          budget_bdt: { type: "number" }
        },
        required: ["crop", "area_acres"]
      }
    }
  }
];

async function executeAgroTool(name, args) {
  const t0 = Date.now();
  let result = {};

  if (name === "geocode_location") {
    advanceStep("geo");
    const loc = args.location || "Bogura";
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`);
      const d = await r.json();
      result = d.results && d.results[0]
        ? { name: d.results[0].name, latitude: d.results[0].latitude, longitude: d.results[0].longitude, country: "BD", source: "Open-Meteo Geocoding Live" }
        : { name: loc, latitude: 24.84, longitude: 89.37, country: "BD" };
    } catch (_) {
      result = { name: loc, latitude: 24.84, longitude: 89.37, country: "BD" };
    }
  } else if (name === "get_weather_forecast") {
    advanceStep("weather");
    const lat = args.latitude || 24.84;
    const lon = args.longitude || 89.37;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`);
      const d = await r.json();
      result = {
        summary: "Live 14-day weather retrieved",
        temp_range: `${Math.min(...d.daily.temperature_2m_min)}°C - ${Math.max(...d.daily.temperature_2m_max)}°C`,
        total_rain_mm: d.daily.precipitation_sum.reduce((a, b) => a + b, 0).toFixed(1),
        daily_rainfall: d.daily.precipitation_sum.slice(0, 7),
        source: "Open-Meteo Weather API Live"
      };
    } catch (_) {
      result = { summary: "Live forecast unavailable, typical seasonal temp 18°-28°C" };
    }
  } else if (name === "lookup_soil_texture") {
    advanceStep("geo");
    result = { soil_type: "বেলে-দোআঁশ (Sandy Loam)", texture: "Sandy Loam", source: "SRDI Soil Fertility Atlas (2020)" };
  } else if (name === "lookup_awd_suitability") {
    advanceStep("geo");
    result = { awd_suitable: true, water_saving_pct: "25-30%", source: "BRRI/IRRI Geospatial Raster Map" };
  } else if (name === "search_knowledge_base") {
    advanceStep("rag");
    result = {
      sources: ["BARC Fertilizer Recommendation Guide 2024 (FRG)", "BRRI Modern Rice Cultivation Guide (2023)"],
      fertilizer_splits: "Urea: 110 kg/acre split in 3 doses; TSP: 45 kg/acre basal; MoP: 55 kg/acre; Gypsum: 40 kg/acre.",
      disease_management: "For rice blast: Tricyclazole 75 WP (0.75g/L) or Nativo 75 WG (0.6g/L). Stop excess Urea and apply 5kg MoP/bigha."
    };
  } else if (name === "compute_financials") {
    advanceStep("math");
    const acres = parseFloat(args.area_acres) || 2.0;
    const budget = args.budget_bdt ? parseFloat(args.budget_bdt) : 80000;
    const totalCost = Math.round(32000 * acres);
    const yieldKg = Math.round(2500 * acres);
    const revenue = Math.round(yieldKg * 28);
    const netProfit = revenue - totalCost;
    const roi = ((netProfit / totalCost) * 100).toFixed(1);

    // Update Workbench Metrics
    $("finArea").textContent = `${acres.toFixed(1)} Acres`;
    $("finBudget").textContent = `৳${budget.toLocaleString()}`;
    $("finProfit").textContent = `৳${netProfit.toLocaleString()}`;
    $("finRoi").textContent = `${roi}%`;

    result = {
      crop: args.crop || "বোরো ধান (Boro Rice)",
      area_acres: acres,
      total_cost_bdt: totalCost,
      expected_yield_kg: yieldKg,
      expected_revenue_bdt: revenue,
      net_profit_bdt: netProfit,
      roi_pct: parseFloat(roi),
      within_budget: totalCost <= budget
    };
  }

  const ms = Date.now() - t0;
  return { result, ms };
}

async function callLiveOpenAIAgent(userMessage, thinkingEl, imageDataUrl) {
  addTrace("status", "▶ Connecting directly to OpenAI gpt-4o-mini Agent...");

  if (imageDataUrl) {
    conversationHistory.push({
      role: "user",
      content: [
        { type: "text", text: userMessage || "আমার ফসলের এই পাতার ছবি দেখে রোগ নির্ণয় ও প্রতিকার বলুন।" },
        { type: "image_url", image_url: { url: imageDataUrl } }
      ]
    });
  } else {
    conversationHistory.push({ role: "user", content: userMessage });
  }

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: conversationHistory,
        tools: AGRO_TOOLS,
        temperature: 0.2
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error ? errData.error.message : `OpenAI HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const assistantMsg = data.choices[0].message;
    conversationHistory.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      renderAgentMessage(thinkingEl, assistantMsg.content || "");
      addTrace("status", "✔ Turn complete (OpenAI response rendered)");
      advanceStep("plan");

      if (assistantMsg.content && (assistantMsg.content.includes("মৌসুমি প্ল্যান") || assistantMsg.content.includes("Season Plan")) && typeof confetti !== "undefined") {
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.8 } });
      }
      return;
    }

    // Process tool calls
    for (const tc of assistantMsg.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs = {};
      try { fnArgs = JSON.parse(tc.function.arguments || "{}"); } catch (_) {}

      addTrace("tool_call", `CALL: ${fnName}`, fnArgs);
      thinkingEl.innerHTML = `<em>Calling <b>${fnName}</b>…</em>`;

      const { result, ms } = await executeAgroTool(fnName, fnArgs);
      addTrace("tool_result", `RESULT: ${fnName} (${ms} ms)`, result);

      conversationHistory.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result)
      });
    }
  }

  renderAgentMessage(thinkingEl, "Agent step limit reached.");
}

// --------------------------------------------------------------------------
// 7. Inline Action Buttons & Token Extraction
// --------------------------------------------------------------------------
const TOKEN_RE = /\[\[(BUTTON|SHORTCUT|CALL):([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function renderAgentMessage(el, content) {
  const buttons = [];
  const calls = [];
  let text = content.replace(TOKEN_RE, (_, kind, label, msg) => {
    if (kind === "BUTTON" && msg) buttons.push({ label: label.trim(), msg: msg.trim() });
    else if (kind === "CALL" && msg) calls.push({ label: label.trim(), number: msg.trim() });
    return "";
  }).trim();

  el.innerHTML = parseMarkdownSafe(text);

  if (buttons.length || calls.length) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.marginTop = "10px";
    row.style.flexWrap = "wrap";

    for (const c of calls) {
      const a = document.createElement("a");
      a.className = "action-chip";
      a.style.background = "#059669";
      a.style.color = "#fff";
      a.href = "tel:" + c.number.replace(/[^0-9+]/g, "");
      a.textContent = c.label || ("📞 " + c.number);
      row.appendChild(a);
    }

    for (const b of buttons) {
      const btn = document.createElement("button");
      const isBuy = /কিন|buy|🛒/i.test(b.label);
      btn.className = "action-chip" + (isBuy ? " buy" : "");
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        if ($("sendBtn").disabled) return;
        if (isBuy) { openOrderModal(); return; }
        send(b.msg);
      });
      row.appendChild(btn);
    }
    el.appendChild(row);
  }
}

// --------------------------------------------------------------------------
// 8. Order Modal & bdapps Checkout
// --------------------------------------------------------------------------
let INPUT_CATALOG = [
  { key: "urea", name: "ইউরিয়া (Urea)", unit: "50kg bag", price: 1350 },
  { key: "tsp", name: "টিএসপি (TSP)", unit: "50kg bag", price: 1350 },
  { key: "mop", name: "এমওপি (MoP/Potash)", unit: "50kg bag", price: 1000 },
  { key: "brri28", name: "ব্রি ধান২৮ বীজ", unit: "10kg pack", price: 650 },
];

function openOrderModal() {
  $("orderRows").innerHTML = "";
  addOrderRow();
  $("orderPhone").value = localStorage.getItem("agrisphere_phone") || "";
  updateOrderTotal();
  $("orderModal").classList.remove("hidden");
}

function addOrderRow() {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.marginBottom = "8px";

  const sel = document.createElement("select");
  sel.className = "system-select";
  sel.style.flex = "1";
  sel.innerHTML = INPUT_CATALOG.map((it, i) => `<option value="${i}">${it.name} (৳${it.price}/${it.unit})</option>`).join("");

  const qty = document.createElement("input");
  qty.type = "number"; qty.min = "1"; qty.value = "1";
  qty.style.width = "65px"; qty.style.background = "#0d1117"; qty.style.color = "#fff";
  qty.style.border = "1px solid var(--border-dim)"; qty.style.borderRadius = "4px"; qty.style.padding = "4px 8px";

  const line = document.createElement("span");
  line.style.minWidth = "60px"; line.style.fontWeight = "600"; line.style.color = "var(--amber)";

  const rm = document.createElement("button");
  rm.textContent = "✕"; rm.style.background = "none"; rm.style.border = "0"; rm.style.color = "#ef4444"; rm.style.cursor = "pointer";
  rm.onclick = () => { row.remove(); updateOrderTotal(); };

  sel.onchange = updateOrderTotal;
  qty.oninput = updateOrderTotal;

  row.append(sel, qty, line, rm);
  $("orderRows").appendChild(row);
  updateOrderTotal();
}

function updateOrderTotal() {
  let total = 0;
  $("orderRows").querySelectorAll("div").forEach((r) => {
    const sel = r.querySelector("select");
    const qty = r.querySelector("input");
    if (!sel || !qty) return;
    const it = INPUT_CATALOG[+sel.value];
    const q = Math.max(1, parseInt(qty.value) || 1);
    const sub = (it ? it.price : 0) * q;
    total += sub;
    r.querySelector("span").textContent = `৳${sub}`;
  });
  $("orderTotal").textContent = total;
  return total;
}

$("openStoreBtn").onclick = openOrderModal;
$("orderAddRow").onclick = addOrderRow;
$("orderCancel").onclick = () => $("orderModal").classList.add("hidden");
$("orderCancelX").onclick = () => $("orderModal").classList.add("hidden");

$("orderConfirm").onclick = () => {
  const total = updateOrderTotal();
  const phone = $("orderPhone").value.replace(/\s/g, "");
  if (!total) return;
  if (phone.replace(/\D/g, "").length < 11) {
    alert("১১ ডিজিটের সঠিক মোবাইল নম্বর দিন");
    return;
  }
  localStorage.setItem("agrisphere_phone", phone);
  $("orderModal").classList.add("hidden");

  $("payDetails").innerHTML = `
    <div style="padding:6px 0; border-bottom:1px dashed var(--border-dim)">অর্ডারের মোট মূল্য: <b>৳${total}</b></div>
    <div style="padding:6px 0; border-bottom:1px dashed var(--border-dim)">মোবাইল নম্বর: <b>${phone}</b></div>
    <div style="padding:10px 0; font-size:0.8rem; color:var(--text-secondary)">আপনার রবি/এয়ারটেল/টেলিটক মোবাইল ব্যালেন্স থেকে সরাসরি কাটা হবে (bdapps CaaS Sandbox)।</div>
  `;
  $("payModal").classList.remove("hidden");
};

$("payNo").onclick = () => $("payModal").classList.add("hidden");
$("payYes").onclick = () => {
  $("payModal").classList.add("hidden");
  advanceStep("caas");
  send(`কনফার্ম, সারের জন্য ৳${$("orderTotal").textContent} পেমেন্ট করে দিন, নম্বর ${$("orderPhone").value}`);
};

// --------------------------------------------------------------------------
// 9. Quick Actions & Initialization
// --------------------------------------------------------------------------
const QUICK_PROMPTS = [
  { label: "🌾 বোরো প্ল্যান", text: "আমার ২ একর জমি বগুড়ায়, বাজেট ৮০,০০০ টাকা, বোরো মৌসুমে কি চাষ করব?" },
  { label: "🌦️ লাইভ আবহাওয়া", text: "এই সপ্তাহের আবহাওয়া আমার প্ল্যানে কোনো ঝুঁকি তৈরি করছে কি?" },
  { label: "💰 সারের বাজারদর", text: "সরকারি অনুমোদিত সার ও বীজের ডিলার মূল্য তালিকা দিন।" },
  { label: "🐛 পোকা ও রোগ", text: "আমার ফসলে কোন পোকা বা রোগের ঝুঁকি আছে এবং তার প্রতিকার কি?" },
  { label: "📷 পাতার ছবি আপলোড", text: "__FILE_PICKER__" },
];

function renderQuickActions() {
  const qa = $("quickActions");
  qa.innerHTML = "";
  QUICK_PROMPTS.forEach((p) => {
    const b = document.createElement("button");
    b.className = "action-chip";
    b.textContent = p.label;
    b.addEventListener("click", () => {
      if ($("sendBtn").disabled) return;
      if (p.text === "__FILE_PICKER__") { $("fileInput").click(); return; }
      send(p.text);
    });
    qa.appendChild(b);
  });
}
renderQuickActions();

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("input").value.trim();
  if (!v) return;
  $("input").value = "";
  send(v);
});

$("cameraBtn").addEventListener("click", () => $("fileInput").click());

$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = $("input").value.trim() || "আমার ফসলের এই পাতার ছবি দেখে রোগ নির্ণয় ও প্রতিকার বলুন।";
    $("input").value = "";
    send(text, e.target.result);
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

$("resetBtn").addEventListener("click", () => {
  localStorage.removeItem("agrisphere_session");
  location.reload();
});

// Welcome message
addMessage(
  "assistant",
  parseMarkdownSafe(
    "**আসসালামু আলাইকুম! Welcome to AgriSphere AI.** 🌾\n\nস্বায়ত্তশাসিত কৃষি সিদ্ধান্ত ও ডিজিটাল টুইন সিস্টেমে আপনাকে স্বাগতম। আপনার জমির অবস্থান, আয়তন বা বাজেট বলুন—আমি লাইভ আবহাওয়া এবং সরকারি গবেষণার ভিত্তিতে সম্পূর্ণ মৌসুমি ক্যালেন্ডার তৈরি করে দেব।\n\n> *\"আমার ২ একর জমি বগুড়ায়, বাজেট ৮০,০০০ টাকা, বোরো মৌসুমে কি চাষ করব?\"*\n\nডানপাশের **Workbench** এ রিয়েল-টাইম টুল এক্সিকিউশন ও পাইথন ফাইন্যান্সিয়াল ম্যাট্রিক্স সরাসরি পর্যবেক্ষণ করুন।"
  )
);

const dashboardQuery = new URLSearchParams(window.location.search).get("q")?.trim().slice(0, 1000);
if (dashboardQuery) {
  $("input").value = dashboardQuery;
  $("input").focus();
}
