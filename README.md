# Doudiopoly

A responsive 44-space property-trading game with original Doudi rules, offline practice players, and real online rooms. Plain HTML, CSS, JavaScript, and Node.js; no production dependencies or build step.

## Run

Open `index.html` directly for offline practice. Add practice players, press **Start game**, and roll to decide who starts.

For online rooms, install Node.js 22 or newer and run:

```sh
npm start
```

Open `http://127.0.0.1:3000`, select **Friends online**, create a room, and share its address and code. Each player joins from their own browser tab/device before the host starts. The server controls turns, dice, ownership, trades and payments, and streams shared updates and chat.

The default server listens only on your computer. To play across a trusted local network (PowerShell):

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Other devices use `http://YOUR-LAN-IP:3000`. Internet play requires deploying this Node service behind HTTPS on a host supporting persistent HTTP connections and a persistent disk. Set `PORT` and `HOST` as required; disable reverse-proxy buffering for `/api/rooms/*/events` and allow long-lived responses. **Pushing to GitHub does not deploy the multiplayer server. GitHub Pages supports only offline practice.**

## Rules

- Two to six players. Joining and team changes close when the host starts the roll-off.
- Everyone rolls two independent dice. Highest starts; ties go to the first tied player in joining order. Normal turns follow joining order.
- Humans manually roll and press **End turn** after required actions. Doubles require another roll; three consecutive doubles send the player to Jail. Bots use the same rules.
- Game Settings offers Normal (440ms per space), Fast (110ms) and Instant movement. Local bots wait 700ms/200ms/50ms respectively. Reduced-motion settings skip animation. Human rolls and confirmations stay manual. Online bot pacing is controlled by the server. Movement is committed before animation, so saves capture the final destination and pending landing action.
- Pass START for £200. Buy an unowned property or open an auction. Bids rise by at least £10; passing withdraws the bidder. If everyone passes, the bank retains the property.
- Complete unmortgaged street sets double unimproved rent. Stations charge £25/£50/£100/£200 depending on station count. Utilities charge 4× dice, or 10× if both are owned. Mortgaged properties charge no rent.
- Build evenly across a complete unmortgaged colour set: four houses, then a hotel (fifth development level). Each level costs £50/£100/£150/£200 according to group. Sell evenly for half that cost. Building supply is unlimited.
- Mortgage for half the purchase price; repay principal plus 10%. Sell all buildings in a colour set before mortgaging or trading any of its properties.
- Trade properties and cash by mutual agreement. Recipients may edit and send counteroffers; each new offer still needs consent. Previews show both players' resulting cash, mortgage principal and colour sets completed or broken. Mortgages remain attached. Bots compare the entire exchange with style-dependent reserves and set-completion preferences.
- To resolve debt, sell buildings, mortgage, negotiate or declare bankruptcy. Bots sell buildings and mortgage before conceding. With no properties and insufficient cash, bankruptcy is automatic. Bank debts return assets to the bank; rent debts transfer cash and assets to the creditor.
- Final net worth = cash + property list prices + building purchase costs − mortgage principal − unpaid bills (including outstanding recipients of a Doudi ten). Buying at list price leaves net worth unchanged. Mortgage interest reduces net worth when paid. The sidebar shows cash only during play; net worth is compared at the end to choose the winner.
- **First bankruptcy ends the game**, including Teams. The highest final net worth wins, with mortgage principal and unpaid bills deducted. Teams compare combined net worth.
- Jail: use a release card, pay £50 before rolling, or try doubles. After three failed attempts, pay £50 and move the last roll. Bail debt remembers the move to resume after settlement. Jail-release doubles grant no extra roll.
- Chance and Community Chest each have 16 original cards, shuffled without replacement: cash, movement, repairs, Jail and release cards. Card movement resolves its destination normally.

### Doudi

Free Parking grants Doudi status for the holder's **next three completed turns**, excluding the claiming turn. Another claimant replaces them immediately. Other players' turns and extra doubles rolls do not reduce the duration.

Doudi receives double rent, START and positive card rewards; pays half rent, taxes, negative cards, Jail fees and Doudi penalties, rounded up. Purchases, auctions, construction, trades and mortgages are unaffected. The bank covers differences between discounted payments and boosted rent.

Four Doudi spaces sit on the sides, immediately before Jail, Free Parking, Go To Jail and START. Travel to an owned property on that side, or roll:

| Total | Result                                |
| ----- | ------------------------------------- |
| 2–4   | Pay £100                              |
| 5–9   | Receive £100                          |
| 10    | Pay exactly £25 to every other player |
| 11–12 | Choose any space                      |

