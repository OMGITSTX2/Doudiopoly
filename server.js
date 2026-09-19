"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const E = require("./engine.js");

const MAX_ROOMS = 100;
const ROOM_TTL = 24 * 60 * 60 * 1000;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const random = () => crypto.randomInt(0, 0x100000000) / 0x100000000;
const publicState = (state) => ({ ...state, decks: { chance: [], chest: [] } });

function createGameServer(options = {}) {
  const rooms = new Map(),
    limits = new Map();
  const storageDir =
    options.storageDir === undefined
      ? path.join(__dirname, "data")
      : options.storageDir;
  const animationMs = options.animationMs ?? 440;
  let closing = false;
  if (storageDir) {
    fs.mkdirSync(storageDir, { recursive: true });
    for (const file of fs
      .readdirSync(storageDir)
      .filter((f) => /^[A-Z0-9]{6}\.json$/.test(f))) {
      try {
        const record = JSON.parse(
          fs.readFileSync(path.join(storageDir, file), "utf8"),
        );
        if (
          !Number.isFinite(record.updatedAt) ||
          Date.now() - record.updatedAt > ROOM_TTL
        )
          continue;
        const state = E.validate(record.state);
        if (
          state.code !== file.slice(0, 6) ||
          !record.members ||
          typeof record.members !== "object"
        )
          continue;
        for (const [token, p] of Object.entries(record.members)) {
          if (
            !/^[a-f0-9]{64}$/.test(token) ||
            !Number.isInteger(p) ||
            !state.players[p] ||
            state.players[p].bot
          )
            throw new Error("Invalid membership");
        }
        rooms.set(state.code, {
          state,
          members: record.members,
          updatedAt: record.updatedAt,
          streams: new Set(),
          readyAt: 0,
          botAt: Date.now() + 700,
        });
      } catch (error) {
        console.error(`Skipped invalid room file ${file}: ${error.message}`);
      }
    }
  }
  function persist(room) {
    if (!storageDir) return;
    const destination = path.join(storageDir, `${room.state.code}.json`),
      temporary = destination + ".tmp";
    fs.writeFileSync(
      temporary,
      JSON.stringify({
        state: room.state,
        members: room.members,
        updatedAt: room.updatedAt,
      }),
      { mode: 0o600 },
    );
    fs.renameSync(temporary, destination);
  }
  function broadcast(room) {
    const message = JSON.stringify({ state: publicState(room.state) }) + "\n";
    for (const stream of room.streams) {
      if (stream.writableLength > 1000000) {
        stream.destroy();
        room.streams.delete(stream);
      } else stream.write(message);
    }
  }
  function commit(room, state, members = room.members) {
    const eventId = room.state.eventId;
    // Persist before publishing. A disk error must not acknowledge an unsaved command.
    const next = { ...room, state, members, updatedAt: Date.now() };
    persist(next);
    room.state = state;
    room.members = members;
    room.updatedAt = next.updatedAt;
    const steps = state.events
      .filter((e) => e.id > eventId && e.type === "move")
      .reduce((sum, e) => sum + e.path.length, 0);
    room.readyAt = Math.max(room.readyAt, Date.now() + steps * animationMs);
    room.botAt = room.readyAt + 700;
    broadcast(room);
  }
  function json(res, status, data) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  }
  async function body(req) {
    if (!String(req.headers["content-type"]).startsWith("application/json"))
      throw Object.assign(new Error("Expected JSON."), { status: 415 });
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 16000)
        throw Object.assign(new Error("Request too large."), { status: 413 });
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error();
      return parsed;
    } catch {
      throw new Error("Invalid JSON request.");
    }
  }
  function authenticate(req, room) {
    const token = String(req.headers.authorization || "").replace(
      /^Bearer /,
      "",
    );
    if (!/^[a-f0-9]{64}$/.test(token))
      throw Object.assign(new Error("Room access required."), { status: 401 });
    const player = room.members[hash(token)];
    if (player === undefined)
      throw Object.assign(new Error("Room access expired."), { status: 401 });
    return player;
  }
  function rateLimit(req) {
    const key = req.socket.remoteAddress,
      now = Date.now();
    let bucket = limits.get(key);
    if (!bucket || now - bucket.start > 60000) {
      bucket = { start: now, count: 0 };
      limits.set(key, bucket);
    }
    if (++bucket.count > 180)
      throw Object.assign(new Error("Too many requests. Try again shortly."), {
        status: 429,
      });
  }
  const staticFiles = new Map([
    ["/", ["index.html", "text/html"]],
    ["/index.html", ["index.html", "text/html"]],
    ["/styles.css", ["styles.css", "text/css"]],
    ["/app.js", ["app.js", "text/javascript"]],
    ["/engine.js", ["engine.js", "text/javascript"]],
    ["/game-data.js", ["game-data.js", "text/javascript"]],
  ]);
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      if (closing) return json(res, 503, { error: "Server is shutting down." });
      const url = new URL(req.url, "http://localhost");
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return json(res, 403, {
          error: "Use the same server address for the page and API.",
        });
      if (req.method === "GET" && url.pathname === "/api/health")
        return json(res, 200, { ok: true });
      if (url.pathname.startsWith("/api/")) rateLimit(req);
      if (req.method === "POST" && url.pathname === "/api/rooms") {
        if (rooms.size >= MAX_ROOMS)
          return json(res, 503, {
            error: "The server is full. Try again later.",
          });
        const input = await body(req);
        let code;
        do {
          code = crypto
            .randomBytes(4)
            .toString("hex")
            .slice(0, 6)
            .toUpperCase();
        } while (rooms.has(code));
        const state = E.create({ ...input, code });
        E.validate(state);
        const token = crypto.randomBytes(32).toString("hex");
        const room = {
          state,
          members: { [hash(token)]: 0 },
          updatedAt: Date.now(),
          streams: new Set(),
          readyAt: 0,
          botAt: 0,
        };
        persist(room);
        rooms.set(code, room);
        return json(res, 201, { state: publicState(state), token, player: 0 });
      }
      const match = url.pathname.match(
        /^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|commands|events))?$/,
      );
      if (match) {
        const room = rooms.get(match[1]);
        if (!room)
          return json(res, 404, { error: "Room not found or expired." });
        if (req.method === "POST" && match[2] === "join") {
          const input = await body(req),
            state = E.dispatch(room.state, 0, {
              type: "join",
              name: input.name,
            });
          const token = crypto.randomBytes(32).toString("hex"),
            player = state.players.length - 1;
          commit(room, state, { ...room.members, [hash(token)]: player });
          return json(res, 200, { state: publicState(state), token, player });
        }
        const actor = authenticate(req, room);
        if (req.method === "GET" && !match[2])
          return json(res, 200, {
            state: publicState(room.state),
            player: actor,
          });
        if (req.method === "GET" && match[2] === "events") {
          if (room.streams.size >= 18)
            return json(res, 429, {
              error: "Too many connections to this room.",
            });
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
            Connection: "keep-alive",
          });
          res.write(JSON.stringify({ state: publicState(room.state) }) + "\n");
          room.streams.add(res);
          const heartbeat = setInterval(() => res.write("\n"), 15000);
          res.on("close", () => {
            clearInterval(heartbeat);
            room.streams.delete(res);
          });
          return;
        }
        if (req.method === "POST" && match[2] === "commands") {
          const input = await body(req);
          if (!input.action || input.action.type === "join")
            return json(res, 400, { error: "Invalid room command." });
          if (input.revision !== room.state.revision)
            return json(res, 409, {
              error:
                "The table changed. Review the latest state and try again.",
            });
          if (Date.now() < room.readyAt && input.action.type !== "chat")
            return json(res, 409, {
              error: "Wait for token movement to finish.",
            });
          const next = E.dispatch(room.state, actor, input.action, {
            rng: random,
          });
          E.validate(next);
          commit(room, next);
          return json(res, 200, { state: publicState(next) });
        }
        return json(res, 405, { error: "Method not allowed." });
      }
      const asset = staticFiles.get(url.pathname);
      if (req.method === "GET" && asset) {
        res.writeHead(200, {
          "Content-Type": `${asset[1]}; charset=utf-8`,
          "Cache-Control": "no-cache",
        });
        res.end(fs.readFileSync(path.join(__dirname, asset[0])));
        return;
      }
      return json(res, 404, { error: "Not found." });
    } catch (error) {
      if (!res.headersSent)
        json(res, error.status || 400, {
          error: error.code
            ? "Server storage is temporarily unavailable."
            : error.message,
        });
      else res.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const ticker = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.updatedAt > ROOM_TTL) {
        for (const stream of room.streams) stream.end();
        rooms.delete(code);
        if (storageDir)
          try {
            fs.unlinkSync(path.join(storageDir, `${code}.json`));
          } catch {
            /* Already removed. */
          }
        continue;
      }
      try {
        const timed = E.tick(room.state, now);
        if (timed.revision !== room.state.revision) {
          commit(room, timed);
          continue;
        }
        if (now < room.botAt || now < room.readyAt) continue;
        // Pause automated play when everyone disconnects; timed deadlines still run.
        if (!room.streams.size) continue;
        const command = E.botAction(room.state);
        if (command) {
          const next = E.dispatch(room.state, command.actor, command.action, {
            rng: random,
            now,
          });
          E.validate(next);
          commit(room, next);
        }
      } catch (error) {
        room.botAt = now + 5000;
        console.error("Room update failed:", error.message);
      }
    }
    for (const [key, bucket] of limits)
      if (now - bucket.start > 60000) limits.delete(key);
  }, 100);
  ticker.unref();
  server.on("close", () => clearInterval(ticker));
  function shutdown() {
    closing = true;
    clearInterval(ticker);
    for (const room of rooms.values())
      for (const stream of room.streams) stream.end();
    server.close();
    server.closeIdleConnections();
  }
  return { server, shutdown };
}
if (require.main === module) {
  const { server, shutdown } = createGameServer();
  const port = Number(process.env.PORT || 3000),
    host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () =>
    console.log(`Doudiopoly: http://${host}:${port}`),
  );
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
module.exports = { createGameServer };
