"use strict";

// The same rules run offline and on the server. Commands are applied to a copy:
// a rejected command cannot partially change balances or the current turn.
(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./game-data.js")
      : root.DoudiData,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DoudiEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (data) {
  const { spaces, playerColors } = data;
  const MODES = ["doudi", "classic", "quick", "timed", "teams"];
  const RENT = {
    1: [2, 10, 30, 90, 160, 250],
    3: [4, 20, 60, 180, 320, 450],
    6: [6, 30, 90, 270, 400, 550],
    8: [6, 30, 90, 270, 400, 550],
    9: [8, 40, 100, 300, 450, 600],
    12: [10, 50, 150, 450, 625, 750],
    14: [10, 50, 150, 450, 625, 750],
    15: [12, 60, 180, 500, 700, 900],
    17: [14, 70, 200, 550, 750, 950],
    19: [14, 70, 200, 550, 750, 950],
    20: [16, 80, 220, 600, 800, 1000],
    23: [18, 90, 250, 700, 875, 1050],
    25: [18, 90, 250, 700, 875, 1050],
    26: [20, 100, 300, 750, 925, 1100],
    28: [22, 110, 330, 800, 975, 1150],
    29: [22, 110, 330, 800, 975, 1150],
    31: [24, 120, 360, 850, 1025, 1200],
    34: [26, 130, 390, 900, 1100, 1275],
    35: [26, 130, 390, 900, 1100, 1275],
    37: [28, 150, 450, 1000, 1200, 1400],
    40: [35, 175, 500, 1100, 1300, 1500],
    42: [50, 200, 600, 1400, 1700, 2000],
  };
  // Original card wording; each deck has sixteen distinct effects.
  const CARDS = {
    chance: [
      { title: "A sunny shortcut", text: "Collect £50.", amount: 50 },
      { title: "Street festival", text: "Contribute £30.", amount: -30 },
      { title: "Lucky find", text: "Collect £100.", amount: 100 },
      { title: "Fresh beginning", text: "Advance to START.", destination: 0 },
      {
        title: "West End invitation",
        text: "Advance to Mayfair.",
        destination: 42,
      },
      { title: "River meeting", text: "Advance to Strand.", destination: 23 },
      {
        title: "Station connection",
        text: "Advance to the next station.",
        nearest: "station",
      },
      {
        title: "Power appointment",
        text: "Advance to the next utility.",
        nearest: "utility",
      },
      { title: "Road closed", text: "Move back three spaces.", back: 3 },
      {
        title: "Court summons",
        text: "Go to Jail without collecting START money.",
        jail: true,
      },
      {
        title: "Travel permit",
        text: "Keep a free Jail release card.",
        release: true,
      },
      {
        title: "Roof repairs",
        text: "Pay £25 per house and £100 per hotel.",
        repairs: [25, 100],
      },
      { title: "Consulting work", text: "Collect £150.", amount: 150 },
      { title: "Parking ticket", text: "Pay £15.", amount: -15 },
      {
        title: "Train journey",
        text: "Advance to King’s Cross.",
        destination: 5,
      },
      { title: "Community donation", text: "Pay £50.", amount: -50 },
    ],
    chest: [
      { title: "Neighbourhood grant", text: "Collect £200.", amount: 200 },
      { title: "Health appointment", text: "Pay £50.", amount: -50 },
      { title: "Market stall", text: "Collect £50.", amount: 50 },
      { title: "Return home", text: "Advance to START.", destination: 0 },
      {
        title: "Court appointment",
        text: "Go to Jail without collecting START money.",
        jail: true,
      },
      {
        title: "Release approved",
        text: "Keep a free Jail release card.",
        release: true,
      },
      { title: "Club refund", text: "Collect £20.", amount: 20 },
      { title: "Birthday gift", text: "Collect £100.", amount: 100 },
      { title: "Tuition payment", text: "Pay £50.", amount: -50 },
      { title: "Savings mature", text: "Collect £100.", amount: 100 },
      { title: "Garden prize", text: "Collect £10.", amount: 10 },
      { title: "Unexpected inheritance", text: "Collect £100.", amount: 100 },
      {
        title: "Home maintenance",
        text: "Pay £40 per house and £115 per hotel.",
        repairs: [40, 115],
      },
      { title: "Community care", text: "Pay £100.", amount: -100 },
      { title: "Tax refund", text: "Collect £25.", amount: 25 },
      { title: "Local volunteering award", text: "Collect £75.", amount: 75 },
    ],
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function requireRule(condition, message) {
    if (!condition) throw new Error(message);
  }
  const integer = (n, min, max) =>
    Number.isSafeInteger(n) && n >= min && n <= max;
  const own = (s, player) =>
    Object.keys(s.owned)
      .map(Number)
      .filter((i) => s.owned[i] === player);
  const group = (i) =>
    spaces
      .map((p, n) => (p.group === spaces[i].group ? n : -1))
      .filter((n) => n >= 0);
  const side = (i) => (i <= 11 ? 0 : i <= 22 ? 1 : i <= 33 ? 2 : 3);
  const isDoudi = (s, p) =>
    s.mode !== "classic" && s.doudiPlayer === p && s.doudiTurnsLeft > 0;
  const cost = (s, n, p) => (isDoudi(s, p) ? Math.ceil(n / 2) : n);
  const income = (s, n, p) => (isDoudi(s, p) ? n * 2 : n);
  const buildCost = (i) => (i <= 9 ? 50 : i <= 20 ? 100 : i <= 31 ? 150 : 200);
  function finalScore(s, p) {
    // Preserve the original final-ledger rule: cash plus full property value.
    // Improvements add their purchase cost to the property's recorded value.
    return (
      s.players[p].balance +
      own(s, p).reduce(
        (sum, i) =>
          sum + spaces[i].price + (s.buildings[i] || 0) * buildCost(i),
        0,
      )
    );
  }
  function netWorthBreakdown(s, p) {
    const assets = own(s, p);
    const cash = s.players[p].balance;
    const properties = assets.reduce((sum, i) => sum + spaces[i].price, 0);
    const buildings = assets.reduce(
      (sum, i) => sum + (s.buildings[i] || 0) * buildCost(i),
      0,
    );
    const mortgages = assets.reduce(
      (sum, i) => sum + (s.mortgaged[i] ? Math.floor(spaces[i].price / 2) : 0),
      0,
    );
    const debt =
      s.debt?.player === p
        ? s.debt.amount +
          (s.debt.after?.type === "payEach"
            ? s.debt.after.remaining.length * 25
            : 0)
        : 0;
    return {
      cash,
      properties,
      buildings,
      mortgages,
      debt,
      total: cash + properties + buildings - mortgages - debt,
    };
  }
  function netWorth(s, p) {
    return netWorthBreakdown(s, p).total;
  }
  function rent(s, i, dice = 7) {
    const owner = s.owned[i];
    if (owner === undefined || s.mortgaged[i]) return 0;
    const p = spaces[i];
    if (p.group === "station")
      return (
        25 *
        2 **
          (own(s, owner).filter((n) => spaces[n].group === "station").length -
            1)
      );
    if (p.type === "utility")
      return (
        dice *
        (own(s, owner).filter((n) => spaces[n].type === "utility").length === 2
          ? 10
          : 4)
      );
    const level = s.buildings[i] || 0;
    return (
      RENT[i][level] *
      (!level && group(i).every((n) => s.owned[n] === owner && !s.mortgaged[n])
        ? 2
        : 1)
    );
  }
  function log(s, text, extra = {}) {
    s.events.push({ id: ++s.eventId, text, ...extra });
    if (s.events.length > 250) s.events.shift();
  }
  function addPlayer(s, name, bot = false) {
    requireRule(
      s.phase === "lobby" && s.players.length < 6,
      "Players can join only before the game starts (maximum six).",
    );
    requireRule(
      typeof name === "string" &&
        name.trim().length > 0 &&
        name.trim().length <= 18,
      "Enter a name of 1–18 characters.",
    );
    const index = s.players.length;
    s.players.push({
      name: name.trim(),
      color: playerColors[index],
      balance: s.mode === "quick" ? 1000 : 1500,
      position: 0,
      bot,
      bankrupt: false,
      jailed: false,
      jailTurns: 0,
      releaseCards: 0,
      team: index % 2,
    });
    log(s, `${name.trim()} joined the table.`);
    return index;
  }
  function create(options = {}) {
    const mode = options.mode || "doudi";
    requireRule(MODES.includes(mode), "Unknown game mode.");
    const s = {
      version: 2,
      boardLayout: 2,
      botDifficulty: options.botDifficulty || "normal",
      botTradeTurn: -1,
      code: String(options.code || "LOCAL").slice(0, 6),
      title: String(options.title || "Doudi room").slice(0, 28),
      mode,
      players: [],
      owned: {},
      mortgaged: {},
      buildings: {},
      phase: "lobby",
      currentPlayer: 0,
      startRolls: {},
      dice: [0, 0],
      turnHasRolled: false,
      extraRoll: false,
      doubles: 0,
      turnNumber: 0,
      pending: null,
      debt: null,
      trade: null,
      doudiPlayer: null,
      doudiTurnsLeft: 0,
      doudiClaimedTurn: -1,
      events: [],
      eventId: 0,
      revision: 0,
      decks: { chance: [], chest: [] },
      reason: "",
      startedAt: null,
      endsAt: null,
      durationMinutes: options.durationMinutes || 30,
    };
    requireRule(
      integer(s.durationMinutes, 5, 180),
      "Timed games must last 5–180 minutes.",
    );
    requireRule(
      ["easy", "normal", "hard"].includes(s.botDifficulty),
      "Unknown practice difficulty.",
    );
    addPlayer(s, options.name || "Doudi");
    return s;
  }
  function dicePair(rng) {
    return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  }
  function finish(s, reason) {
    s.phase = "over";
    s.reason = reason;
    s.pending = null;
    s.debt = null;
    s.trade = null;
    s.extraRoll = false;
    log(s, reason);
  }
  function checkTime(s, now) {
    if (s.phase === "playing" && s.endsAt !== null && now >= s.endsAt)
      finish(s, "Time is up. The highest final score wins.");
  }
  function jail(s, p) {
    const player = s.players[p];
    player.position = 11;
    player.jailed = true;
    player.jailTurns = 0;
    s.extraRoll = false;
    s.doubles = 0;
    log(s, `${player.name} went to Jail.`, { type: "teleport", player: p });
  }
  function bankrupt(s, p) {
    const d = s.debt;
    requireRule(d && d.player === p, "There is no debt to concede.");
    const player = s.players[p];
    if (d.creditor !== null) s.players[d.creditor].balance += player.balance;
    player.balance = 0;
    player.bankrupt = true;
    own(s, p).forEach((i) => {
      if (d.creditor === null) {
        delete s.owned[i];
        delete s.mortgaged[i];
        delete s.buildings[i];
      } else s.owned[i] = d.creditor;
    });
    finish(
      s,
      `${player.name} went bankrupt owing £${d.amount} to ${d.creditor === null ? "the bank" : s.players[d.creditor].name}.`,
    );
  }
  function afterPayment(s, p, after, env) {
    if (!after) return;
    if (after.type === "payEach") return payEach(s, p, after.remaining, env);
    s.players[p].jailed = false;
    s.players[p].jailTurns = 0;
    if (after.type === "jailMove") move(s, p, after.steps, env);
  }
  function settle(s, env) {
    const d = s.debt;
    if (!d || s.players[d.player].balance < d.amount) return;
    s.players[d.player].balance -= d.amount;
    if (d.creditor !== null) s.players[d.creditor].balance += d.credit;
    s.debt = null;
    log(s, `${s.players[d.player].name} paid £${d.amount}: ${d.reason}.`);
    afterPayment(s, d.player, d.after, env);
  }
  function payEach(s, p, recipients, env) {
    if (!recipients.length || s.phase === "over") return;
    const [creditor, ...remaining] = recipients;
    s.debt = {
      player: p,
      amount: 25,
      creditor,
      credit: 25,
      reason: "Doudi ten: £25 to " + s.players[creditor].name,
      after: { type: "payEach", remaining },
    };
    settle(s, env);
    if (s.debt && !own(s, p).length) bankrupt(s, p);
  }
  function charge(s, p, base, creditor, reason, env, after = null) {
    const due = cost(s, base, p);
    // Store final amounts. Debt settlement never applies a second discount.
    s.debt = {
      player: p,
      amount: due,
      creditor,
      credit: creditor === null ? 0 : income(s, base, creditor),
      reason,
      after,
    };
    settle(s, env);
    if (s.debt) {
      log(
        s,
        `${s.players[p].name} must raise £${Math.max(0, due - s.players[p].balance)} for ${reason}.`,
      );
      if (!own(s, p).length && s.players[p].balance < due) bankrupt(s, p);
    }
  }
  function draw(s, deck, rng) {
    if (!s.decks[deck].length) {
      s.decks[deck] = CARDS[deck].map((_, i) => i);
      for (let i = s.decks[deck].length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [s.decks[deck][i], s.decks[deck][j]] = [
          s.decks[deck][j],
          s.decks[deck][i],
        ];
      }
    }
    s.pending = {
      type: "card",
      player: s.currentPlayer,
      deck,
      card: s.decks[deck].shift(),
    };
  }
  function landing(s, p, env) {
    const player = s.players[p],
      i = player.position,
      space = spaces[i];
    log(s, `${player.name} landed on ${space.name}.`);
    if (space.price) {
      const owner = s.owned[i];
      if (owner === undefined) s.pending = { type: "buy", player: p, index: i };
      else if (
        owner !== p &&
        !(s.mode === "teams" && player.team === s.players[owner].team)
      )
        charge(
          s,
          p,
          rent(s, i, s.dice[0] + s.dice[1]),
          owner,
          `rent for ${space.name}`,
          env,
        );
    } else if (space.type === "tax")
      charge(s, p, i === 4 ? 200 : 100, null, space.name, env);
    else if (space.type === "chance" || space.type === "chest")
      draw(s, space.type, env.rng);
    else if (i === 33) jail(s, p);
    else if (i === 22 && s.mode !== "classic") {
      s.doudiPlayer = p;
      s.doudiTurnsLeft = 3;
      s.doudiClaimedTurn = s.turnNumber;
      log(s, `${player.name} is Doudi for their next three completed turns.`);
    } else if (space.type === "doudi" && s.mode !== "classic")
      s.pending = { type: "doudi", player: p };
  }
  function move(s, p, steps, env, backwards = false) {
    const player = s.players[p],
      path = [];
    for (let n = 0; n < steps; n++) {
      player.position =
        (player.position + (backwards ? -1 : 1) + spaces.length) %
        spaces.length;
      path.push(player.position);
      if (!backwards && player.position === 0) {
        const amount = income(s, 200, p);
        player.balance += amount;
        log(s, `${player.name} passed START and collected £${amount}.`);
      }
    }
    log(s, `${player.name} moved ${steps} spaces.`, {
      type: "move",
      player: p,
      path,
    });
    landing(s, p, env);
  }
  function advance(s, p, destination, env) {
    const steps =
      (destination - s.players[p].position + spaces.length) % spaces.length;
    if (!steps && destination === 0) {
      s.players[p].balance += income(s, 200, p);
      landing(s, p, env);
    } else move(s, p, steps, env);
  }
  function applyCard(s, env) {
    const { player: p, deck, card: index } = s.pending,
      card = CARDS[deck][index];
    s.pending = null;
    log(s, `${s.players[p].name}: ${card.title} — ${card.text}`);
    if (card.amount > 0) s.players[p].balance += income(s, card.amount, p);
    else if (card.amount < 0) charge(s, p, -card.amount, null, card.title, env);
    else if (card.jail) jail(s, p);
    else if (card.release) s.players[p].releaseCards++;
    else if (card.repairs) {
      const base = own(s, p).reduce(
        (sum, i) =>
          sum +
          ((s.buildings[i] || 0) === 5
            ? card.repairs[1]
            : (s.buildings[i] || 0) * card.repairs[0]),
        0,
      );
      charge(s, p, base, null, card.title, env);
    } else if (card.back) move(s, p, card.back, env, true);
    else if (card.destination !== undefined)
      advance(s, p, card.destination, env);
    else if (card.nearest) {
      let i = s.players[p].position;
      do {
        i = (i + 1) % spaces.length;
      } while (
        spaces[i].group !== card.nearest &&
        spaces[i].type !== card.nearest
      );
      advance(s, p, i, env);
    }
  }
  function auction(s, index) {
    s.pending = {
      type: "auction",
      index,
      player: s.currentPlayer,
      bidder: s.currentPlayer,
      highBid: 0,
      highBidder: null,
      passed: [],
    };
    log(s, `Auction opened for ${spaces[index].name}. Minimum raise: £10.`);
  }
  function progressAuction(s) {
    const a = s.pending;
    const eligible = s.players
      .map((p, i) =>
        !p.bankrupt && !a.passed.includes(i) && i !== a.highBidder ? i : -1,
      )
      .filter((i) => i >= 0);
    if (!eligible.length) {
      if (a.highBidder !== null) {
        s.players[a.highBidder].balance -= a.highBid;
        s.owned[a.index] = a.highBidder;
        log(
          s,
          `${s.players[a.highBidder].name} won ${spaces[a.index].name} for £${a.highBid}.`,
        );
      } else log(s, `${spaces[a.index].name} remains with the bank.`);
      s.pending = null;
      return;
    }
    for (let offset = 1; offset <= s.players.length; offset++) {
      const i = (a.bidder + offset) % s.players.length;
      if (eligible.includes(i)) {
        a.bidder = i;
        break;
      }
    }
  }
  function mayManage(s, p) {
    return (
      s.phase === "playing" &&
      s.currentPlayer === p &&
      !s.trade &&
      (!s.pending || s.debt)
    );
  }
  function mortgage(s, p, i, env) {
    requireRule(
      mayManage(s, p) && s.owned[i] === p,
      "Manage only your own properties during your turn.",
    );
    requireRule(
      !group(i).some((n) => s.buildings[n]),
      "Sell every building in this colour set before mortgaging.",
    );
    const principal = Math.floor(spaces[i].price / 2);
    if (s.mortgaged[i]) {
      requireRule(!s.debt, "Resolve the payment before unmortgaging.");
      const amount = Math.ceil(principal * 1.1);
      requireRule(
        s.players[p].balance >= amount,
        "Not enough cash to unmortgage.",
      );
      s.players[p].balance -= amount;
      delete s.mortgaged[i];
      log(
        s,
        `${s.players[p].name} unmortgaged ${spaces[i].name} for £${amount}.`,
      );
    } else {
      s.mortgaged[i] = true;
      s.players[p].balance += principal;
      log(
        s,
        `${s.players[p].name} mortgaged ${spaces[i].name} for £${principal}.`,
      );
    }
    settle(s, env);
  }
  function building(s, p, i, sell, env) {
    requireRule(
      mayManage(s, p) && s.owned[i] === p && RENT[i],
      "Buildings require a street you own and your turn.",
    );
    const set = group(i),
      level = s.buildings[i] || 0;
    if (sell) {
      requireRule(
        level > 0 && set.every((n) => (s.buildings[n] || 0) <= level),
        "Sell buildings evenly across the set.",
      );
      s.buildings[i] = level - 1;
      s.players[p].balance += buildCost(i) / 2;
    } else {
      requireRule(
        !s.debt &&
          level < 5 &&
          set.every((n) => s.owned[n] === p && !s.mortgaged[n]),
        "Own the entire unmortgaged set before building.",
      );
      requireRule(
        set.every((n) => (s.buildings[n] || 0) >= level),
        "Build evenly across the set.",
      );
      requireRule(
        s.players[p].balance >= buildCost(i),
        "Not enough cash to build.",
      );
      s.players[p].balance -= buildCost(i);
      s.buildings[i] = level + 1;
    }
    log(
      s,
      `${s.players[p].name} ${sell ? "sold a building on" : "developed"} ${spaces[i].name}.`,
    );
    settle(s, env);
  }
  function tradeValid(s, t) {
    requireRule(
      integer(t.from, 0, s.players.length - 1) &&
        integer(t.to, 0, s.players.length - 1) &&
        t.from !== t.to &&
        !s.players[t.to].bankrupt,
      "Choose another active player.",
    );
    for (const [key, owner] of [
      ["give", t.from],
      ["receive", t.to],
    ]) {
      requireRule(
        Array.isArray(t[key]) &&
          t[key].length <= 28 &&
          new Set(t[key]).size === t[key].length,
        "Invalid trade properties.",
      );
      t[key].forEach((i) =>
        requireRule(
          integer(i, 0, 43) &&
            s.owned[i] === owner &&
            !group(i).some((n) => s.buildings[n]),
          "Trade only owned properties with no buildings in their colour set.",
        ),
      );
    }
    requireRule(
      integer(t.giveCash, 0, 100000000) && integer(t.receiveCash, 0, 100000000),
      "Trade amounts must be non-negative whole pounds.",
    );
    requireRule(
      t.give.length + t.receive.length + t.giveCash + t.receiveCash > 0,
      "The trade is empty.",
    );
    requireRule(
      s.players[t.from].balance >= t.giveCash &&
        s.players[t.to].balance >= t.receiveCash,
      "A player cannot afford this offer.",
    );
  }
  function requiredActor(s) {
    if (s.trade) return s.trade.to;
    if (s.pending?.type === "auction") return s.pending.bidder;
    return s.currentPlayer;
  }
  function dispatch(input, actor, action, environment = {}) {
    const s = clone(input),
      env = {
        rng: environment.rng || Math.random,
        now: environment.now ?? Date.now(),
      };
    requireRule(action && typeof action.type === "string", "Invalid command.");
    requireRule(integer(actor, 0, s.players.length - 1), "Unknown player.");
    const player = s.players[actor];
    checkTime(s, env.now);
    if (s.phase === "over") {
      requireRule(input.phase !== "over", "This game has ended.");
      s.revision++;
      return s;
    }
    if (action.type === "chat") {
      requireRule(
        typeof action.text === "string" &&
          action.text.trim().length > 0 &&
          action.text.length <= 100,
        "Messages must be 1–100 characters.",
      );
      log(s, action.text.trim(), { type: "chat", player: actor });
    } else if (action.type === "addBot" || action.type === "join") {
      requireRule(actor === 0, "Only the host can add players.");
      addPlayer(s, action.name, action.type === "addBot");
    } else if (action.type === "team") {
      requireRule(
        s.phase === "lobby" &&
          s.mode === "teams" &&
          (actor === action.player || actor === 0) &&
          integer(action.player, 0, s.players.length - 1) &&
          integer(action.team, 0, 1),
        "Teams can be chosen before starting.",
      );
      s.players[action.player].team = action.team;
    } else if (action.type === "start") {
      requireRule(
        actor === 0 && s.phase === "lobby" && s.players.length >= 2,
        "The host can start once at least two players have joined.",
      );
      requireRule(
        s.mode !== "teams" || new Set(s.players.map((p) => p.team)).size === 2,
        "Both teams need a player.",
      );
      s.phase = "starting";
      log(s, "Roll once each to decide who starts. Ties follow joining order.");
    } else if (
      action.type === "tradeAccept" ||
      action.type === "tradeReject" ||
      action.type === "tradeCancel"
    ) {
      const t = s.trade;
      requireRule(
        t &&
          (action.type === "tradeCancel" ? actor === t.from : actor === t.to),
        "This trade is not awaiting your response.",
      );
      if (action.type === "tradeAccept") {
        tradeValid(s, t);
        s.players[t.from].balance += t.receiveCash - t.giveCash;
        s.players[t.to].balance += t.giveCash - t.receiveCash;
        t.give.forEach((i) => {
          s.owned[i] = t.to;
        });
        t.receive.forEach((i) => {
          s.owned[i] = t.from;
        });
        log(
          s,
          `${s.players[t.from].name} and ${s.players[t.to].name} accepted a trade. Mortgages remain attached.`,
        );
      } else log(s, "The trade offer was closed.");
      s.trade = null;
      settle(s, env);
    } else if (action.type === "bid" || action.type === "passBid") {
      const a = s.pending;
      requireRule(
        a?.type === "auction" && a.bidder === actor,
        "Wait for your auction bid.",
      );
      if (action.type === "bid") {
        requireRule(
          integer(action.amount, a.highBid + 10, player.balance),
          "Bid at least £10 above the current bid, within your cash balance.",
        );
        a.highBid = action.amount;
        a.highBidder = actor;
        log(s, `${player.name} bid £${action.amount}.`);
      } else a.passed.push(actor);
      progressAuction(s);
    } else {
      requireRule(
        actor === s.currentPlayer && !s.trade,
        "Wait for your turn or the trade response.",
      );
      if (action.type === "roll") {
        requireRule(
          (s.phase === "starting" || s.phase === "playing") &&
            !s.pending &&
            !s.debt &&
            (!s.turnHasRolled || s.extraRoll),
          "Finish the current action before rolling.",
        );
        s.dice = dicePair(env.rng);
        const total = s.dice[0] + s.dice[1],
          doubles = s.dice[0] === s.dice[1];
        log(s, `${player.name} rolled ${s.dice[0]} + ${s.dice[1]}.`, {
          type: "dice",
          player: actor,
        });
        if (s.phase === "starting") {
          requireRule(
            s.startRolls[actor] === undefined,
            "You already made a starting roll.",
          );
          s.startRolls[actor] = total;
          const next = s.players.findIndex(
            (_, i) => s.startRolls[i] === undefined,
          );
          if (next >= 0) s.currentPlayer = next;
          else {
            s.currentPlayer = s.players.findIndex(
              (_, i) =>
                s.startRolls[i] === Math.max(...Object.values(s.startRolls)),
            );
            s.phase = "playing";
            s.startedAt = env.now;
            if (s.mode === "timed")
              s.endsAt = env.now + s.durationMinutes * 60000;
            log(
              s,
              `${s.players[s.currentPlayer].name} starts. Play follows joining order.`,
            );
          }
        } else {
          s.turnHasRolled = true;
          s.extraRoll = false;
          if (player.jailed) {
            if (doubles) {
              player.jailed = false;
              player.jailTurns = 0;
              move(s, actor, total, env);
            } else if (++player.jailTurns >= 3)
              charge(s, actor, 50, null, "Jail release", env, {
                type: "jailMove",
                steps: total,
              });
            else
              log(
                s,
                `${player.name} stays in Jail (${player.jailTurns}/3 attempts).`,
              );
          } else if (doubles && ++s.doubles >= 3) jail(s, actor);
          else {
            s.extraRoll = doubles;
            move(s, actor, total, env);
          }
        }
      } else if (action.type === "end") {
        requireRule(
          s.phase === "playing" &&
            s.turnHasRolled &&
            !s.pending &&
            !s.debt &&
            !s.extraRoll,
          "Complete all rolls and landing actions before ending the turn.",
        );
        if (
          s.doudiPlayer === actor &&
          s.doudiClaimedTurn !== s.turnNumber &&
          --s.doudiTurnsLeft <= 0
        ) {
          s.doudiPlayer = null;
          s.doudiTurnsLeft = 0;
        }
        s.turnNumber++;
        s.currentPlayer = (actor + 1) % s.players.length;
        s.turnHasRolled = false;
        s.doubles = 0;
        if (s.mode === "quick" && s.turnNumber >= s.players.length * 20)
          finish(s, "Twenty rounds completed. The highest final score wins.");
        else log(s, `${s.players[s.currentPlayer].name}’s turn begins.`);
      } else if (action.type === "buy" || action.type === "decline") {
        requireRule(
          s.pending?.type === "buy" && !s.debt,
          "There is no purchase to resolve.",
        );
        const i = s.pending.index;
        if (action.type === "buy") {
          requireRule(
            player.balance >= spaces[i].price && s.owned[i] === undefined,
            "This property is unavailable or unaffordable.",
          );
          player.balance -= spaces[i].price;
          s.owned[i] = actor;
          s.pending = null;
          log(
            s,
            `${player.name} bought ${spaces[i].name} for £${spaces[i].price}.`,
          );
        } else auction(s, i);
      } else if (action.type === "card") {
        requireRule(
          s.pending?.type === "card" && !s.debt,
          "There is no card to resolve.",
        );
        applyCard(s, env);
      } else if (action.type === "doudiRoll") {
        requireRule(
          s.pending?.type === "doudi",
          "There is no Doudi choice to resolve.",
        );
        s.dice = dicePair(env.rng);
        const total = s.dice[0] + s.dice[1];
        s.pending = null;
        log(s, `${player.name} rolled ${total} on the Doudi space.`);
        if (total <= 4) charge(s, actor, 100, null, "Doudi roll", env);
        else if (total <= 9) player.balance += income(s, 100, actor);
        else if (total === 10)
          payEach(
            s,
            actor,
            s.players.map((_, i) => i).filter((i) => i !== actor),
            env,
          );
        else if (total >= 11)
          s.pending = { type: "destination", player: actor };
      } else if (action.type === "travel") {
        requireRule(
          ["doudi", "destination"].includes(s.pending?.type) &&
            integer(action.index, 0, 43),
          "Choose a valid Doudi destination.",
        );
        if (s.pending.type === "doudi")
          requireRule(
            s.owned[action.index] === actor &&
              side(action.index) === side(player.position),
            "Choose your own property on this side.",
          );
        player.position = action.index;
        s.pending = null;
        log(
          s,
          `${player.name} travelled to ${spaces[action.index].name}; travel does not trigger landing effects.`,
          { type: "teleport", player: actor },
        );
      } else if (action.type === "mortgage")
        mortgage(s, actor, action.index, env);
      else if (action.type === "build" || action.type === "sellBuilding")
        building(s, actor, action.index, action.type === "sellBuilding", env);
      else if (action.type === "trade") {
        requireRule(
          mayManage(s, actor),
          "Resolve the landing action before trading.",
        );
        const t = {
          from: actor,
          to: action.to,
          give: action.give,
          receive: action.receive,
          giveCash: action.giveCash,
          receiveCash: action.receiveCash,
        };
        tradeValid(s, t);
        s.trade = t;
        if (player.bot) s.botTradeTurn = s.turnNumber;
        log(s, `${player.name} offered a trade to ${s.players[t.to].name}.`);
      } else if (action.type === "bankrupt") bankrupt(s, actor);
      else if (action.type === "jailPay" || action.type === "jailCard") {
        requireRule(
          s.phase === "playing" &&
            player.jailed &&
            !s.turnHasRolled &&
            !s.pending &&
            !s.debt,
          "Choose a Jail option before rolling.",
        );
        if (action.type === "jailCard") {
          requireRule(player.releaseCards > 0, "No release card available.");
          player.releaseCards--;
          player.jailed = false;
          player.jailTurns = 0;
        } else
          charge(s, actor, 50, null, "Jail release", env, { type: "release" });
      } else throw new Error("Unknown command.");
    }
    s.revision++;
    return s;
  }
  function botAction(s) {
    const p = requiredActor(s),
      player = s.players[p];
    if (!player?.bot || !["starting", "playing"].includes(s.phase)) return null;
    if (s.trade) {
      const t = s.trade;
      const value = (list) =>
        list.reduce(
          (sum, i) =>
            sum +
            spaces[i].price -
            (s.mortgaged[i] ? Math.floor(spaces[i].price / 2) : 0),
          0,
        );
      return {
        actor: p,
        action: {
          type:
            value(t.give) + t.giveCash >= value(t.receive) + t.receiveCash
              ? "tradeAccept"
              : "tradeReject",
        },
      };
    }
    if (s.debt) {
      const developed = own(s, p)
        .filter((i) => s.buildings[i])
        .sort((a, b) => s.buildings[b] - s.buildings[a]);
      if (developed.length)
        return {
          actor: p,
          action: { type: "sellBuilding", index: developed[0] },
        };
      const i = own(s, p).find((i) => !s.mortgaged[i]);
      return {
        actor: p,
        action:
          i !== undefined
            ? { type: "mortgage", index: i }
            : { type: "bankrupt" },
      };
    }
    const reserve =
      s.botDifficulty === "easy" ? 0 : s.botDifficulty === "hard" ? 250 : 120;
    const a = s.pending;
    if (a?.type === "auction")
      return {
        actor: p,
        action:
          a.highBid + 10 <=
          Math.min(
            Math.max(0, player.balance - reserve),
            spaces[a.index].price *
              (s.botDifficulty === "hard" &&
              group(a.index).some((i) => s.owned[i] === p)
                ? 1.3
                : 1),
          )
            ? { type: "bid", amount: a.highBid + 10 }
            : { type: "passBid" },
      };
    if (a?.type === "buy")
      return {
        actor: p,
        action: {
          type:
            player.balance >=
            spaces[a.index].price +
              (group(a.index).some((i) => s.owned[i] === p) ? 0 : reserve)
              ? "buy"
              : "decline",
        },
      };
    if (a?.type === "card") return { actor: p, action: { type: "card" } };
    if (a?.type === "doudi") {
      const i = own(s, p).find((i) => side(i) === side(player.position));
      return {
        actor: p,
        action:
          i !== undefined
            ? { type: "travel", index: i }
            : { type: "doudiRoll" },
      };
    }
    if (a?.type === "destination")
      return { actor: p, action: { type: "travel", index: 0 } };
    if (player.jailed && !s.turnHasRolled && player.releaseCards)
      return { actor: p, action: { type: "jailCard" } };
    if (s.phase === "playing" && s.turnHasRolled && !s.extraRoll) {
      if (s.botDifficulty !== "easy" && s.botTradeTurn !== s.turnNumber) {
        const target = spaces.findIndex(
          (space, i) =>
            RENT[i] &&
            s.owned[i] !== undefined &&
            s.owned[i] !== p &&
            !s.mortgaged[i] &&
            group(i).every(
              (n) => !s.buildings[n] && (n === i || s.owned[n] === p),
            ) &&
            player.balance >= Math.ceil(space.price * 1.25) + reserve,
        );
        if (target >= 0)
          return {
            actor: p,
            action: {
              type: "trade",
              to: s.owned[target],
              give: [],
              receive: [target],
              giveCash: Math.ceil(spaces[target].price * 1.25),
              receiveCash: 0,
            },
          };
      }
      const i = own(s, p).find(
        (i) =>
          RENT[i] &&
          (s.buildings[i] || 0) < 5 &&
          player.balance >=
            buildCost(i) + (s.botDifficulty === "easy" ? 350 : reserve) &&
          group(i).every(
            (n) =>
              s.owned[n] === p &&
              !s.mortgaged[n] &&
              (s.buildings[n] || 0) >= (s.buildings[i] || 0),
          ),
      );
      if (i !== undefined)
        return { actor: p, action: { type: "build", index: i } };
      return { actor: p, action: { type: "end" } };
    }
    return { actor: p, action: { type: "roll" } };
  }
  function tick(input, now = Date.now()) {
    const s = clone(input);
    checkTime(s, now);
    if (s.phase !== input.phase) s.revision++;
    return s;
  }

  // Import only an explicit schema; imported strings never become executable UI.
  function validate(s) {
    if (s && s.botDifficulty === undefined)
      s = { ...s, botDifficulty: "normal", botTradeTurn: -1 };
    requireRule(
      ["easy", "normal", "hard"].includes(s?.botDifficulty) &&
        integer(s.botTradeTurn, -1, 100000000),
      "Invalid practice difficulty.",
    );
    // Older saves used the adjacent Doudi cells as three board corners.
    if (s?.version === 2 && s.boardLayout === undefined) {
      s = clone(s);
      const remap = (i) =>
        ({ 10: 11, 11: 10, 21: 22, 22: 21, 32: 33, 33: 32 })[i] ?? i;
      if (Array.isArray(s.players))
        s.players.forEach((p) => {
          if (p) p.position = remap(p.position);
        });
      if (Array.isArray(s.events))
        s.events.forEach((e) => {
          if (Array.isArray(e?.path)) e.path = e.path.map(remap);
        });
      s.boardLayout = 2;
    }
    requireRule(s?.boardLayout === 2, "Unsupported board layout.");
    requireRule(
      s && s.version === 2 && MODES.includes(s.mode),
      "Unsupported save version or mode.",
    );
    requireRule(
      typeof s.code === "string" &&
        s.code.length <= 6 &&
        typeof s.title === "string" &&
        s.title.length <= 28,
      "Invalid room details.",
    );
    requireRule(
      Array.isArray(s.players) &&
        s.players.length >= 1 &&
        s.players.length <= 6,
      "Invalid players.",
    );
    s.players.forEach((p) => {
      requireRule(
        p &&
          typeof p.name === "string" &&
          p.name.trim().length > 0 &&
          p.name.length <= 18 &&
          /^#[0-9a-f]{6}$/i.test(p.color),
        "Invalid player name or colour.",
      );
      requireRule(
        integer(p.balance, 0, 100000000) &&
          integer(p.position, 0, 43) &&
          integer(p.jailTurns, 0, 3) &&
          integer(p.releaseCards, 0, 100000) &&
          integer(p.team, 0, 1),
        "Invalid player values.",
      );
      for (const key of ["bot", "bankrupt", "jailed"])
        requireRule(typeof p[key] === "boolean", "Invalid player flags.");
    });
    const playerIndex = (n) => integer(n, 0, s.players.length - 1);
    requireRule(
      ["lobby", "starting", "playing", "over"].includes(s.phase) &&
        playerIndex(s.currentPlayer),
      "Invalid turn.",
    );
    for (const key of ["turnHasRolled", "extraRoll"])
      requireRule(typeof s[key] === "boolean", "Invalid turn flags.");
    for (const [key, max] of [
      ["turnNumber", 100000000],
      ["doubles", 3],
      ["revision", 100000000],
      ["eventId", 100000000],
      ["doudiTurnsLeft", 3],
    ])
      requireRule(integer(s[key], 0, max), "Invalid turn counter.");
    requireRule(
      integer(s.doudiClaimedTurn, -1, s.turnNumber) &&
        (s.doudiPlayer === null || playerIndex(s.doudiPlayer)),
      "Invalid Doudi state.",
    );
    requireRule(
      (s.doudiPlayer === null) === (s.doudiTurnsLeft === 0),
      "Inconsistent Doudi duration.",
    );
    requireRule(
      Array.isArray(s.dice) &&
        s.dice.length === 2 &&
        s.dice.every((n) => integer(n, 0, 6)),
      "Invalid dice.",
    );
    const record = (value) =>
      value && typeof value === "object" && !Array.isArray(value);
    for (const key of ["owned", "mortgaged", "buildings", "startRolls"])
      requireRule(record(s[key]), "Invalid property or roll data.");
    for (const [key, owner] of Object.entries(s.owned))
      requireRule(
        String(Number(key)) === key &&
          spaces[Number(key)]?.price &&
          playerIndex(owner),
        "Invalid property owner.",
      );
    for (const [key, value] of Object.entries(s.mortgaged))
      requireRule(
        s.owned[key] !== undefined && value === true,
        "Invalid mortgage.",
      );
    for (const [key, level] of Object.entries(s.buildings)) {
      requireRule(
        RENT[key] && s.owned[key] !== undefined && integer(level, 0, 5),
        "Invalid buildings.",
      );
      if (level)
        requireRule(
          group(Number(key)).every(
            (i) =>
              s.owned[i] === s.owned[key] &&
              !s.mortgaged[i] &&
              Math.abs((s.buildings[i] || 0) - level) <= 1,
          ),
          "Inconsistent building set.",
        );
    }
    for (const [key, value] of Object.entries(s.startRolls))
      requireRule(
        String(Number(key)) === key &&
          playerIndex(Number(key)) &&
          integer(value, 2, 12),
        "Invalid starting roll.",
      );
    if (s.phase === "starting")
      requireRule(
        s.startRolls[s.currentPlayer] === undefined,
        "Starting player has already rolled.",
      );
    requireRule(
      integer(s.durationMinutes, 5, 180) &&
        (s.startedAt === null ||
          integer(s.startedAt, 0, Number.MAX_SAFE_INTEGER)) &&
        (s.endsAt === null || integer(s.endsAt, 0, Number.MAX_SAFE_INTEGER)),
      "Invalid game timer.",
    );
    requireRule(
      record(s.decks) &&
        ["chance", "chest"].every(
          (d) =>
            Array.isArray(s.decks[d]) &&
            new Set(s.decks[d]).size === s.decks[d].length &&
            s.decks[d].every((i) => integer(i, 0, 15)),
        ),
      "Invalid card deck.",
    );
    requireRule(
      typeof s.reason === "string" && s.reason.length <= 500,
      "Invalid game result.",
    );
    if (s.pending !== null) {
      const a = s.pending;
      requireRule(
        record(a) &&
          ["buy", "card", "doudi", "destination", "auction"].includes(a.type) &&
          a.player === s.currentPlayer &&
          s.phase === "playing" &&
          s.turnHasRolled,
        "Invalid pending action.",
      );
      if (["buy", "auction"].includes(a.type))
        requireRule(
          integer(a.index, 0, 43) &&
            spaces[a.index].price &&
            s.owned[a.index] === undefined,
          "Invalid pending property.",
        );
      if (a.type === "card")
        requireRule(
          ["chance", "chest"].includes(a.deck) && integer(a.card, 0, 15),
          "Invalid pending card.",
        );
      if (a.type === "auction")
        requireRule(
          playerIndex(a.bidder) &&
            Array.isArray(a.passed) &&
            a.passed.every(playerIndex) &&
            new Set(a.passed).size === a.passed.length &&
            !a.passed.includes(a.bidder) &&
            a.bidder !== a.highBidder &&
            integer(a.highBid, 0, 100000000) &&
            (a.highBidder === null
              ? a.highBid === 0
              : playerIndex(a.highBidder) &&
                a.highBid >= 10 &&
                s.players[a.highBidder].balance >= a.highBid),
          "Invalid auction.",
        );
    }
    if (s.debt !== null) {
      const d = s.debt;
      requireRule(
        record(d) &&
          s.phase === "playing" &&
          d.player === s.currentPlayer &&
          integer(d.amount, 1, 100000000) &&
          integer(d.credit, 0, 100000000) &&
          (d.creditor === null ||
            (playerIndex(d.creditor) && d.creditor !== d.player)) &&
          typeof d.reason === "string" &&
          d.reason.length <= 500 &&
          !s.pending,
        "Invalid debt.",
      );
      requireRule(
        d.after === null ||
          (record(d.after) &&
            ["release", "jailMove", "payEach"].includes(d.after.type) &&
            (d.after.type !== "payEach" ||
              (Array.isArray(d.after.remaining) &&
                d.after.remaining.length <= 5 &&
                new Set(d.after.remaining).size === d.after.remaining.length &&
                d.after.remaining.every(
                  (p) => playerIndex(p) && p !== d.player && p !== d.creditor,
                ))) &&
            (d.after.type !== "jailMove" || integer(d.after.steps, 2, 12))),
        "Invalid debt continuation.",
      );
    }
    if (s.trade !== null) {
      requireRule(
        s.phase === "playing" && !s.pending && s.trade.from === s.currentPlayer,
        "Invalid pending trade.",
      );
      tradeValid(s, s.trade);
    }
    requireRule(
      Array.isArray(s.events) &&
        s.events.length <= 250 &&
        s.events.every(
          (e) =>
            e &&
            integer(e.id, 1, s.eventId) &&
            typeof e.text === "string" &&
            e.text.length <= 1000,
        ),
      "Invalid event history.",
    );
    s.events.forEach((e) => {
      if (e.type !== undefined)
        requireRule(
          ["chat", "dice", "move", "teleport"].includes(e.type) &&
            playerIndex(e.player),
          "Invalid event type.",
        );
      if (e.type === "move")
        requireRule(
          Array.isArray(e.path) &&
            e.path.length <= 44 &&
            e.path.every((i) => integer(i, 0, 43)),
          "Invalid movement history.",
        );
    });
    requireRule(
      s.phase === "over" || !s.players.some((p) => p.bankrupt),
      "A bankrupt player requires an ended game.",
    );
    requireRule(
      s.phase !== "over" || (!s.pending && !s.debt && !s.trade),
      "Ended games cannot have pending actions.",
    );
    return clone(s);
  }
  function migrate(old) {
    requireRule(
      old &&
        old.format === "Doudiopoly save" &&
        old.version === 1 &&
        Array.isArray(old.players) &&
        old.players.length >= 1 &&
        old.players.length <= 6 &&
        old.room &&
        old.game,
      "Invalid legacy save.",
    );
    const g = old.game,
      t = old.turn || {},
      s = create({
        name: old.players[0].name,
        code: old.room.code || "LOCAL",
        title: old.room.title || "Doudi room",
      });
    s.players = old.players.map((p, i) => ({
      name: p.name,
      color: p.color || playerColors[i],
      balance: p.balance,
      position: p.position,
      bot: i > 0,
      bankrupt: !!p.bankrupt,
      jailed: false,
      jailTurns: 0,
      releaseCards: 0,
      team: i % 2,
    }));
    requireRule(
      integer(g.balance, 0, 100000000) && integer(g.position, 0, 43),
      "Invalid legacy board data.",
    );
    s.players[0].balance = g.balance;
    s.players[0].position = g.position;
    s.owned = g.owned || {};
    s.mortgaged = g.mortgaged || {};
    s.currentPlayer = t.currentPlayer ?? 0;
    s.phase = g.over ? "over" : t.phase === "playing" ? "playing" : "starting";
    s.startRolls = t.startRolls || {};
    s.turnHasRolled = !!t.turnHasRolled;
    s.doudiPlayer = g.doudiPlayer ?? null;
    s.doudiTurnsLeft = g.doudiTurnsLeft || 0;
    s.doudiClaimedTurn = g.doudiClaimedThisTurn ? 0 : -1;
    if (s.doudiTurnsLeft === 0) s.doudiPlayer = null;
    if (g.debt && !g.over) {
      const d = g.debt,
        creditor = d.type === "rent" ? d.owner : null;
      requireRule(["bank", "rent"].includes(d.type), "Invalid legacy debt.");
      const amount = d.cardPending ? cost(s, d.amount, 0) : d.amount;
      s.debt = {
        player: 0,
        amount,
        creditor,
        credit:
          creditor === null ? 0 : income(s, rent(s, d.propertyIndex), creditor),
        reason: String(d.reason || "Outstanding payment"),
        after: null,
      };
    } else if (t.actionPending && !g.over) {
      s.turnHasRolled = true;
      if (g.pendingDoudi)
        s.pending = { type: "doudi", player: s.currentPlayer };
      else if (spaces[g.position]?.price && s.owned[g.position] === undefined)
        s.pending = { type: "buy", player: s.currentPlayer, index: g.position };
      // Old card rewards were already applied before acknowledgement. Do not apply twice.
    }
    s.reason = g.over ? "Loaded completed game." : "";
    log(
      s,
      "Imported a version 1 save. Legacy cards already paid are not applied twice.",
    );
    delete s.boardLayout;
    return validate(s);
  }
  function parseSave(text) {
    requireRule(
      typeof text === "string" && text.length <= 1000000,
      "Save file is too large.",
    );
    const marker = "[DOUDIOPOLY_JSON]",
      pos = text.indexOf(marker);
    let parsed;
    try {
      parsed = JSON.parse(pos < 0 ? text : text.slice(pos + marker.length));
    } catch {
      throw new Error("The save does not contain valid JSON.");
    }
    if (parsed?.version === 1) return migrate(parsed);
    requireRule(
      parsed?.format === "Doudiopoly save" && parsed.version === 2,
      "Invalid Doudiopoly save.",
    );
    return validate(parsed.state);
  }
  function saveText(s) {
    const lines = [
      "DOUDIOPOLY SAVE FILE",
      "Version: 2",
      `Room: ${s.title} (${s.code})`,
      `Mode: ${s.mode}`,
      `Turn: ${s.players[s.currentPlayer].name}`,
      "",
      "[PLAYERS]",
      ...s.players.map(
        (p, i) =>
          `${p.name} | cash=${p.balance} | position=${p.position} | netWorth=${netWorth(s, i)} | token=${data.tokenTypes[i]}`,
      ),
      "",
      "[PROPERTIES]",
      ...Object.keys(s.owned)
        .map(Number)
        .map(
          (i) =>
            `${spaces[i].name} | owner=${s.players[s.owned[i]].name} | mortgaged=${!!s.mortgaged[i]} | buildings=${s.buildings[i] || 0}`,
        ),
      "",
      "The JSON block below is authoritative. Editing the ledger above does not change the save.",
      "",
      "[DOUDIOPOLY_JSON]",
      JSON.stringify(
        {
          format: "Doudiopoly save",
          version: 2,
          savedAt: new Date().toISOString(),
          state: s,
        },
        null,
        2,
      ),
    ];
    return lines.join("\n");
  }
  return {
    create,
    dispatch,
    botAction,
    requiredActor,
    tick,
    validate,
    parseSave,
    saveText,
    netWorth,
    netWorthBreakdown,
    finalScore,
    rent,
    own,
    side,
    isDoudi,
    buildCost,
    CARDS,
    MODES,
    clone,
  };
});