The roll of 10 includes teammates and ignores Doudi discounts/bonuses. Payments go in player order; if cash runs out, raise funds to continue. Outstanding recipients survive saving. The normal first-bankruptcy ending still applies.

Doudi travel preserves the previous behaviour: **no landing effects or START reward**. Normal dice/card movement still applies landing effects. Two dice cannot total 1.

### Modes

| Mode    | Differences                                                                            |
| ------- | -------------------------------------------------------------------------------------- |
| Doudi   | Default custom rules; £1,500 starting cash                                             |
| Classic | No Doudi status; Doudi spaces become rest spaces                                       |
| Quick   | £1,000 start; ends after 20 rounds or bankruptcy                                       |
| Timed   | 5–180 minutes, default 30; ends at deadline or bankruptcy                              |
| Teams   | Two selectable teams, no teammate rent; separate cash/ownership, combined final totals |

All modes retain the 44-space board, manual human End turn and first-bankruptcy ending. Timed deadlines use real wall-clock time, including when disconnected or a save is closed.

## Practice improvements

Before starting, the host can use **Edit** beside any practice player to change its name, personality and individual difficulty. Existing games and unconfigured bots use the room difficulty. Custom settings survive saving, refreshing and rematches. Players cannot edit bots after the starting roll-off begins.

Choose Easy, Normal or Hard when creating a game. Practice players rotate through trader, saver, risk-taker and investor styles. Traders can offer 125% of purchase price for a property that completes a set, at most once per turn; Easy bots do not initiate trades. Savers keep a larger cash reserve, risk-takers spend and bid more freely, and investors prioritise strong rent improvements. Difficulty still affects reserves and bidding.

Click or keyboard-select any board space for a larger explanation; properties include ownership, rent, development and mortgage details. Doudi destinations have highlighted board spaces and full-size named buttons for touch input. Your square is highlighted, turn guidance explains the next action, dice animate during movement (unless reduced motion is enabled), and balance changes appear as notifications. Final results show turns, property counts and development totals.

## Saves and reconnects

Saved games show the save date, mode, turn number and player names. Rename preserves the snapshot and its date; deletion requires confirmation. Older saves without a date are labelled. **Restore previous autosave** lets you deliberately restore the earlier practice snapshot after confirming that later actions will be omitted. Active online rooms cannot be replaced by practice saves.

Practice saves retain a previous valid autosave. If the tab save is invalid, recovery tries the latest practice save and then the previous copy; Continue last game uses the same fallback. Recovering an earlier copy explicitly warns that the latest action may be missing. The game toolbar shows the save time or storage failure, and Save .txt remains the portable fallback. Clearing browser data removes both copies.

- **Continue last game** restores your latest practice game even after closing the tab. **Saved games** provides five named local slots with confirmation before overwriting. Both use this browser’s local storage; clearing browser data removes them. Portable .txt saves remain available.

- Refreshing the page automatically restores the active game in the same tab, including balances, properties and pending actions. Moves are saved before their animation. Online games reopen the same seat and reconnect to the server automatically. Choosing Leave returns to the lobby and stops automatic reopening. Tab storage must be available; use Save .txt for a portable backup.

- **Save .txt** exports a readable ledger and versioned JSON. The JSON block is authoritative; editing only the ledger does not change the save.
- Version 2 retains pending purchases, cards, Doudi choices, auctions, debt continuations, trades, decks, buildings, Jail, dice, starting rolls, mode, teams and history. Validation finishes before replacing the current game.
- Version 1 saves remain supported. Pending purchases and Doudi choices are recovered where sufficient information exists. Already-paid legacy cards are not applied again. Old saves did not store movement progress or a selected Doudi destination; missing information cannot be reconstructed.
- Close dialogs with ×, Escape or the backdrop. **Continue action** reopens them. The engine blocks progress until required actions finish.
- Load from the lobby. Online snapshots load as practice with other seats converted to bots. They omit the server's remaining deck order, so those decks reshuffle in practice. They cannot replace an active online room.
- Online credentials live in the current tab's session storage. Refreshing reconnects automatically; after leaving, use **Rejoin online room** in that tab. A new device does not inherit the seat's credentials.
- Server state and hashed credentials are atomically saved under ignored `data/`. Rooms expire after 24 hours without a state change. Bots pause when all clients disconnect; timed deadlines continue. A disconnected human's turn waits for reconnection.
- Back up `data/` if recovery matters. Run one server process per data directory; this is not a clustered/high-availability service. Default limits: 100 rooms and 18 streams per room.

## Interface and architecture

