# Smart Farm AI Dashboard — Full Implementation Plan

> Full-window, bilingual (বাংলা / English), interactive dashboard for an agricultural AI agent used by Bangladeshi smart farmers. Clicking a plot opens a rotating 3D plot view.

---

## 0. MANDATORY SKILLS (every agent MUST follow this first)

Every agent working on any section of this project is **required** to use these two skills:

1. **ponytail** — https://github.com/DietrichGebert/ponytail
2. **ui-ux-pro-max-skill** — https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

**Rules**
- Before starting any section, open both repos, read the README and skill files, install or load them as instructed, and follow their rules.
- At the end of every section, output a short **"Skills applied"** note listing which rules from each skill were used and where.
- Other skills may be added where useful (e.g. `frontend-design` for visual direction). List any extra skill in the section where it is used.
- If a skill's guidance conflicts with a "Done when" criterion in this plan, stop and flag it. Do not silently pick one.

### EXISTING REPOSITORY — NON-NEGOTIABLE

This work happens inside an **existing project**. **Do not change the repo structure.**
- Do not move, rename, delete or reformat existing files or folders.
- Do not scaffold a new project, switch package manager, run codemods, or upgrade the framework or other major dependencies.
- Add new files only. Edit existing files only where integration is unavoidable (route/nav registration, providers, a global CSS import), and keep each such edit minimal and listed in the section's final note.
- Follow the repo's own conventions (naming, aliases, lint/format rules, component and data-fetching patterns). Read **Section 4** before writing any code.

---

## 1. Product Overview

| Item | Value |
|---|---|
| Product | "My Farm" dashboard for an agri AI agent |
| Users | Bangladeshi smallholder and smart farmers, often on mid-range Android |
| Core promise | See the whole farm at a glance, tap a plot, get a living 3D view with explained data |
| Languages | Bangla (default) and English |
| Layout | Full window: `100dvh x 100vw`, no page scroll |

### Reference images

| Image | Used for |
|---|---|
| **Image 1** (Intelligent Eco System) | Overall layout: dark rounded left rail, large hero card, KPI tiles row, chart cards below, soft sage background, lime/black accents |
| **Image 2** (My Farm) | Content: Total Plots, Total Crop, Total Area, Total Plants, Weather, Soil Health (N/P/K), Farm Performance donut, Task Completed/Pending pill, Add New Task, task photo cards, satellite map with pins |
| **Image 3** (EcoSolutions) | The 3D plot view: floating low-poly island, big score with vertical scale, positive/negative factor badges, bottom metric buttons, status banner |

---

## 2. Enhancements Added On Top of the Brief

1. **Bangla first:** bn/en toggle, Bangla numerals, Noto Sans Bengali and Hind Siliguri fonts, Bangla voice input for the agent.
2. **Local land units:** area in hectare, bigha and decimal (শতাংশ). The conversion table is editable because a bigha varies by region.
3. **Plot Health Score** per plot (like the GP Score in image 3) with a transparent, configurable formula.
4. **Real weather** from Open-Meteo (free, no key) plus a rain/heat alert strip.
5. **AI agent panel:** ask "আমার প্লট ৩ এ কী সমস্যা?"; the agent opens plots, creates tasks, explains scores and cites its data.
6. **Safe abstention:** the agent says it is unsure and points to the local agriculture officer when data is missing or weak.
7. **Low-end device mode:** the 3D scene has a lite mode and a static fallback.
8. **Label fix:** image 2 shows "Total Plants" with the unit "Plots". Use **plants (গাছ)**.
9. **Accessibility:** keyboard-operable map and 3D, reduced-motion support, AA contrast.

---

## 3. Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand (UI state), TanStack Query (data) |
| Map | MapLibre GL JS |
| 3D | three + @react-three/fiber + @react-three/drei |
| Charts | Recharts |
| Motion | Framer Motion |
| i18n | next-intl |
| Weather | Open-Meteo |
| Tests | Vitest (unit), Playwright (e2e) |
| Agent backend | Provider-agnostic `/api/agent` route with tool calling |

> This is the **preferred** stack, not a mandate to install it. If the repo already uses an equivalent library (another chart, state, i18n, or data-fetching library), **reuse it** and adapt the instructions. Add a dependency only if nothing equivalent exists, and list it in the section note. Next.js-specific items (`next/dynamic`, API routes, `next-intl`) map to the repo's equivalents if the framework differs.

---

