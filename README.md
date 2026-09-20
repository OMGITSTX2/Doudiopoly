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
- Tokens move one space every 440ms. Reduced-motion settings skip animation. Movement is committed before animation, so saves capture the final destination and pending landing action.
- Pass START for £200. Buy an unowned property or open an auction. Bids rise by at least £10; passing withdraws the bidder. If everyone passes, the bank retains the property.
- Complete unmortgaged street sets double unimproved rent. Stations charge £25/£50/£100/£200 depending on station count. Utilities charge 4× dice, or 10× if both are owned. Mortgaged properties charge no rent.
- Build evenly across a complete unmortgaged colour set: four houses, then a hotel (fifth development level). Each level costs £50/£100/£150/£200 according to group. Sell evenly for half that cost. Building supply is unlimited.
- Mortgage for half the purchase price; repay principal plus 10%. Sell all buildings in a colour set before mortgaging or trading any of its properties.
- Trade properties and cash by mutual agreement. Mortgages remain attached. Bots compare cash and asset values after mortgage principal and accept equal or better value.
- To resolve debt, sell buildings, mortgage, negotiate or declare bankruptcy. Bots sell buildings and mortgage before conceding. With no properties and insufficient cash, bankruptcy is automatic. Bank debts return assets to the bank; rent debts transfer cash and assets to the creditor.
- **First bankruptcy ends the game**, including Teams. Final totals preserve the original cash-plus-full-property-value rule; building investment adds to property value. Mortgages remain displayed but do not reduce this custom score.
- Jail: use a release card, pay £50 before rolling, or try doubles. After three failed attempts, pay £50 and move the last roll. Bail debt remembers the move to resume after settlement. Jail-release doubles grant no extra roll.
- Chance and Community Chest each have 16 original cards, shuffled without replacement: cash, movement, repairs, Jail and release cards. Card movement resolves its destination normally.

### Doudi

Free Parking grants Doudi status for the holder's **next three completed turns**, excluding the claiming turn. Another claimant replaces them immediately. Other players' turns and extra doubles rolls do not reduce the duration.

Doudi receives double rent, START and positive card rewards; pays half rent, taxes, negative cards, Jail fees and Doudi penalties, rounded up. Purchases, auctions, construction, trades and mortgages are unaffected. The bank covers differences between discounted payments and boosted rent.

Four Doudi spaces remain after Jail, Free Parking, Go To Jail and Mayfair. Travel to an owned property on that side, or roll:

| Total | Result           |
| ----- | ---------------- |
| 2–4   | Pay £100         |
| 5–9   | Receive £100     |
| 10    | Nothing happens  |
| 11–12 | Choose any space |

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

## Saves and reconnects

- Refreshing the page automatically restores the active game in the same tab, including balances, properties and pending actions. Moves are saved before their animation. Online games reopen the same seat and reconnect to the server automatically. Choosing Leave returns to the lobby and stops automatic reopening. Tab storage must be available; use Save .txt for a portable backup or before closing the tab.

- **Save .txt** exports a readable ledger and versioned JSON. The JSON block is authoritative; editing only the ledger does not change the save.
- Version 2 retains pending purchases, cards, Doudi choices, auctions, debt continuations, trades, decks, buildings, Jail, dice, starting rolls, mode, teams and history. Validation finishes before replacing the current game.
- Version 1 saves remain supported. Pending purchases and Doudi choices are recovered where sufficient information exists. Already-paid legacy cards are not applied again. Old saves did not store movement progress or a selected Doudi destination; missing information cannot be reconstructed.
- Close dialogs with ×, Escape or the backdrop. **Continue action** reopens them. The engine blocks progress until required actions finish.
- Load from the lobby. Online snapshots load as practice with other seats converted to bots. They omit the server's remaining deck order, so those decks reshuffle in practice. They cannot replace an active online room.
- Online credentials live in the current tab's session storage. Refreshing reconnects automatically; after leaving, use **Rejoin online room** in that tab. A new device does not inherit the seat's credentials.
- Server state and hashed credentials are atomically saved under ignored `data/`. Rooms expire after 24 hours without a state change. Bots pause when all clients disconnect; timed deadlines continue. A disconnected human's turn waits for reconnection.
- Back up `data/` if recovery matters. Run one server process per data directory; this is not a clustered/high-availability service. Default limits: 100 rooms and 18 streams per room.

## Interface and architecture

The original branding, rounded cards and horizontal centre label are retained. The UI includes coloured tokens and ownership markers, grouped properties, history, chat, a live final-total leaderboard, optional sounds, keyboard-accessible dialogs and reduced-motion support. Small screens scroll the board instead of shrinking text. History retains the latest 250 events including chat.

- `game-data.js`: board, colours and tokens.
- `engine.js`: transactional shared rules, validation, bots and save migration.
- `app.js`: UI, cancellable animations, accessibility and connection handling.
- `server.js`: authenticated rooms, server dice, streamed updates and persistence. Only allowlisted frontend files are public.
- `tests/`: rules regressions, seeded simulations, and real HTTP integration tests.

```sh
npm run check
npm test
git diff --check
```

Browser checks should cover offline play, closing/resuming dialogs, valid/invalid saves, leaving during movement, online create/join/rejoin, keyboard navigation and desktop/mobile layouts.

## Git workflow

Repository: https://github.com/OMGITSTX2/Doudiopoly

Check status/branch, make focused changes, run checks, review the diff, commit and push. Exclude `.freebuff/`, `data/`, unrelated folders, credentials and test artifacts. Do not use destructive resets, rebases or force pushes.
