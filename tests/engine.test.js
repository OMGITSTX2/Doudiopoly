"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../game-data.js");

test("all 44 board spaces occupy distinct perimeter cells", () => {
  const cells = D.spaces.map((_, i) => D.boardCell(i));
  assert.equal(cells.length, 44);
  assert.equal(new Set(cells.map(String)).size, 44);
  for (const [row, column] of cells) {
    assert.ok(row >= 1 && row <= 12 && column >= 1 && column <= 12);
    assert.ok(row === 1 || row === 12 || column === 1 || column === 12);
  }
  assert.deepEqual(cells[43], [2, 1]);
});
function table(mode = "doudi", count = 2) {
  let s = E.create({ name: "Human", mode });
  for (let i = 1; i < count; i++)
    s = E.dispatch(s, 0, { type: "addBot", name: `Bot ${i}` });
  s.phase = "playing";
  return s;
}
function command(s, action, actor = s.currentPlayer, dice = [1, 2]) {
  let index = 0;
  return E.dispatch(s, actor, action, {
    rng: () => ((dice[index++ % dice.length] || 1) - 0.5) / 6,
    now: 1000,
  });
}
function land(s, index, dice = [1, 2]) {
  s.players[s.currentPlayer].position = (index - dice[0] - dice[1] + 44) % 44;
  return command(s, { type: "roll" }, s.currentPlayer, dice);
}
function roundtrip(s) {
  return E.parseSave(E.saveText(s));
}

