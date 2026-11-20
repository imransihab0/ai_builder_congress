import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getFarm = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("farms")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const saveFarm = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("farms")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("farms", {
        ...args,
        updatedAt,
      });
    }
  },
});

export const clearFarm = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const farm = await ctx.db
      .query("farms")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (farm) {
      await ctx.db.delete(farm._id);
    }
    // Delete messages
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const m of msgs) {
      await ctx.db.delete(m._id);
    }
    return { ok: true };
  },
});
