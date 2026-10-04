"use strict";

// Classic scripts share the app session; functions run after app.js initialises.
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
    !persistentRead("doudi-last-practice") && !persistentRead("doudi-previous-practice"),
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
  if (connection) $("#saveStatus").textContent = "Online room saved by server";
  if (!connection) {
    try {
      const previous = localStorage.getItem("doudi-last-practice");
      if (previous && previous !== JSON.stringify(game)) {
        try { E.validate(JSON.parse(previous)); localStorage.setItem("doudi-previous-practice", previous); } catch { /* Keep the last valid backup. */ }
      }
      localStorage.setItem("doudi-last-practice", JSON.stringify(game));
      localStorage.setItem("doudi-last-saved", String(Date.now()));
      $("#saveStatus").textContent = `Saved ${new Date().toLocaleTimeString()}`;
    } catch {
      $("#saveStatus").textContent = "Browser save failed — export Save .txt";
      if (!saveWarningShown) { toast("Browser storage is unavailable or full. Use Save .txt; tab recovery may still work."); saveWarningShown = true; }
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
    if (!loadPracticeRecovery()) toast("The automatic save could not be restored. You can load a saved .txt file.");
  }
}
function loadPracticeRecovery() {
  for (const key of ["doudi-last-practice", "doudi-previous-practice"]) {
    try {
      const state = E.validate(persistentRead(key));
      localGame(E.tick(state));
      toast(key.includes("previous") ? "Recovered the previous autosave. Your latest action may be missing." : "Recovered your saved practice game.");
      return true;
    } catch { /* Try the next valid copy. */ }
  }
  return false;
}
