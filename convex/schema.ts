import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  farms: defineTable({
    sessionId: v.string(),
    district: v.optional(v.string()),
    upazila: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    areaAcres: v.optional(v.number()),
    soilType: v.optional(v.string()),
    awdSuitable: v.optional(v.boolean()),
    irrigation: v.optional(v.string()),
    budgetBdt: v.optional(v.number()),
    season: v.optional(v.string()),
    targetCrop: v.optional(v.string()),
    planSummary: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),

  messages: defineTable({
    sessionId: v.string(),
    role: v.string(), // "user" | "assistant" | "system"
    content: v.string(),
    imageDataUrl: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_session_time", ["sessionId", "timestamp"]),

  agentTraces: defineTable({
    sessionId: v.string(),
    turnId: v.string(),
    nodeName: v.string(),
    toolName: v.string(),
    params: v.any(),
    result: v.any(),
    latencyMs: v.number(),
    status: v.string(), // "success" | "error" | "running"
    timestamp: v.number(),
  }).index("by_session", ["sessionId"]),

  weatherAlerts: defineTable({
    sessionId: v.string(),
    crop: v.string(),
    severity: v.string(), // "high" | "medium" | "info"
    message: v.string(),
    suggestion: v.string(),
    active: v.boolean(),
    dateTrigger: v.string(),
    createdAt: v.number(),
  }).index("by_session_active", ["sessionId", "active"]),

  marketOrders: defineTable({
    sessionId: v.string(),
    phone: v.string(),
    items: v.array(
      v.object({
        item: v.string(),
        unit: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        subtotal: v.number(),
      })
    ),
    totalBdt: v.number(),
    status: v.string(), // "pending" | "paid" | "failed"
    paymentRef: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  dashboardStates: defineTable({
    sessionId: v.string(),
    state: v.any(),
    nextTaskId: v.number(),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),
});
