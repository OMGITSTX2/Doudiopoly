const { test, expect } = require("@playwright/test");
const E = require("../../engine.js");
const path = require("node:path");

test.beforeEach(async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
});

async function stableFont(page) {
  const font = path.join(path.dirname(require.resolve("@fontsource-variable/manrope/package.json")), "files/manrope-latin-wght-normal.woff2");
  await page.route("**/test-font.woff2", (route) => route.fulfill({ path: font, contentType: "font/woff2" }));
  await page.addStyleTag({ content: '@font-face { font-family: TestFont; src: url("/test-font.woff2"); font-weight: 200 800; } #board, #board * { font-family: TestFont, sans-serif !important; }' });
  await page.evaluate(() => document.fonts.ready);
}

async function openPractice(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#playerName").fill("Tester");
  await page.locator("#roomForm button[type=submit]").click();
  await expect(page.locator("#gameView")).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1365, height: 900 }]) {
  test(`board layout and space details at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openPractice(page);
    const board = page.locator("#board");
    await expect(board.locator(".square")).toHaveCount(44);
    const box = await board.boundingBox();
    expect(box.width).toBeGreaterThan(300);
    expect(Math.abs(box.width - box.height)).toBeLessThan(3);
    const scroll = await page.locator(".board-scroll").evaluate((el) => ({
      scroll: el.scrollWidth, visible: el.clientWidth,
    }));
    expect(scroll.scroll).toBeLessThanOrEqual(scroll.visible + 2);
    await board.locator(".square").nth(10).click();
    await expect(page.locator("#spaceInspectorTitle")).toHaveText("DOUDI SPACE");
    await expect(page.locator("#spaceInspectorText")).toContainText("travel");
    await page.locator("#spaceInspectorClose").click();
    await expect(page.locator("#spaceInspector")).toBeHidden();
    await stableFont(page);
    await page.mouse.move(0, 0);
    await expect(board).toHaveScreenshot(`board-${viewport.width}.png`);
  });
}

test("mobile board remains usable after refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPractice(page);
  await page.locator("#addBot").click();
  await expect(page.locator(".player-row")).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#gameView")).toBeVisible();
  await expect(page.locator("#board .square")).toHaveCount(44);
  await expect(page.locator(".player-row")).toHaveCount(2);
});

function playing() {
  let state = E.dispatch(E.create({ name: "Tester" }), 0, { type: "addBot", name: "Jamie" });
  state.players.forEach((player) => { player.bot = false; });
  state.phase = "playing";
  state.turnHasRolled = true;
  return state;
}
async function restore(page, state) {
  await page.addInitScript((saved) => sessionStorage.setItem("doudi-active-game", JSON.stringify({ state: saved, connection: null })), state);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#gameView")).toBeVisible();
}

test("auction bids and debt resolution update actual balances", async ({ page }) => {
  const state = playing();
  state.players[0].position = 1;
  state.pending = { type: "auction", player: 0, index: 1, bidder: 0, highBid: 0, highBidder: null, passed: [] };
  await restore(page, state);
  await page.locator("#placeBid").click();
  await expect(page.locator("#modalContent")).toContainText("Current bid: £10");
  const debt = playing();
  debt.players[0].balance = 0; debt.owned[42] = 0;
  debt.debt = { player: 0, amount: 100, creditor: null, credit: 0, reason: "Tax", after: null };
  await page.evaluate((state) => localGame(state), debt);
  await page.locator("#debtAssets").click();
  await page.locator('[data-command="mortgage"][data-index="42"]').click();
  await expect(page.locator("#cashBalance")).toHaveText("£100");
});

test("trade preview shows both cash balances, sets and mortgages before sending", async ({ page }) => {
  const state = playing(); state.owned = { 1: 0, 3: 1 }; state.mortgaged[3] = true;
  await restore(page, state);
  await page.locator("#offerTrade").click();
  await page.locator('#receiveProperties input[value="3"]').check();
  await page.locator("#giveCash").fill("75");
  await expect(page.locator("#tradePreview")).toContainText("£1,425");
  await expect(page.locator("#tradePreview")).toContainText("£1,575");
  await expect(page.locator("#tradePreview")).toContainText("Completes: Brown set");
  await expect(page.locator("#tradePreview")).toContainText("Mortgage debt £30");
  await page.locator("#sendTrade").click();
  await expect(page.locator("#modalContent")).toContainText("Trade offer");
});

test("results show every net-worth component and property details show potential rent", async ({ page }) => {
  const state = playing(); state.owned[42] = 0; state.mortgaged[42] = true;
  await restore(page, state);
  await page.locator("#board .square").nth(1).click();
  await expect(page.locator("#modalContent")).toContainText("Potential base rent");
  await expect(page.locator(".rent-table tr")).toHaveCount(7);
  state.phase = "over"; state.reason = "Finished"; state.finalDebt = { player: 0, amount: 50 };
  await page.evaluate((state) => localGame(state), state);
  await expect(page.locator(".worth-breakdown").first()).toContainText("Mortgage debt−£200");
  await expect(page.locator(".worth-breakdown").first()).toContainText("Unpaid bills−£50");
  await expect(page.locator(".worth-total").first()).toContainText("£1,650");
});

test("landscape dark board has a stable visual baseline and reachable focus controls", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openPractice(page);
  await page.locator("#gameMenu summary").click();
  await page.locator("#themeToggle").click();
  await stableFont(page);
  await page.mouse.move(0, 0);
  await expect(page.locator("#board")).toHaveScreenshot("board-landscape-dark.png");
  await page.locator("#boardFullscreen").click();
  await page.locator("#boardUnfocus").click();
  await expect(page.locator(".board-stage")).not.toHaveClass(/board-focus/);
});

test("game speed preference survives a refresh", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#accessibilitySettings").click();
  await page.locator("#gameSpeed").selectOption("instant");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#accessibilitySettings").click();
  await expect(page.locator("#gameSpeed")).toHaveValue("instant");
});

test("mobile destination choices provide full-size targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let state = E.create({ name: "Tester" });
  state = E.dispatch(state, 0, { type: "addBot", name: "Jamie" });
  state.phase = "playing";
  state.turnHasRolled = true;
  state.pending = { type: "destination", player: 0 };
  await page.addInitScript((saved) => {
    localStorage.setItem("doudi-last-practice", JSON.stringify(saved));
    sessionStorage.setItem("doudi-active-game", JSON.stringify({ state: saved, connection: null }));
  }, state);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#gameView")).toBeVisible();
  const choices = page.locator("#destinationChoices button");
  await expect(choices).toHaveCount(44);
  const box = await choices.first().boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await choices.filter({ hasText: "Mayfair" }).click();
  await expect(page.locator("#destinationChoices")).toBeHidden();
});
