import test from "node:test";
import assert from "node:assert/strict";

let moduleId = 0;

async function freshData() {
  const url = new URL("../data.js", import.meta.url);
  url.searchParams.set("api-test", String(moduleId++));
  return import(url.href);
}

function stateFrom(data) {
  return {
    farm: data.getFarm(),
    crops: data.getCrops(),
    plots: data.getPlots(),
    tasks: data.getTasks(),
  };
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(payload),
  };
}

test("task mutations remain local before initialization", async () => {
  const data = await freshData();
  const before = data.getTasks().length;
  const created = await data.createTask({
    title: { bn: "Local task", en: "Local task" },
    status: "waiting",
  });

  assert.equal(created.id, "task-23");
  assert.equal(data.getTasks().length, before + 1);
  const updated = await data.updateTask(created.id, { status: "progress" });
  assert.equal(updated.status, "progress");
  assert.equal(data.getTasks().find((task) => task.id === created.id).status, "progress");
});

test("initializeData rejects session ids the backend cannot store", async () => {
  const data = await freshData();
  let called = false;
  await assert.rejects(
    data.initializeData({
      sessionId: "bad/session",
      fetchImpl: async () => { called = true; },
    }),
    /letters, numbers, underscores, or hyphens/,
  );
  assert.equal(called, false);
});

test("initializeData hydrates authoritative state once and deduplicates concurrent calls", async () => {
  const data = await freshData();
  const authoritative = stateFrom(data);
  authoritative.farm.name.en = "Authoritative Farm";
  authoritative.crops[0].name.en = "Authoritative Rice";
  authoritative.plots[0].plantCount += 7;
  authoritative.tasks[0].status = "progress";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(authoritative);
  };
  let notifications = 0;
  data.subscribe(() => { notifications += 1; });
  const options = { fetchImpl, sessionId: "test-session", apiBase: "https://api.example.test///" };

  const [first, second] = await Promise.all([data.initializeData(options), data.initializeData(options)]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.test/api/dashboard/test-session/bootstrap");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.cache, "no-store");
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json", "Content-Type": "application/json" });
  const bootstrap = JSON.parse(calls[0].options.body);
  assert.deepEqual([bootstrap.plots.length, bootstrap.crops.length, bootstrap.tasks.length], [12, 6, 22]);
  assert.equal(Object.hasOwn(bootstrap, "weather"), false);
  assert.equal(notifications, 1);
  assert.equal(data.getFarm().name.en, "Authoritative Farm");
  assert.equal(data.getCrops()[0].name.en, "Authoritative Rice");
  assert.equal(data.getPlots()[0].plantCount, authoritative.plots[0].plantCount);
  assert.equal(data.getTasks()[0].status, "progress");
  first.farm.name.en = "Changed by caller";
  second.tasks.length = 0;
  assert.equal(data.getFarm().name.en, "Authoritative Farm");
  assert.equal(data.getTasks().length, authoritative.tasks.length);
});

test("backend create and patch use encoded URLs and authoritative tasks", async () => {
  const data = await freshData();
  const initial = stateFrom(data);
  const createdTask = {
    id: "task/99",
    title: { bn: "Canonical task", en: "Canonical task" },
    plotId: "plot-1",
    status: "waiting",
    dueAt: "2027-01-02T12:00:00+06:00",
    createdBy: "farmer",
  };
  const updatedTask = { ...createdTask, plotId: null, status: "progress", dueAt: null };
  const replies = [initial, createdTask, updatedTask];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(replies.shift());
  };
  await data.initializeData({ fetchImpl, sessionId: "session-one", apiBase: "/service/" });

  const created = await data.createTask({
    id: "client-task",
    title: { bn: "Draft task", en: "Draft task" },
    plotId: "plot-1",
    status: "waiting",
    dueAt: "2027-01-02T12:00:00+06:00",
  });
  assert.deepEqual(created, createdTask);
  assert.deepEqual(data.getTasks().at(-1), createdTask);
  assert.equal(calls[1].url, "/service/api/dashboard/session-one/tasks");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.cache, "no-store");
  const createBody = JSON.parse(calls[1].options.body);
  assert.equal(Object.hasOwn(createBody, "id"), false);
  assert.equal(createBody.createdBy, "farmer");

  const updated = await data.updateTask(created.id, {
    id: "wrong-id",
    plotId: undefined,
    dueAt: undefined,
    status: "progress",
  });
  assert.deepEqual(updated, updatedTask);
  assert.deepEqual(data.getTasks().at(-1), updatedTask);
  assert.equal(calls[2].url, "/service/api/dashboard/session-one/tasks/task%2F99");
  assert.equal(calls[2].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[2].options.body), { plotId: null, dueAt: null, status: "progress" });
});

test("failed backend mutation leaves local tasks unchanged", async () => {
  const data = await freshData();
  const initial = stateFrom(data);
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    return call === 1 ? response(initial) : response({ detail: "Database unavailable" }, 503);
  };
  await data.initializeData({ fetchImpl, sessionId: "failure", apiBase: "" });
  const before = data.getTasks();
  let notifications = 0;
  data.subscribe(() => { notifications += 1; });

  await assert.rejects(data.updateTask(before[0].id, { status: "progress" }), /Database unavailable/);

  assert.deepEqual(data.getTasks(), before);
  assert.equal(notifications, 0);
});

test("refreshData replaces changed state once and ignores unchanged state", async () => {
  const data = await freshData();
  const initial = stateFrom(data);
  const changed = structuredClone(initial);
  changed.plots[0].plantCount += 25;
  const replies = [initial, changed, structuredClone(changed)];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(replies.shift());
  };
  await data.initializeData({ fetchImpl, sessionId: "refresh-session", apiBase: "https://api.example.test/" });
  let notifications = 0;
  data.subscribe(() => { notifications += 1; });

  const refreshed = await data.refreshData();
  assert.equal(data.getPlots()[0].plantCount, changed.plots[0].plantCount);
  assert.equal(notifications, 1);
  refreshed.plots[0].plantCount = 0;
  assert.equal(data.getPlots()[0].plantCount, changed.plots[0].plantCount);

  await data.refreshData();
  assert.equal(notifications, 1);
  assert.equal(calls[1].url, "https://api.example.test/api/dashboard/refresh-session");
  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.cache, "no-store");
  assert.equal(calls[2].options.method, "GET");
});

test("a slow refresh cannot overwrite a newer task mutation", async () => {
  const data = await freshData();
  const initial = stateFrom(data);
  const stale = structuredClone(initial);
  const created = {
    id: "task-23",
    title: { bn: "নতুন কাজ", en: "New task" },
    status: "waiting",
    createdBy: "farmer",
  };
  let resolveRefresh;
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) return response(initial);
    if (call === 2) return new Promise((resolve) => { resolveRefresh = () => resolve(response(stale)); });
    return response(created, 201);
  };
  await data.initializeData({ fetchImpl, sessionId: "race-session" });

  const refresh = data.refreshData();
  await Promise.resolve();
  await data.createTask({ title: created.title, status: "waiting" });
  resolveRefresh();
  await refresh;

  assert.equal(data.getTasks().at(-1).id, created.id);
  assert.equal(data.getTasks().length, initial.tasks.length + 1);
});
