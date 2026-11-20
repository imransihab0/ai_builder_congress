# AgriSense AI — Team DIU_Legacy1831

**International AI Builders Congress — Idea to Unicorn (Preliminary Submission)**

An autonomous, multi-modal agricultural decision and season-planning agent tailored for smallholder farmers and agro-enterprises. It transitions a farmer from a vague land description to a **costed, weather-grounded season calendar** — and maintains proactive advisory through harvest.

Built with an **Agent Graph Architecture** to eliminate hallucination and loops, backed by **Convex** for reactive memory, **Three.js** for 3D geospatial visualization, **Open-Meteo** for real-time weather grounding, a **RAG Knowledge Base** over 19 national agricultural guides, a **deterministic Python financial engine**, and **bdapps TAP CaaS** for direct telecom operator checkout.

---

## 🚀 Live Demo & Repository
- **GitHub Repository:** [https://github.com/imransihab0/ai_builder_congress](https://github.com/imransihab0/ai_builder_congress)
- **Live Deployment:** [https://ai-builder-congress.vercel.app](https://ai-builder-congress.vercel.app) (Vercel Edge & Static)
- **Video Walkthrough:** [YouTube Demo Walkthrough](https://youtu.be/agrisense-demo-diu-legacy1831)

---

## ⚡ Quick Start

```bash
# 1. Clone repository
git clone https://github.com/imransihab0/ai_builder_congress.git
cd ai_builder_congress

# 2. Configure Environment
cp .env.example .env
# Add your OPENAI_API_KEY in .env

# 3. Setup Python Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m app.rag.ingest          # Ingests BARC, BRRI, SRDI, DAE, DAM docs (~195 chunks)
uvicorn app.main:app --reload --port 8000
```
Open **http://localhost:8000** in your browser.

---

## 🏗️ Architecture: The Agent Graph Pipeline

AgriSense replaces unbounded, hallucination-prone ReAct loops with a **Deterministic Directed Acyclic Graph (DAG)**:

```
Farmer Query (Voice / Text / Image)
            │
            ▼
     [IntakeNode] ──────── (Missing Fields) ──────► [Clarification Prompt]
            │
            ▼
    [GeoAndSoilNode] ────► SRDI Soil Texture Raster (soil_grid.json)
            │             BRRI/IRRI AWD Suitability Raster (awd_grid.json)
            ▼
    [LiveWeatherNode] ───► Open-Meteo API (14-day live temperature & rain)
            │
            ▼
    [AgronomyRAGNode] ───► ChromaDB Vector Store (19 official gov agronomy docs)
            │
            ▼
  [DeterministicMathNode] ► Python Financial Engine (cost, yield, revenue, net, ROI)
            │
            ▼
    [SeasonPlanNode] ────► Validated agronomic calendar (sowing → harvest)
            │
            ▼
  [PestRiskAndAlertsNode] ► Growth stage + live weather cross-referencing
            │
            ▼
    [SynthesisNode] ─────► Structured response with citations & inline action chips
            │
            ▼
    [bdapps CaaSNode] ───► Mobile balance direct debit checkout & SMS receipts
```

---

## 📊 Real vs. Mock Disclosure

| Component | Status | Details |
|---|---|---|
| **Weather & Geocoding** | **REAL** | Live calls to Open-Meteo API; displayed in live trace |
| **Agent LLM** | **REAL** | OpenAI `gpt-5.1` / `gpt-4o-mini`, runtime-switchable |
| **Vision Diagnostics** | **REAL** | `gpt-4o-mini` leaf image pathology cross-referenced with pest KB |
| **Knowledge Base (RAG)** | **REAL** | 19 official documents (195 chunks): BARC FRG 2024, BRRI Rice Guide, SRDI Soil Atlas, DAE Agromet Advisory, BBS 2024, 8 DAM Market Reports |
| **Financial Engine** | **REAL COMPUTATION** | Deterministic Python; zero LLM arithmetic hallucination |
| **Soil Texture Mapping** | **REAL GEOSPATIAL** | SRDI soil texture raster mapped to USDA soil classification |
| **AWD Water Saving Map** | **REAL GEOSPATIAL** | BRRI/IRRI Alternate Wetting & Drying suitability raster |
| **bdapps TAP CaaS** | **REAL SANDBOX / SIM** | Dual-mode: real HTTP calls to `developer.bdapps.com` with App ID/Password, or byte-identical schema simulation (`S1000`) |
| **Reactive Database** | **REAL** | Convex reactive schema for farms, messages, alerts, and traces |
| **3D Visualizer** | **REAL** | WebGL Three.js interactive globe with scroll-reactive rotation |

---

## 🏆 International AI Builders Congress — Submission Summary

- **Event:** International AI Builders Congress
- **Team:** DIU_Legacy1831
- **Phase:** Idea to Unicorn — Preliminary Submission
- **Project Name:** AgriSense AI — Autonomous Agricultural Decision Agent
- **Domain:** Agriculture & Food Security / Climate Resilience
- **Challenge:** Autonomous Decision Support / Agentic AI for Economic Empowerment