## 4. Existing Repo Audit and Logical Module Map

**The repo already exists. Its structure stays exactly as it is.** This section replaces any idea of a new folder layout.

### Step 0 — Repo audit (read-only, do this before Section 1)

Inspect the repo and output a short **"Repo audit"** note covering:
- Framework and version, router type (App Router / Pages / other), language (TS/JS).
- Styling system (Tailwind version, CSS modules, etc.) and UI library already in use.
- State, data-fetching, i18n, chart, map and 3D libraries that are **already installed**.
- Folder conventions: where components, hooks, utilities, API routes, types, tests and assets live; file naming; import aliases.
- Lint, format and test setup (and the commands to run them).
- Where the dashboard page should live, following how existing pages are organised.
- Any conflict with this plan (for example an older React or three version, or no i18n setup).

Then fill in the mapping table below with **real paths from the repo**. Do not start Section 1 until the table is complete.

### Logical module map

All `Files:` lines in this plan use logical names. Place each module where the repo's own conventions say it belongs, ideally inside **one self-contained feature folder** named in the repo's style.

| Logical module | Purpose | Actual path in repo |
|---|---|---|
| shell | App frame, left rail, bottom nav | _fill in_ |
| hero | Hero card, task pill, farm preview | _fill in_ |
| kpi | Four KPI tiles | _fill in_ |
| weather | Weather card, temperature bar | _fill in_ |
| soil | Soil health card | _fill in_ |
| performance | Farm performance donut | _fill in_ |
| tasks | Task strip, card, drawer | _fill in_ |
| map | Farm map, pins, controls | _fill in_ |
| plot3d | 3D plot view and its parts | _fill in_ |
| agent | Chat panel, voice, command bar | _fill in_ |
| ui primitives | GlassPill and other shared pieces | _fill in_ |
| data layer | Types, repository, mock data, derived stats | _fill in_ |
| score | Plot health score logic | _fill in_ |
| units | Area unit conversion | _fill in_ |
| i18n messages | bn / en strings | _fill in_ |
| API routes | Weather and agent endpoints | _fill in_ |
| tests | Unit and e2e tests | _fill in_ |

### Integration rules

- **Isolation:** keep all new code in the feature folder so existing pages are unaffected and the work is easy to review or revert.
- **Tokens:** scope design tokens to the dashboard (a wrapper class or a prefix) so existing pages don't change appearance.
- **Layout:** mount the full-window shell only on the dashboard route. Do not change the repo's global layout unless unavoidable. If it is unavoidable, stop and flag it first.
- **Routing:** add the dashboard and plot routes using the repo's existing router convention. If adding a route would require restructuring, use an in-page overlay with a query parameter instead.
- **Existing backend or database:** if the repo already has data models or an API for farms, plots or tasks, implement the repository interface (Section 3) on top of them. Keep the mock data behind the same interface for development.
- **Existing i18n:** if the repo already has an i18n setup, add the new strings to it. Only add a new i18n library if none exists.
- **Dependencies:** prefer what is installed. Pin new packages to versions compatible with the repo's framework and React version.
- **Conflicts:** if something in this plan conflicts with the repo, do not restructure to make it fit. Adapt the plan, and note the change.

---

## 5. Section 1 — Setup and Design Tokens

**Goal:** a working project with the visual language of image 1.

**Build**
- Do **not** scaffold a project. Work inside the existing repo and install only the stack items that are missing and have no equivalent already installed.
- Define tokens as CSS variables (and Tailwind theme extensions if the repo uses Tailwind), scoped to the dashboard so existing pages are unaffected:
  - `--bg-page`: muted sage (about `#A9B09F`).
  - `--bg-shell` / `--bg-card`: off-white with a soft vertical gradient.
  - `--rail`: near-black (`#141414`).
  - `--accent`: lime (about `#A6E22E`). `--accent-2`: forest green (about `#3E7B3A`).
  - `--warn`: amber. `--danger`: soft red.
  - Radius: `24px` cards, `32px` hero, `999px` pills.
  - Shadows: very soft, low opacity, large blur.
- Fonts: Plus Jakarta Sans (English), Noto Sans Bengali (Bangla). Set `lang`-aware font stacks.
- Build a `GlassPill` component: translucent white, backdrop blur, small text and a bold value, like "Moisture: 68%" in image 2.
- Use the repo's existing i18n setup if there is one; otherwise add `next-intl` with `bn` default and `en` without touching existing routes. Create the message files in the repo's convention.

