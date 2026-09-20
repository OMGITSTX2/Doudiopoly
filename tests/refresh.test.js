"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const E = require("../engine.js");
const D = require("../game-data.js");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8");

// Run the real UI script in fresh page contexts sharing only tab storage.
function page(storage = new Map(), persistent = new Map()) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      value: "",
      textContent: "",
      innerHTML: "",
      style: { setProperty() {} },
      classList: {
        add: (x) => classes.add(x),
        remove: (x) => classes.delete(x),
        contains: (x) => classes.has(x),
        toggle(x, enabled) {
          enabled ? classes.add(x) : classes.delete(x);
        },
      },
      handlers: {},
      dataset: {},
      addEventListener(type, fn) {
        this.handlers[type] = fn;
      },
      setAttribute() {},
      children: [],
      append(child) {
        this.children.push(child);
      },
      replaceChildren() {
        this.children = [];
      },
      focus() {},
      querySelectorAll: () => [],
      getClientRects: () => [{}],
    };
  }
  const context = vm.createContext({
    DoudiEngine: E,
    DoudiData: D,
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, element());
        return elements.get(selector);
      },
      querySelectorAll: () => [],
      createElement: element,
      addEventListener() {},
    },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    localStorage: {
      getItem: (key) => persistent.get(key) ?? null,
      setItem: (key, value) => persistent.set(key, value),
      removeItem: (key) => persistent.delete(key),
    },
    location: { search: "" },
    URLSearchParams,
    AbortController,
    AbortSignal,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    matchMedia: () => ({ matches: false }),
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(source, context);
  return {
    run: (code) => vm.runInContext(code, context),
    storage,
    persistent,
    elements,
  };
}

test("refresh restores a card landing committed before movement animation finishes", () => {
  const first = page();
  first.run(
    'localGame(E.dispatch(E.create({name:"Refresh player"}),0,{type:"addBot",name:"Bot"})); game.phase="playing";',
  );
  first.run('acceptState(E.dispatch(game,0,{type:"roll"},{rng:()=>0.01}));');
  const saved = JSON.parse(first.storage.get("doudi-active-game")).state;
  const next = page(first.storage);
  assert.deepEqual(JSON.parse(next.run("JSON.stringify(game)")), saved);
  assert.equal(next.run("busy"), false);
  assert.equal(next.run("game.pending.type"), "card");
});

test("refresh retains cash, ownership and an unfinished purchase", () => {
  const first = page();
  first.run(
    'let state=E.dispatch(E.create({name:"Buyer"}),0,{type:"addBot",name:"Bot"}); state.phase="playing"; state.turnHasRolled=true; state.players[0].balance=987; state.players[0].position=1; state.owned[3]=0; state.pending={type:"buy",player:0,index:1}; localGame(state);',
  );
  const next = page(first.storage);
  assert.equal(next.run("game.players[0].balance"), 987);
  assert.equal(next.run("game.owned[3]"), 0);
  assert.equal(next.run("game.pending.index"), 1);
  assert.match(next.elements.get("#modalContent").innerHTML, /Old Kent Road/);
  next.run("leave()");
  assert.equal(page(next.storage).run("game"), null);
});

test("online refresh restores the same seat and waits for the server", () => {
  const first = page();
  first.run(
    'connectRoom({code:"ABC123",player:0,token:"a".repeat(64)},E.create({name:"Online",code:"ABC123"}));',
  );
  const next = page(first.storage);
  assert.equal(next.run("game.code"), "ABC123");
  assert.equal(next.run("connection.player"), 0);
  assert.equal(next.run("connected"), false);
  assert.equal(
    next.elements.get("#connectionStatus").textContent,
    "Reconnecting…",
  );
});

test("invalid automatic save leaves the lobby usable", () => {
  const next = page(new Map([["doudi-active-game", "broken JSON"]]));
  assert.equal(next.run("game"), null);
  assert.match(
    next.elements.get("#toast").textContent,
    /could not be restored/,
  );
});