test("rent from a bot reaches the single spendable balance and survives saving", () => {
  let s = table();
  s.owned[1] = 0;
  s.currentPlayer = 1;
  s = land(s, 1);
  assert.equal(s.players[0].balance, 1502);
  assert.equal(s.players[1].balance, 1698); // The bot also passes START.
  s = roundtrip(s);
  assert.equal(s.players[0].balance, 1502);
  assert.equal(s.balance, undefined);
});
test("discounted bank debt is paid exactly once after mortgaging", () => {
  let s = table();
  s.players[0].balance = 0;
  s.owned[5] = 0;
  s.doudiPlayer = 0;
  s.doudiTurnsLeft = 3;
  s = land(s, 4);
  assert.equal(s.debt.amount, 100);
  s = command(s, { type: "mortgage", index: 5 });
  assert.equal(s.players[0].balance, 0);
  assert.equal(s.debt, null);
});
test("Doudi negative card affordability uses the discounted cost", () => {
  let s = table();
  s.players[0].balance = 20;
  s.doudiPlayer = 0;
  s.doudiTurnsLeft = 3;
  s.turnHasRolled = true;
  s.pending = { type: "card", player: 0, deck: "chance", card: 1 };
  s = command(s, { type: "card" });
  assert.equal(s.players[0].balance, 5);
  assert.equal(s.phase, "playing");
  assert.equal(s.debt, null);
});
test("positive cards and START rewards apply Doudi income once", () => {
  let s = table();
  s.doudiPlayer = 0;
  s.doudiTurnsLeft = 3;
  s.players[0].position = 43;
  s = command(s, { type: "roll" }, 0, [1, 2]);
  assert.equal(s.players[0].balance, 1900);
  s.pending = { type: "card", player: 0, deck: "chance", card: 0 };
  s = command(s, { type: "card" });
  assert.equal(s.players[0].balance, 2000);
});
test("mortgaged properties collect no rent", () => {
  let s = table();
  s.owned[1] = 1;
  s.mortgaged[1] = true;
  s = land(s, 1);
  assert.equal(s.players[0].balance, 1700);
  assert.equal(s.players[1].balance, 1500);
});
test("boosted rent goes to the creditor even when debtor later raises cash", () => {
  let s = table();
  s.owned[42] = 1;
  s.owned[5] = 0;
  s.players[0].balance = 0;
  s.doudiPlayer = 1;
  s.doudiTurnsLeft = 3;
  s = land(s, 42);
  assert.equal(s.debt.amount, 50);
  assert.equal(s.debt.credit, 100);
  s = command(s, { type: "mortgage", index: 5 });
  assert.equal(s.players[0].balance, 50);
  assert.equal(s.players[1].balance, 1600);
});
test("mortgage repayment costs principal plus interest, without Doudi discount", () => {
  let s = table();
  s.owned[1] = 0;
  s.doudiPlayer = 0;
  s.doudiTurnsLeft = 3;
  s = command(s, { type: "mortgage", index: 1 });
  assert.equal(s.players[0].balance, 1530);
  s = command(s, { type: "mortgage", index: 1 });
  assert.equal(s.players[0].balance, 1497);
});
test("trade requires consent, preserves mortgages, and transfers both sides atomically", () => {
  let s = table();
  s.owned[1] = 0;
  s.owned[3] = 1;
  s.mortgaged[1] = true;
  s = command(s, {
    type: "trade",
    to: 1,
    give: [1],
    receive: [3],
    giveCash: 10,
    receiveCash: 20,
  });
  assert.equal(s.owned[1], 0);
  assert.throws(() => command(s, { type: "tradeAccept" }, 0));
  s = roundtrip(s);
  s = command(s, { type: "tradeAccept" }, 1);
  assert.equal(s.owned[1], 1);
  assert.equal(s.owned[3], 0);
  assert.equal(s.mortgaged[1], true);
  assert.equal(s.players[0].balance, 1510);
});
test("unaffordable and unowned trades cannot partially mutate state", () => {
  const s = table(),
    before = JSON.stringify(s);
  assert.throws(() =>
    command(s, {
      type: "trade",
      to: 1,
      give: [1],
      receive: [],
      giveCash: 0,
      receiveCash: 10,
    }),
  );
  assert.throws(() =>
    command(s, {
      type: "trade",
      to: 1,
      give: [],
      receive: [],
      giveCash: 2000,
      receiveCash: 0,
    }),
  );
  assert.equal(JSON.stringify(s), before);
});
test("turn guards reject rolling twice, ending during a purchase and acting as another player", () => {
  let s = land(table(), 1);
  assert.throws(() => command(s, { type: "end" }));
  assert.throws(() => command(s, { type: "roll" }));
  assert.throws(() => command(s, { type: "buy" }, 1));
  s = command(s, { type: "buy" });
  assert.throws(() => command(s, { type: "roll" }));
  s = command(s, { type: "end" });
  assert.equal(s.currentPlayer, 1);
});
test("every pending action survives a version 2 save", () => {
  for (const pending of [
    { type: "buy", player: 0, index: 1 },
    { type: "card", player: 0, deck: "chest", card: 4 },
    { type: "doudi", player: 0 },
    { type: "destination", player: 0 },
    {
      type: "auction",
      player: 0,
      index: 3,
      bidder: 1,
      highBid: 10,
      highBidder: 0,
      passed: [],
    },
  ]) {
    const s = table();
    s.turnHasRolled = true;
    s.pending = pending;
    assert.deepEqual(roundtrip(s).pending, pending);
  }
});
test("save on a movement command records the committed destination and landing action", () => {
  let s = land(table(), 1);
  s = roundtrip(s);
  assert.equal(s.players[0].position, 1);
  assert.equal(s.pending.type, "buy");
  s = command(s, { type: "buy" });
  assert.equal(s.owned[1], 0);
});
test("invalid colours, ownership, pending cards and debts are rejected before replacement", () => {
  const s = table(),
    before = JSON.stringify(s);
  for (const mutate of [
    (x) => (x.players[0].color = 'red"><img src=x>'),
    (x) => (x.owned[1] = 99),
    (x) => (x.players[0].balance = -1),
    (x) => (x.pending = { type: "card", player: 0, deck: "chance", card: 999 }),
    (x) =>
      (x.debt = {
        player: 0,
        amount: -100,
        creditor: null,
        credit: 0,
        reason: "bad",
        after: null,
      }),
    (x) => (x.startRolls = { 9: 12 }),
  ]) {
    const bad = E.clone(s);
    mutate(bad);
    assert.throws(() => roundtrip(bad));
  }
  assert.equal(JSON.stringify(s), before);
});
test("legacy save migration restores purchases and does not reapply paid cards", () => {
  const old = {
    format: "Doudiopoly save",
    version: 1,
    room: { code: "ABC123", title: "Legacy" },
    players: [
      { name: "You", balance: 1500, position: 1 },
      { name: "Bot", balance: 1500, position: 0 },
    ],
    turn: {
      phase: "playing",
      currentPlayer: 0,
      turnHasRolled: true,
      actionPending: true,
    },
    game: { position: 1, balance: 1500, owned: {}, mortgaged: {} },
  };
  let s = E.parseSave(JSON.stringify(old));
  assert.equal(s.pending.type, "buy");
  assert.equal(s.players[1].bot, true);
  old.game.position = 7;
  old.players[0].position = 7;
  old.game.balance = 1550;
  s = E.parseSave(JSON.stringify(old));
  assert.equal(s.pending, null);
  assert.equal(s.players[0].balance, 1550);
});
test("player additions are locked after start; starting ties follow joining order", () => {
  let s = E.create({ name: "You" });
  assert.throws(() => command(s, { type: "start" }));
  s = command(s, { type: "addBot", name: "Bot" });
  s = command(s, { type: "start" });
  assert.throws(() => command(s, { type: "addBot", name: "Late" }));
  s = command(s, { type: "roll" }, 0, [2, 3]);
  s = command(s, { type: "roll" }, 1, [2, 3]);
  assert.equal(s.currentPlayer, 0);
  assert.equal(s.phase, "playing");
});
test("humans and bots use independent dice with identical outcomes for the same RNG", () => {
  const a = land(table(), 1, [1, 6]),
    b = table();
  b.players[0].bot = true;
  const result = land(b, 1, [1, 6]);
  assert.deepEqual(a.dice, [1, 6]);
  assert.deepEqual(result.dice, a.dice);
});
test("three doubles go to Jail; completed doubles require another roll", () => {
  let s = table();
  s.players[0].position = 9;
  s = command(s, { type: "roll" }, 0, [1, 1]);
  assert.equal(s.extraRoll, true);
  assert.throws(() => command(s, { type: "end" }));
  s.players[0].position = 9;
  s = command(s, { type: "roll" }, 0, [1, 1]);
  s.players[0].position = 9;
  s = command(s, { type: "roll" }, 0, [1, 1]);
  assert.equal(s.players[0].jailed, true);
  assert.equal(s.players[0].position, 11);
  assert.equal(s.extraRoll, false);
  assert.equal(command(s, { type: "end" }).currentPlayer, 1);
});
test("third failed Jail roll resumes movement after bail debt settlement", () => {
  let s = table();
  Object.assign(s.players[0], {
    jailed: true,
    jailTurns: 2,
    balance: 0,
    position: 11,
  });
  s.owned[5] = 0;
  s = command(s, { type: "roll" }, 0, [1, 2]);
  assert.equal(s.debt.after.type, "jailMove");
  s = roundtrip(s);
  s = command(s, { type: "mortgage", index: 5 });
  assert.equal(s.players[0].jailed, false);
  assert.equal(s.players[0].position, 14);
  assert.equal(s.pending.type, "buy");
  assert.equal(s.players[0].balance, 50);
});
test("Jail card and bail permit a regular roll; Jail doubles give no extra roll", () => {
  let s = table();
  s.players[0].jailed = true;
  s.players[0].releaseCards = 1;
  s = command(s, { type: "jailCard" });
  assert.equal(s.turnHasRolled, false);
  assert.equal(s.players[0].releaseCards, 0);
  s.players[0].jailed = true;
  s.players[0].position = 11;
  s = command(s, { type: "roll" }, 0, [2, 2]);
  assert.equal(s.extraRoll, false);
  assert.equal(s.players[0].jailed, false);
});
test("Doudi duration counts only the holder’s next three completed turns", () => {
  let s = land(table(), 22);
  assert.equal(s.doudiTurnsLeft, 3);
  s = command(s, { type: "end" });
  assert.equal(s.doudiTurnsLeft, 3);
  for (let n = 0; n < 3; n++) {
    s.turnHasRolled = true;
    s = command(s, { type: "end" }, 1);
    s.turnHasRolled = true;
    s = command(s, { type: "end" }, 0);
    assert.equal(s.doudiTurnsLeft, 2 - n);
  }
  assert.equal(s.doudiPlayer, null);
});
test("another claimant replaces Doudi immediately; Classic disables custom effects", () => {
  let s = table();
  s.doudiPlayer = 0;
  s.doudiTurnsLeft = 3;
  s.currentPlayer = 1;
  s = land(s, 22);
  assert.equal(s.doudiPlayer, 1);
  assert.equal(land(table("classic"), 22).doudiPlayer, null);
  assert.equal(land(table("classic"), 10).pending, null);
});
test("Doudi travel neither collects START nor triggers a destination action", () => {
  let s = table();
  s.turnHasRolled = true;
  s.pending = { type: "destination", player: 0 };
  s.players[0].position = 43;
  s = command(s, { type: "travel", index: 21 });
  assert.equal(s.players[0].balance, 1500);
  assert.equal(s.doudiPlayer, null);
  assert.equal(s.pending, null);
});
test("auction is ordered, affordable and saveable; all-pass returns property to bank", () => {
  let s = land(table(), 1);
  s = command(s, { type: "decline" });
  assert.throws(() => command(s, { type: "bid", amount: 10 }, 1));
  s = command(s, { type: "bid", amount: 10 }, 0);
  s = roundtrip(s);
  s = command(s, { type: "bid", amount: 20 }, 1);
  s = command(s, { type: "passBid" }, 0);
  assert.equal(s.pending, null);
  assert.equal(s.owned[1], 1);
  assert.equal(s.players[1].balance, 1480);
  s = land(table(), 1);
  s = command(s, { type: "decline" });
  s = command(s, { type: "passBid" }, 0);
  s = command(s, { type: "passBid" }, 1);
  assert.equal(s.owned[1], undefined);
  assert.equal(s.pending, null);
});
test("full sets, stations and utilities calculate rent consistently", () => {
  const s = table();
  s.owned = { 1: 0, 3: 0, 5: 0, 16: 0, 13: 0 };
  assert.equal(E.rent(s, 1), 4);
  assert.equal(E.rent(s, 5), 50);
  assert.equal(E.rent(s, 13, 8), 32);
  s.owned[30] = 0;
  assert.equal(E.rent(s, 13, 8), 80);
  s.mortgaged[13] = true;
  assert.equal(E.rent(s, 13, 8), 0);
});
test("houses and hotels require full sets, even building and selling", () => {
  let s = table();
  s.owned = { 1: 0 };
  assert.throws(() => command(s, { type: "build", index: 1 }));
  s.owned[3] = 0;
  s.players[0].balance = 5000;
  s = command(s, { type: "build", index: 1 });
  assert.equal(E.rent(s, 1), 10);
  assert.throws(() => command(s, { type: "build", index: 1 }));
  assert.throws(() => command(s, { type: "mortgage", index: 3 }));
  s = command(s, { type: "build", index: 3 });
  for (let n = 1; n < 5; n++) {
    s = command(s, { type: "build", index: 1 });
    s = command(s, { type: "build", index: 3 });
  }
  assert.equal(s.buildings[1], 5);
  assert.equal(E.rent(s, 1), 250);
  assert.throws(() => command(s, { type: "build", index: 1 }));
  s = command(s, { type: "sellBuilding", index: 1 });
  assert.throws(() => command(s, { type: "sellBuilding", index: 1 }));
  assert.equal(roundtrip(s).buildings[1], 4);
});
test("bots sell buildings and mortgage assets before bankruptcy", () => {
  let s = table();
  s.currentPlayer = 1;
  s.players[1].balance = 0;
  s.owned[5] = 1;
  s = land(s, 4);
  const bot = E.botAction(s);
  assert.equal(bot.action.type, "mortgage");
  s = command(s, bot.action, 1);
  assert.equal(s.players[1].bankrupt, false);
  const next = E.botAction(s);
  assert.equal(next.action.type, "bankrupt");
  s = command(s, next.action, 1);
  assert.equal(s.phase, "over");
});
test("bankruptcy transfers cash and properties to creditor, preserving mortgages", () => {
  let s = table();
  s.owned = { 42: 1, 1: 0 };
  s.mortgaged[1] = true;
  s.players[0].balance = 10;
  s = land(s, 42);
  s = command(s, { type: "bankrupt" });
  assert.equal(s.owned[1], 1);
  assert.equal(s.mortgaged[1], true);
  assert.equal(s.players[1].balance, 1510);
  assert.equal(s.phase, "over");
});
test("timed and Quick games finish at their limits", () => {
  let s = table("timed");
  s.endsAt = 2000;
  assert.equal(E.tick(s, 1999).phase, "playing");
  assert.equal(E.tick(s, 2000).phase, "over");
  s = table("quick");
  assert.equal(s.players[0].balance, 1000);
  s.turnNumber = 39;
  s.turnHasRolled = true;
  assert.equal(command(s, { type: "end" }).phase, "over");
});
test("team members do not pay each other rent", () => {
  let s = table("teams", 3);
  s.currentPlayer = 2;
  s.owned[1] = 0;
  s = land(s, 1);
  assert.equal(s.players[2].balance, 1700);
  assert.equal(s.players[0].balance, 1500);
});
test("both decks exhaust sixteen distinct original cards before reshuffling", () => {
  for (const deck of ["chance", "chest"]) {
    let s = table();
    const seen = new Set();
    for (let n = 0; n < 16; n++) {
      s.turnHasRolled = false;
      s.pending = null;
      s = land(s, deck === "chance" ? 7 : 2);
      seen.add(s.pending.card);
    }
    assert.equal(seen.size, 16);
  }
});
test("seeded long games stay valid without stuck decisions; limited modes finish", () => {
  for (const mode of E.MODES)
    for (let seed = 1; seed <= 4; seed++) {
      let value = seed,
        rng = () => {
          value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
          return value / 4294967296;
        };
      let s = table(mode, 4);
      s.players.forEach((p) => (p.bot = true));
      s.phase = "starting";
      let steps = 0;
      while (s.phase !== "over" && steps++ < 4000) {
        const c = E.botAction(s);
        assert.ok(c, `${mode}: no next action`);
        s = E.dispatch(s, c.actor, c.action, { rng, now: 1000 + steps * 1000 });
        E.validate(s);
        if (steps % 31 === 0) s = roundtrip(s);
      }
      if (["quick", "timed"].includes(mode))
        assert.equal(s.phase, "over", `${mode} seed ${seed} failed to finish`);
      else
        assert.ok(
          s.phase === "over" || s.turnNumber > 100,
          `${mode} failed to make progress`,
        );
    }
});

test("original corners and one Doudi space per side follow the board path", () => {
  assert.deepEqual(
    [0, 11, 22, 33].map((i) => D.spaces[i].name),
    ["START", "JAIL", "FREE PARKING", "GO TO JAIL"],
  );
  assert.deepEqual(
    D.spaces.flatMap((s, i) => (s.type === "doudi" ? [i] : [])),
    [10, 21, 32, 43],
  );
  for (let i = 0; i < 44; i++) {
    const a = D.boardCell(i),
      b = D.boardCell((i + 1) % 44);
    assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
  }
  assert.equal(land(table(), 33).players[0].position, 11);
});

test("old saves retain named spaces and property ownership after corner correction", () => {
  for (const [before, after] of [
    [10, 11],
    [11, 10],
    [21, 22],
    [22, 21],
    [32, 33],
    [33, 32],
    [43, 43],
  ]) {
    const old = table();
    delete old.boardLayout;
    old.players[0].position = before;
    old.owned[1] = 0;
    const next = E.validate(old);
    assert.equal(next.players[0].position, after);
    assert.equal(next.owned[1], 0);
    assert.equal(old.players[0].position, before);
    assert.deepEqual(E.validate(next), next);
  }
});
