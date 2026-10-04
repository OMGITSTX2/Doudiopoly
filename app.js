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
let saveWarningShown = false;

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
function applyAccessibility(prefs) {
  const root = document.documentElement;
  if (!root?.classList) return;
  root.classList.toggle("large-text", !!prefs.largeText);
  root.classList.toggle("high-contrast", !!prefs.highContrast);
  root.classList.toggle("static-motion", !!prefs.staticMotion);
  try {
    localStorage.setItem("doudi-accessibility", JSON.stringify(prefs));
  } catch {
    /* Storage is optional. */
  }
}
function reducedMotion() {
  return (
    gameSpeed() === "instant" ||
    !!document.documentElement?.classList?.contains("static-motion") ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
function gameSpeed() {
  const speed = persistentRead("doudi-speed", "normal");
  return ["normal", "fast", "instant"].includes(speed) ? speed : "normal";
}
function accessibilitySettings() {
  const prefs = persistentRead("doudi-accessibility", {
    largeText: false,
    highContrast: false,
    staticMotion: false,
  });
  showModal(
    "Accessibility settings",
    `<p>These settings apply locally to this browser.</p><label class="setting-toggle"><input type="checkbox" id="largeTextSetting" ${prefs.largeText ? "checked" : ""} /> Larger board and interface text</label><label class="setting-toggle"><input type="checkbox" id="highContrastSetting" ${prefs.highContrast ? "checked" : ""} /> High contrast colours</label><label class="setting-toggle"><input type="checkbox" id="staticMotionSetting" ${prefs.staticMotion ? "checked" : ""} /> Reduce movement animations</label>${actionButton("accessibilityDone", "Done", false)}`,
    "accessibility",
  );
  $("#modalContent").insertAdjacentHTML("beforeend", `<label class="field-label" for="gameSpeed">Game speed</label><select class="text-input" id="gameSpeed"><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant movement</option></select><p class="form-help">Controls movement and local practice-player delays. Your rolls and payments still wait for you.</p>`);
  $("#gameSpeed").value = gameSpeed();
  $("#gameSpeed").addEventListener("change", () => {
    persistentWrite("doudi-speed", $("#gameSpeed").value);
    scheduleBot();
  });
  ["largeTextSetting", "highContrastSetting", "staticMotionSetting"].forEach((id) =>
    $("#" + id).addEventListener("change", () => {
      applyAccessibility({
        largeText: $("#largeTextSetting").checked,
        highContrast: $("#highContrastSetting").checked,
        staticMotion: $("#staticMotionSetting").checked,
      });
    }),
  );
  bind("#accessibilityDone", closeModal);
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
        `<div class="player-row ${i === game.currentPlayer ? "current" : ""} ${i === me ? "is-you" : ""}"><span class="avatar"><span class="mini-token token-${tokenTypes[i]}" style="--token-color:${p.color}"><span></span></span></span><div class="player-details"><strong>${escapeHtml(p.name)}${E.isDoudi(game, i) ? ' <span class="doudi-badge">👑 Doudi</span>' : ""}</strong><small>${p.bankrupt ? "Bankrupt" : p.jailed ? "In Jail" : game.phase === "starting" ? (game.startRolls[i] ?? "Needs a starting roll") : p.bot ? `Practice player · ${p.botStyle || "investor"}` : i === me ? "You" : "Player"}${game.mode === "teams" ? ` · ${p.team ? "Blue" : "Coral"}` : ""}</small>${E.isDoudi(game, i) ? `<small class="doudi-status">${game.doudiTurnsLeft} turns remaining</small>` : ""}</div><span class="player-color-dot" style="--player-color:${p.color}"></span><span class="player-cash">${money(p.balance)}</span></div>`,
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
  const doudiPanel = $("#doudiStatusPanel"),
    doudiHolder = game.doudiPlayer === null ? null : game.players[game.doudiPlayer];
  if (doudiPanel) {
    doudiPanel.classList.toggle("hidden", !doudiHolder || game.mode === "classic");
    if (doudiHolder && game.mode !== "classic")
      doudiPanel.innerHTML = `<strong>👑 ${escapeHtml(doudiHolder.name)} is Doudi</strong><small>${game.doudiTurnsLeft} completed turn${game.doudiTurnsLeft === 1 ? "" : "s"} remaining · double income · half costs</small>`;
  }

  const historyFilter = $("#historyFilter")?.value || "all";
  const events = game.events.filter((e) => {
    if (e.type === "chat") return false;
    return historyFilter === "all" || e.categories?.includes(historyFilter);
  });
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
  renderDestinationChoices();
  $("#gameModeLabel").textContent =
    `${modeNames[game.mode]} · ${game.phase === "lobby" ? "Waiting for players" : game.phase === "over" ? "Finished" : "First bankruptcy ends the game"}`;
  updateMobileActions();
}
function updateMobileActions() {
  const drawer = $("#mobileActionDrawer"),
    buttons = $("#mobileActionButtons"),
    title = $("#mobileActionTitle");
  if (!drawer || !buttons || !title || !game) return;
  const actions = [];
  if (busy || sending || !connected || E.requiredActor(game) !== me) {
    drawer.classList.add("hidden");
    return;
  }
  if (game.phase !== "over" && (game.pending || game.debt || game.trade)) {
    if (game.pending?.type === "doudiReady")
      actions.push({ label: "Roll Doudi dice", run: () => $("#rollButton").click() });
    else if (["destination", "doudiTravel"].includes(game.pending?.type))
      actions.push({
        label: "Choose a board space",
        run: () => {
          if (!$(".board-stage").classList.contains("board-focus"))
            toggleBoardFocus();
        },
      });
    else actions.push({ label: "Open current action", run: () => showPending(true) });
    title.textContent = game.debt ? "Payment required" : "Action required";
  } else if (myTurn() && game.phase === "playing") {
    if (!game.turnHasRolled || game.extraRoll)
      actions.push({ label: game.extraRoll ? "Roll again" : "Roll dice", run: () => $("#rollButton").click() });
    if (game.turnHasRolled && !game.extraRoll)
      actions.push({ label: "End turn", run: () => send({ type: "end" }) });
    if (canManage()) {
      actions.push({ label: "Manage properties", run: showAssets });
      actions.push({ label: "Offer trade", run: showTrade });
    }
    title.textContent = "Your actions";
  }
  drawer.classList.toggle("hidden", actions.length === 0);
  buttons.innerHTML = actions
    .map((action, i) => `<button class="secondary-button" data-mobile-action="${i}">${escapeHtml(action.label)}</button>`)
    .join("");
  buttons.querySelectorAll("[data-mobile-action]").forEach((button) => {
    button.addEventListener("click", () => actions[Number(button.dataset.mobileAction)].run());
  });
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
  if (button) button.textContent = focused ? "Leave board focus" : "Focus board";
  if (unfocus) unfocus.classList.toggle("hidden", !focused);
  if (focused) stage.scrollIntoView({ behavior: "smooth", block: "start" });
}
function readLocalStats() {
  const stats = persistentRead("doudi-stats", {
    games: 0,
    wins: 0,
    turns: 0,
    highest: 0,
    bestName: "—",
  });
  if (stats.version !== 2) {
    stats.legacyHighest = stats.highest;
    stats.legacyTotals = stats.games > 0;
    stats.highest = 0;
    stats.bestName = "—";
    stats.version = 2;
    stats.personalGames = 0;
    persistentWrite("doudi-stats", stats);
  }
  return stats;
}
function localStats() {
  const stats = readLocalStats();
  const achievements = [
    [stats.games >= 1, "First game", "Finish your first game"],
    [stats.wins >= 1, "Winner", "Win a game"],
    [stats.games >= 5, "Regular", "Finish five games"],
    [stats.highest >= 2000, "Property mogul", "Reach £2,000 net worth"],
  ];
  showModal(
    "Your statistics",
    `<div class="stats-grid"><p><small>Games finished</small><strong>${stats.games}</strong></p><p><small>Wins</small><strong>${stats.wins}</strong></p><p><small>Total turns</small><strong>${stats.turns}</strong></p><p><small>Highest net worth</small><strong>${money(stats.highest)}</strong></p></div><h3>Achievements</h3><div class="achievement-list">${achievements.map(([earned, title, detail]) => `<div class="achievement ${earned ? "earned" : ""}"><strong>${earned ? "✓" : "○"} ${title}</strong><small>${detail}</small></div>`).join("")}</div><p class="form-help">Statistics are stored locally in this browser and are never sent online.</p>${actionButton("statsDone", "Back", false)}`,
    "local-stats",
  );
  bind("#statsDone", closeModal);
  if (stats.legacyTotals) $("#modalContent").insertAdjacentHTML("beforeend", `<p class="form-help">Game and win totals include older records. Your personal best starts with corrected results; the previous recorded high was ${money(stats.legacyHighest)} and may have belonged to another player. Tied winners count as wins.</p>`);
}
function recordLocalStats(ranked) {
  if (connection || !game || game.phase !== "over") return;
  const key = `${game.startedAt || "local"}:${game.turnNumber}:${game.reason}:${game.players.map((p) => p.name).join(",")}`;
  const stats = readLocalStats();
  if (stats.lastGame === key || stats.recordedGames?.includes(key)) return;
  const ownTotal = E.netWorth(game, me);
  const won = game.mode === "teams"
    ? teamWorth(game.players[me].team) >= teamWorth(1 - game.players[me].team)
    : ownTotal === ranked[0].total;
  stats.games += 1;
  stats.personalGames = (stats.personalGames || 0) + 1;
  stats.wins += won ? 1 : 0;
  stats.turns += game.turnNumber;
  if (stats.personalGames === 1 || ownTotal > stats.highest) {
    stats.highest = ownTotal;
    stats.bestName = game.players[me].name;
  }
  stats.lastGame = key;
  stats.recordedGames = [...(stats.recordedGames || []), key].slice(-100);
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
  game.players.forEach((p, i) => {
    next.players[i].team = p.team;
    next.players[i].botStyle = p.botStyle;
  });
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
    !reducedMotion()
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
        await delay(gameSpeed() === "fast" ? 110 : 440);
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
  }, gameSpeed() === "normal" ? 700 : gameSpeed() === "fast" ? 200 : 50);
}
applyTheme(loadTheme());
applyAccessibility(persistentRead("doudi-accessibility", { largeText: false, highContrast: false, staticMotion: false }));
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
bind("#accessibilitySettings", accessibilitySettings);
bind("#gameSettings", accessibilitySettings);
bind("#browseProperties", browseProperties);
bind("#localStats", localStats);
bind("#boardFullscreen", toggleBoardFocus);
bind("#boardUnfocus", toggleBoardFocus);
bind("#spaceInspectorClose", () => $("#spaceInspector").classList.add("hidden"));
$("#historyFilter")?.addEventListener("change", render);
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
  if (!loadPracticeRecovery()) toast("No valid autosave found. Load a saved .txt file instead.");
});
refreshContinue();