**Files (logical):** token stylesheet/theme extension, `GlassPill` component, i18n message files. Place them per the module map in Section 4.

**Done when:** a temporary token preview page (removed when done) renders cards, buttons, pills and the glass pill in both languages with correct fonts.

**Skills applied note:** required.

---

## 6. Section 2 — Full-Window Shell

**Goal:** the outer frame from image 1, stretched to fill the viewport.

**Build**
- Mount only on the dashboard route; do not alter the repo's existing global layout (see Section 4).
- Root container: `h-dvh w-screen overflow-hidden`, sage background, about 12px padding.
- Inside it, a rounded off-white shell that fills the remaining space.
- **Left rail** (72px wide, dark, rounded 28px):
  - Logo at the top.
  - Icons: Dashboard, Plots, Map, Tasks, AI Agent, Settings.
  - Active item uses a lime pill with a dark icon.
  - Help and Logout pinned at the bottom.
  - Tooltips on hover, `aria-label` on every button.
- **Main grid** (CSS grid, `min-h-0` everywhere so inner cards scroll, not the page):
  - Row A (about 30%): Hero (wide) + Weather.
  - Row B: four KPI tiles.
  - Row C: Map (large) | Soil Health + Farm Performance | Task strip.
- **Responsive**
  - `>= 1280px`: full grid.
  - `1024–1279px`: tighter gaps, smaller type.
  - `< 1024px`: rail becomes a bottom nav, cards stack, the page may scroll vertically on phones only.

**Files:** `AppShell.tsx`, `Rail.tsx`, `BottomNav.tsx`

**Done when:** at 1366x768 and 1920x1080 there is no page scroll and nothing is clipped. At 390px the bottom nav works.

---

## 7. Section 3 — Data Layer and Mock Data

**Goal:** every number on screen comes from data, never from a component.

**Types**

```ts
export type Locale = "bn" | "en";

export interface Farm {
  id: string;
  name: { bn: string; en: string };
  center: [number, number];          // [lng, lat]
  timezone: "Asia/Dhaka";
}

export interface SoilReading {
  n: number; p: number; k: number;   // ppm (placeholder targets, see Appendix B)
  ph: number;
  moisture: number;                  // percent
  updatedAt: string;                 // ISO
}

export type GrowthStage = "seedling" | "vegetative" | "flowering" | "fruiting" | "harvest";

export interface Plot {
  id: string;
  name: { bn: string; en: string };
  polygon: GeoJSON.Polygon;
  cropId: string;
  plantCount: number;
  areaM2: number;
  soil: SoilReading;
  growthStage: GrowthStage;
  issues: PlotIssue[];
}

export interface PlotIssue {
  id: string;
  kind: "low_n" | "low_p" | "low_k" | "water_stress" | "pest_risk" | "disease_risk" | "flood_risk";
  severity: 1 | 2 | 3;
}

export interface Crop {
  id: string;
  name: { bn: string; en: string };
  model: "rice" | "tomato" | "brinjal" | "jute" | "potato" | "chili";
  color: string;
}

export interface Task {
  id: string;
  title: { bn: string; en: string };
  plotId?: string;
  status: "waiting" | "progress" | "complete";
  dueAt?: string;
  photo?: string;
  createdBy: "farmer" | "agent";
}

export interface WeatherSnapshot {
  tempC: number;
  humidity: number;
  windKmh: number;
  condition: string;                 // mapped from WMO weather code
  hourly: { time: string; tempC: number; rainProb: number }[];
}

export interface Alert {
  id: string;
  kind: "rain" | "heat" | "wind";
  startsAt: string;
  message: { bn: string; en: string };
}
```

**Repository interface**

```ts
export interface FarmRepository {
  getFarm(): Promise<Farm>;
  getPlots(): Promise<Plot[]>;
  getPlot(id: string): Promise<Plot | undefined>;
  getTasks(): Promise<Task[]>;
  createTask(input: Omit<Task, "id">): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  completeTask(id: string): Promise<Task>;
}
```

Components only use TanStack Query hooks that call this interface, so the mock can later be swapped for a real API.

**Seed data**
- 12 plots with realistic Bangladesh coordinates (pick a real farming area, for example near Savar or Gazipur) and small polygons about 20–60m wide.
- 6 crops: rice (ধান), tomato (টমেটো), brinjal (বেগুন), jute (পাট), potato (আলু), chili (মরিচ).
- 22 tasks with a mix of statuses. About 10 complete and 12 pending/in progress so the pill matches image 2.
- Vary the soil values so some plots are healthy, some borderline, and 2 need attention.