test("continue and named saves survive closing the tab", () => {
  const first = page();
  first.run(
    'localGame(E.create({name:"Persistent",botDifficulty:"hard"})); savedGames();',
  );
  first.run('$("#saveSlot").value="1"; $("#saveName").value="Weekend";');
  first.elements.get("#writeSlot").handlers.click();
  const second = page(new Map(), first.persistent);
  assert.equal(second.run("game"), null);
  second.elements.get("#continueLast").handlers.click();
  assert.equal(second.run("game.players[0].name"), "Persistent");
  assert.equal(second.run("game.botDifficulty"), "hard");
  second.run("leave(); savedGames();");
  second.run('$("#saveSlot").value="1";');
  second.elements.get("#readSlot").handlers.click();
  assert.equal(second.run("game.players[0].name"), "Persistent");
});

test("sidebar shows cash only and the final winner uses net worth after mortgages", () => {
  const app = page();
  app.run(
    'let s=E.dispatch(E.create({name:"Owner"}),0,{type:"addBot",name:"Cash winner"}); s.players[0].balance=100; s.players[1].balance=350; s.owned[42]=0; s.mortgaged[42]=true; localGame(s);',
  );
  const sidebar = app.elements.get("#leaderboard").innerHTML;
  assert.match(sidebar, /Owner<\/span><b>£100/);
  assert.match(sidebar, /Cash winner<\/span><b>£350/);
  assert.doesNotMatch(sidebar, /properties|mortgages|£500/);
  app.run('game.phase="over"; game.reason="Finished"; showResults();');
  assert.match(
    app.elements.get("#modalContent").innerHTML,
    /Highest net worth: Cash winner/,
  );
  assert.match(app.elements.get("#modalContent").innerHTML, /£300/);
});

test("Doudi UI waits for a manual roll, confirmation, and a board destination", async () => {
  const p = page();
  p.run(
    'let s=E.dispatch(E.create({name:"Traveller"}),0,{type:"addBot",name:"Bot"}); s.phase="playing"; s.turnHasRolled=true; s.players[0].position=10; s.pending={type:"doudi",player:0}; localGame(s);',
  );
  await p.elements.get("#chooseDoudiRoll").handlers.click();
  assert.equal(p.run("game.pending.type"), "doudiReady");
  assert.equal(p.elements.get("#rollButton").disabled, false);
  assert.equal(
    p.elements.get("#modalBackdrop").classList.contains("hidden"),
    true,
  );
  p.run("random=()=>0.99");
  await p.elements.get("#rollButton").handlers.click();
  assert.equal(p.run("game.pending.type"), "doudiResult");
  assert.match(p.elements.get("#modalContent").innerHTML, /Doudi roll: 12/);
  await p.elements.get("#resolveDoudi").handlers.click();
  const targets = p.elements
    .get("#board")
    .children.filter((e) => e.classList.contains("travel-target"));
  assert.equal(targets.length, 44);
  await targets[42].handlers.click();
  assert.equal(p.run("game.players[0].position"), 42);
  assert.equal(p.run("game.pending"), null);
});

test("tax and payment cards show Pay before deducting cash", async () => {
  for (const pending of [
    { type: "tax", player: 0, index: 4 },
    { type: "card", player: 0, deck: "chance", card: 1 },
    { type: "card", player: 0, deck: "chest", card: 1 },
    { type: "card", player: 0, deck: "chance", card: 11 },
  ]) {
    const p = page();
    p.run(
      'let s=E.dispatch(E.create({name:"Payer"}),0,{type:"addBot",name:"Bot"}); s.phase="playing"; s.turnHasRolled=true; s.players[0].position=4; s.owned[1]=0; s.buildings[1]=1; s.pending=' +
        JSON.stringify(pending) +
        "; localGame(s);",
    );
    assert.equal(p.run("game.players[0].balance"), 1500);
    assert.match(p.elements.get("#modalContent").innerHTML, /Pay £/);
    const before = p.run("game.players[0].balance");
    await p.elements
      .get(pending.type === "tax" ? "#payTax" : "#resolveCard")
      .handlers.click();
    assert.ok(p.run("game.players[0].balance") < before);
  }
});
