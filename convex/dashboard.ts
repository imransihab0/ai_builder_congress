import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const getState = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dashboardStates")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    return existing ? existing.state : null;
  },
});

export const bootstrap = internalMutation({
  args: {
    sessionId: v.string(),
    state: v.any(),
    nextTaskId: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dashboardStates")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      return existing.state;
    }
    if (
      !isObject(args.state) ||
      !Array.isArray(args.state.tasks) ||
      !Number.isSafeInteger(args.nextTaskId) ||
      args.nextTaskId < 1
    ) {
      throw new Error("Invalid dashboard state");
    }
    await ctx.db.insert("dashboardStates", {
      sessionId: args.sessionId,
      state: args.state,
      nextTaskId: args.nextTaskId,
      updatedAt: Date.now(),
    });
    return args.state;
  },
});

export const createTask = internalMutation({
  args: {
    sessionId: v.string(),
    taskInput: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dashboardStates")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!existing) {
      throw new Error("Dashboard state not found");
    }
    if (
      !isObject(existing.state) ||
      !Array.isArray(existing.state.tasks) ||
      !Number.isSafeInteger(existing.nextTaskId) ||
      existing.nextTaskId < 1 ||
      existing.nextTaskId >= Number.MAX_SAFE_INTEGER
    ) {
      throw new Error("Invalid dashboard state");
    }
    if (!isObject(args.taskInput)) {
      throw new Error("Invalid task input");
    }

    const taskId = `task-${existing.nextTaskId}`;
    if (
      existing.state.tasks.some(
        (task) => isObject(task) && task.id === taskId
      )
    ) {
      throw new Error("Task already exists");
    }
    const task = { ...args.taskInput, id: taskId };

    await ctx.db.patch(existing._id, {
      state: {
        ...existing.state,
        tasks: [...existing.state.tasks, task],
      },
      nextTaskId: existing.nextTaskId + 1,
      updatedAt: Date.now(),
    });
    return task;
  },
});

export const updateTask = internalMutation({
  args: {
    sessionId: v.string(),
    taskId: v.string(),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dashboardStates")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!existing) {
      throw new Error("Dashboard state not found");
    }
    if (!isObject(existing.state) || !Array.isArray(existing.state.tasks)) {
      throw new Error("Invalid dashboard state");
    }
    if (!isObject(args.patch)) {
      throw new Error("Invalid task patch");
    }
    if (Object.prototype.hasOwnProperty.call(args.patch, "id")) {
      throw new Error("Task ID cannot be changed");
    }

    const taskIndex = existing.state.tasks.findIndex(
      (task) => isObject(task) && task.id === args.taskId
    );
    if (taskIndex < 0) {
      throw new Error("Task not found");
    }

    const updatedTask = {
      ...existing.state.tasks[taskIndex],
      ...args.patch,
      id: args.taskId,
    };
    if (args.patch.plotId === null) {
      delete updatedTask.plotId;
    }
    if (args.patch.dueAt === null) {
      delete updatedTask.dueAt;
    }
    const tasks = [...existing.state.tasks];
    tasks[taskIndex] = updatedTask;

    await ctx.db.patch(existing._id, {
      state: { ...existing.state, tasks },
      updatedAt: Date.now(),
    });
    return updatedTask;
  },
});

export const deleteState = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const states = await ctx.db
      .query("dashboardStates")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const state of states) {
      await ctx.db.delete(state._id);
    }
    return { ok: true };
  },
});