**Derived stats (computed, never stored)**
`totalPlots`, `totalCrops` (distinct crop ids), `totalAreaM2`, `totalPlants`, `tasksCompleted`, `tasksPending`, `plotsNeedingAttention`.

**Plot Health Score (0–100), configurable weights**

| Factor | Weight |
|---|---|
| Soil NPK vs crop target range | 30% |
| Moisture vs crop target range | 25% |
| Growth stage progress vs expected | 25% |
| Weather risk (rain, heat, wind) | 10% |
| Task timeliness for the plot | 10% |

Score bands: `>= 80` Healthy (green), `55–79` Watch (amber), `< 55` Needs attention (red). The formula must be pure and unit tested (see Appendix A).

**Files (logical):** data layer and score modules, placed per the module map in Section 4.

**Done when:** a unit test confirms the KPIs and the plot score recalculate when a plot's soil or a task's status changes.

---

## 8. Section 4 — Hero and KPI Tiles

**Goal:** the top of the dashboard, styled after image 1 with content from image 2.

**Hero card**
- Large rounded card with a soft sage gradient.
- Title "My Farm" (আমার খামার) with a farm selector dropdown ("North Fields").
- Short subtitle: "Your smart farm, in one view."
- Search field (also the agent command bar, see Section 9) and a notification bell with a badge.
- Right side: a small floating low-poly **farm overview** preview (lightweight scene, not the full plot scene) with a slow idle bob.
- **Task pill** like image 2: `Task Completed 10 | Task Pending 12`. Clicking either side filters the task strip.
- Dark pill button **Add New Task** that opens a drawer form (title, plot, due date, status).
- Two small stat chips at the bottom right of the hero, like image 1's "Current load / System health": **Farm Health %** and **Plots needing attention**.

**KPI tiles (4)**
- Total Plots, Total Crop, Total Area, Total Plants.
- Each tile: small label, large number with a unit, a three-dot menu, hover lift (`translateY(-2px)` + shadow).
- Count-up animation on mount and on value change. Respect reduced motion.
- **Total Area** has a unit toggle: hectare / bigha / decimal.
- Clicking a tile filters the map and plot list (for example Total Crop opens a crop filter popover).

**Done when:** adding a task updates the pill counts live, and the area unit toggle converts correctly using the editable conversion table.

---

## 9. Section 5 — Weather, Soil Health and Performance

**Weather card**
- Fetch from Open-Meteo through `/api/weather` (server route, cached for 10 minutes):

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lng}
  &current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code
  &hourly=temperature_2m,precipitation_probability
  &timezone=Asia%2FDhaka&forecast_days=2
