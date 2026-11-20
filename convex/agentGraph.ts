import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getTraces = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentTraces")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(100);
  },
});

export const logTrace = mutation({
  args: {
    sessionId: v.string(),
    turnId: v.string(),
    nodeName: v.string(),
    toolName: v.string(),
    params: v.any(),
    result: v.any(),
    latencyMs: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentTraces", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