The toolbar keeps Properties, Rules and Focus board visible. **Menu** groups settings, sound, theme, save/load, invites and leaving. Escape closes the menu; closing a settings dialog returns keyboard focus to Menu. Property browsing filters by bank or individual owner, mortgaged status and complete colour sets, with ascending/descending price and rent sorting. Unowned properties show potential base rent; utilities use dice 7 for comparisons, and mortgage rent is zero.

Arrow keys move spatially between board spaces; Home/End select the first/last space. Enter/Space inspect or choose an eligible Doudi destination. Keyboard focus survives board rebuilding. Sound on/off and volume are stored locally, with distinct tones for rolls, cash changes and game results. **Recent cash action** retains the latest receipt, including payer/recipient, any Doudi bank subsidy and net balance changes, across refresh and save/load. Non-cash actions do not erase it. Older saves have no receipt until a new cash action occurs. Team results show both combined final net-worth totals and the winning margin, including individual mortgage debts and unpaid bills.

**Properties** opens a searchable list of names, sets and owners, with prices, mortgage status and touch-friendly details. During a Doudi destination choice it also offers eligible travel buttons. The board dimensions and equal property sizes are unchanged. Manage properties groups colour sets, shows set progress, and explains disabled mortgage/build/sell actions using the engine's rules. Property details include the full normal rent schedule; utility rent uses dice multipliers. Payment confirmations show the normal charge, Doudi discount, recipients and remaining cash or funding shortfall. Doudi ten payments remain exactly £25 per other player.

Results show the full final net-worth calculation plus rent earned, bills paid, auction spending and biggest direct/auction property purchase. These totals survive history eviction and save/load. Bills paid includes taxes, rent, cards, Jail and Doudi penalties, including cash surrendered on bankruptcy; it excludes purchases, development, mortgages and trades. Older saves cannot reconstruct unrecorded performance totals and are labelled accordingly. Personal statistics record your own final net worth and team/shared wins; legacy game/win totals are retained and labelled, while the ambiguous old highest value is archived separately. Rematches retain teams and bot styles. Bots evaluate Doudi destinations by likely next-roll opportunities and costs; travel still has no immediate landing effects or START reward.

The original branding, rounded cards and horizontal centre label are retained. The UI includes coloured tokens and ownership markers, grouped properties, a board legend, history, chat, a live cash leaderboard, local player statistics, rematches, result sharing, optional sounds, keyboard-accessible dialogs and reduced-motion support. Mobile players can use board focus mode. History retains the latest 250 events including chat; filters use explicit event categories, with older saves categorised on import. These offline features do not require the multiplayer server.

- `game-data.js`: board, colours and tokens.
- `engine.js`: transactional shared rules, validation, bots and save migration.
- `app.js`: session state, main rendering, cancellable animations, preferences/statistics and event bindings.
- `ui-board.js`: board rendering, space inspection and searchable property/destination lists.
- `ui-dialogs.js`: pending actions, property management, trades, payments, rules and results.
- `ui-saves.js`: browser storage, autosave recovery, named saves and reconnect credentials.
- `ui-connection.js`: HTTP requests, streamed updates, room creation/joining and leaving.
- The UI files are classic scripts loaded before `app.js`, sharing its session globals. This preserves direct `index.html` offline use without introducing a bundler. They define functions only; `app.js` initialises the session and binds controls.
- `server.js`: authenticated rooms, server dice, streamed updates and persistence. Only allowlisted frontend files are public.
- `tests/`: rules regressions, seeded simulations, and real HTTP integration tests.

```sh
npm run check
npm test
npm ci
npx playwright install chromium
npm run test:browser
git diff --check
```

The browser suite checks desktop/mobile board layout, touch destination targets, search, settings, auctions, counteroffers, debt resolution, payment refresh recovery, portable save imports, team results and rematches. Desktop, portrait mobile and dark landscape board screenshots use a fixed local test font. The CI workflow installs Chromium and runs the suite. Update screenshots only after reviewing an intentional visual change with `npm run test:browser -- --update-snapshots`. Further browser coverage can extend to online create/join/rejoin.

## Git workflow

Usability coverage checks the mobile menu, property filters, save metadata/rename/delete/recovery, bot configuration, arrow-key focus, persisted sound/volume and cash receipts. On failure, GitHub Actions uploads browser screenshots and Playwright traces from `test-results/` as **browser-failure-diagnostics**, retained for seven days.

Repository: https://github.com/OMGITSTX2/Doudiopoly

Check status/branch, make focused changes, run checks, review the diff, commit and push. Exclude `.freebuff/`, `data/`, unrelated folders, credentials and test artifacts. Do not use destructive resets, rebases or force pushes.