```

- Show condition (WMO code mapped to bn/en text and an icon), wind, humidity and a large current temperature.
- Below it, a **24h temperature gradient bar** like image 2, with min/max ticks and a "now" marker.
- **Alert chip** when rain probability or heat crosses a threshold (for example rain probability >= 60% in the next 6h, or temperature >= 36 degrees C).
- Loading skeleton and an offline/error state ("Weather unavailable, showing last update").

**Soil Health card**
- Dark-green gradient card like image 2.
- Three animated bars: **N, P, K** with ppm values and a target-range marker per crop.
- Farm-wide average by default. When a plot is selected, show that plot's values.
- Bar colour moves from lime (good) to amber (low) to red (very low).
- Tooltip on hover explains the value in plain language ("Nitrogen is low for rice at this stage").

**Farm Performance card**
- Donut chart with the **overall score** in the centre (for example 72%).
- Three segments: **Utilization**, **Health**, **On Track** with hover tooltips and legend.
- Score definitions are documented in code comments and in the agent's `explain_score` tool.

**Done when:** selecting a plot on the map changes the soil bars and the donut, and clearing the selection restores farm-wide values.

---

## 10. Section 6 — Task Cards

**Goal:** the photo task strip from image 2, fully functional.

**Build**
- Horizontal strip of cards: photo, status chip (**Complete** / **Progress** / **Waiting**), title.
- Status chip colours: lime, amber, dark.
- Click opens a **detail drawer**: change status, assign a plot, set due date, see who created it (farmer or agent).
- Filter by status (driven by the hero pill) and drag-to-reorder within a status.
- **Optimistic updates** with rollback on failure.
- Empty state: "No tasks yet. Ask the agent for a suggestion."
- Tasks linked to a plot show a small plot tag. Clicking it opens that plot.

**Done when:** changing a status in a card updates the hero pill, the Farm Performance donut and the plot's timeliness score.

---

## 11. Section 7 — Interactive Map

**Goal:** the satellite map from image 2 with clickable plots.

**Build**
- MapLibre GL with a satellite raster source. Choose a provider whose terms allow this use (for example MapTiler or Mapbox with a key in `.env`). Do not assume a free tile server is allowed for production. Keep the tile URL and attribution configurable.
- Render plots from GeoJSON as `fill` + `line` layers. Fill colour by health band (green, amber, red) with `fill-opacity` about 0.35.
- Hover: raise `line-width`, show a glass pill with plot name and health %.
- Pins (HTML markers or symbol layer): "2 plots need attention" (red/amber), "Moisture 68%", "Healthy 92%".
- Controls: fullscreen, compass/reset-north, zoom in/out, and a **layer dropdown** (Satellite / Health / Moisture). Moisture and Health layers recolour the polygons.
- Mini-map thumbnail bottom-left like image 2 (optional, behind a flag).
- **Click a plot:** select it, update soil and donut cards, then open the 3D view (Section 8) with a zoom/fade transition from that plot's screen position.
- Keyboard: plots reachable via an accessible list (`Tab` and `Enter`), because canvas features aren't focusable by default.

**Done when:** every plot is clickable by mouse and keyboard, and the layer dropdown recolours the plots.

---

## 12. Section 8 — 3D Interactive Plot View (Main Feature)

### 8.1 Layout (full-window overlay, based on image 3; use the repo's router convention for a plot route such as `/plots/[id]`, or a query-param overlay if a new route would change the structure)

- Breadcrumb: `Farm > Plot 3`.
- Level chip: "LV.8 Healthy" (map score bands to levels).
- **Left:** big **Plot Health Score** (for example `82.01`) with a vertical 0–100 scale and a dashed "Average" line.
- **Centre:** the 3D floating island.
- **Right:** **Positive factors** (moisture OK, good growth) and **Negative factors** (low N, pest risk, water stress) as circular icon badges. Inactive ones are faded.
- **Bottom:** two buttons, **Soil Metrics** and **Crop Metrics**, which swap the data panels. A banner below, for example "This plot is healthy. No action needed."
- Close with `Esc` or a Back button. Focus returns to the plot that opened it.

### 8.2 Scene (react-three-fiber + drei)

- Extrude the plot's polygon (`THREE.Shape` + `ExtrudeGeometry`) into a floating **low-poly island**.
  - Top: grass/soil material.
  - Side: soil strata bands (3–4 colours).
  - Underside: an inverted low-poly crystal/rock (flat-shaded `IcosahedronGeometry` or a displaced cone).
- **Underside colour reflects moisture:** blue for wet, amber for dry.
- **Crops:** `InstancedMesh` whose count scales with `plantCount` (capped for performance). The mesh changes by crop (rice tufts, tomato bushes, brinjal plants, and so on). Colour reflects health.
- **Floating glass pills** anchored to 3D positions using drei `Html` (Moisture 68%, N 23 ppm, Healthy 92%). Use `occlude` and `distanceFactor` so they stay readable.
- Lighting: soft hemisphere light plus one directional light. Add `ContactShadows` and wrap the island in drei `Float` for gentle bobbing.
- Background: transparent so the pale green page gradient shows through, like image 3.

### 8.3 Rotation and interaction (REQUIRED)

| Input | Behaviour |
|---|---|
| **Pointer hover** | The island tilts and turns toward the pointer. Map pointer position (-1..1) to target yaw about ±0.6 rad and pitch about ±0.25 rad, smoothed in `useFrame` with `MathUtils.damp` |
| **Drag** | Orbit with `OrbitControls`: pan disabled, zoom limited to a small range, polar angle clamped so it never flips |
| **While dragging** | Hover tilt is paused so the two don't fight |
| **Idle** | After about 3 seconds without input, auto-rotate slowly. Stop immediately on any pointer movement |
| **Hotspot click** | Highlight the hotspot and sync the matching data panel (Soil or Crop) |
| **Touch** | One-finger drag rotates, pinch zooms, hover tilt disabled |
| **Reduced motion** | `prefers-reduced-motion` disables auto-rotate and bobbing |
| **Keyboard** | Arrow keys rotate in steps, `+`/`-` zoom, `R` resets the view |

Reference implementation for the hover tilt (adapt, don't paste blindly):

```tsx
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, Group } from "three";

