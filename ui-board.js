"use strict";

// Classic scripts share the app session; functions run after app.js initialises.
function buildBoard() {
  const board = $("#board");
  const focused = document.activeElement?.dataset?.boardIndex;
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
      travel ? send({ type: "travel", index: i }) : inspectSpace(i);
    if (travel) square.classList.add("travel-target");
    square.tabIndex = 0;
    square.dataset.boardIndex = String(i);
    square.setAttribute("role", "button");
    square.setAttribute("aria-label", `${space.name} — ${travel ? "travel here" : "view space details"}`);
    square.addEventListener("click", select);
    square.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const target = e.key === "Home" ? 0 : e.key === "End" ? spaces.length - 1 : boardArrowTarget(i, e.key);
        board.children[target]?.focus();
      }
    });
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
  if (focused !== undefined) board.children[Number(focused)]?.focus({preventScroll: true});
}
function boardArrowTarget(index, key) {
  const [row, col] = DoudiData.boardCell(index);
  const vertical = key === "ArrowUp" || key === "ArrowDown";
  const direction = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
  const candidates = spaces.map((_, i) => ({index: i, cell: DoudiData.boardCell(i)})).filter(entry => {
    const [r, c] = entry.cell;
    return vertical ? c === col && (r - row) * direction > 0 : r === row && (c - col) * direction > 0;
  });
  candidates.sort((a, b) => Math.abs(a.cell[vertical ? 0 : 1] - (vertical ? row : col)) - Math.abs(b.cell[vertical ? 0 : 1] - (vertical ? row : col)));
  return candidates[0]?.index ?? index;
}
function renderDestinationChoices() {
  const panel = $("#destinationChoices");
  const pending = game.pending;
  const choosing = myTurn() && connected && !busy && !sending &&
    ["destination", "doudiTravel"].includes(pending?.type);
  panel.classList.toggle("hidden", !choosing);
  if (!choosing) return;
  const targets = spaces
    .map((space, i) => ({ space, i }))
    .filter(({ i }) => pending.type === "destination" ||
      (game.owned[i] === me && E.side(i) === E.side(game.players[me].position)));
  panel.innerHTML = `<strong>${pending.type === "destination" ? "Choose any space" : "Choose your property on this side"}</strong><p>Tap a highlighted board space or use a destination button below.</p><div class="destination-grid">${targets.map(({space, i}) => `<button type="button" class="secondary-button" data-destination="${i}">${escapeHtml(space.name)}</button>`).join("")}</div>`;
  panel.querySelectorAll("[data-destination]").forEach((button) =>
    button.addEventListener("click", () => send({ type: "travel", index: Number(button.dataset.destination) })));
}
function browseProperties() {
  showModal("Browse properties", `<label class="field-label" for="propertySearch">Search by name, set or owner</label><input id="propertySearch" class="text-input" type="search" placeholder="Search properties" /><div id="browserPropertyList" class="property-browser"></div>${actionButton("browseDone", "Back to game", false)}`, "property-browser");
  $("#browserPropertyList").insertAdjacentHTML("beforebegin", `<div class="property-filters"><label>Owner<select id="propertyOwner" class="text-input"><option value="all">Everyone</option><option value="bank">Bank</option>${game.players.map((p, i) => `<option value="${i}">${i === me ? "Your properties" : escapeHtml(p.name)}</option>`).join("")}</select></label><label>Status<select id="propertyStatus" class="text-input"><option value="all">All properties</option><option value="mortgaged">Mortgaged</option><option value="complete">Complete colour sets</option></select></label><label>Sort<select id="propertySort" class="text-input"><option value="board">Board order</option><option value="price-low">Price: low first</option><option value="price-high">Price: high first</option><option value="rent-high">Rent: high first</option><option value="rent-low">Rent: low first</option></select></label></div>`);
  const choosing = myTurn() && connected && !busy && !sending && ["destination", "doudiTravel"].includes(game.pending?.type);
  const listedRent = (space, i) => game.owned[i] === undefined ? space.type === "utility" ? 28 : space.rent || 0 : E.rent(game, i);
  function list() {
    const query = $("#propertySearch").value.trim().toLowerCase();
    const ownerFilter = $("#propertyOwner").value;
    const status = $("#propertyStatus").value;
    const rows = spaces.map((space, i) => ({space, i})).filter(({space, i}) => {
      const owner = game.owned[i] === undefined ? "Bank" : game.players[game.owned[i]].name;
      if (ownerFilter === "bank" && game.owned[i] !== undefined || ownerFilter !== "all" && ownerFilter !== "bank" && game.owned[i] !== Number(ownerFilter)) return false;
      if (status === "mortgaged" && !game.mortgaged[i]) return false;
      if (status === "complete" && !(game.owned[i] !== undefined && E.rentSchedule(i).length === 7 && spaces.every((s, n) => s.group !== space.group || game.owned[n] === game.owned[i]))) return false;
      return (space.price || choosing) && `${space.name} ${groupLabels[space.group] || space.type} ${owner}`.toLowerCase().includes(query);
    });
    const sort = $("#propertySort").value;
    if (sort !== "board") rows.sort((a, b) => {
      const value = row => sort.startsWith("price") ? row.space.price || 0 : listedRent(row.space, row.i);
      return (value(a) - value(b)) * (sort.endsWith("high") ? -1 : 1) || a.i - b.i;
    });
    $("#browserPropertyList").innerHTML = rows.map(({space, i}) => {
      const owner = game.owned[i] === undefined ? "Bank" : game.players[game.owned[i]].name;
      const travel = choosing && (game.pending.type === "destination" || game.owned[i] === me && E.side(i) === E.side(game.players[me].position));
      return `<article><strong>${escapeHtml(space.name)}</strong><small>${escapeHtml(owner)}${space.price ? ` · ${money(space.price)} · ${game.mortgaged[i] ? "Mortgaged" : "Unmortgaged"} · ${money(listedRent(space, i))} ${space.type === "utility" ? "rent at dice 7" : "rent"}` : ""}</small><button class="secondary-button" data-inspect="${i}">Details</button>${travel ? `<button class="primary-button" data-travel="${i}">Travel here</button>` : ""}</article>`;
    }).join("") || "<p>No matching properties.</p>";
    $("#browserPropertyList").querySelectorAll("[data-inspect]").forEach(b => b.addEventListener("click", () => { closeModal(); inspectSpace(Number(b.dataset.inspect)); }));
    $("#browserPropertyList").querySelectorAll("[data-travel]").forEach(b => b.addEventListener("click", () => send({type:"travel", index:Number(b.dataset.travel)})));
  }
  $("#propertySearch").addEventListener("input", list);
  for (const id of ["propertyOwner", "propertyStatus", "propertySort"]) $("#" + id).addEventListener("change", list);
  bind("#browseDone", () => { closeModal(); showPending(true); });
  list();
}
function inspectSpace(i) {
  const space = spaces[i];
  if (space.price) return propertyDetails(i);
  const panel = $("#spaceInspector");
  const classicDoudi = game.mode === "classic" && space.type === "doudi";
  const description = classicDoudi
    ? "Rest space. No Doudi action in Classic mode."
    : space.type === "doudi"
      ? "Choose a dice roll for a cash effect or travel to your own property on this side."
      : i === 22 && game.mode !== "classic"
        ? "Become Doudi for three completed turns: double income and half costs."
        : i === 33
          ? "Go directly to Jail without collecting START money."
          : space.type === "tax"
            ? `Pay ${money(E.isDoudi(game, me) ? Math.ceil((i === 4 ? 200 : 100) / 2) : i === 4 ? 200 : 100)} when you land here.`
            : space.type === "chance" || space.type === "chest"
              ? "Draw and resolve the next card when you land here."
              : space.note || "No payment or action on this space.";
  $("#spaceInspectorTitle").textContent = space.name;
  $("#spaceInspectorText").textContent = description;
  panel.classList.remove("hidden");
}
