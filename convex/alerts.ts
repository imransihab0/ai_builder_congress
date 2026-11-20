import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getActiveAlerts = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("weatherAlerts")
      .withIndex("by_session_active", (q) =>
        q.eq("sessionId", args.sessionId).eq("active", true)
      )
      .collect();
  },
});

export const saveAlert = mutation({
  args: {
    sessionId: v.string(),
    crop: v.string(),
    severity: v.string(),
    message: v.string(),
    suggestion: v.string(),
    dateTrigger: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("weatherAlerts", {
      ...args,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const dismissAlert = mutation({
  args: { alertId: v.id("weatherAlerts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, { active: false });
    return { ok: true };
  },
});
