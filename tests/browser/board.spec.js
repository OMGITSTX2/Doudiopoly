const { test, expect } = require("@playwright/test");
const E = require("../../engine.js");

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
    await board.screenshot({ path: `test-results/board-${viewport.width}.png` });
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
