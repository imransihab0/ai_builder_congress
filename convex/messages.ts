import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getMessages = query({
  args: { sessionId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const lim = args.limit || 50;
    return await ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .take(lim);
  },
});

export const addMessage = mutation({
  args: {
    sessionId: v.string(),
    role: v.string(),
    content: v.string(),
    imageDataUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      imageDataUrl: args.imageDataUrl,
      timestamp: Date.now(),
    });
  },
});
