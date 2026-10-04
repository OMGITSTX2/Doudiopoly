"use strict";

// Classic scripts share the app session; functions run after app.js initialises.
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
