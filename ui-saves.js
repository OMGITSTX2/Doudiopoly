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
function savedGames(selectedSlot = "1") {
  if (!["1", "2", "3", "4", "5"].includes(selectedSlot)) selectedSlot = "1";
  const stored = persistentRead("doudi-save-slots", {});
  const slots = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
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
      '</select><p id="saveSummary" class="form-help"></p><label class="field-label" for="saveName">Save name</label><input id="saveName" class="text-input" maxlength="40" value="' +
      escapeHtml(game?.title || "My game") +
      '" />' +
      (game && !connection
        ? actionButton("writeSlot", "Save to selected slot")
        : "") +
      actionButton("readSlot", "Load selected slot", false) +
      actionButton("renameSlot", "Rename selected save", false) +
      actionButton("deleteSlot", "Delete selected save", false) +
      (persistentRead("doudi-previous-practice") ? actionButton("recoverPrevious", "Restore previous autosave", false) : "") +
      actionButton("slotsDone", "Back", false),
  );
  $("#saveSlot").value = selectedSlot;
  function describeSlot() {
    const slot = slots[$("#saveSlot").value];
    $("#saveName").value = slot?.name || game?.title || "My game";
    $("#saveSummary").textContent = slot ? `${slot.savedAt ? new Date(slot.savedAt).toLocaleString() : "Save date unavailable"} · ${modeNames[slot.state?.mode] || "Unknown mode"} · Turn ${slot.state?.turnNumber ?? 0} · ${(slot.state?.players || []).map(p => p.name).join(", ")}` : "Empty slot";
    for (const id of ["readSlot", "renameSlot", "deleteSlot"]) $("#" + id).disabled = !slot || (id === "readSlot" && !!connection);
    $("#deleteSlot").textContent = "Delete selected save";
    $("#deleteSlot").dataset.confirm = "";
    if ($("#writeSlot")) { $("#writeSlot").textContent = "Save to selected slot"; $("#writeSlot").dataset.confirm = ""; }
  }
  $("#saveSlot").addEventListener("change", describeSlot);
  describeSlot();
  const writeSlots = () => {
    try { localStorage.setItem("doudi-save-slots", JSON.stringify(slots)); return true; }
    catch { toast("Browser storage is unavailable. Your saved games were not changed. Use Save .txt."); closeModal(); savedGames(); return false; }
  };
  bind("#renameSlot", () => {
    const slot = $("#saveSlot").value;
    if (!slots[slot]) return;
    slots[slot] = {...slots[slot], name: $("#saveName").value.trim() || "My game"};
    if (writeSlots()) { toast("Saved game renamed."); closeModal(); savedGames(slot); }
  });
  bind("#deleteSlot", () => {
    const slot = $("#saveSlot").value;
    if (!slots[slot]) return;
    if ($("#deleteSlot").dataset.confirm !== slot) { $("#deleteSlot").dataset.confirm = slot; $("#deleteSlot").textContent = "Delete this save? Click to confirm"; return; }
    delete slots[slot];
    if (writeSlots()) { toast("Saved game deleted."); closeModal(); savedGames(slot); }
  });
  bind("#recoverPrevious", () => {
    if (connection) return toast("Leave the online room before restoring a practice autosave.");
    showModal("Restore previous autosave?", `<p>This replaces the current practice game with the earlier autosave. Actions after that save will not be included.</p>${actionButton("confirmRecovery", "Restore previous autosave")}${actionButton("cancelRecovery", "Cancel", false)}`, "recover-save");
    bind("#confirmRecovery", () => {
      try { localGame(E.tick(E.validate(persistentRead("doudi-previous-practice")))); toast("Previous autosave restored. Later actions are not included."); }
      catch { toast("The previous autosave is unavailable or invalid. Load a saved .txt file instead."); }
    });
    bind("#cancelRecovery", savedGames);
  });
  bind("#writeSlot", () => {
    const slot = $("#saveSlot").value;
    const save = () => {
      try {
        slots[slot] = {
          name: $("#saveName").value.trim() || "My game",
          savedAt: Date.now(),
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
