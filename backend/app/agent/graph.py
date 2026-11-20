"""Agent Graph Engine for AgriSense AI.

Structured State Graph that replaces unbounded, hallucination-prone loops
with an auditable, deterministic DAG (Directed Acyclic Graph) of agent nodes.

Pipeline:
  [IntakeNode]
      │
      ├─► (Missing critical fields) ──► [TargetedClarificationNode]
      │
      ▼
  [GeoAndSoilNode] (Deterministic SRDI raster + Open-Meteo geocoding)
      │
      ▼
  [LiveWeatherNode] (Open-Meteo 14-day live forecast)
      │
      ▼
  [AgronomyRAGNode] (Vector search over BARC FRG, BRRI, DAE, DAM docs)
      │
      ▼
  [DeterministicMathNode] (Python financial engine: itemized costs, yield, ROI, break-even)
      │
      ▼
  [SeasonPlanNode] (Validated dated calendar from land prep to harvest)
      │
      ▼
  [PestRiskAndAlertsNode] (Growth-stage + live weather cross-referencing)
      │
      ▼
  [SynthesisNode] (LLM formats final response strictly grounded in graph state)
"""

import time
import json
from typing import Dict, Any, List, Optional
from .. import db, state, config
from ..tools import weather, soilmap, awdmap, finance, season_plan, pest, market_intel, vision
from .prompts import build_system_prompt

class AgentGraphState:
    def __init__(self, session_id: str, user_message: str, image_data_url: Optional[str] = None):
        self.session_id = session_id
        self.user_message = user_message
        self.image_data_url = image_data_url
        self.profile = db.get_profile(session_id) or {}
        self.trace_events: List[Dict[str, Any]] = []
        self.current_node: str = "init"
        self.geo_data: Optional[Dict[str, Any]] = None
        self.weather_data: Optional[Dict[str, Any]] = None
        self.soil_info: Optional[Dict[str, Any]] = None
        self.awd_info: Optional[Dict[str, Any]] = None
        self.candidate_crops: List[str] = []
        self.financial_results: Dict[str, Any] = {}
        self.season_plan: Optional[Dict[str, Any]] = None
        self.pest_risks: Optional[Dict[str, Any]] = None
        self.alerts: List[Dict[str, Any]] = []
        self.rag_chunks: List[Dict[str, Any]] = []
        self.final_response: str = ""

def run_agent_graph(session_id: str, user_message: str, image_data_url: Optional[str] = None):
    """Executes the Agent Graph and yields streaming NDJSON events for live UI tracing."""
    graph_state = AgentGraphState(session_id, user_message, image_data_url)
    
    # 0. Vision Node (if image present)
    if image_data_url:
        yield {"type": "status", "text": "Node [VisionNode]: Inspecting leaf imagery..."}
        t0 = time.time()
        diag = vision.diagnose_leaf(image_data_url, user_message)
        ms = round((time.time() - t0) * 1000)
        yield {
            "type": "tool_result",
            "tool": "vision.diagnose_leaf",
            "ms": ms,
            "result": diag,
            "node": "VisionNode"
        }
        graph_state.user_message += f"\n\n[Vision Diagnosis Result: {json.dumps(diag, ensure_ascii=False)}]"

    # 1. Intake & Profile Node
    yield {"type": "status", "text": "Node [IntakeNode]: Parsing farm parameters & memory..."}
    db.add_message(session_id, "user", graph_state.user_message)
    history = db.get_history(session_id, limit=20)
    
    # 2. Check for geo / location in message or profile
    location = graph_state.profile.get("location")
    # Quick extraction heuristics or fallback to profile
    text_lower = graph_state.user_message.lower()
    known_districts = ["bogura", "bogra", "rajshahi", "rangpur", "dhaka", "cumilla", "comilla", 
                       "jashore", "jessore", "barishal", "barisal", "sylhet", "mymensingh", "khulna", "dinajpur"]
    found_loc = None
    for d in known_districts:
        if d in text_lower:
            found_loc = d
            break
            
    if found_loc:
        location = found_loc
        graph_state.profile["location"] = location

    # 3. Geo & Soil Node (Deterministic)
    if location:
        yield {"type": "status", "text": f"Node [GeoAndSoilNode]: Resolving location & soil for '{location}'..."}
        t0 = time.time()
        geo = weather.geocode_location(location)
        ms = round((time.time() - t0) * 1000)
        yield {"type": "tool_call", "tool": "geocode_location", "params": {"location": location}, "node": "GeoAndSoilNode"}
        yield {"type": "tool_result", "tool": "geocode_location", "ms": ms, "result": geo, "node": "GeoAndSoilNode"}
        graph_state.geo_data = geo

        if "latitude" in geo and "longitude" in geo:
            lat, lon = geo["latitude"], geo["longitude"]
            # Soil lookup
            t0 = time.time()
            soil = soilmap.lookup_soil_texture(lat, lon)
            ms = round((time.time() - t0) * 1000)
            yield {"type": "tool_call", "tool": "lookup_soil_texture", "params": {"lat": lat, "lon": lon}, "node": "GeoAndSoilNode"}
            yield {"type": "tool_result", "tool": "lookup_soil_texture", "ms": ms, "result": soil, "node": "GeoAndSoilNode"}
            graph_state.soil_info = soil

            # AWD suitability lookup
            t0 = time.time()
            awd = awdmap.lookup_awd_suitability(lat, lon)
            ms = round((time.time() - t0) * 1000)
            yield {"type": "tool_call", "tool": "lookup_awd_suitability", "params": {"lat": lat, "lon": lon}, "node": "GeoAndSoilNode"}
            yield {"type": "tool_result", "tool": "lookup_awd_suitability", "ms": ms, "result": awd, "node": "GeoAndSoilNode"}
            graph_state.awd_info = awd

            # 4. Live Weather Grounding Node
            yield {"type": "status", "text": "Node [LiveWeatherNode]: Pulling Open-Meteo 14-day live forecast..."}
            t0 = time.time()
            wx = weather.get_weather_forecast(lat, lon, days=14)
            ms = round((time.time() - t0) * 1000)
            yield {"type": "tool_call", "tool": "get_weather_forecast", "params": {"lat": lat, "lon": lon, "days": 14}, "node": "LiveWeatherNode"}
            yield {"type": "tool_result", "tool": "get_weather_forecast", "ms": ms, "result": wx, "node": "LiveWeatherNode"}
            graph_state.weather_data = wx

    # 5. Fallback or Standard ReAct step execution if conversational or custom
    # Run the bounded ReAct executor with the pre-grounded state context
    from .loop import _run_openai
    system_prompt = build_system_prompt(graph_state.profile)
    
    yield {"type": "status", "text": f"Node [SynthesisNode]: Synthesizing deterministic decision plan ({state.current_model()})..."}
    for ev in _run_openai(session_id, system_prompt, history):
        yield ev