export function TiltRig({
  children, reduced, dragging, lastInput,
}: {
  children: React.ReactNode;
  reduced: boolean;
  dragging: React.MutableRefObject<boolean>;
  lastInput: React.MutableRefObject<number>;   // performance.now() of last pointer activity
}) {
  const group = useRef<Group>(null!);
  const spin = useRef(0);

  useFrame((state, dt) => {
    const g = group.current;
    const idleMs = performance.now() - lastInput.current;

    if (!reduced && idleMs > 3000 && !dragging.current) {
      spin.current += dt * 0.25;                       // slow auto-rotate
    }

    const hovering = idleMs < 3000 && !dragging.current;
    const yaw = hovering ? state.pointer.x * 0.6 : 0;   // ±0.6 rad
    const pitch = hovering ? -state.pointer.y * 0.25 : 0; // ±0.25 rad

    g.rotation.y = MathUtils.damp(g.rotation.y, spin.current + yaw, 4, dt);
    g.rotation.x = MathUtils.damp(g.rotation.x, pitch, 4, dt);
  });

  return <group ref={group}>{children}</group>;
}
```

`OrbitControls` props to start from: `enablePan={false}`, `enableDamping`, `minDistance`/`maxDistance` within about ±25% of the default, `minPolarAngle={Math.PI/4}`, `maxPolarAngle={Math.PI/2.1}`. Update `lastInput` on `onPointerMove` and on controls `onStart`/`onEnd`.

### 8.4 Performance

- Load three/r3f with `next/dynamic` and `ssr: false`.
- Canvas `dpr={[1, 2]}`, `frameloop="demand"` when idle motion is off, and pause rendering when the overlay is closed or the tab is hidden (`visibilitychange`).
- **Lite mode** when `navigator.deviceMemory <= 4` or `hardwareConcurrency <= 4`: fewer instances, no shadows, DPR 1, no `Html` occlusion. The user can also toggle it in Settings.
- If WebGL fails, show a static illustrated image with the same data panels.
- Budget: first 3D frame under 1.5s on a mid-range laptop after the route loads, 60fps target on desktop, 30fps acceptable in lite mode.

**Done when:** the island follows the mouse smoothly, drag and idle rotation both work without conflict, lite mode still looks good, and closing the view stops all rendering.

---

## 13. Section 9 — AI Agent Panel and Bangla

**Build**
- A slide-in **chat panel** plus a command bar inside the hero search field.
- **Voice input** in Bangla using the Web Speech API (`lang = "bn-BD"`). Support varies by browser, so always keep a typed fallback and hide the mic when unsupported.
- **Tools** the agent can call (typed, validated with Zod):

```ts
open_plot({ plotId: string })
create_task({ title: string, plotId?: string, dueAt?: string })
explain_score({ plotId: string })
get_weather()
list_plots_needing_attention()
```

- Every answer **cites the data it used** (soil values, weather, score factors) in a small "Based on" footer chip row.
- **Safe abstention:** when data is missing, stale or conflicting, the agent says so and suggests contacting the local agriculture officer. It must not invent numbers or recommend specific chemical doses.
- Language toggle in the shell, **Bangla numerals** and localized dates via `Intl.NumberFormat("bn-BD")` and `Intl.DateTimeFormat("bn-BD")`.
- Agent-created tasks are tagged `createdBy: "agent"` and appear in the task strip and the hero pill immediately.

**Done when:** "প্লট ৩ খুলো" opens the 3D view of plot 3, and a task created via chat shows up in the hero pill count.

---

## 14. Section 10 — Polish and QA

- **States:** empty, loading (skeletons) and error for every card.
- **Accessibility:** full keyboard navigation, visible focus rings, AA contrast, `aria-label` on map and 3D controls, a text alternative summary for the 3D scene.
- **Performance:** Lighthouse run, plus a test on a throttled mid-range mobile profile (4x CPU slowdown, Fast 3G).
- **Playwright smoke test:** load dashboard, click a plot, 3D opens, rotate with the mouse, close with `Esc`, add a task, switch to Bangla, confirm numerals and fonts.
- **Cross-check:** every section has its "Skills applied" note.
- **Final review:** no hardcoded strings, no hardcoded numbers in components, no page scroll at 1366x768 and 1920x1080.

---

## 15. Global Definition of Done

- [ ] No existing file or folder moved, renamed or restructured; edits to existing files are minimal and listed
- [ ] Full-window layout with no page scroll on desktop
- [ ] All KPIs, weather, soil, performance and tasks are data-driven and update live
- [ ] Task pill, performance donut and plot score stay in sync
- [ ] Map plots are clickable; click opens the 3D view
- [ ] 3D island rotates on hover, drag and idle; lite mode and fallback work
- [ ] Bangla and English complete, with Bangla numerals
- [ ] Agent tools work and answers cite their data
- [ ] AA accessibility and reduced-motion respected
- [ ] Both mandatory skills used, with a "Skills applied" note per section

---

## Appendix A — Health Score Reference Implementation

```ts
export const DEFAULT_WEIGHTS = {
  soil: 0.30, moisture: 0.25, growth: 0.25, weather: 0.10, tasks: 0.10,
} as const;

