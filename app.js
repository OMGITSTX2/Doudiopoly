const spaces = [
  { name:'START', type:'corner', note:'Collect £200' },
  { name:'Old Kent Road', group:'brown', price:60, rent:2 },
  { name:'Community Chest', type:'chest', note:'Draw a card' },
  { name:'Whitechapel Road', group:'brown', price:60, rent:4 },
  { name:'Income Tax', type:'tax', note:'Pay £200' },
  { name:'King’s Cross', group:'station', price:200, rent:25 },
  { name:'The Angel, Islington', group:'lightblue', price:100, rent:6 },
  { name:'Chance', type:'chance', note:'Take a chance' },
  { name:'Euston Road', group:'lightblue', price:100, rent:6 },
  { name:'Pentonville Road', group:'lightblue', price:120, rent:8 },
  { name:'JAIL', type:'corner', note:'Just visiting' },
  { name:'DOUDI SPACE', type:'doudi', note:'Choose your fate' },
  { name:'Pall Mall', group:'pink', price:140, rent:10 },
  { name:'Electric Company', type:'utility', price:150, rent:0 },
  { name:'Whitehall', group:'pink', price:140, rent:10 },
  { name:'Northumberland Ave', group:'pink', price:160, rent:12 },
  { name:'Marylebone Station', group:'station', price:200, rent:25 },
  { name:'Bow Street', group:'orange', price:180, rent:14 },
  { name:'Community Chest', type:'chest', note:'Draw a card' },
  { name:'Marlborough Street', group:'orange', price:180, rent:14 },
  { name:'Vine Street', group:'orange', price:200, rent:16 },
  { name:'FREE PARKING', type:'corner', note:'Take a breather' },
  { name:'DOUDI SPACE', type:'doudi', note:'Choose your fate' },
  { name:'Strand', group:'red', price:220, rent:18 },
  { name:'Chance', type:'chance', note:'Take a chance' },
  { name:'Fleet Street', group:'red', price:220, rent:18 },
  { name:'Trafalgar Square', group:'red', price:240, rent:20 },
  { name:'Fenchurch Station', group:'station', price:200, rent:25 },
  { name:'Leicester Square', group:'yellow', price:260, rent:22 },
  { name:'Coventry Street', group:'yellow', price:260, rent:22 },
  { name:'Water Works', type:'utility', price:150, rent:0 },
  { name:'Piccadilly', group:'yellow', price:280, rent:24 },
  { name:'GO TO JAIL', type:'corner', note:'Do not pass GO' },
  { name:'DOUDI SPACE', type:'doudi', note:'Choose your fate' },
  { name:'Regent Street', group:'green', price:300, rent:26 },
  { name:'Oxford Street', group:'green', price:300, rent:26 },
  { name:'Community Chest', type:'chest', note:'Draw a card' },
  { name:'Bond Street', group:'green', price:320, rent:28 },
  { name:'Liverpool Street', group:'station', price:200, rent:25 },
  { name:'Chance', type:'chance', note:'Take a chance' },
  { name:'Park Lane', group:'darkblue', price:350, rent:35 },
  { name:'Super Tax', type:'tax', note:'Pay £100' },
  { name:'Mayfair', group:'darkblue', price:400, rent:50 },
  { name:'DOUDI SPACE', type:'doudi', note:'Choose your fate' },
];

