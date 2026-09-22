"use strict";

const E = DoudiEngine;
const { spaces, colors, groupLabels, tokenTypes } = DoudiData;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => `£${Number(n).toLocaleString("en-GB")}`;
const modeNames = {
  doudi: "Doudi",
  classic: "Classic",
  quick: "Quick",
  timed: "Timed",
  teams: "Teams",
};
let game = null,
  me = 0,
  connection = null,
  roomAction = "create";
let generation = 0,
  botTimer = null,
  toastTimer = null,
  clockTimer = null,
  streamController = null;
let busy = false,
  sending = false,
  connected = true,
  modalKey = "",
  lastFocus = null,
  sound = false,
  darkMode = false,
  audioContext;
const viewPositions = new Map(),
  uiTimers = new Map();
let inbox = Promise.resolve();

function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").classList.remove("show");
    $("#toast").textContent = "";
  }, 3500);
}
function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      uiTimers.delete(timer);
      resolve();
    }, ms);
    uiTimers.set(timer, resolve);
  });
}
function stopSession() {
  generation++;
  clearTimeout(toastTimer);
  $("#toast").classList.remove("show");
  $("#toast").textContent = "";
  clearTimeout(botTimer);
  clearInterval(clockTimer);
  streamController?.abort();
  for (const [timer, resolve] of uiTimers) {
    clearTimeout(timer);
    resolve();
  }
  uiTimers.clear();
  viewPositions.clear();
  inbox = Promise.resolve();
  busy = false;
  sending = false;
  connected = true;
  connection = null;
  modalKey = "";
  closeModal();
}
function applyTheme(dark) {
  darkMode = dark;
  if (document.documentElement) {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  for (const button of [$("#themeToggle"), $("#themeToggleLobby")]) {
    if (!button) continue;
    button.textContent = dark ? "Light mode" : "Dark mode";
    button.setAttribute("aria-pressed", String(dark));
  }
  try {
    localStorage.setItem("doudi-theme", dark ? "dark" : "light");
  } catch {
    /* Storage is optional. */
  }
}
function loadTheme() {
  try {
    return localStorage.getItem("doudi-theme") === "dark";
  } catch {
    return false;
  }
}
function toggleTheme() {
  applyTheme(!darkMode);
}
function beep() {
  if (!sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain();
    oscillator.frequency.value = 440;
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.12,
    );
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch {
    /* Sound is optional. */
  }
}
function random() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return n[0] / 4294967296;
}
function showGame() {
  $("#lobbyView").classList.add("hidden");
  $("#gameView").classList.remove("hidden");
  render();
  clockTimer = setInterval(updateClock, 1000);
}
function localGame(state) {
  stopSession();
  game = state;
  me = 0;
  autosave();
  showGame();
  showPending();
  scheduleBot();
}
function updateClock() {
  if (!game) return;
  if (!connection && !busy && !sending) {
    const next = E.tick(game);
    if (next.revision !== game.revision) {
      game = next;
      autosave();
      render();
      showPending();
    }
  }
  let label = `${modeNames[game.mode]} · ${game.phase === "lobby" ? "Waiting for players" : game.phase === "over" ? "Finished" : "First bankruptcy ends the game"}`;
  if (game.mode === "quick")
    label += ` · Round ${Math.min(20, Math.floor(game.turnNumber / game.players.length) + 1)}/20`;
  if (game.endsAt && game.phase === "playing") {
    const remaining = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
    label += ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`;
  }
  $("#gameModeLabel").textContent = label;
}
function myTurn() {
  return game && game.currentPlayer === me && game.phase !== "over";
}
function canManage() {
  return (
    game?.phase === "playing" &&
    myTurn() &&
    !game.trade &&
    !game.pending &&
    !busy &&
    !sending &&
    connected
  );
}
function render() {
  if (!game) return;
  $("#turnGuide").textContent = !connected
    ? "Reconnecting — your game is safe."
    : busy
      ? "Your move is being played…"
      : game.phase === "lobby"
        ? "Add practice players, then start the game."
        : game.phase === "over"
          ? "Game finished — view the final results."
          : E.requiredActor(game) !== me
            ? "Waiting for " + game.players[E.requiredActor(game)].name + "."
            : game.debt
              ? "Raise money using your properties, then settle the payment."
              : game.trade
                ? "Review the trade offer and choose your response."
                : game.pending
                  ? "Resolve the highlighted action. Use Continue action if you closed it."
                  : game.phase === "starting"
                    ? "Roll once to decide who starts."
                    : game.extraRoll
                      ? "You rolled doubles — roll again."
                      : game.turnHasRolled
                        ? "Finished? Press End turn to pass play on."
                        : "Roll both dice to move around the board.";
  $(".dice-result").classList.toggle("rolling-dice", busy);
  $("#roomCodeDisplay").textContent = game.code;
  $("#roomTitle").textContent = game.title;
  $("#connectionStatus").textContent = connection
    ? connected
      ? "Online"
      : "Reconnecting…"
    : "Practice on this device";
  $("#chatMode").textContent = connection ? "Online" : "Local";
  $("#copyInvite").disabled = !connection;
  $("#loadGame").disabled = !!connection;
  $("#loadGame").title = connection
    ? "Online snapshots can be loaded as practice games from the lobby."
    : "";
  $("#playerCount").textContent = `${game.players.length}/6`;
  $("#playersList").innerHTML = game.players
    .map(
      (p, i) =>
        `<div class="player-row ${i === game.currentPlayer ? "current" : ""} ${i === me ? "is-you" : ""}"><span class="avatar"><span class="mini-token token-${tokenTypes[i]}" style="--token-color:${p.color}"><span></span></span></span><div class="player-details"><strong>${escapeHtml(p.name)}${E.isDoudi(game, i) ? ' <span class="doudi-badge">👑 Doudi</span>' : ""}</strong><small>${p.bankrupt ? "Bankrupt" : p.jailed ? "In Jail" : game.phase === "starting" ? (game.startRolls[i] ?? "Needs a starting roll") : p.bot ? "Practice player" : i === me ? "You" : "Player"}${game.mode === "teams" ? ` · ${p.team ? "Blue" : "Coral"}` : ""}</small>${E.isDoudi(game, i) ? `<small class="doudi-status">${game.doudiTurnsLeft} turns remaining</small>` : ""}</div><span class="player-color-dot" style="--player-color:${p.color}"></span><span class="player-cash">${money(p.balance)}</span></div>`,
    )
    .join("");
  $("#cashBalance").textContent = money(game.players[me].balance);
  $("#turnPlayer").textContent =
    `${game.players[game.currentPlayer].name}${myTurn() ? " (you)" : ""}`;
  $("#dieOne").textContent = game.dice[0] || "?";
  $("#dieTwo").textContent = game.dice[1] || "?";
  $("#addBot").classList.toggle("hidden", game.phase !== "lobby" || me !== 0);
  $("#addBot").disabled = game.players.length >= 6 || sending || !connected;
  $("#startGame").classList.toggle(
    "hidden",
    game.phase !== "lobby" || me !== 0,
  );
  $("#startGame").disabled = game.players.length < 2 || sending || !connected;
  $("#teamChoice").classList.toggle(
    "hidden",
    game.mode !== "teams" || game.phase !== "lobby",
  );
  $("#myTeam").value = game.players[me].team;
  const blocked =
    busy ||
    sending ||
    !connected ||
    !!game.debt ||
    !!game.pending ||
    !!game.trade;
  $("#rollButton").disabled =
    !myTurn() ||
    (game.pending?.type === "doudiReady"
      ? busy || sending || !connected || !!game.debt || !!game.trade
      : blocked) ||
    !["starting", "playing"].includes(game.phase) ||
    (game.turnHasRolled &&
      !game.extraRoll &&
      game.pending?.type !== "doudiReady");
  $("#endTurn").disabled =
    !myTurn() ||
    blocked ||
    game.phase !== "playing" ||
    !game.turnHasRolled ||
    game.extraRoll;
  $("#rollButton").textContent =
    game.phase === "starting"
      ? "Roll to start"
      : game.extraRoll
        ? "Doubles — roll again"
        : "Roll dice";
  $("#moveLabel").textContent =
    game.phase === "starting" ? "STARTING ROLL" : "YOUR MOVE";
  $("#rollHint").textContent = busy
    ? "Moving…"
    : game.phase === "over"
      ? "Game over"
      : game.phase === "lobby"
        ? "Waiting to start"
        : !myTurn()
          ? `${game.players[game.currentPlayer].name}’s turn`
          : game.debt
            ? "Payment required"
            : game.pending || game.trade
              ? "Action required"
              : game.extraRoll
                ? "Roll your extra turn"
                : game.turnHasRolled
                  ? "Press End turn when ready"
                  : "Roll both dice";
  const actionable =
    !!game.debt || !!game.pending || !!game.trade || game.phase === "over";
  $("#resumeAction").classList.toggle("hidden", !actionable);
  $("#resumeAction").disabled = busy;
  $("#resumeAction").textContent =
    game.phase === "over" ? "View final ledger" : "Continue action";
  $("#jailControls").classList.toggle(
    "hidden",
    !myTurn() ||
      !game.players[me].jailed ||
      game.turnHasRolled ||
      game.phase !== "playing",
  );
  $("#jailPay").disabled = blocked;
  $("#jailPay").textContent =
    `Pay ${money(E.isDoudi(game, me) ? 25 : 50)} to leave Jail`;
  $("#jailCard").disabled = blocked || !game.players[me].releaseCards;
  $("#manageProperties").disabled = !canManage();
  $("#offerTrade").disabled = !canManage();
  $("#chatInput").disabled = !connected || game.phase === "over";
  const properties = E.own(game, me);
  $("#propertyCount").textContent = properties.length;
  const groups = {};
  for (const i of properties)
    (groups[spaces[i].group || "utility"] ||= []).push(i);
  $("#propertyList").innerHTML = properties.length
    ? Object.entries(groups)
        .map(
          ([g, list]) =>
            `<div class="property-set"><div class="property-set-heading"><i class="property-swatch" style="background:${colors[g]}"></i><strong>${groupLabels[g]}</strong><span>${list.length}</span></div>${list.map((i) => `<div class="property-item"><span class="property-name"><b>${escapeHtml(spaces[i].name)}</b>${game.mortgaged[i] ? '<em class="mortgage-badge">Mortgaged</em>' : ""}${game.buildings[i] ? `<small>${game.buildings[i] === 5 ? "Hotel" : `${game.buildings[i]} houses`}</small>` : ""}</span></div>`).join("")}</div>`,
        )
        .join("")
    : '<p class="empty-state">Buy a street and it will appear here.</p>';
  const ranking = game.players
    .map((p, i) => ({
      name: p.name,
      value: p.balance,
    }))
    .sort((a, b) => b.value - a.value);
  $("#leaderboard").innerHTML = ranking
    .map(
      (p) =>
        `<div><span>${escapeHtml(p.name)}</span><b>${money(p.value)}</b></div>`,
    )
    .join("");

  const events = game.events.filter((e) => e.type !== "chat");
  $("#historyCount").textContent = `${events.length} events`;
  const log = $("#eventLog"),
    atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = events.map((e) => `<li>${escapeHtml(e.text)}</li>`).join("");
  if (atBottom) log.scrollTop = log.scrollHeight;
  const chat = $("#chatMessages");
  chat.innerHTML =
    game.events
      .filter((e) => e.type === "chat")
      .map(
        (e) =>
          `<p><b>${escapeHtml(game.players[e.player].name)}</b> ${escapeHtml(e.text)}</p>`,
      )
      .join("") || "<p>Welcome to the table.</p>";
  chat.scrollTop = chat.scrollHeight;
  if (!busy)
    $("#statusMessage").textContent =
      events.at(-1)?.text || "Welcome to the table.";
  buildBoard();
  $("#gameModeLabel").textContent =
    `${modeNames[game.mode]} · ${game.phase === "lobby" ? "Waiting for players" : game.phase === "over" ? "Finished" : "First bankruptcy ends the game"}`;
}
function teamWorth(team) {
  return game.players.reduce(
    (sum, p, i) => sum + (p.team === team ? E.netWorth(game, i) : 0),
    0,
  );
}
function toggleBoardFocus() {
  const stage = $(".board-stage");
  const focused = stage.classList.toggle("board-focus");
  const button = $("#boardFullscreen"),
    unfocus = $("#boardUnfocus");
  if (button) button.textContent = "Focus board";
  if (unfocus) unfocus.classList.toggle("hidden", !focused);
  if (focused) stage.scrollIntoView({ behavior: "smooth", block: "start" });
}
function localStats() {
  const stats = persistentRead("doudi-stats", {
    games: 0,
    wins: 0,
    turns: 0,
    highest: 0,
    bestName: "—",
  });
  showModal(
    "Your statistics",
    `<div class="stats-grid"><p><small>Games finished</small><strong>${stats.games}</strong></p><p><small>Wins</small><strong>${stats.wins}</strong></p><p><small>Total turns</small><strong>${stats.turns}</strong></p><p><small>Highest net worth</small><strong>${money(stats.highest)}</strong></p></div><p class="form-help">Statistics are stored locally in this browser and are never sent online.</p>${actionButton("statsDone", "Back", false)}`,
    "local-stats",
  );
  bind("#statsDone", closeModal);
}
function recordLocalStats(ranked) {
  if (connection || !game || game.phase !== "over") return;
  const key = `${game.startedAt || "local"}:${game.turnNumber}:${game.reason}:${game.players.map((p) => p.name).join(",")}`;
  const stats = persistentRead("doudi-stats", {
    games: 0,
    wins: 0,
    turns: 0,
    highest: 0,
    bestName: "—",
    lastGame: "",
  });
  if (stats.lastGame === key) return;
  const winner = ranked[0];
  stats.games += 1;
  stats.wins += winner?.i === me ? 1 : 0;
  stats.turns += game.turnNumber;
  if ((winner?.total || 0) > stats.highest) {
    stats.highest = winner.total;
    stats.bestName = winner.p.name;
  }
  stats.lastGame = key;
  persistentWrite("doudi-stats", stats);
}
function rematch() {
  if (!game || connection) return;
  let next = E.create({
    name: game.players[0].name,
    title: game.title,
    mode: game.mode,
    botDifficulty: game.botDifficulty,
    durationMinutes: game.durationMinutes,
  });
  for (const p of game.players.slice(1))
    next = E.dispatch(next, 0, { type: "addBot", name: p.name });
  localGame(next);
  closeModal();
  toast("Rematch ready — start when everyone is ready.");
}
async function shareResults() {
  if (!game) return;
  const ranked = game.players
    .map((p, i) => ({ name: p.name, total: E.netWorth(game, i) }))
    .sort((a, b) => b.total - a.total);
  const text = `Doudiopoly results — ${ranked.map((p, i) => `${i + 1}. ${p.name} ${money(p.total)}`).join(" · ")}`;
  try {
    if (navigator.share) await navigator.share({ title: "Doudiopoly results", text });
    else await navigator.clipboard.writeText(text);
    toast(navigator.share ? "Results shared." : "Results copied.");
  } catch {
    toast("Results sharing was cancelled.");
  }
}
function buildBoard() {
  const board = $("#board");
  board.replaceChildren();
  spaces.forEach((space, i) => {
    const square = document.createElement("div"),
      edge = ["top", "right", "bottom", "left"][E.side(i)];
    square.className = `square ${edge} ${space.type || ""} ${space.group ? "has-color" : ""} ${i === 0 ? "start-square" : ""}`;
    if ((viewPositions.get(me) ?? game.players[me].position) === i)
      square.classList.add("your-position");
    const travel =
      myTurn() &&
      !busy &&
      !sending &&
      connected &&
      (game.pending?.type === "destination" ||
        (game.pending?.type === "doudiTravel" &&
          game.owned[i] === me &&
          E.side(i) === E.side(game.players[me].position)));
    const select = () =>
      travel ? send({ type: "travel", index: i }) : propertyDetails(i);
    if (travel) square.classList.add("travel-target");
    if (space.price || travel) {
      square.tabIndex = 0;
      square.setAttribute("role", "button");
      square.setAttribute(
        "aria-label",
        space.name + (travel ? " — travel here" : " — view property details"),
      );
      square.addEventListener("click", select);
      square.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    }
    square.style.gridArea = DoudiData.boardCell(i).join(" / ");
    const icon =
      space.type === "chance"
        ? "✦ "
        : space.type === "chest"
          ? "♧ "
          : space.group === "station"
            ? "▣ "
            : space.type === "utility"
              ? "⚡ "
                : "";
    square.innerHTML = `${space.group ? `<span class="color-bar" style="background:${colors[space.group]}"></span>` : ""}<span class="square-label"><strong>${icon}${escapeHtml(space.name)}</strong><small>${space.price ? money(space.price) : escapeHtml(game.mode === "classic" && space.type === "doudi" ? "Rest space" : space.note || "")}</small></span>`;
    const owner = game.owned[i];
    if (owner !== undefined)
      square.innerHTML += `<span class="owner-dot" style="--owner-color:${game.players[owner].color}" title="${escapeHtml(game.players[owner].name)}${game.mortgaged[i] ? " · mortgaged" : ""}" aria-label="Owned by ${escapeHtml(game.players[owner].name)}"></span>`;
    if (game.buildings[i])
      square.innerHTML += `<span class="building-marker">${game.buildings[i] === 5 ? "🏨" : `⌂${game.buildings[i]}`}</span>`;
    const occupants = game.players
      .map((p, n) => ((viewPositions.get(n) ?? p.position) === i ? n : -1))
      .filter((n) => n >= 0);
    occupants.forEach((n, slot) => {
      const token = document.createElement("span");
      token.className = `token token-${tokenTypes[n]}`;
      token.style.setProperty("--token-color", game.players[n].color);
      token.style.setProperty("--slot", slot);
      token.title = game.players[n].name;
      token.setAttribute(
        "aria-label",
        `${game.players[n].name} on ${space.name}`,
      );
      token.innerHTML = "<span></span>";
      square.append(token);
    });
    board.append(square);
  });
}
async function acceptState(next, token = generation, animate = true) {
  if (token !== generation || (game && next.revision <= game.revision)) return;
  const old = game,
    chatOnly =
      old &&
      next.events.some((e) => e.id > old.eventId) &&
      next.events
        .filter((e) => e.id > old.eventId)
        .every((e) => e.type === "chat") &&
      JSON.stringify({ ...old, events: [], eventId: 0, revision: 0 }) ===
        JSON.stringify({ ...next, events: [], eventId: 0, revision: 0 }),
    moves = old
      ? next.events.filter((e) => e.id > old.eventId && e.type === "move")
      : [];
  game = next;
  if (old && old.players[me].balance !== next.players[me].balance) {
    const change = next.players[me].balance - old.players[me].balance;
    toast(
      (change > 0 ? "Received " : "Paid ") +
        money(Math.abs(change)) +
        " · Balance " +
        money(next.players[me].balance),
    );
  }
  autosave();
  if (!chatOnly) modalKey = "";
  if (
    animate &&
    moves.length &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    busy = true;
    for (const move of moves)
      viewPositions.set(move.player, old.players[move.player]?.position ?? 0);
    render();
    closeModal();
    for (const move of moves)
      for (const i of move.path) {
        if (token !== generation) return;
        viewPositions.set(move.player, i);
        buildBoard();
        $("#statusMessage").textContent =
          `${game.players[move.player].name} moving to ${spaces[i].name}…`;
        await delay(440);
      }
    if (token !== generation) return;
    viewPositions.clear();
    busy = false;
    beep();
  }
  render();
  if (!chatOnly) showPending();
  scheduleBot();
}
function enqueueState(state, token = generation) {
  inbox = inbox
    .then(() => acceptState(state, token))
    .catch((error) => {
      if (token === generation) {
        busy = false;
        toast(error.message);
      }
    });
  return inbox;
}
async function send(action) {
  if (sending || busy || !game) return;
  if (connection && !connected) return toast("Reconnecting to your game…");
  const token = generation;
  sending = true;
  render();
  try {
    if (connection) {
      const result = await api(
        `/api/rooms/${connection.code}/commands`,
        { action, revision: game.revision },
        connection.token,
      );
      if (token === generation) await enqueueState(result.state, token);
    } else {
      const next = E.dispatch(game, me, action, { rng: random });
      await acceptState(next, token);
    }
  } catch (error) {
    if (token === generation) toast(error.message);
  } finally {
    if (token === generation) {
      sending = false;
      render();
      scheduleBot();
    }
  }
}
function scheduleBot() {
  clearTimeout(botTimer);
  if (connection || busy || sending || !game) return;
  const command = E.botAction(game);
  if (!command) return;
  const token = generation;
  botTimer = setTimeout(async () => {
    if (token !== generation || busy || sending) return;
    try {
      const next = E.dispatch(game, command.actor, command.action, {
        rng: random,
      });
      await acceptState(next, token);
    } catch (error) {
      toast(`Practice player: ${error.message}`);
    }
  }, 700);
}
function showModal(title, content, key = "custom") {
  if (!$("#modalBackdrop").classList.contains("hidden") && modalKey === key)
    return;
  if ($("#modalBackdrop").classList.contains("hidden"))
    lastFocus = document.activeElement;
  modalKey = key;
  $("#modalContent").innerHTML =
    `<h2 id="modalTitle">${escapeHtml(title)}</h2>${content}`;
  $("#modalBackdrop").classList.remove("hidden");
  $("main").inert = true;
  $(".modal").focus();
}
function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
  $("main").inert = false;
  modalKey = "";
  if (lastFocus?.isConnected) lastFocus.focus();
}
function bind(id, fn) {
  $(id)?.addEventListener("click", fn);
}
function actionButton(id, label, primary = true) {
  return `<button id="${id}" class="${primary ? "primary-button" : "secondary-button full-button"}">${label}</button>`;
}
function showPending(force = false) {
  if (!game || busy) return;
  const key = `${game.revision}:${game.phase}:${game.pending?.type}:${!!game.debt}:${!!game.trade}`;
  if (!force && modalKey === key) return;
  if (game.phase === "over") return showResults();
  if (game.trade) {
    const t = game.trade,
      description = (indexes, cash) =>
        `${money(cash)}${indexes.length ? ` + ${indexes.map((i) => escapeHtml(spaces[i].name) + (game.mortgaged[i] ? " (mortgaged)" : "")).join(", ")}` : ""}`;
    showModal(
      "Trade offer",
      `<p>${escapeHtml(game.players[t.from].name)} offers ${description(t.give, t.giveCash)} for ${description(t.receive, t.receiveCash)} from ${escapeHtml(game.players[t.to].name)}.</p>${me === t.to ? actionButton("acceptTrade", "Accept trade") + actionButton("rejectTrade", "Decline", false) : me === t.from ? actionButton("cancelTrade", "Withdraw offer", false) : "<p>Waiting for their response.</p>"}`,
      key,
    );
    bind("#acceptTrade", () => send({ type: "tradeAccept" }));
    bind("#rejectTrade", () => send({ type: "tradeReject" }));
    bind("#cancelTrade", () => send({ type: "tradeCancel" }));
    return;
  }
  if (game.debt) {
    const d = game.debt;
    if (me !== d.player) {
      if (force)
        showModal(
          "Payment required",
          `<p>${escapeHtml(game.players[d.player].name)} is resolving a payment.</p>`,
          key,
        );
      return;
    }
    showModal(
      `Payment: ${money(d.amount)}`,
      `<p>${escapeHtml(d.reason)}. You have ${money(game.players[me].balance)}. Raise ${money(Math.max(0, d.amount - game.players[me].balance))} to continue.</p>${actionButton("debtAssets", "Manage assets")}${actionButton("debtTrade", "Offer a trade", false)}${actionButton("concedeDebt", "Declare bankruptcy", false)}<p class="form-help">Closing this dialog pauses the decision. Use Continue action to return.</p>`,
      key,
    );
    bind("#debtAssets", showAssets);
    bind("#debtTrade", showTrade);
    bind("#concedeDebt", () => {
      showModal(
        "Declare bankruptcy?",
        `<p>This transfers your remaining assets according to the debt and ends the game for everyone.</p>${actionButton("confirmBankruptcy", "Declare bankruptcy")}${actionButton("returnDebt", "Keep resolving payment", false)}`,
      );
      bind("#confirmBankruptcy", () => send({ type: "bankrupt" }));
      bind("#returnDebt", () => showPending(true));
    });
    return;
  }
  const a = game.pending;
  if (!a) {
    if (!["rules", "assets", "trade-form"].includes(modalKey)) closeModal();
    return;
  }
  if (a.type === "auction") {
    showModal(
      `Auction: ${spaces[a.index].name}`,
      `<p>Current bid: ${money(a.highBid)}${a.highBidder !== null ? ` by ${escapeHtml(game.players[a.highBidder].name)}` : ""}. ${escapeHtml(game.players[a.bidder].name)} is next. Passing withdraws you from this auction.</p>${a.bidder === me ? `<label class="field-label" for="auctionBid">Your bid</label><input id="auctionBid" class="text-input" type="number" min="${a.highBid + 10}" max="${game.players[me].balance}" value="${a.highBid + 10}" />${actionButton("placeBid", "Bid")}${actionButton("passBid", "Pass", false)}` : "<p>Waiting for the next bid.</p>"}`,
      key,
    );
    bind("#placeBid", () =>
      send({ type: "bid", amount: Number($("#auctionBid").value) }),
    );
    bind("#passBid", () => send({ type: "passBid" }));
    return;
  }
  if (a.player !== me) {
    if (force)
      showModal(
        "Action in progress",
        `<p>Waiting for ${escapeHtml(game.players[a.player].name)} to finish their action.</p>`,
        key,
      );
    return;
  }
  if (a.type === "buy") {
    const space = spaces[a.index];
    showModal(
      `Buy ${space.name}?`,
      `<p>Purchase price: <strong>${money(space.price)}</strong>. ${space.type === "utility" ? "Utility rent is 4× dice, or 10× with both utilities." : space.group === "station" ? "Station rent is £25 / £50 / £100 / £200 for 1 / 2 / 3 / 4 stations." : `Base rent: ${money(space.rent)}.`}</p><p>Declining opens an auction for all players.</p>${actionButton("confirmBuy", `Buy for ${money(space.price)}`)}${actionButton("declineBuy", "Send to auction", false)}`,
      key,
    );
    $("#confirmBuy").disabled = game.players[me].balance < space.price;
    bind("#confirmBuy", () => send({ type: "buy" }));
    bind("#declineBuy", () => send({ type: "decline" }));
  } else if (a.type === "tax") {
    const amount = (a.index === 4 ? 200 : 100) / (E.isDoudi(game, me) ? 2 : 1);
    showModal(
      spaces[a.index].name,
      `<p>Pay ${money(amount)} to the bank.</p>${actionButton("payTax", `Pay ${money(amount)}`)}`,
      key,
    );
    bind("#payTax", () => send({ type: "payTax" }));
  } else if (a.type === "card") {
    const card = E.CARDS[a.deck][a.card];
    const base =
      card.amount < 0
        ? -card.amount
        : card.repairs
          ? E.own(game, me).reduce(
              (sum, i) =>
                sum +
                ((game.buildings[i] || 0) === 5
                  ? card.repairs[1]
                  : (game.buildings[i] || 0) * card.repairs[0]),
              0,
            )
          : 0;
    const due = E.isDoudi(game, me) ? Math.ceil(base / 2) : base;
    showModal(
      card.title,
      `<p>${escapeHtml(card.text)}</p>${E.isDoudi(game, me) ? "<p>Your Doudi bonus or discount applies to cash rewards and costs.</p>" : ""}${actionButton("resolveCard", due > 0 ? `Pay ${money(due)}` : "Continue")}`,
      key,
    );
    bind("#resolveCard", () => send({ type: "card" }));
  } else if (["doudiReady", "doudiTravel", "destination"].includes(a.type)) {
    closeModal();
    $("#rollHint").textContent =
      a.type === "doudiReady"
        ? "Press Roll dice for your Doudi roll"
        : "Select a highlighted destination on the board";
  } else if (a.type === "doudiResult") {
    const total = a.total;
    const amount = E.isDoudi(game, me) ? (total <= 4 ? 50 : 200) : 100;
    const label =
      total <= 4
        ? `Pay ${money(amount)}`
        : total <= 9
          ? `Receive ${money(amount)}`
          : total === 10
            ? "Pay £25 to each player"
            : "Choose a space on the board";
    showModal(
      `Doudi roll: ${total}`,
      `<p>${label}.</p>${actionButton("resolveDoudi", label)}`,
      key,
    );
    bind("#resolveDoudi", () => send({ type: "resolveDoudi" }));
  } else if (a.type === "doudi") {
    const canTravel = E.own(game, me).some(
      (i) => E.side(i) === E.side(game.players[me].position),
    );
    showModal(
      "Choose your Doudi move",
      `<p>Travel to your own property on this side, or choose to roll and then press the Roll dice button. Confirm the result before paying, receiving money, or choosing any destination. Travel does not collect START money or trigger landing effects.</p>${canTravel ? actionButton("chooseDoudiTravel", "Select an owned property on the board") : "<p>No properties on this side yet.</p>"}${actionButton("chooseDoudiRoll", "Choose to roll", false)}`,
      key,
    );
    bind("#chooseDoudiTravel", () => send({ type: "chooseDoudiTravel" }));
    bind("#chooseDoudiRoll", () => send({ type: "chooseDoudiRoll" }));
  }
}
function showAssets() {
  const indexes = E.own(game, me);
  showModal(
    "Manage properties",
    `<p>Mortgage for 50%; repay principal + 10%. Build or sell evenly across a complete colour set. Five development levels means a hotel.</p><div class="asset-list">${indexes.map((i) => `<div class="asset-row"><span><b>${escapeHtml(spaces[i].name)}</b><small>${game.mortgaged[i] ? "Mortgaged" : `Rent ${money(E.rent(game, i))}${spaces[i].type === "utility" ? " at dice 7" : ""}`} · ${game.buildings[i] === 5 ? "Hotel" : `${game.buildings[i] || 0} houses`}</small></span><div class="asset-actions"><button class="property-action" data-command="mortgage" data-index="${i}">${game.mortgaged[i] ? `Repay ${money(Math.ceil(Math.floor(spaces[i].price / 2) * 1.1))}` : `Mortgage +${money(Math.floor(spaces[i].price / 2))}`}</button>${spaces[i].group && spaces[i].group !== "station" ? `<button class="property-action" data-command="build" data-index="${i}">Build ${money(E.buildCost(i))}</button><button class="property-action" data-command="sellBuilding" data-index="${i}">Sell building</button>` : ""}</div></div>`).join("") || "<p>No properties available.</p>"}</div>${actionButton("assetsDone", game.debt ? "Back to payment" : "Done", false)}`,
    "assets",
  );
  $("#modalContent")
    .querySelectorAll("[data-command]")
    .forEach((b) =>
      b.addEventListener("click", async () => {
        const token = generation;
        await send({ type: b.dataset.command, index: Number(b.dataset.index) });
        if (token === generation && game && !game.debt && game.phase !== "over")
          showAssets();
      }),
    );
  bind("#assetsDone", () => (game.debt ? showPending(true) : closeModal()));
}
function showTrade() {
  const others = game.players
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i !== me);
  showModal(
    "Offer a trade",
    `<p>Both players must agree. Mortgages transfer with the property. Buildings must be sold before trading a colour set.</p><label class="field-label" for="tradePlayer">Other player</label><select id="tradePlayer" class="text-input">${others.map(({ p, i }) => `<option value="${i}">${escapeHtml(p.name)} · ${money(p.balance)}</option>`).join("")}</select><div class="trade-columns"><fieldset><legend>You give</legend><div id="giveProperties"></div><label class="field-label" for="giveCash">Cash</label><input id="giveCash" class="text-input" type="number" min="0" value="0" /></fieldset><fieldset><legend>You receive</legend><div id="receiveProperties"></div><label class="field-label" for="receiveCash">Cash</label><input id="receiveCash" class="text-input" type="number" min="0" value="0" /></fieldset></div>${actionButton("sendTrade", "Send offer")}${actionButton("tradeBack", "Back", false)}`,
    "trade-form",
  );
  function choices() {
    for (const [id, p] of [
      ["giveProperties", me],
      ["receiveProperties", Number($("#tradePlayer").value)],
    ])
      $("#" + id).innerHTML =
        E.own(game, p)
          .map(
            (i) =>
              `<label class="trade-check"><input type="checkbox" value="${i}" />${escapeHtml(spaces[i].name)}${game.mortgaged[i] ? " (mortgaged)" : ""}</label>`,
          )
          .join("") || "<small>No properties</small>";
  }
  choices();
  $("#tradePlayer").addEventListener("change", choices);
  bind("#sendTrade", () =>
    send({
      type: "trade",
      to: Number($("#tradePlayer").value),
      give: [...$("#giveProperties").querySelectorAll(":checked")].map((b) =>
        Number(b.value),
      ),
      receive: [...$("#receiveProperties").querySelectorAll(":checked")].map(
        (b) => Number(b.value),
      ),
      giveCash: Number($("#giveCash").value),
      receiveCash: Number($("#receiveCash").value),
    }),
  );
  bind("#tradeBack", () => (game.debt ? showPending(true) : closeModal()));
}
function propertyDetails(i) {
  const space = spaces[i],
    owner = game.owned[i];
  showModal(
    space.name,
    "<p>Owner: <strong>" +
      (owner === undefined
        ? "Bank — available to buy"
        : escapeHtml(game.players[owner].name)) +
      '</strong></p><div class="detail-grid"><p>Price<strong>' +
      money(space.price) +
      "</strong></p><p>Current rent<strong>" +
      money(E.rent(game, i)) +
      (space.type === "utility" ? " at dice 7" : "") +
      "</strong></p><p>Mortgage value<strong>" +
      money(Math.floor(space.price / 2)) +
      "</strong></p><p>Status<strong>" +
      (game.mortgaged[i]
        ? "Mortgaged — no rent"
        : game.buildings[i] === 5
          ? "Hotel"
          : (game.buildings[i] || 0) + " houses") +
      "</strong></p></div>" +
      (space.group && space.group !== "station"
        ? "<p>Base rent: " +
          money(space.rent) +
          ". Build cost: " +
          money(E.buildCost(i)) +
          " per house or hotel level. Own the complete colour set and build evenly.</p>"
        : "<p>" +
          (space.type === "utility"
            ? "Rent is 4× dice, or 10× with both utilities."
            : "Rent is £25, £50, £100 or £200 with 1, 2, 3 or 4 stations.") +
          "</p>") +
      actionButton("detailsDone", "Back to game"),
  );
  bind("#detailsDone", () => {
    closeModal();
    showPending(true);
  });
}
function showResults() {
  const ranked = game.players
    .map((p, i) => ({ p, i, total: E.netWorth(game, i) }))
    .sort((a, b) => b.total - a.total);
  recordLocalStats(ranked);
  const best = ranked[0].total,
    winners = ranked
      .filter((p) => p.total === best)
      .map((p) => p.p.name)
      .join(" & ");
  const teamWinner =
    teamWorth(0) === teamWorth(1)
      ? "Teams tied"
      : `${teamWorth(0) > teamWorth(1) ? "Coral" : "Blue"} team wins`;
  showModal(
    "🏆 Game results",
    `<div class="result-celebration">🏆</div><p>${escapeHtml(game.reason)}</p><p>${game.turnNumber} turns completed · ${game.players.length} players · ${game.botDifficulty || "normal"} practice difficulty</p><p><strong>${game.mode === "teams" ? teamWinner : `Highest net worth: ${escapeHtml(winners)}`}</strong></p><div class="scoreboard">${ranked
      .map(
        ({ p, i, total }) =>
          `<article class="score-player ${p.bankrupt ? "bankrupt" : ""}"><div class="score-player-head"><div><strong>${escapeHtml(p.name)}${p.bankrupt ? " · Bankrupt" : ""}</strong><small>Cash ${money(p.balance)} · ${E.own(game, i).length} properties · ${Object.entries(
            game.buildings,
          )
            .filter(([n]) => game.owned[n] === i)
            .reduce(
              (sum, [, level]) => sum + level,
              0,
            )} building levels</small></div><b>${money(total)}</b></div><div class="score-properties">${
            E.own(game, i)
              .map(
                (n) =>
                  `<div class="score-property"><span>${escapeHtml(spaces[n].name)}${game.mortgaged[n] ? " · mortgaged" : ""}</span><span>${money(spaces[n].price)} · ${money(E.rent(game, n))} rent</span></div>`,
              )
              .join("") || "<p>No properties</p>"
          }</div></article>`,
      )
      .join(
        "",
      )}</div><p class="form-help">Final net worth: cash + property and building values − mortgage loans − unpaid bills. Highest net worth wins. Utility rent shown at dice 7.</p><div class="result-actions">${actionButton("rematch", "Play rematch")}${actionButton("shareResults", "Share results", false)}${actionButton("backLobby", "Back to lobby", false)}</div>`,
    "results",
  );
  bind("#rematch", rematch);
  bind("#shareResults", shareResults);
  bind("#backLobby", leave);
}
function rules() {
  showModal(
    "How to play",
    `<div class="rules-copy"><p>Add 2–6 players and start. Everyone rolls once; highest starts, ties follow joining order. Turns then follow joining order.</p><p>Roll, resolve your landing action, then press <strong>End turn</strong>. Doubles allow another roll; three consecutive doubles send you to Jail. Normal movement takes 440ms per space.</p><p>Buy properties or send them to auction. Bids rise by at least £10. Passing withdraws you. Complete unmortgaged street sets double base rent. Stations charge £25–£200 depending on the number owned; utilities charge 4× dice or 10× with both.</p><p>Build evenly on complete, unmortgaged street sets: four houses, then a hotel. Sell evenly for half the building cost. Building supply is unlimited. Mortgage for half the purchase value; repay principal plus 10%. Net worth is cash plus property and building costs, minus mortgage principal and unpaid bills. Buying at list price converts cash into assets, so it does not increase net worth. During play, the sidebar shows cash only. At the end, the highest net worth wins.</p><p>Trade cash and properties by mutual agreement. Mortgages transfer unchanged. Practice players accept offers worth at least what they give. To resolve a debt, mortgage, sell buildings, trade, or declare bankruptcy. <strong>The first bankruptcy ends the game.</strong></p><p>Jail: use a release card, pay £50 before rolling, or attempt doubles. After three failed attempts, pay £50 and move the third roll. Leaving Jail with doubles grants no extra roll.</p><p>Free Parking makes you <strong>Doudi</strong> for your next three completed turns; the claiming turn does not count. Another claimant replaces you. Receive double rent, START and positive card rewards; pay half rent, taxes, negative cards, Jail fees and Doudi penalties. Purchases, bids, buildings, trades and mortgages are unaffected. The bank covers differences between discounted payments and boosted rent.</p><p>Doudi spaces: travel to an owned property on that side or roll two dice. 2–4: pay £100; 5–9: receive £100; 10: pay £25 to every other player (exactly £25, without Doudi bonuses or discounts); 11–12: choose any space. Doudi travel has no landing effects and no START bonus.</p><p><strong>Modes:</strong> Doudi is the default. Classic disables Doudi status and makes Doudi spaces rest spaces. Quick starts with £1,000 and ends after 20 rounds or bankruptcy. Timed ends at the deadline or bankruptcy. Teams combines net worth and waives teammate rent; cash and ownership stay individual. All modes retain the 44-space board.</p><p>Save at any time: movement animations represent an already committed move. Loading resumes the recorded action. Online snapshots can be loaded into practice mode; other seats become bots. Online rooms are controlled by the server.</p></div>`,
    "rules",
  );
}
async function api(path, body, token) {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(15000),
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Online play requires the Doudiopoly server. Run npm start and open its address.",
    );
  }
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
function remember(value) {
  try {
    if (value) sessionStorage.setItem("doudi-room", JSON.stringify(value));
    else sessionStorage.removeItem("doudi-room");
  } catch {
    /* Storage can be unavailable for local files. */
  }
}
function remembered() {
  try {
    return JSON.parse(sessionStorage.getItem("doudi-room"));
  } catch {
    return null;
  }
}
function persistentRead(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function persistentWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
function refreshContinue() {
  $("#continueLast").classList.toggle(
    "hidden",
    !persistentRead("doudi-last-practice"),
  );
}
function savedGames() {
  const slots = persistentRead("doudi-save-slots", {});
  showModal(
    "Saved games",
    '<p>Keep up to five named practice games on this browser. Save .txt makes a portable backup.</p><label class="field-label" for="saveSlot">Slot</label><select id="saveSlot" class="text-input">' +
      [1, 2, 3, 4, 5]
        .map(
          (n) =>
            '<option value="' +
            n +
            '">' +
            n +
            " — " +
            escapeHtml(slots[n]?.name || "Empty") +
            "</option>",
        )
        .join("") +
      '</select><label class="field-label" for="saveName">Save name</label><input id="saveName" class="text-input" maxlength="40" value="' +
      escapeHtml(game?.title || "My game") +
      '" />' +
      (game && !connection
        ? actionButton("writeSlot", "Save to selected slot")
        : "") +
      actionButton("readSlot", "Load selected slot", false) +
      actionButton("slotsDone", "Back", false),
  );
  bind("#writeSlot", () => {
    const slot = $("#saveSlot").value;
    const save = () => {
      try {
        slots[slot] = {
          name: $("#saveName").value.trim() || "My game",
          state: game,
        };
        localStorage.setItem("doudi-save-slots", JSON.stringify(slots));
        closeModal();
        toast("Named game saved.");
      } catch {
        toast("Browser storage is unavailable. Use Save .txt.");
      }
    };
    if (slots[slot] && $("#writeSlot").dataset.confirm !== slot) {
      $("#writeSlot").dataset.confirm = slot;
      $("#writeSlot").textContent = "Replace this saved game? Click to confirm";
      return;
    }
    save();
  });
  bind("#readSlot", () => {
    if (connection)
      return toast("Leave the online room before loading a practice save.");
    try {
      const state = E.validate(slots[$("#saveSlot").value]?.state);
      localGame(E.tick(state));
      toast("Saved game loaded.");
    } catch {
      toast("Choose a valid, occupied save slot.");
    }
  });
  bind("#slotsDone", () => {
    closeModal();
    if (game) showPending(true);
  });
}
function autosave() {
  if (!game) return;
  if (!connection) {
    try {
      localStorage.setItem("doudi-last-practice", JSON.stringify(game));
    } catch {
      /* Tab autosave remains available. */
    }
  }
  try {
    sessionStorage.setItem(
      "doudi-active-game",
      JSON.stringify({
        state: game,
        connection,
      }),
    );
  } catch {
    toast("Automatic saving is unavailable. Use Save .txt to keep this game.");
  }
}
function restoreGame() {
  try {
    const saved = sessionStorage.getItem("doudi-active-game");
    if (!saved) return;
    const active = JSON.parse(saved);
    const state = E.validate(active.state);
    if (active.connection) {
      const details = active.connection;
      if (
        details.code !== state.code ||
        !/^[a-f0-9]{64}$/.test(details.token) ||
        !Number.isInteger(details.player) ||
        !state.players[details.player]
      )
        throw new Error("Invalid saved room.");
      // Show the last known table immediately; server updates remain authoritative.
      connectRoom(details, state, true);
    } else localGame(E.tick(state));
  } catch {
    toast(
      "The automatic save could not be restored. You can load a saved .txt file.",
    );
  }
}
async function connectRoom(details, state, reconnecting = false) {
  stopSession();
  connection = details;
  connected = !reconnecting;
  me = details.player;
  game = state;
  remember(details);
  autosave();
  showGame();
  showPending();
  streamController = new AbortController();
  streamLoop(generation, streamController.signal);
}
async function streamLoop(token, signal) {
  while (!signal.aborted && token === generation) {
    try {
      const response = await fetch(`/api/rooms/${connection.code}/events`, {
        headers: { Authorization: `Bearer ${connection.token}` },
        signal,
      });
      if (!response.ok) throw new Error("Connection lost.");
      connected = true;
      render();
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line.trim()) {
            const item = JSON.parse(line);
            if (
              item.state &&
              token === generation &&
              item.state.revision > game.revision
            )
              enqueueState(item.state, token);
          }
        }
      }
    } catch (error) {
      if (signal.aborted || token !== generation) return;
      connected = false;
      render();
    }
    if (signal.aborted || token !== generation) return;
    connected = false;
    render();
    await delay(2000);
  }
}
async function enter(event) {
  event.preventDefault();
  const button = $('#roomForm button[type="submit"]');
  if (button.disabled) return;
  const token = generation;
  const name = $("#playerName").value.trim();
  if (!name) return toast("Enter your name.");
  const options = {
    name,
    title: $("#roomName").value.trim(),
    mode: $("#rulesMode").value,
    botDifficulty: $("#botDifficulty").value || "normal",
    durationMinutes: Number($("#durationMinutes").value),
  };
  button.disabled = true;
  try {
    if ($("#connectionMode").value === "local") {
      if (roomAction === "join")
        throw new Error("Choose Friends online to join another person’s room.");
      localGame(E.create(options));
    } else {
      if (!/^https?:$/.test(location.protocol))
        throw new Error(
          "Open the game through the Doudiopoly server to play online.",
        );
      const result =
        roomAction === "create"
          ? await api("/api/rooms", options)
          : await api(
              `/api/rooms/${$("#roomCode").value.trim().toUpperCase()}/join`,
              { name },
            );
      if (token !== generation) return;
      await connectRoom(
        { code: result.state.code, token: result.token, player: result.player },
        result.state,
      );
    }
  } catch (error) {
    if (token === generation) toast(error.message);
  } finally {
    button.disabled = false;
  }
}
function leave() {
  refreshContinue();
  try {
    sessionStorage.removeItem("doudi-active-game");
  } catch {
    /* Storage is optional. */
  }
  stopSession();
  game = null;
  $("#gameView").classList.add("hidden");
  $("#lobbyView").classList.remove("hidden");
  $("#reconnectRoom").classList.toggle("hidden", !remembered());
}
applyTheme(loadTheme());
$("#roomForm").addEventListener("submit", enter);
$(".mode-switch").addEventListener("click", (event) => {
  const b = event.target.closest("[data-mode]");
  if (!b) return;
  roomAction = b.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach((el) => {
    el.classList.toggle("active", el === b);
    el.setAttribute("aria-pressed", String(el === b));
  });
  $("#createFields").classList.toggle("hidden", roomAction !== "create");
  $("#joinFields").classList.toggle("hidden", roomAction !== "join");
  $("#roomSubmitLabel").textContent =
    roomAction === "create" ? "Create room" : "Join room";
  if (roomAction === "join") $("#connectionMode").value = "online";
  connectionHelp();
});
function connectionHelp() {
  $("#connectionHelp").textContent =
    $("#connectionMode").value === "local"
      ? "Practice games stay on this device."
      : "Open the same Doudiopoly server address on each device, then share the room code.";
}
$("#connectionMode").addEventListener("change", connectionHelp);
$("#rulesMode").addEventListener("change", () =>
  $("#durationField").classList.toggle(
    "hidden",
    $("#rulesMode").value !== "timed",
  ),
);
bind("#addBot", () =>
  send({
    type: "addBot",
    name: ["Jamie", "Morgan", "Sam", "Riley", "Avery"][game.players.length - 1],
  }),
);
bind("#startGame", () => send({ type: "start" }));
bind("#rollButton", () =>
  send({ type: game.pending?.type === "doudiReady" ? "doudiRoll" : "roll" }),
);
bind("#endTurn", () => send({ type: "end" }));
bind("#jailPay", () => send({ type: "jailPay" }));
bind("#jailCard", () => send({ type: "jailCard" }));
bind("#resumeAction", () => showPending(true));
bind("#manageProperties", showAssets);
bind("#offerTrade", showTrade);
$("#myTeam").addEventListener("change", () =>
  send({ type: "team", player: me, team: Number($("#myTeam").value) }),
);
bind("#showRules", rules);
bind("#lobbyRules", rules);
bind("#localStats", localStats);
bind("#boardFullscreen", toggleBoardFocus);
bind("#boardUnfocus", toggleBoardFocus);
bind("#themeToggle", toggleTheme);
bind("#themeToggleLobby", toggleTheme);
bind("#leaveRoom", leave);
bind("#soundToggle", () => {
  sound = !sound;
  $("#soundToggle").textContent = sound ? "Sound on" : "Sound off";
  $("#soundToggle").setAttribute("aria-pressed", String(sound));
  beep();
});
$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#chatInput").value.trim();
  if (text) {
    send({ type: "chat", text });
    $("#chatInput").value = "";
  }
});
bind("#copyInvite", async () => {
  if (!connection) return;
  const url = new URL(location.href);
  url.search = `room=${game.code}`;
  url.hash = "";
  try {
    await navigator.clipboard.writeText(
      `Join Doudiopoly: ${url.href} (room ${game.code})`,
    );
    toast("Invite copied.");
  } catch {
    toast(`Room ${game.code} — share this page’s address.`);
  }
});
bind("#saveGame", () => {
  if (!game) return;
  const blob = new Blob([E.saveText(game)], {
      type: "text/plain;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `doudiopoly-${game.code}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Game saved. Pending actions are included.");
});
bind("#loadGame", () => $("#loadGameInput").click());
bind("#lobbyLoad", () => $("#loadGameInput").click());
$("#loadGameInput").addEventListener("change", async (event) => {
  const file = event.target.files[0],
    token = generation;
  event.target.value = "";
  if (!file) return;
  try {
    if (connection)
      throw new Error("Leave the online room before loading a practice save.");
    if (file.size > 1000000) throw new Error("Save file is too large.");
    const next = E.parseSave(await file.text());
    if (token !== generation) return;
    next.players.forEach((p, i) => (p.bot = i !== 0));
    localGame(next);
    toast("Practice game restored. Other seats are practice players.");
  } catch (error) {
    toast(error.message);
  }
});
bind("#reconnectRoom", async () => {
  const details = remembered(),
    token = generation;
  if (!details) return;
  try {
    const result = await api(
      `/api/rooms/${details.code}`,
      undefined,
      details.token,
    );
    if (token === generation) await connectRoom(details, result.state);
  } catch (error) {
    if (token !== generation) return;
    remember(null);
    $("#reconnectRoom").classList.add("hidden");
    toast(error.message);
  }
});
bind("#modalClose", closeModal);
$("#modalBackdrop").addEventListener("click", (event) => {
  if (event.target === $("#modalBackdrop")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if ($("#modalBackdrop").classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const focusable = [
      ...$(".modal").querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
      ),
    ].filter((el) => el.getClientRects().length);
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === $(".modal"))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === $(".modal"))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }
});
$("#reconnectRoom").classList.toggle("hidden", !remembered());
const invitedRoom = new URLSearchParams(location.search).get("room");
if (invitedRoom) {
  $('[data-mode="join"]').click();
  $("#roomCode").value = invitedRoom.slice(0, 6).toUpperCase();
}
restoreGame();

bind("#saveSlots", savedGames);
bind("#lobbySlots", savedGames);
bind("#continueLast", () => {
  try {
    localGame(E.tick(E.validate(persistentRead("doudi-last-practice"))));
  } catch {
    toast(
      "The last game could not be restored. Load a saved .txt file instead.",
    );
  }
});
refreshContinue();