// each sub-score is 0–100
export function plotHealthScore(
  s: { soil: number; moisture: number; growth: number; weather: number; tasks: number },
  w = DEFAULT_WEIGHTS,
): number {
  const total =
    s.soil * w.soil + s.moisture * w.moisture + s.growth * w.growth +
    s.weather * w.weather + s.tasks * w.tasks;
  return Math.round(total * 100) / 100;
}

// Score how close a reading is to a target range: 100 inside, falling off outside.
export function rangeScore(value: number, min: number, max: number, tolerance: number) {
  if (value >= min && value <= max) return 100;
  const dist = value < min ? min - value : value - max;
  return Math.max(0, Math.round(100 - (dist / tolerance) * 100));
}
```

Unit tests to include: all-in-range gives 100; one weight set to 1 returns that sub-score; weights sum to 1; changing a task from overdue to complete raises `tasks`.

## Appendix B — Agronomic Data Warning

NPK ppm targets, moisture ranges and growth-stage expectations in the mock data are **placeholders for UI development**. Before real farmers rely on them, replace them with crop-specific values from verified Bangladeshi sources (for example BARC, SRDI or BRRI guidance) and have an agronomist review them. The agent must not present placeholder values as advice.

## Appendix C — Area Units

- 1 decimal (শতাংশ) is about 40.47 m². 1 acre = 100 decimal. 1 hectare is about 247.1 decimal.
- A **bigha** varies by region (commonly about 33 decimal, but not everywhere). Store the conversion in settings, default to a documented value, and let the farmer edit it.
- Always show the unit next to the number and keep the toggle state in the UI store.

## Appendix D — i18n Key Conventions

```
dashboard.title            -> "আমার খামার" / "My Farm"
kpi.totalPlots             -> "মোট প্লট" / "Total Plots"
kpi.totalCrop              -> "মোট ফসল" / "Total Crop"
kpi.totalArea              -> "মোট জমি" / "Total Area"
kpi.totalPlants            -> "মোট গাছ" / "Total Plants"
task.completed             -> "সম্পন্ন" / "Task Completed"
task.pending               -> "অপেক্ষমান" / "Task Pending"
plot.score                 -> "প্লট স্বাস্থ্য স্কোর" / "Plot Health Score"
agent.abstain              -> "আমি নিশ্চিত নই। অনুগ্রহ করে স্থানীয় কৃষি কর্মকর্তার সাথে যোগাযোগ করুন।"
                              / "I'm not sure. Please check with your local agriculture officer."
```

Namespaces: `dashboard`, `kpi`, `weather`, `soil`, `performance`, `task`, `map`, `plot`, `agent`, `common`. Have a native Bangla speaker review all strings.

## Appendix E — Prompt Template for Each Section

Paste this wrapper above any section when handing it to a coding agent:

```
You are implementing Section <N> of the Smart Farm AI Dashboard plan.
0. This is an EXISTING repo. Read Section 4, complete the repo audit and module map, and do not move, rename or restructure any existing file.
1. Read and apply the two mandatory skills (ponytail, ui-ux-pro-max-skill).
2. Build only what this section lists. Do not start the next section.
3. No hardcoded strings or numbers; use i18n and the data layer.
4. Verify the "Done when" criterion and show evidence (test output or screenshot).
5. End with a "Skills applied" note, plus a list of existing files you edited and any new dependencies added.
<paste the section here>
```
