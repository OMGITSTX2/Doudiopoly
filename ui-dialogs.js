"use strict";

// Classic scripts share the app session; functions run after app.js initialises.
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
  if (force) modalKey = "";
  if (force) modalKey = "";
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
    $("#modalContent").insertAdjacentHTML("beforeend", `<div class="trade-preview">${E.tradePreview(game, t).map(side => `<section><strong>${escapeHtml(game.players[side.player].name)} after trade</strong><p>Cash ${money(side.cash)} · Mortgage debt ${money(side.mortgages)}</p><p>Completes: ${side.gained.map(name => escapeHtml(groupLabels[name])).join(", ") || "None"} · Breaks: ${side.broken.map(name => escapeHtml(groupLabels[name])).join(", ") || "None"}</p></section>`).join("")}</div>`);
    if (me === t.to) {
      $("#modalContent").insertAdjacentHTML("beforeend", actionButton("counterTrade", "Make counteroffer", false));
      bind("#counterTrade", () => showTrade(t));
    }
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
    $("#modalContent").insertAdjacentHTML("beforeend", `<p>Recipient: ${d.creditor === null ? "Bank" : escapeHtml(game.players[d.creditor].name)} · Cash after settlement: ${money(Math.max(0, game.players[me].balance - d.amount))}. This bill already includes any Doudi adjustment.</p>`);
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
    $("#modalContent").insertAdjacentHTML("beforeend", `<ul class="auction-players">${game.players.map((p, i) => `<li><strong>${escapeHtml(p.name)}</strong> · ${a.passed.includes(i) ? "Withdrawn" : i === a.highBidder ? "Highest bidder" : i === a.bidder ? "Bidding now" : "Waiting"} · Maximum bid ${money(p.balance)}</li>`).join("")}</ul>`);
    if (a.bidder === me && game.players[me].balance < a.highBid + 10) $("#placeBid").disabled = true;
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
    const amount = E.pendingEffect(game).amount;
    showModal(
      spaces[a.index].name,
      `${paymentBreakdown(E.pendingEffect(game), a.index === 4 ? 200 : 100)}${actionButton("payTax", `Pay ${money(amount)}`)}`,
      key,
    );
    bind("#payTax", () => send({ type: "payTax" }));
  } else if (a.type === "card") {
    const card = E.CARDS[a.deck][a.card];
    const effect = E.pendingEffect(game);
    const label = effect.kind === "pay" ? `Pay ${money(effect.amount)}` : effect.kind === "receive" ? `Receive ${money(effect.amount)}` : "Continue";
    showModal(
      card.title,
      `<p>${escapeHtml(card.text)}</p>${E.isDoudi(game, me) ? "<p>Your Doudi bonus or discount applies to cash rewards and costs.</p>" : ""}${actionButton("resolveCard", label)}`,
      key,
    );
    if (effect.kind === "pay") $("#modalContent").insertAdjacentHTML("beforeend", paymentBreakdown(effect, E.pendingBase(game)));
    bind("#resolveCard", () => send({ type: "card" }));
  } else if (["doudiReady", "doudiTravel", "destination"].includes(a.type)) {
    closeModal();
    $("#rollHint").textContent =
      a.type === "doudiReady"
        ? "Press Roll dice for your Doudi roll"
        : "Select a highlighted destination on the board";
  } else if (a.type === "doudiResult") {
    const total = a.total;
    const effect = E.pendingEffect(game);
    const label =
      total <= 4
        ? `Pay ${money(effect.amount)}`
        : total <= 9
          ? `Receive ${money(effect.amount)}`
          : total === 10
            ? "Pay £25 to each player"
            : "Choose a space on the board";
    showModal(
      `Doudi roll: ${total}`,
      `<p>${label}.</p>${actionButton("resolveDoudi", label)}`,
      key,
    );
    if (["pay", "payEach"].includes(effect.kind)) $("#modalContent").insertAdjacentHTML("beforeend", paymentBreakdown(effect, total === 10 ? effect.total : 100));
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
function paymentBreakdown(effect, base) {
  const due = effect.kind === "payEach" ? effect.total : effect.amount;
  const cash = game.players[me].balance;
  const recipient = effect.kind === "payEach" ? game.players.filter((p, i) => i !== me).map(p => escapeHtml(p.name)).join(", ") : "Bank";
  return `<dl class="worth-breakdown"><div><dt>Normal charge</dt><dd>${money(base)}</dd></div><div><dt>Doudi discount</dt><dd>${money(base - due)}</dd></div><div><dt>Recipient</dt><dd>${recipient}</dd></div><div><dt>Payment</dt><dd>${money(due)}</dd></div><div><dt>Cash after payment</dt><dd>${money(Math.max(0, cash - due))}</dd></div></dl>${cash < due ? `<p>You need to raise ${money(due - cash)} before completing this payment.</p>` : ""}`;
}
function showAssets() {
  const indexes = E.own(game, me);
  const groups = [...new Set(indexes.map((i) => spaces[i].group || spaces[i].type))];
  const action = (i, type, label) => {
    const reason = E.managementReason(game, me, { type, index: i });
    return `<div><button class="property-action" data-command="${type}" data-index="${i}" ${reason ? "disabled" : ""}>${label}</button>${reason ? `<small class="action-reason">${escapeHtml(reason)}</small>` : ""}</div>`;
  };
  const content = groups.map((name) => {
    const all = spaces.map((space, i) => (space.group || space.type) === name ? i : -1).filter((i) => i >= 0);
    const owned = indexes.filter((i) => all.includes(i));
    return `<section class="asset-group"><h3>${escapeHtml(groupLabels[name] || name)} <small>${owned.length}/${all.length} owned</small></h3>${owned.map((i) => `<div class="asset-row"><span><b>${escapeHtml(spaces[i].name)}</b><small>${game.mortgaged[i] ? "Mortgaged" : `Rent ${money(E.rent(game, i))}`} · ${game.buildings[i] === 5 ? "Hotel" : `${game.buildings[i] || 0} houses`}</small></span><div class="asset-actions">${action(i, "mortgage", game.mortgaged[i] ? `Repay ${money(Math.ceil(spaces[i].price / 2 * 1.1))}` : `Mortgage +${money(spaces[i].price / 2)}`)}${E.rentSchedule(i).length === 7 ? action(i, "build", `Build ${money(E.buildCost(i))}`) + action(i, "sellBuilding", `Sell +${money(E.buildCost(i) / 2)}`) : ""}</div></div>`).join("")}</section>`;
  }).join("");
  showModal("Manage properties", `<p>Build and sell evenly across complete colour sets. Mortgage repayments include 10% interest.</p><div class="asset-list">${content || "<p>No properties available.</p>"}</div>${actionButton("assetsDone", game.debt ? "Back to payment" : "Done", false)}`, "assets");
  $("#modalContent").querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", async () => {
      const token = generation;
      await send({ type: button.dataset.command, index: Number(button.dataset.index) });
      if (token === generation && game && !game.debt && game.phase !== "over") showAssets();
    });
  });
  bind("#assetsDone", () => game.debt ? showPending(true) : closeModal());
}
function showTrade(counter = null) {
  if (!Array.isArray(counter?.give)) counter = null;
  const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== me);
  showModal("Offer a trade",
    `<p>Both players must agree. Mortgages stay attached; sell buildings before trading a colour set.</p><label class="field-label" for="tradePlayer">Other player</label><select id="tradePlayer" class="text-input">${others.map(({p, i}) => `<option value="${i}">${escapeHtml(p.name)} · ${money(p.balance)}</option>`).join("")}</select><div class="trade-columns"><fieldset><legend>You give</legend><div id="giveProperties"></div><label class="field-label" for="giveCash">Cash</label><input id="giveCash" class="text-input" type="number" min="0" value="0" /></fieldset><fieldset><legend>You receive</legend><div id="receiveProperties"></div><label class="field-label" for="receiveCash">Cash</label><input id="receiveCash" class="text-input" type="number" min="0" value="0" /></fieldset></div><div id="tradePreview" class="trade-preview" aria-live="polite"></div>${actionButton("sendTrade", "Send offer")}${actionButton("tradeBack", "Back", false)}`, "trade-form");
  function draft() {
    return {
      from: me, to: Number($("#tradePlayer").value),
      give: [...$("#giveProperties").querySelectorAll(":checked")].map((b) => Number(b.value)),
      receive: [...$("#receiveProperties").querySelectorAll(":checked")].map((b) => Number(b.value)),
      giveCash: Number($("#giveCash").value), receiveCash: Number($("#receiveCash").value),
    };
  }
  function preview() {
    try {
      const result = E.tradePreview(game, draft());
      $("#tradePreview").innerHTML = result.map((side) => `<section><strong>${escapeHtml(game.players[side.player].name)} after trade</strong><p>Cash ${money(side.cash)} · Mortgage debt ${money(side.mortgages)}</p>${side.gained.length ? `<p>Completes: ${side.gained.map((name) => escapeHtml(groupLabels[name])).join(", ")}</p>` : ""}${side.broken.length ? `<p>Breaks: ${side.broken.map((name) => escapeHtml(groupLabels[name])).join(", ")}</p>` : ""}</section>`).join("") + "<p class=\"form-help\">Mortgage debt is the outstanding principal. Repaying a mortgage later also costs 10% interest.</p>";
      $("#sendTrade").disabled = false;
    } catch (error) {
      $("#tradePreview").textContent = error.message;
      $("#sendTrade").disabled = true;
    }
  }
  function choices() {
    for (const [id, player] of [["giveProperties", me], ["receiveProperties", Number($("#tradePlayer").value)]])
      $("#" + id).innerHTML = E.own(game, player).map((i) => {
        const developed = spaces.some((space, n) => space.group === spaces[i].group && game.buildings[n]);
        return `<label class="trade-check"><input type="checkbox" value="${i}" ${developed ? "disabled" : ""} />${escapeHtml(spaces[i].name)}${game.mortgaged[i] ? ` · mortgage ${money(spaces[i].price / 2)}` : ""}${developed ? " · sell set buildings first" : ""}</label>`;
      }).join("") || "<small>No properties</small>";
    preview();
  }
  choices();
  if (counter) {
    $("#tradePlayer").value = String(counter.from);
    $("#tradePlayer").disabled = true;
    choices();
    for (const [id, values] of [["giveProperties", counter.receive], ["receiveProperties", counter.give]])
      $("#" + id).querySelectorAll("input").forEach(input => { input.checked = values.includes(Number(input.value)); });
    $("#giveCash").value = counter.receiveCash;
    $("#receiveCash").value = counter.giveCash;
    $("#sendTrade").textContent = "Send counteroffer";
    preview();
  }
  $("#tradePlayer").addEventListener("change", choices);
  for (const id of ["giveProperties", "receiveProperties"])
    $("#" + id).addEventListener("change", preview);
  for (const id of ["giveCash", "receiveCash"])
    $("#" + id).addEventListener("input", preview);
  bind("#sendTrade", () => send({ type: counter ? "tradeCounter" : "trade", ...draft() }));
  bind("#tradeBack", () => counter || game.debt ? showPending(true) : closeModal());
}
function propertyDetails(i) {
  const space = spaces[i], owner = game.owned[i], schedule = E.rentSchedule(i);
  const potential = owner === undefined;
  const rentText = space.type === "utility" && potential
    ? "4× dice (10× with both)"
    : money(potential ? space.rent : E.rent(game, i)) + (space.type === "utility" ? " at dice 7" : "");
  showModal(space.name,
    `<p>Owner: <strong>${owner === undefined ? "Bank — available to buy" : escapeHtml(game.players[owner].name)}</strong></p><div class="detail-grid"><p>Price<strong>${money(space.price)}</strong></p><p>${potential ? "Potential base rent" : "Current rent"}<strong>${rentText}</strong></p><p>Mortgage value<strong>${money(Math.floor(space.price / 2))}</strong></p><p>Status<strong>${game.mortgaged[i] ? "Mortgaged — no rent" : game.buildings[i] === 5 ? "Hotel" : `${game.buildings[i] || 0} houses`}</strong></p></div>${schedule.length ? `<table class="rent-table"><caption>Rent schedule</caption><tbody>${schedule.map((row) => `<tr><th scope="row">${row.label}</th><td>${money(row.amount)}</td></tr>`).join("")}</tbody></table>` : "<p>Utility rent is 4× the dice total with one utility, or 10× with both.</p>"}${schedule.length === 7 ? `<p>Each building level costs ${money(E.buildCost(i))}. Build evenly across the complete unmortgaged set.</p>` : ""}<p class="form-help">Rent schedule shows normal amounts before Doudi bonuses or discounts. Mortgaged properties collect no rent.</p>${actionButton("detailsDone", "Back to game")}`);
  bind("#detailsDone", () => { closeModal(); showPending(true); });
}
function worthDetails(i) {
  const value = E.netWorthBreakdown(game, i);
  return `<dl class="worth-breakdown">${[["Cash", value.cash], ["Properties", value.properties], ["Buildings", value.buildings], ["Mortgage debt", -value.mortgages], ["Unpaid bills", -value.debt]].map(([label, amount]) => `<div><dt>${label}</dt><dd>${amount < 0 ? "−" : ""}${money(Math.abs(amount))}</dd></div>`).join("")}<div class="worth-total"><dt>Final net worth</dt><dd>${money(value.total)}</dd></div></dl>`;
}
function performanceDetails(p) {
  if (!p.totals) return "<p class=\"form-help\">Performance totals were not recorded in this older save.</p>";
  return `<dl class="worth-breakdown">${[["Rent earned", p.totals.rentEarned], ["Bills paid", p.totals.payments], ["Auction spending", p.totals.auctionSpent], ["Biggest property purchase", p.totals.biggestPurchase]].map(([label, value]) => `<div><dt>${label}</dt><dd>${money(value)}</dd></div>`).join("")}</dl>${p.totalsIncomplete ? "<p class=\"form-help\">Performance totals cover actions recorded since this update; earlier actions in this save are unavailable.</p>" : ""}`;
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
            )} building levels</small></div><b>${money(total)}</b></div>${worthDetails(i)}${performanceDetails(p)}<div class="score-properties">${
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
    `<div class="rules-copy"><p>Add 2–6 players and start. Everyone rolls once; highest starts, ties follow joining order. Turns then follow joining order.</p><p>Roll, resolve your landing action, then press <strong>End turn</strong>. Doubles allow another roll; three consecutive doubles send you to Jail. Normal movement takes 440ms per space.</p><p>Buy properties or send them to auction. Bids rise by at least £10. Passing withdraws you. Complete unmortgaged street sets double base rent. Stations charge £25–£200 depending on the number owned; utilities charge 4× dice or 10× with both.</p><p>Build evenly on complete, unmortgaged street sets: four houses, then a hotel. Sell evenly for half the building cost. Building supply is unlimited. Mortgage for half the purchase value; repay principal plus 10%. Net worth is cash plus property and building costs, minus mortgage principal and unpaid bills. Buying at list price converts cash into assets, so it does not increase net worth. During play, the sidebar shows cash only. At the end, the highest net worth wins.</p><p>Trade cash and properties by mutual agreement. Mortgages transfer unchanged. Practice players assess cash, mortgage debts and completed sets according to their style. To resolve a debt, mortgage, sell buildings, trade, or declare bankruptcy. <strong>The first bankruptcy ends the game.</strong></p><p>Jail: use a release card, pay £50 before rolling, or attempt doubles. After three failed attempts, pay £50 and move the third roll. Leaving Jail with doubles grants no extra roll.</p><p>Free Parking makes you <strong>Doudi</strong> for your next three completed turns; the claiming turn does not count. Another claimant replaces you. Receive double rent, START and positive card rewards; pay half rent, taxes, negative cards, Jail fees and Doudi penalties. Purchases, bids, buildings, trades and mortgages are unaffected. The bank covers differences between discounted payments and boosted rent.</p><p>Doudi spaces: travel to an owned property on that side or roll two dice. 2–4: pay £100; 5–9: receive £100; 10: pay £25 to every other player (exactly £25, without Doudi bonuses or discounts); 11–12: choose any space. Doudi travel has no landing effects and no START bonus.</p><p><strong>Modes:</strong> Doudi is the default. Classic disables Doudi status and makes Doudi spaces rest spaces. Quick starts with £1,000 and ends after 20 rounds or bankruptcy. Timed ends at the deadline or bankruptcy. Teams combines net worth and waives teammate rent; cash and ownership stay individual. All modes retain the 44-space board.</p><p>Save at any time: movement animations represent an already committed move. Loading resumes the recorded action. Online snapshots can be loaded into practice mode; other seats become bots. Online rooms are controlled by the server.</p></div>`,
    "rules",
  );
}