const colors = { brown:'#a87850', lightblue:'#91cde0', pink:'#db90b4', orange:'#efa15d', red:'#ea756b', yellow:'#f4ca60', green:'#85b994', darkblue:'#7886c9', station:'#2d3748', utility:'#80a4b8' };
const groupLabels = { brown:'Brown set', lightblue:'Light blue set', pink:'Pink set', orange:'Orange set', red:'Red set', yellow:'Yellow set', green:'Green set', darkblue:'Blue set', station:'Stations', utility:'Utilities' };
const avatars = [{bg:'#dfe9ff', color:'#5876ba', icon:'Y'}, {bg:'#ffe1dc', color:'#d86c5b', icon:'J'}, {bg:'#e4f4df', color:'#69a478', icon:'M'}, {bg:'#fff0c5', color:'#c3902c', icon:'S'}, {bg:'#eadfff', color:'#8b73c7', icon:'R'}, {bg:'#d8f2ef', color:'#4d9d9a', icon:'A'}];
const playerColors = ['#ef5b5b', '#4d78df', '#2ead78', '#e3a52f', '#9569d8', '#df5d9b'];
const tokenTypes = ['pawn', 'car', 'hat', 'boot', 'ship', 'dog'];
const chanceCards = [
  { title:'A sunny shortcut', text:'Collect £50 from the bank.', amount:50 },
  { title:'Street festival', text:'Pay £30 for your share of the festivities.', amount:-30 },
  { title:'Lucky find', text:'Collect £100 from the bank.', amount:100 },
];
const doudiTurns = 3;
const tokenMoveDelay = 440;
let game = { mode:'create', code:'', title:'', players:[], currentPlayer:0, balance:1500, properties:[], owned:{}, mortgaged:{}, debt:null, sound:true, rolling:false, moving:false, over:false, phase:'starting', startRolls:{}, turnHasRolled:false, actionPending:false, pendingDoudi:null, doudiPlayer:null, doudiTurnsLeft:0, doudiClaimedThisTurn:false };
const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char])); }
function randomCode() { return Math.random().toString(36).slice(2,8).toUpperCase(); }
function playerColor(playerIndex) { return game.players[playerIndex]?.color || playerColors[playerIndex % playerColors.length]; }
function ensurePlayerColor(player, playerIndex) { player.color = player.color || playerColors[playerIndex % playerColors.length]; return player; }
function money(value) { return `£${Number(value).toLocaleString('en-GB')}`; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function boardSide(index) { return index <= 11 ? 'top' : index <= 22 ? 'right' : index <= 33 ? 'bottom' : 'left'; }
function sideLabel(side) { return { top:'top side', right:'right side', bottom:'bottom side', left:'left side' }[side]; }
function sideRange(side) { return side === 'top' ? [0, 11] : side === 'right' ? [12, 22] : side === 'bottom' ? [23, 33] : [34, 43]; }
function propertiesOnSide(playerIndex, side) { const [start, end] = sideRange(side); return propertiesForPlayer(playerIndex).filter(index => index >= start && index <= end); }

function buildBoard() {
  const board = $('#board'); board.innerHTML = '';
  spaces.forEach((space, index) => {
    const square = document.createElement('div');
    const side = boardSide(index);
    let grid;
    if (index <= 11) grid = `1 / ${index + 1}`;
    else if (index <= 22) grid = `${index - 10} / 12`;
    else if (index <= 33) grid = `12 / ${34 - index}`;
    else grid = `${44 - index} / 1`;
    square.className = `square ${side} ${space.type || ''} ${index === 0 ? 'start-square' : ''}`;
    square.style.gridArea = grid;
    if (space.group) square.innerHTML += `<span class="color-bar" style="background:${colors[space.group]}"></span>`;
    const icon = space.type === 'chance' ? '✦' : space.type === 'chest' ? '♧' : space.type === 'station' ? '▣' : space.type === 'utility' ? '⚡' : space.type === 'tax' ? '£' : space.type === 'doudi' ? '👑' : '';
    square.innerHTML += `<strong>${icon} ${escapeHtml(space.name)}</strong>${space.price ? `<small class="property-price">${money(space.price)}</small>` : `<small>${escapeHtml(space.note || '')}</small>`}`;
    const ownerIndex = game.owned[index];
    if (space.price && Number.isInteger(ownerIndex) && game.players[ownerIndex]) square.innerHTML += `<span class="owner-dot" style="--owner-color:${playerColor(ownerIndex)}" title="Owned by ${escapeHtml(game.players[ownerIndex].name)}" aria-label="Owned by ${escapeHtml(game.players[ownerIndex].name)}"></span>`;
    game.players.forEach((player, playerIndex) => { if (player.position === index) square.innerHTML += `<span class="token token-${tokenTypes[playerIndex % tokenTypes.length]}" style="--token-color:${playerColor(playerIndex)}" title="${escapeHtml(player.name)}"><span></span></span>`; });
    board.appendChild(square);
  });
}

function doudiLabel(playerIndex) { return isDoudi(playerIndex) ? `<small class="doudi-status">${game.doudiTurnsLeft} turn${game.doudiTurnsLeft === 1 ? '' : 's'} remaining</small>` : ''; }
function doudiBadge(playerIndex) { return isDoudi(playerIndex) ? '<span class="doudi-badge" aria-label="Doudi">👑 Doudi</span>' : ''; }
function isDoudi(playerIndex) { return game.doudiPlayer === playerIndex && game.doudiTurnsLeft > 0; }
function doudiIncome(amount, playerIndex = 0) { return isDoudi(playerIndex) ? amount * 2 : amount; }
function doudiCost(amount, playerIndex = 0) { return isDoudi(playerIndex) ? Math.ceil(amount / 2) : amount; }
function claimDoudi(playerIndex) { const previous = game.doudiPlayer; game.doudiPlayer = playerIndex; game.doudiTurnsLeft = doudiTurns; game.doudiClaimedThisTurn = true; if (previous !== playerIndex) addMessage('System', `${game.players[playerIndex].name} is now Doudi for ${doudiTurns} turns.`); }
function completeDoudiTurn(playerIndex) { if (game.doudiClaimedThisTurn) { game.doudiClaimedThisTurn = false; return; } if (!isDoudi(playerIndex)) return; game.doudiTurnsLeft -= 1; if (game.doudiTurnsLeft <= 0) { game.doudiPlayer = null; game.doudiTurnsLeft = 0; addMessage('System', `${game.players[playerIndex].name} is no longer Doudi.`); } }
function renderDoudiStatus() { const status = doudiLabel(0); const row = document.querySelector('.player-row.current .player-details small'); if (row && status) row.outerHTML = status; }

function updateTurnControls() {
  const active = game.players[game.currentPlayer]; const yourTurn = game.currentPlayer === 0 && !game.over;
  const canEndTurn = game.phase === 'playing' && game.currentPlayer === 0 && game.turnHasRolled && !game.actionPending && !game.rolling && !game.moving && !game.debt && !game.over;
  $('#turnPlayer').textContent = active ? `${active.name}${yourTurn ? ' (you)' : ''}` : 'Your turn';
  $('#moveLabel').textContent = game.phase === 'starting' ? 'STARTING ROLL' : 'YOUR MOVE';
  $('#rollButton').disabled = game.rolling || game.moving || game.over || !yourTurn || Boolean(game.debt) || (game.phase === 'starting' && game.startRolls[0] !== undefined) || (game.phase === 'playing' && game.turnHasRolled);
  $('#endTurn').disabled = !canEndTurn;
  if (game.phase === 'starting') { $('#rollHint').textContent = game.startRolls[0] !== undefined ? 'Waiting for others…' : 'Roll to determine who starts'; $('#rollButton').innerHTML = game.startRolls[0] !== undefined ? 'Waiting for rolls <span>…</span>' : 'Roll to start <span>↗</span>'; }
  else if (!yourTurn) { $('#rollHint').textContent = `${active?.name || 'Other player'} is rolling`; $('#rollButton').innerHTML = 'Other player’s turn <span>…</span>'; }
  else if (game.turnHasRolled && game.actionPending) { $('#rollHint').textContent = 'Finish the landing action'; $('#rollButton').innerHTML = 'Action required <span>!</span>'; }
  else if (game.turnHasRolled) { $('#rollHint').textContent = 'Press End turn when ready'; $('#rollButton').innerHTML = 'Turn complete <span>✓</span>'; }
  else if (!game.rolling && !game.moving && !game.debt) { $('#rollHint').textContent = 'Roll both dice'; $('#rollButton').innerHTML = 'Roll dice <span>↗</span>'; }
}
function renderPlayers() {
  $('#playerCount').textContent = `${game.players.length}/6`;
  $('#playersList').innerHTML = game.players.map((player, index) => `<div class="player-row ${index === game.currentPlayer ? 'current' : ''}"><span class="avatar" style="background:${avatars[index % avatars.length].bg};color:${playerColor(index)}"><span class="mini-token token-${tokenTypes[index % tokenTypes.length]}" style="--token-color:${playerColor(index)}"><span></span></span></span><div class="player-details"><strong>${escapeHtml(player.name)} ${doudiBadge(index)}</strong><small>${game.phase === 'starting' ? (game.startRolls[index] !== undefined ? `Starter roll: ${game.startRolls[index]}` : 'Needs a starter roll') : index === game.currentPlayer ? 'Current turn' : 'Waiting'}</small>${doudiLabel(index)}</div><span class="player-color-dot" style="--player-color:${playerColor(index)}" title="${escapeHtml(player.name)}'s colour"></span><span class="player-cash">${money(player.balance)}</span></div>`).join('');
  updateTurnControls();
}
function renderProperties() {
  $('#propertyCount').textContent = game.properties.length;
  if (!game.properties.length) { $('#propertyList').innerHTML = '<p class="empty-state">Buy a street and it will appear here.</p>'; return; }
  const grouped = game.properties.reduce((sets, index) => { const group = spaces[index].group || 'utility'; (sets[group] ||= []).push(index); return sets; }, {});
  $('#propertyList').innerHTML = Object.entries(grouped).map(([group, indexes]) => `<div class="property-set"><div class="property-set-heading"><i class="property-swatch" style="background:${colors[group] || '#80a4b8'}"></i><strong>${groupLabels[group] || 'Property set'}</strong><span>${indexes.length}</span></div>${indexes.map(index => `<div class="property-item"><span class="property-name"><b>${escapeHtml(spaces[index].name)}</b>${game.mortgaged[index] ? '<em class="mortgage-badge">Mortgaged</em>' : ''}</span><button class="property-action" data-property="${index}">${game.mortgaged[index] ? 'Unmortgage' : 'Mortgage'}</button></div>`).join('')}</div>`).join('');
  document.querySelectorAll('.property-action').forEach(button => button.addEventListener('click', () => toggleMortgage(Number(button.dataset.property))));
}
function addMessage(name, message) { const el = $('#chatMessages'); el.innerHTML += `<p><b>${escapeHtml(name)}</b> ${escapeHtml(message)}</p>`; el.scrollTop = el.scrollHeight; }

function enterGame() {
  const name = ($('#playerName').value.trim() || 'Doudi').slice(0, 18);
  game.code = game.mode === 'join' ? ($('#roomCode').value.trim().toUpperCase() || randomCode()) : randomCode();
  game.title = ($('#roomName').value.trim() || 'Doudi room').slice(0, 28);
  game.players = [ensurePlayerColor({ name, balance:1500, position:0 }, 0)]; game.position = 0; game.balance = 1500; game.properties = []; game.owned = {}; game.mortgaged = {}; game.debt = null; game.over = false; game.rolling = false; game.moving = false; game.phase = 'starting'; game.currentPlayer = 0; game.startRolls = {}; game.turnHasRolled = false; game.actionPending = false; game.pendingDoudi = null; game.doudiPlayer = null; game.doudiTurnsLeft = 0; game.doudiClaimedThisTurn = false;
  $('#roomCodeDisplay').textContent = game.code; $('#roomTitle').textContent = game.title;
  $('#lobbyView').classList.add('hidden'); $('#gameView').classList.remove('hidden');
  $('#cashBalance').textContent = money(game.balance); $('#dieOne').textContent = '?'; $('#dieTwo').textContent = '?';
  renderPlayers(); renderProperties(); buildBoard(); updateTurnControls();
  addMessage('System', game.mode === 'join' ? `You joined room ${game.code}.` : `Room ${game.code} created. Everyone must roll to decide who starts.`);
  toast(game.mode === 'join' ? 'Joined the room!' : 'Room created — roll to choose the starter.');
}

function rollDice() {
  if (game.rolling || game.moving || game.over || game.debt || game.currentPlayer !== 0) return;
  game.rolling = true; updateTurnControls();
  let ticks = 0; const timer = setInterval(() => { $('#dieOne').textContent = 1 + Math.floor(Math.random()*6); $('#dieTwo').textContent = 1 + Math.floor(Math.random()*6); if (++ticks > 7) { clearInterval(timer); const total = Number($('#dieOne').textContent) + Number($('#dieTwo').textContent); if (game.phase === 'starting') finishStartingRoll(total); else finishRoll(total); } }, 90);
}
function finishStartingRoll(total) {
  game.rolling = false; game.startRolls[game.currentPlayer] = total; addMessage('System', `${game.players[game.currentPlayer].name} rolled ${total} for the starting roll.`);
  if (Object.keys(game.startRolls).length < game.players.length) { const next = game.currentPlayer + 1; game.currentPlayer = next < game.players.length ? next : Object.keys(game.startRolls).length; $('#statusMessage').textContent = `${game.players.length - Object.keys(game.startRolls).length} player${game.players.length - Object.keys(game.startRolls).length === 1 ? '' : 's'} still need to roll.`; renderPlayers(); if (game.currentPlayer !== 0) setTimeout(playBotStartingRoll, 650); return; }
  const highest = Math.max(...Object.values(game.startRolls)); const starter = game.players.findIndex((player, index) => game.startRolls[index] === highest); game.currentPlayer = starter; game.phase = 'playing'; game.turnHasRolled = false; $('#statusMessage').textContent = `${game.players[starter].name} rolled highest and starts. Play follows joining order.`; addMessage('System', `${game.players[starter].name} starts the game with ${highest}.`); renderPlayers(); if (game.currentPlayer !== 0) setTimeout(playBotTurn, 700);
}
function playBotStartingRoll() {
  if (game.phase !== 'starting' || game.startRolls[game.currentPlayer] !== undefined) return;
  const playerIndex = game.currentPlayer; const total = 2 + Math.floor(Math.random() * 11); game.startRolls[playerIndex] = total; addMessage('System', `${game.players[playerIndex].name} rolled ${total} for the starting roll.`);
  if (Object.keys(game.startRolls).length < game.players.length) { game.currentPlayer = game.players.findIndex((player, index) => game.startRolls[index] === undefined); renderPlayers(); if (game.currentPlayer !== 0) setTimeout(playBotStartingRoll, 650); return; }
  const highest = Math.max(...Object.values(game.startRolls)); const starter = game.players.findIndex((player, index) => game.startRolls[index] === highest); game.currentPlayer = starter; game.phase = 'playing'; game.turnHasRolled = false; $('#statusMessage').textContent = `${game.players[starter].name} rolled highest and starts. Play follows joining order.`; addMessage('System', `${game.players[starter].name} starts the game with ${highest}.`); renderPlayers(); if (game.currentPlayer !== 0) setTimeout(playBotTurn, 700);
}
function finishRoll(total) {
  game.rolling = false; game.moving = true; $('#rollHint').textContent = `Moving ${total} spaces…`;
  const destination = (game.position + total) % spaces.length;
  moveOneSpace(destination, total);
}
function moveOneSpace(destination, total) {
  if (game.position === destination) return landOnSpace(total);
  const passedStart = game.position === spaces.length - 1;
  game.position = (game.position + 1) % spaces.length;
  game.players[0].position = game.position;
  if (passedStart) collectStartBonus(0);
  buildBoard();
  $('#statusMessage').textContent = `Moving to ${spaces[game.position].name}…`;
  setTimeout(() => moveOneSpace(destination, total), tokenMoveDelay);
}
function collectStartBonus(playerIndex = 0) {
  const amount = doudiIncome(200, playerIndex); const player = game.players[playerIndex]; player.balance += amount;
  if (playerIndex === 0) { game.balance = player.balance; $('#cashBalance').textContent = money(game.balance); }
  addMessage('System', `${player.name} passed START and collected ${money(amount)}${isDoudi(playerIndex) ? ' (Doudi bonus)' : ''}.`);
}
function claimFreeParking(playerIndex) {
  const previous = game.doudiPlayer;
  claimDoudi(playerIndex);
  renderPlayers();
  if (previous !== playerIndex) { addMessage('System', `${game.players[playerIndex].name} landed on Free Parking and became Doudi.`); toast(`${game.players[playerIndex].name} is Doudi for ${doudiTurns} turns.`); }
}
function completeDoudiAction() { game.pendingDoudi = null; game.actionPending = false; closeModal(); updateTurnControls(); buildBoard(); renderPlayers(); }
function showDoudiChoice() {
  const side = boardSide(game.position); const owned = propertiesOnSide(0, side); const propertyOptions = owned.length ? owned.map(index => `<option value="${index}">${escapeHtml(spaces[index].name)}</option>`).join('') : '<option value="">No properties on this side</option>';
  showModal(`<div class="doudi-modal"><span class="game-over-kicker">👑 DOUDI SPACE</span><h2>Choose your move</h2><p>You landed on the Doudi space on the ${sideLabel(side)}. Travel to one of your properties here, or roll: 1–4 pays £100, 5–9 receives £100, 10 does nothing, and 11–12 lets you choose any space.</p><label class="field-label" for="doudiProperty">Travel to your property</label><select class="text-input" id="doudiProperty" ${owned.length ? '' : 'disabled'}>${propertyOptions}</select><button class="primary-button" id="travelDoudi" ${owned.length ? '' : 'disabled'}>Travel there <span>→</span></button><div class="doudi-or"><span>or</span></div><button class="secondary-button full-button" id="rollDoudi">Roll Doudi dice <span>↗</span></button></div>`);
  $('#travelDoudi').addEventListener('click', () => { game.position = Number($('#doudiProperty').value); game.players[0].position = game.position; addMessage('System', `You travelled to ${spaces[game.position].name}.`); $('#statusMessage').textContent = `You travelled to ${spaces[game.position].name}.`; completeDoudiAction(); });
  $('#rollDoudi').addEventListener('click', rollDoudiOutcome);
}
function rollDoudiOutcome() {
  $('#rollDoudi').disabled = true; let ticks = 0; const timer = setInterval(() => { $('#dieOne').textContent = 1 + Math.floor(Math.random() * 6); $('#dieTwo').textContent = 1 + Math.floor(Math.random() * 6); if (++ticks > 7) { clearInterval(timer); const total = Number($('#dieOne').textContent) + Number($('#dieTwo').textContent); resolveDoudiOutcome(0, total); } }, 90);
}
function resolveDoudiOutcome(playerIndex, total) {
  const player = game.players[playerIndex];
  if (total <= 4) {
    const due = doudiCost(100, playerIndex);
    if (playerIndex === 0) { if (game.balance >= due) { payBank(100, 'Doudi roll'); completeDoudiAction(); } else { game.debt = { type:'bank', amount:due, reason:'Your Doudi roll requires a £100 payment.', doudiPending:true }; showDebtModal(); } }
    else { botPayBank(playerIndex, 100, 'Doudi roll'); if (!game.over) finishBotTurn(playerIndex, 'DOUDI SPACE'); }
    return;
  }
  if (total <= 9) {
    const reward = doudiIncome(100, playerIndex); player.balance += reward; if (playerIndex === 0) { game.balance = player.balance; $('#cashBalance').textContent = money(game.balance); } addMessage('System', `${player.name} rolled ${total} and received ${money(reward)} from the Doudi space.`); if (playerIndex === 0) completeDoudiAction(); else finishBotTurn(playerIndex, 'DOUDI SPACE'); return;
  }
  if (total === 10) {
    addMessage('System', `${player.name} rolled 10 on the Doudi space; nothing happens.`);
    if (playerIndex === 0) completeDoudiAction(); else finishBotTurn(playerIndex, 'DOUDI SPACE');
    return;
  }
  if (playerIndex === 0) {
    showDoudiDestinationPicker(total);
  } else {
    const destination = Math.floor(Math.random() * spaces.length); player.position = destination; addMessage('System', `${player.name} rolled ${total} and travelled to ${spaces[destination].name}.`); finishBotTurn(playerIndex, spaces[destination].name);
  }
}
function showDoudiDestinationPicker(total) {
  showModal(`<div class="doudi-modal"><span class="game-over-kicker">👑 DOUDI ROLL: ${total}</span><h2>Choose any destination</h2><p>Rolls of 11 or 12 let you move to any space on the board.</p><label class="field-label" for="doudiDestination">Destination</label><select class="text-input" id="doudiDestination">${spaces.map((space, index) => `<option value="${index}">${index + 1}. ${escapeHtml(space.name)}</option>`).join('')}</select><button class="primary-button" id="confirmDoudiDestination">Travel to space <span>→</span></button></div>`);
  $('#confirmDoudiDestination').addEventListener('click', () => { const destination = Number($('#doudiDestination').value); game.position = destination; game.players[0].position = destination; addMessage('System', `You rolled ${total} and travelled to ${spaces[destination].name}.`); $('#statusMessage').textContent = `You travelled to ${spaces[destination].name}.`; completeDoudiAction(); });
}
function finishBotTurn(playerIndex, landedName) {
  const player = game.players[playerIndex];
  completeDoudiTurn(playerIndex);
  buildBoard(); renderPlayers();
  if (game.over) return;
  addMessage('System', `${player.name} landed on ${landedName}.`);
  game.currentPlayer = nextPlayerIndex(playerIndex); game.turnHasRolled = false; renderPlayers();
  if (game.currentPlayer !== 0) setTimeout(playBotTurn, 700);
  else { $('#statusMessage').textContent = 'Your turn.'; addMessage('System', 'Your turn begins.'); }
}
function propertiesForPlayer(playerIndex) { return Object.entries(game.owned).filter(([, owner]) => owner === playerIndex).map(([index]) => Number(index)); }
function syncCurrentPlayer() { if (!game.players[0]) return; game.players[0].balance = game.balance; game.players[0].position = game.position; }
function propertyValueTotal(playerIndex) { return propertiesForPlayer(playerIndex).reduce((total, index) => total + spaces[index].price, 0); }
function rentTotal(playerIndex) { return propertiesForPlayer(playerIndex).reduce((total, index) => total + (game.mortgaged[index] ? 0 : (spaces[index].rent || 0)), 0); }
function playerNetWorth(playerIndex) { const player = game.players[playerIndex]; return player?.bankrupt ? 0 : (player?.balance || 0) + propertyValueTotal(playerIndex); }
function refreshMoney() { syncCurrentPlayer(); $('#cashBalance').textContent = money(game.balance); renderPlayers(); renderProperties(); }
function debtCanBeResolved() { const mortgageable = propertiesForPlayer(0).some(index => !game.mortgaged[index]); const tradeable = propertiesForPlayer(0).length > 0 && game.players.some((player, index) => index > 0 && !player.bankrupt && player.balance > 0); return mortgageable || tradeable; }
function continueAfterDebt() { if (!game.debt) return; if (game.balance >= game.debt.amount) { const debt = game.debt; game.debt = null; if (debt.type === 'rent') payRent(debt.propertyIndex); else if (debt.doudiPending) { payBank(debt.amount, debt.reason); completeDoudiAction(); } else { payBank(debt.amount, debt.reason); if (debt.cardPending) game.actionPending = false; } } else if (!debtCanBeResolved()) { const debt = game.debt; game.debt = null; debt.type === 'rent' ? bankruptToPlayer(debt.owner, debt.amount) : bankruptToBank(debt.amount, debt.reason); } else showDebtModal(); }
function showDebtModal() {
  if (!game.debt || game.over) return;
  if (game.balance >= game.debt.amount) return continueAfterDebt();
  if (!debtCanBeResolved()) { const debt = game.debt; game.debt = null; debt.type === 'rent' ? bankruptToPlayer(debt.owner, debt.amount) : bankruptToBank(debt.amount, debt.reason); return; }
  const debt = game.debt; const owned = propertiesForPlayer(0); const mortgageable = owned.filter(index => !game.mortgaged[index]);
  const tradeable = game.players.filter((player, index) => index > 0 && !player.bankrupt && player.balance > 0);
  const assetText = mortgageable.length ? `${mortgageable.length} property${mortgageable.length === 1 ? '' : 'ies'} can be mortgaged` : 'No unmortgaged properties available';
  showModal(`<div class="debt-modal"><span class="game-over-kicker">PAYMENT REQUIRED</span><h2>You owe ${money(debt.amount)}</h2><p>${escapeHtml(debt.reason)} You have ${money(game.balance)}. You must raise the shortfall before continuing.</p><div class="debt-summary"><span>Shortfall</span><strong>${money(Math.max(0, debt.amount - game.balance))}</strong></div><button class="primary-button" id="manageAssets">Manage assets <span>→</span></button><button class="secondary-button full-button" id="tradeAsset">Trade with a player</button><button class="text-button debt-cancel" id="cancelDebt">Cancel</button><small class="debt-availability">${assetText}${tradeable.length ? ` · ${tradeable.length} player${tradeable.length === 1 ? '' : 's'} can trade` : ''}</small></div>`);
  $('#manageAssets').addEventListener('click', showAssetManager); $('#tradeAsset').addEventListener('click', showTradeModal); $('#cancelDebt').addEventListener('click', () => showDebtModal());
  if (!mortgageable.length || !owned.length) $('#manageAssets').disabled = true; if (!tradeable.length || !owned.length) $('#tradeAsset').disabled = true;
}
function showAssetManager() {
  const owned = propertiesForPlayer(0); showModal(`<div class="asset-manager"><h2>Manage properties</h2><p>Mortgage a property to receive half its value. Mortgaged properties collect no rent.</p><div class="asset-list">${owned.length ? owned.map(index => `<div class="asset-row"><span><i class="property-swatch" style="background:${colors[spaces[index].group] || '#80a4b8'}"></i><b>${escapeHtml(spaces[index].name)}</b><small>${game.mortgaged[index] ? `Mortgage held · ${money(Math.floor(spaces[index].price / 2))}` : `Release ${money(Math.floor(spaces[index].price / 2))}`}</small></span><button class="property-action" data-mortgage="${index}">${game.mortgaged[index] ? 'Unmortgage' : `Mortgage +${money(Math.floor(spaces[index].price / 2))}`}</button></div>`).join('') : '<p class="empty-state">You have no properties to manage.</p>'}</div><button class="secondary-button full-button" id="backToDebt">Back to payment</button></div>`);
  document.querySelectorAll('[data-mortgage]').forEach(button => button.addEventListener('click', () => toggleMortgage(Number(button.dataset.mortgage)))); $('#backToDebt').addEventListener('click', showDebtModal);
}
function toggleMortgage(index) {
  if (game.over || game.owned[index] !== 0) return;
  const space = spaces[index]; const value = Math.floor(space.price / 2);
  if (game.mortgaged[index]) { const repayment = Math.ceil(value * 1.1); if (game.balance < repayment) return toast(`You need ${money(repayment)} to unmortgage this property.`); game.balance -= repayment; delete game.mortgaged[index]; addMessage('System', `${space.name} was unmortgaged for ${money(repayment)}.`); }
  else { game.balance += value; game.mortgaged[index] = true; addMessage('System', `${space.name} was mortgaged for ${money(value)}.`); }
  refreshMoney(); if (game.debt && game.balance >= game.debt.amount) { continueAfterDebt(); closeModal(); } else if (game.debt) showDebtModal(); else showAssetManager();
}
function showTradeModal() {
  const owned = propertiesForPlayer(0); const tradeable = game.players.filter((player, index) => index > 0 && !player.bankrupt && player.balance > 0);
  showModal(`<div class="trade-modal"><h2>Trade a property</h2><p>Sell one of your properties to another player for cash. The trade completes only if they can afford it.</p><label class="field-label" for="tradeProperty">Property</label><select class="text-input" id="tradeProperty">${owned.map(index => `<option value="${index}">${escapeHtml(spaces[index].name)}${game.mortgaged[index] ? ' · mortgaged' : ''}</option>`).join('')}</select><label class="field-label" for="tradePlayer">Trade with</label><select class="text-input" id="tradePlayer">${tradeable.map(player => `<option value="${game.players.indexOf(player)}">${escapeHtml(player.name)} · ${money(player.balance)}</option>`).join('')}</select><label class="field-label" for="tradeAmount">Cash received</label><input class="text-input" id="tradeAmount" type="number" min="1" step="1" placeholder="e.g. 100" /><button class="primary-button" id="confirmTrade">Offer trade <span>→</span></button><button class="text-button debt-cancel" id="backFromTrade">Back</button></div>`);
  $('#confirmTrade').addEventListener('click', confirmTrade); $('#backFromTrade').addEventListener('click', game.debt ? showDebtModal : closeModal);
}
function confirmTrade() {
  const propertyIndex = Number($('#tradeProperty').value); const playerIndex = Number($('#tradePlayer').value); const amount = Math.max(0, Math.floor(Number($('#tradeAmount').value)));
  if (!amount) return toast('Enter a cash amount for the trade.'); const buyer = game.players[playerIndex]; if (!buyer || buyer.balance < amount) return toast(`${buyer?.name || 'That player'} cannot afford this trade.`);
  buyer.balance -= amount; game.balance += amount; game.owned[propertyIndex] = playerIndex; game.properties = game.properties.filter(index => index !== propertyIndex); delete game.mortgaged[propertyIndex]; refreshMoney(); buildBoard(); addMessage('System', `${buyer.name} bought ${spaces[propertyIndex].name} from you for ${money(amount)}.`); if (game.debt) { continueAfterDebt(); closeModal(); } else closeModal();
}
function landOnSpace(total) {
  if (game.over) return;
  game.turnHasRolled = true; game.actionPending = false;
  const index = game.position; const space = spaces[index]; game.moving = false; $('#rollButton').disabled = false; $('#rollButton').innerHTML = 'Turn complete <span>✓</span>'; $('#rollHint').textContent = 'Press End turn when ready';
  $('#statusMessage').textContent = `You rolled ${total} and landed on ${space.name}.`; addMessage('System', `You landed on ${space.name}.`);
  if (space.price) { if (game.owned[index] === 0) { if (game.mortgaged[index]) toast(`${space.name} is mortgaged and collects no rent.`); else toast(`You own ${space.name}.`); } else if (game.owned[index] === undefined && game.balance >= space.price) { game.actionPending = true; offerProperty(index); } else if (game.owned[index] === undefined) { toast(`You need ${money(space.price)} to buy ${space.name}.`); addMessage('System', `You could not afford ${space.name}; it remains available.`); } else if (game.mortgaged[index]) toast(`${space.name} is mortgaged and collects no rent.`); else payRent(index); }
  else if (space.type === 'tax') payTax(space.name === 'Income Tax' ? 200 : 100);
  else if (space.type === 'chance' || space.type === 'chest') { game.actionPending = true; drawCard(space.type); }
  else if (space.name === 'FREE PARKING') claimFreeParking(0);
  else if (space.type === 'doudi') { game.actionPending = true; game.pendingDoudi = { playerIndex:0, spaceIndex:index }; showDoudiChoice(); }
  else if (space.name === 'GO TO JAIL') { game.position = 10; game.players[0].position = 10; buildBoard(); addMessage('System', 'Go directly to Jail.'); toast('Go directly to Jail.'); }
  if (!game.debt) { game.actionPending = game.actionPending && !game.over; updateTurnControls(); }
}
function endTurn() {
  if (game.phase !== 'playing' || game.currentPlayer !== 0 || !game.turnHasRolled || game.rolling || game.moving || game.debt || game.over) return;
  completeDoudiTurn(0);
  game.currentPlayer = nextPlayerIndex(0); game.turnHasRolled = false; $('#statusMessage').textContent = `${game.players[game.currentPlayer].name}'s turn.`; addMessage('System', `${game.players[game.currentPlayer].name}'s turn begins.`); renderPlayers();
  if (game.currentPlayer !== 0) setTimeout(playBotTurn, 700);
}
function playBotTurn() {
  if (game.over || game.currentPlayer === 0 || game.phase !== 'playing') return;
  const playerIndex = game.currentPlayer; const player = game.players[playerIndex]; const total = 2 + Math.floor(Math.random() * 11); game.rolling = true; renderPlayers(); $('#statusMessage').textContent = `${player.name} is rolling…`;
  let ticks = 0; const diceTimer = setInterval(() => { $('#dieOne').textContent = 1 + Math.floor(Math.random() * 6); $('#dieTwo').textContent = 1 + Math.floor(Math.random() * 6); if (++ticks > 7) { clearInterval(diceTimer); $('#dieOne').textContent = Math.ceil(total / 2); $('#dieTwo').textContent = total - Math.ceil(total / 2); game.rolling = false; game.moving = true; addMessage('System', `${player.name} rolled ${total}.`); moveBotOneSpace(playerIndex, total, total, player.position); } }, 90);
}
function moveBotOneSpace(playerIndex, remaining, total, startingPosition) {
  if (game.over) return;
  const player = game.players[playerIndex];
  if (remaining <= 0) { resolveBotLanding(playerIndex, total, startingPosition); return; }
  const passedStart = player.position === spaces.length - 1; player.position = (player.position + 1) % spaces.length;
  if (passedStart) collectStartBonus(playerIndex);
  buildBoard(); renderPlayers(); $('#statusMessage').textContent = `${player.name} moving to ${spaces[player.position].name}…`;
  setTimeout(() => moveBotOneSpace(playerIndex, remaining - 1, total, startingPosition), tokenMoveDelay);
}
function resolveBotLanding(playerIndex, total, startingPosition) {
  const player = game.players[playerIndex]; const index = player.position; const space = spaces[index]; game.moving = false;
  if (space.price) {
    const owner = game.owned[index];
    if (owner === undefined && player.balance >= space.price) { player.balance -= space.price; game.owned[index] = playerIndex; addMessage('System', `${player.name} bought ${space.name}.`); }
    else if (owner !== undefined && owner !== playerIndex && !game.mortgaged[index]) { botPayRent(playerIndex, owner, space.rent || 25, index); }
  } else if (space.type === 'tax') botPayBank(playerIndex, space.name === 'Income Tax' ? 200 : 100, space.name);
  else if (space.type === 'chance' || space.type === 'chest') resolveBotCard(playerIndex, space.type);
  else if (space.name === 'FREE PARKING') claimFreeParking(playerIndex);
  else if (space.type === 'doudi') { const owned = propertiesOnSide(playerIndex, boardSide(index)); if (owned.length) { player.position = owned[0]; addMessage('System', `${player.name} used the Doudi space to travel to ${spaces[owned[0]].name}.`); } else { const outcome = 2 + Math.floor(Math.random() * 11); resolveDoudiOutcome(playerIndex, outcome); return; } }
  else if (space.name === 'GO TO JAIL') { player.position = 10; addMessage('System', `${player.name} went directly to Jail.`); }
  finishBotTurn(playerIndex, space.name);
}
function nextPlayerIndex(fromIndex) {
  for (let offset = 1; offset <= game.players.length; offset += 1) { const index = (fromIndex + offset) % game.players.length; if (!game.players[index].bankrupt) return index; }
  return 0;
}
function botPayBank(playerIndex, amount, reason) {
  const player = game.players[playerIndex]; const due = doudiCost(amount, playerIndex); if (player.balance >= due) { player.balance -= due; return true; }
  bankruptBotToBank(playerIndex, due, reason); return false;
}
function botPayRent(playerIndex, ownerIndex, amount, propertyIndex) {
  const player = game.players[playerIndex]; const owner = game.players[ownerIndex]; const due = doudiCost(amount, playerIndex); const received = doudiIncome(amount, ownerIndex); if (player.balance >= due) { player.balance -= due; owner.balance += received; return true; }
  bankruptBotToPlayer(playerIndex, ownerIndex, due, propertyIndex); return false;
}
function resolveBotCard(playerIndex, type) {
  const card = chanceCards[Math.floor(Math.random() * chanceCards.length)];
  if (card.amount < 0) botPayBank(playerIndex, Math.abs(card.amount), card.title); else game.players[playerIndex].balance += doudiIncome(card.amount, playerIndex);
  addMessage('System', `${game.players[playerIndex].name} drew ${type === 'chance' ? 'Chance' : 'Community Chest'}: ${card.text}`);
}
function bankruptBotToBank(playerIndex, amount, reason) {
  const player = game.players[playerIndex]; player.bankrupt = true; player.balance = 0; propertiesForPlayer(playerIndex).forEach(index => { delete game.owned[index]; delete game.mortgaged[index]; });
  buildBoard(); renderPlayers(); addMessage('System', `${player.name} could not pay ${money(amount)} to the bank and went bankrupt.`); showGameOver(`${player.name} went bankrupt owing the bank ${money(amount)}.`);
}
function bankruptBotToPlayer(playerIndex, ownerIndex, amount, propertyIndex) {
  const player = game.players[playerIndex]; const owner = game.players[ownerIndex]; owner.balance += player.balance; player.balance = 0; player.bankrupt = true;
  propertiesForPlayer(playerIndex).forEach(index => { game.owned[index] = ownerIndex; }); addMessage('System', `${player.name} could not pay ${money(amount)} rent for ${spaces[propertyIndex].name}; assets transferred to ${owner.name}.`); buildBoard(); renderPlayers(); showGameOver(`${player.name} went bankrupt owing ${owner.name} ${money(amount)}.`);
}
function payBank(amount, reason) {
  const due = doudiCost(amount, 0);
  if (game.balance >= due) { game.balance -= due; syncCurrentPlayer(); $('#cashBalance').textContent = money(game.balance); renderPlayers(); addMessage('System', `You paid ${money(due)} to the bank${isDoudi(0) ? ' (Doudi discount)' : ''}.`); toast(`${reason}: ${money(due)}`); return true; }
  game.debt = { type:'bank', amount:due, reason }; showDebtModal(); return false;
}
function payTax(amount) { payBank(amount, 'Tax paid'); }
function payRent(index) {
  const owner = game.owned[index]; const space = spaces[index]; const baseAmount = space.rent || 25; if (owner === undefined || owner === 0 || game.over) return;
  const amount = doudiCost(baseAmount, 0); const creditor = game.players[owner]; const received = doudiIncome(baseAmount, owner);
  if (game.balance >= amount) { game.balance -= amount; creditor.balance += received; syncCurrentPlayer(); $('#cashBalance').textContent = money(game.balance); renderPlayers(); addMessage('System', `You paid ${money(amount)} rent to ${creditor.name}${isDoudi(0) ? ' (Doudi discount)' : ''}${isDoudi(owner) ? `, who collected ${money(received)}` : ''}.`); toast(`Rent paid: ${money(amount)}`); return; }
  game.debt = { type:'rent', amount, owner, propertyIndex:index, reason:`You owe ${money(amount)} rent to ${creditor.name} for ${space.name}.` }; showDebtModal();
}
function drawCard(type) {
  const card = chanceCards[Math.floor(Math.random() * chanceCards.length)];
  if (card.amount < 0 && game.balance < Math.abs(card.amount)) { game.debt = { type:'bank', amount:Math.abs(card.amount), reason:card.title, cardPending:true }; showDebtModal(); return; }
  if (card.amount < 0) payBank(Math.abs(card.amount), card.title);
  if (card.amount > 0) { const reward = doudiIncome(card.amount, 0); game.balance += reward; syncCurrentPlayer(); $('#cashBalance').textContent = money(game.balance); }
  showModal(`<div class="card-reveal"><span class="card-symbol">${type === 'chance' ? '✦' : '♧'}</span><h2>${card.title}</h2><p>${card.text}</p><strong>${card.amount >= 0 ? '+' : ''}${money(card.amount)}</strong><button class="primary-button" id="closeCard">Continue <span>→</span></button></div>`); $('#closeCard').addEventListener('click', closeCardAction); addMessage('System', card.text);
}
function bankruptToBank(amount, reason) {
  const bankruptPlayer = game.players[0]; bankruptPlayer.bankrupt = true; bankruptPlayer.balance = 0; game.balance = 0;
  propertiesForPlayer(0).forEach(index => { delete game.owned[index]; delete game.mortgaged[index]; }); game.properties = [];
  renderPlayers(); buildBoard(); addMessage('System', `${bankruptPlayer.name} could not pay ${money(amount)} to the bank and went bankrupt.`); showGameOver(`${bankruptPlayer.name} went bankrupt owing the bank ${money(amount)}.`);
}
function bankruptToPlayer(owner, amount) {
  const bankruptPlayer = game.players[0]; const creditor = game.players[owner];
  creditor.balance += game.balance; game.balance = 0; bankruptPlayer.balance = 0; bankruptPlayer.bankrupt = true;
  propertiesForPlayer(0).forEach(index => { game.owned[index] = owner; }); game.properties = [];
  renderPlayers(); renderProperties(); buildBoard(); addMessage('System', `${bankruptPlayer.name} could not pay ${money(amount)} rent. Their assets transferred to ${creditor.name}.`); showGameOver(`${bankruptPlayer.name} went bankrupt owing ${creditor.name} ${money(amount)}.`);
}
function showGameOver(reason) {
  game.over = true; game.rolling = false; game.moving = false; $('#rollButton').disabled = true; $('#endTurn').disabled = true; $('#rollHint').textContent = 'Game over';
  const standings = game.players.map((player, index) => {
    const propertyIndexes = propertiesForPlayer(index); const properties = propertyIndexes.length ? propertyIndexes.map(propertyIndex => `<div class="score-property"><span>${escapeHtml(spaces[propertyIndex].name)}</span><span>${money(spaces[propertyIndex].price)} · ${money(spaces[propertyIndex].rent || 0)} rent</span></div>`).join('') : '<div class="score-empty">No properties</div>';
    return `<article class="score-player ${player.bankrupt ? 'bankrupt' : ''}"><div class="score-player-head"><span class="avatar" style="background:${avatars[index % avatars.length].bg};color:${playerColor(index)}"><span class="mini-token token-${tokenTypes[index % tokenTypes.length]}" style="--token-color:${playerColor(index)}"><span></span></span></span><div><strong>${escapeHtml(player.name)}${player.bankrupt ? ' · Bankrupt' : ''}</strong><small>Cash ${money(player.balance)} · Property value ${money(propertyValueTotal(index))}</small></div><b>${money(playerNetWorth(index))}</b></div><div class="score-properties">${properties}</div><div class="score-rent">Potential rent <b>${money(rentTotal(index))}</b></div></article>`;
  }).join('');
  showModal(`<div class="game-over"><span class="game-over-kicker">FINAL LEDGER</span><h2>Game over</h2><p>${escapeHtml(reason)} All remaining totals are calculated from cash plus property value.</p><div class="scoreboard">${standings}</div><button class="primary-button" id="newGame">Back to lobby <span>→</span></button></div>`);
  $('#newGame').addEventListener('click', () => { closeModal(); game.over = false; game.rolling = false; game.moving = false; game.debt = null; game.phase = 'starting'; game.currentPlayer = 0; game.turnHasRolled = false; game.actionPending = false; game.startRolls = {}; game.pendingDoudi = null; game.doudiPlayer = null; game.doudiTurnsLeft = 0; game.doudiClaimedThisTurn = false; $('#gameView').classList.add('hidden'); $('#lobbyView').classList.remove('hidden'); });
}
function offerProperty(index) {
  const space = spaces[index]; showModal(`<h2>Buy ${escapeHtml(space.name)}?</h2><p>This street costs <strong>${money(space.price)}</strong> and charges ${money(space.rent)} rent. Your balance is ${money(game.balance)}.</p><div class="modal-actions"><button class="secondary-button" id="declineBuy">Not this time</button><button class="primary-button" id="confirmBuy">Buy for ${money(space.price)} <span>→</span></button></div>`);
  $('#confirmBuy').addEventListener('click', () => { if (game.balance < space.price) { closeModal(); toast(`You need ${money(space.price)} to buy this property.`); return; } game.balance -= space.price; game.players[0].balance = game.balance; game.properties.push(index); game.owned[index] = 0; $('#cashBalance').textContent = money(game.balance); renderProperties(); renderPlayers(); buildBoard(); game.actionPending = false; closeModal(); addMessage('System', `You bought ${space.name}.`); $('#statusMessage').textContent = `${space.name} is yours!`; updateTurnControls(); });
  $('#declineBuy').addEventListener('click', () => { game.actionPending = false; closeModal(); updateTurnControls(); });
}
function saveGameState() {
  const state = {
    format: 'Doudiopoly save', version: 1, savedAt: new Date().toISOString(),
    room: { code: game.code, title: game.title },
    turn: { currentPlayer: game.currentPlayer, currentPlayerName: game.players[game.currentPlayer]?.name || game.players[0]?.name || '', phase: game.phase, turnHasRolled: game.turnHasRolled, actionPending: game.actionPending, startRolls: game.startRolls },
    dice: { one: $('#dieOne').textContent, two: $('#dieTwo').textContent },
    game: { position: game.position, balance: game.balance, properties: game.properties, owned: game.owned, mortgaged: game.mortgaged, over: game.over, debt: game.debt, pendingDoudi: game.pendingDoudi, doudiPlayer: game.doudiPlayer, doudiTurnsLeft: game.doudiTurnsLeft, doudiClaimedThisTurn: game.doudiClaimedThisTurn },
    players: game.players.map(player => ({ name: player.name, color: player.color, balance: player.balance, position: player.position, bankrupt: Boolean(player.bankrupt) })),
  };
  const lines = [
    'DOUDIOPOLY SAVE FILE', 'Format: Doudiopoly save', `Version: ${state.version}`, `Saved at: ${state.savedAt}`, '',
    '[ROOM]', `Code: ${state.room.code}`, `Name: ${state.room.title}`, '', '[TURN]', `Current player: ${state.turn.currentPlayerName}`, `Current player index: ${state.turn.currentPlayer}`, '',
    '[PLAYERS]', ...state.players.map((player, index) => `${index + 1}. ${player.name} | color=${player.color || playerColors[index % playerColors.length]} | cash=${player.balance} | position=${player.position} | bankrupt=${player.bankrupt}`), '',
    '[PROPERTIES]', ...spaces.map((space, index) => { const owner = state.game.owned[index]; if (owner === undefined) return null; return `${space.name} | owner=${state.players[owner]?.name || 'Unknown'} | ownerIndex=${owner} | value=${space.price} | rent=${space.rent || 0} | mortgaged=${Boolean(state.game.mortgaged[index])}`; }).filter(Boolean), '',
    '[STATE]', `Position: ${state.game.position}`, `Balance: ${state.game.balance}`, `Owned property indexes: ${state.game.properties.join(',')}`, `Dice: ${state.dice.one},${state.dice.two}`, `Game over: ${state.game.over}`, `Debt: ${JSON.stringify(state.game.debt)}`,
  ];
  const blob = new Blob([lines.join('\n') + '\n\n[DOUDIOPOLY_JSON]\n' + JSON.stringify(state, null, 2)], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `doudiopoly-${game.code || 'save'}.txt`; link.click(); URL.revokeObjectURL(url); toast('Board saved as a .txt file.');
}
function parseSaveFile(text) {
  const marker = '[DOUDIOPOLY_JSON]'; const jsonText = text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length).trim() : text.trim();
  const state = JSON.parse(jsonText);
  if (state.format !== 'Doudiopoly save' || state.version !== 1 || !Array.isArray(state.players) || !state.room || !state.game) throw new Error('Invalid Doudiopoly save file.');
  if (state.players.length < 1 || state.players.length > 6 || !state.players.every(player => typeof player.name === 'string' && Number.isFinite(player.balance) && Number.isInteger(player.position))) throw new Error('The save file has invalid player data.');
  if (!Number.isInteger(state.game.position) || state.game.position < 0 || state.game.position >= spaces.length || !Number.isFinite(state.game.balance)) throw new Error('The save file has invalid board data.');
  return state;
}
function applyGameState(state) {
  game.code = String(state.room.code || randomCode()); game.title = String(state.room.title || 'Doudi room'); game.currentPlayer = Number.isInteger(state.turn?.currentPlayer) ? Math.max(0, Math.min(state.players.length - 1, state.turn.currentPlayer)) : 0; game.position = state.game.position; game.balance = Math.max(0, state.game.balance); game.properties = []; game.owned = {}; game.mortgaged = {};
  Object.entries(state.game.owned || {}).forEach(([index, owner]) => { const propertyIndex = Number(index); if (spaces[propertyIndex]?.price && Number.isInteger(owner) && owner >= 0 && owner < state.players.length) game.owned[propertyIndex] = owner; });
  Object.entries(state.game.mortgaged || {}).forEach(([index, value]) => { if (value && game.owned[Number(index)] !== undefined) game.mortgaged[Number(index)] = true; });
  game.properties = propertiesForPlayer(0);
  game.debt = state.game.debt || null; game.over = Boolean(state.game.over); game.pendingDoudi = state.game.pendingDoudi || null; game.doudiPlayer = Number.isInteger(state.game.doudiPlayer) ? state.game.doudiPlayer : null; game.doudiTurnsLeft = Number.isInteger(state.game.doudiTurnsLeft) ? Math.max(0, Math.min(doudiTurns, state.game.doudiTurnsLeft)) : 0; game.doudiClaimedThisTurn = Boolean(state.game.doudiClaimedThisTurn); game.phase = state.turn?.phase === 'playing' ? 'playing' : 'starting'; game.turnHasRolled = Boolean(state.turn?.turnHasRolled); game.actionPending = Boolean(state.turn?.actionPending); game.startRolls = state.turn?.startRolls || {}; game.rolling = false; game.moving = false; game.players = state.players.map((player, index) => ensurePlayerColor({ name:player.name.slice(0,18), color:player.color, balance:Math.max(0, player.balance), position:Math.max(0, Math.min(spaces.length - 1, player.position)), bankrupt:Boolean(player.bankrupt) }, index)); game.players[0].position = game.position; game.players[0].balance = game.balance;
  $('#roomCodeDisplay').textContent = game.code; $('#roomTitle').textContent = game.title; $('#cashBalance').textContent = money(game.balance); $('#dieOne').textContent = state.dice?.one || '?'; $('#dieTwo').textContent = state.dice?.two || '?'; $('#rollHint').textContent = game.over ? 'Game over' : 'Your turn'; $('#rollButton').disabled = game.over; $('#statusMessage').textContent = `Loaded room ${game.code}. Continue playing from the saved board.`;
  $('#lobbyView').classList.add('hidden'); $('#gameView').classList.remove('hidden'); renderPlayers(); renderProperties(); buildBoard(); updateTurnControls(); addMessage('System', `Loaded save from ${state.savedAt ? new Date(state.savedAt).toLocaleString() : 'your file'}.`); if (game.debt && !game.over) showDebtModal(); if (game.over) showGameOver('This saved game was already over.'); if (game.phase === 'starting' && game.currentPlayer !== 0) setTimeout(playBotStartingRoll, 700); else if (game.phase === 'playing' && game.currentPlayer !== 0) setTimeout(playBotTurn, 700); toast('Board loaded successfully.');
}
function loadGameFile(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { applyGameState(parseSaveFile(String(reader.result))); } catch (error) { toast(error.message || 'Could not load that save file.'); } event.target.value = ''; }; reader.readAsText(file); }

