"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createGameServer } = require("../server.js");

async function start(options = {}) {
  const app = createGameServer({
    storageDir: null,
    animationMs: 0,
    ...options,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function request(route, data, token, extra = {}) {
    const response = await fetch(base + route, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }
  async function stop() {
    if (!app.server.listening) return;
    const closed = once(app.server, "close");
    app.shutdown();
    app.server.closeAllConnections();
    await closed;
  }
  return { ...app, base, request, stop };
}
async function pair(app) {
  const host = (await app.request("/api/rooms", { name: "Host" })).body;
  const guest = (
    await app.request(`/api/rooms/${host.state.code}/join`, { name: "Guest" })
  ).body;
  return { host, guest, route: `/api/rooms/${host.state.code}` };
}

test("real clients create/join, authenticate, enforce host controls and reject stale commands", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { host, guest, route } = await pair(app);
  assert.notEqual(host.token, guest.token);
  assert.equal(guest.player, 1);
  assert.equal((await app.request(route)).status, 401);
  assert.equal(
    (await app.request(route, undefined, "a".repeat(64))).status,
    401,
  );
  assert.equal(
    (
      await app.request(
        route + "/commands",
        { action: { type: "start" }, revision: 1 },
        guest.token,
      )
    ).status,
    400,
  );
  const started = await app.request(
    route + "/commands",
    { action: { type: "start" }, revision: 1 },
    host.token,
  );
  assert.equal(started.status, 200);
  assert.equal(
    (await app.request(route + "/join", { name: "Late" })).status,
    400,
  );
  assert.equal(
    (
      await app.request(
        route + "/commands",
        { action: { type: "roll" }, revision: 1 },
        host.token,
      )
    ).status,
    409,
  );
  const wrong = await app.request(
    route + "/commands",
    { action: { type: "roll", actor: 0 }, revision: 2 },
    guest.token,
  );
  assert.equal(wrong.status, 400);
  const roll = await app.request(
    route + "/commands",
    { action: { type: "roll", dice: [6, 6] }, revision: 2 },
    host.token,
  );
  assert.equal(roll.status, 200);
  assert.equal(roll.body.state.currentPlayer, 1);
  assert.deepEqual(
    (await app.request(route, undefined, guest.token)).body.state,
    roll.body.state,
  );
  assert.equal(JSON.stringify(roll.body).includes(host.token), false);
  assert.deepEqual(roll.body.state.decks, { chance: [], chest: [] });
});
test("event stream delivers another player’s commands without polling", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { host, guest, route } = await pair(app),
    controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(app.base + route + "/events", {
    headers: { Authorization: `Bearer ${guest.token}` },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /Host/);
  const changed = await app.request(
    route + "/commands",
    {
      action: { type: "chat", text: "Hello from another client" },
      revision: 1,
    },
    host.token,
  );
  assert.equal(changed.status, 200);
  const update = await reader.read();
  assert.match(
    new TextDecoder().decode(update.value),
    /Hello from another client/,
  );
  await reader.cancel();
});
test("room and reconnect credentials survive server restart; persistence stores only token hashes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doudi-test-"));
  t.after(() => {
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
  let app = await start({ storageDir: root });
  t.after(() => app.stop());
  const { host, guest, route } = await pair(app);
  const before = (await app.request(route, undefined, guest.token)).body.state;
  const stored = fs.readFileSync(
    path.join(root, host.state.code + ".json"),
    "utf8",
  );
  assert.equal(stored.includes(host.token), false);
  assert.equal(stored.includes(guest.token), false);
  await app.stop();
  app = await start({ storageDir: root });
  const restored = await app.request(route, undefined, guest.token);
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body.state, before);
});
test("static serving excludes source control, room files, tests and traversal paths", async (t) => {
  const app = await start();
  t.after(app.stop);
  for (const route of [
    "/.git/config",
    "/data/ABC123.json",
    "/server.js",
    "/tests/engine.test.js",
    "/%2e%2e/package.json",
  ])
    assert.equal((await fetch(app.base + route)).status, 404);
  const page = await fetch(app.base + "/");
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(
    (
      await app.request("/api/rooms", { name: "Bad" }, undefined, {
        Origin: "https://unrelated.example",
      })
    ).status,
    403,
  );
});
test("simultaneous commands cannot spend or advance twice", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { host, route } = await pair(app);
  const results = await Promise.all([
    app.request(
      route + "/commands",
      { action: { type: "start" }, revision: 1 },
      host.token,
    ),
    app.request(
      route + "/commands",
      { action: { type: "start" }, revision: 1 },
      host.token,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await app.request(route, undefined, host.token)).body.state.revision,
    2,
  );
});
test("forged joins and oversized requests are rejected", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { host, route } = await pair(app);
  assert.equal(
    (
      await app.request(
        route + "/commands",
        { action: { type: "join", name: "Fake" }, revision: 1 },
        host.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await app.request("/api/rooms", { name: "x".repeat(17000) })).status,
    413,
  );
});