function showModal(content) { $('#modalContent').innerHTML = content; $('#modalBackdrop').classList.remove('hidden'); }
function closeCardAction() { game.actionPending = false; closeModal(); updateTurnControls(); }
function closeModal() { if (game.debt && !game.over) return; $('#modalBackdrop').classList.add('hidden'); }

$('.mode-switch').addEventListener('click', event => { const button = event.target.closest('.mode-button'); if (!button) return; game.mode = button.dataset.mode; document.querySelectorAll('.mode-button').forEach(el => el.classList.toggle('active', el === button)); $('#createFields').classList.toggle('hidden', game.mode !== 'create'); $('#joinFields').classList.toggle('hidden', game.mode !== 'join'); $('#roomSubmitLabel').textContent = game.mode === 'create' ? 'Create room' : 'Join room'; });
$('#roomForm').addEventListener('submit', event => { event.preventDefault(); enterGame(); });
$('#rollButton').addEventListener('click', rollDice);
$('#endTurn').addEventListener('click', endTurn);  $('#addBot').addEventListener('click', () => { if (game.players.length >= 6) return toast('This room is full.'); const names = ['Jamie','Morgan','Sam','Riley','Avery']; game.players.push(ensurePlayerColor({name:names[game.players.length-1] || 'Guest',balance:1500,position:0}, game.players.length)); renderPlayers(); buildBoard(); addMessage('System', `${game.players[game.players.length-1].name} joined the table.`); if (game.phase === 'starting') { const missingPlayer = game.players.findIndex((player, index) => game.startRolls[index] === undefined); if (missingPlayer > 0) { game.currentPlayer = missingPlayer; renderPlayers(); setTimeout(playBotStartingRoll, 650); } } });

$('#chatForm').addEventListener('submit', event => { event.preventDefault(); const input = $('#chatInput'); if (input.value.trim()) { addMessage(game.players[0]?.name || 'You', input.value.trim()); input.value = ''; } });
$('#copyInvite').addEventListener('click', async () => { const invite = `Join my Doudiopoly room: ${game.code}`; try { await navigator.clipboard.writeText(invite); toast('Invite copied to clipboard.'); } catch { toast(invite); } });
$('#saveGame').addEventListener('click', saveGameState);
$('#loadGame').addEventListener('click', () => $('#loadGameInput').click());
$('#loadGameInput').addEventListener('change', loadGameFile);
$('#leaveRoom').addEventListener('click', () => { $('#gameView').classList.add('hidden'); $('#lobbyView').classList.remove('hidden'); });
$('#modalClose').addEventListener('click', closeModal); $('#modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });

// Give the board a useful preview if the game is opened directly during development.
if ($('#board')) { game.players = [ensurePlayerColor({name:'You',balance:1500,position:0}, 0)]; }
