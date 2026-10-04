const {test, expect} = require("@playwright/test");
const E = require("../../engine.js");

test.beforeEach(async ({page}) => page.route("https://fonts.googleapis.com/**", route => route.abort()));
function playing() {
  const state = E.dispatch(E.create({name:"Tester"}), 0, {type:"addBot",name:"Jamie"});
  state.players.forEach(p => p.bot = false);
  state.phase = "playing"; state.turnHasRolled = true;
  return state;
}
async function restore(page, state) {
  await page.addInitScript(saved => {
    if (!sessionStorage.getItem("doudi-active-game")) sessionStorage.setItem("doudi-active-game", JSON.stringify({state:saved,connection:null}));
  }, state);
  await page.goto("/", {waitUntil:"domcontentloaded"});
}
async function menu(page, id) {
  await page.locator("#gameMenu summary").click();
  await page.locator("#" + id).click();
}
test("mobile toolbar groups secondary controls in a keyboard-accessible menu", async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await restore(page, playing());
  await expect(page.locator(".game-toolbar-actions > button")).toHaveCount(3);
  await expect(page.locator("#saveSlots")).toBeHidden();
  await page.locator("#gameMenu summary").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#saveSlots")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.locator("#saveSlots")).toBeHidden();
  await menu(page,"gameSettings"); await page.locator("#modalClose").click();
  await expect(page.locator("#gameMenu summary")).toBeFocused();
  await page.screenshot({path:"test-results/mobile-toolbar.png"});
});
test("property filters combine owner and status, and sort by price or rent", async ({page}) => {
  const state=playing();state.owned={1:0,3:0,42:1};state.mortgaged[42]=true;
  await restore(page,state);await page.locator("#browseProperties").click();
  await page.locator("#propertyOwner").selectOption("0");
  await expect(page.locator("#browserPropertyList article")).toHaveCount(2);
  await page.locator("#propertyStatus").selectOption("complete");
  await expect(page.locator("#browserPropertyList article")).toHaveCount(2);
  await page.locator("#propertyOwner").selectOption("1");await page.locator("#propertyStatus").selectOption("mortgaged");
  await expect(page.locator("#browserPropertyList article")).toHaveCount(1);
  await expect(page.locator("#browserPropertyList")).toContainText("Mayfair");
  await page.locator("#propertyStatus").selectOption("all");await page.locator("#propertyOwner").selectOption("all");
  await page.locator("#propertySort").selectOption("price-high");
  await expect(page.locator("#browserPropertyList article").first()).toContainText("Mayfair");
  await page.locator("#propertyOwner").selectOption("bank");await page.locator("#propertySort").selectOption("rent-high");
  await expect(page.locator("#browserPropertyList article").first()).toContainText("Park Lane");
});
test("named saves show metadata, rename, delete with confirmation, and recover an earlier copy", async ({page}) => {
  const state=playing();state.turnNumber=7;await restore(page,state);
  await menu(page,"saveSlots");await page.locator("#saveSlot").selectOption("2");await page.locator("#saveName").fill("Afternoon");await page.locator("#writeSlot").click();
  await menu(page,"saveSlots");await page.locator("#saveSlot").selectOption("2");await expect(page.locator("#saveSummary")).toContainText("Turn 7");
  await expect(page.locator("#saveSummary")).toContainText("Tester, Jamie");
  await expect(page.locator("#saveSummary")).not.toContainText("unavailable");
  await page.locator("#saveName").fill("Renamed");await page.locator("#renameSlot").click();
  await expect(page.locator("#saveSlot option:checked")).toContainText("Renamed");
  await page.locator("#deleteSlot").click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("doudi-save-slots"))[2].name)).toBe("Renamed");
  await page.locator("#deleteSlot").click();await expect(page.locator("#readSlot")).toBeDisabled();
  await page.locator("#slotsDone").click();
  await page.evaluate(()=>{game.players[0].balance=1234;autosave();});
  await menu(page,"saveSlots");await page.locator("#recoverPrevious").click();
  await expect(page.locator("#modalContent")).toContainText("Actions after that save");
  await page.locator("#confirmRecovery").click();await expect(page.locator("#cashBalance")).toHaveText("£1,500");
});
test("each bot can be renamed and configured before play and keeps its settings on refresh", async ({page}) => {
  await page.goto("/",{waitUntil:"domcontentloaded"});await page.locator("#playerName").fill("Host");
  await page.locator("#roomForm button[type=submit]").click();await page.locator("#addBot").click();
  await page.getByRole("button",{name:"Configure Jamie"}).click();
  await page.locator("#botName").fill("");await page.locator("#saveBot").click();
  await expect(page.locator("#botName")).toBeVisible();
  await page.locator("#botName").fill("Penny");await page.locator("#botStyle").selectOption("saver");
  await page.locator("#playerDifficulty").selectOption("hard");await page.locator("#saveBot").click();
  await expect(page.locator("#playersList")).toContainText("Penny");await expect(page.locator("#playersList")).toContainText("saver · hard");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Configure Penny"}).click();await expect(page.locator("#playerDifficulty")).toHaveValue("hard");
  await page.locator("#cancelBot").click();await page.locator("#startGame").click();
  await expect(page.locator(".bot-edit-button")).toHaveCount(0);
});
test("board arrows follow spatial neighbours and retain focus when rebuilt", async ({page}) => {
  await restore(page,playing());const squares=page.locator("#board .square");
  await squares.nth(0).focus();await page.keyboard.press("ArrowRight");await expect(squares.nth(1)).toBeFocused();
  await page.evaluate(()=>render());await expect(squares.nth(1)).toBeFocused();
  await page.keyboard.press("Home");await page.keyboard.press("ArrowDown");await expect(squares.nth(43)).toBeFocused();
  await page.keyboard.press("End");await expect(squares.nth(43)).toBeFocused();
  await page.keyboard.press("ArrowUp");await expect(squares.nth(0)).toBeFocused();
});
test("sound preferences survive refresh and rolls, payments and results have distinct notes", async ({page}) => {
  await restore(page,playing());await menu(page,"gameSettings");await page.locator("#soundSetting").check();
  await page.locator("#soundVolume").evaluate(el=>el.value="60");await page.locator("#soundVolume").dispatchEvent("input");
  await page.reload({waitUntil:"domcontentloaded"});await menu(page,"gameSettings");
  await expect(page.locator("#soundSetting")).toBeChecked();await expect(page.locator("#soundVolume")).toHaveValue("60");
  await page.locator("#gameSpeed").selectOption("instant");await page.locator("#modalClose").click();
  await page.evaluate(()=>{
    window.played=[];window.soundKinds=[];
    audioContext={currentTime:0,destination:{},resume(){},createOscillator(){const o={frequency:{value:0},connect(){},start(){played.push(o.frequency.value);},stop(){}};return o;},createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
    const original=beep;beep=kind=>{soundKinds.push(kind);original(kind);};
    game.pending={type:"tax",player:0,index:4};game.players[0].position=4;render();showPending(true);
  });
  await page.locator("#payTax").click();
  await page.evaluate(()=>{game.players[0].position=0;game.turnHasRolled=false;random=()=>0.01;render();});
  await page.locator("#rollButton").click();
  await page.evaluate(async()=>{const next=E.clone(game);next.phase="over";next.pending=null;next.debt=null;next.reason="Finished";next.revision++;await acceptState(next);});
  expect(await page.evaluate(()=>soundKinds)).toEqual(["payment","roll","win"]);
  const notes=await page.evaluate(()=>played);
  expect(notes.slice(0,2)).not.toEqual(notes.slice(2,4));
  expect(notes.slice(4)).toHaveLength(3);
});
test("payment receipts survive refresh and team totals include liabilities", async ({page}) => {
  const state=playing();state.pending={type:"tax",player:0,index:4};state.players[0].position=4;await restore(page,state);
  await page.locator("#payTax").click();await expect(page.locator("#receiptContent")).toContainText("Tester → Bank: £200");
  await expect(page.locator("#receiptContent")).toContainText("−£200");await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#receiptContent")).toContainText("Tester → Bank");
  const teams=playing();teams.mode="teams";teams.players[0].team=0;teams.players[1].team=1;teams.owned[42]=0;teams.mortgaged[42]=true;
  teams.players[1].botStyle="saver";teams.players[1].botDifficulty="easy";teams.finalDebt={player:0,amount:50};teams.phase="over";teams.reason="Finished";
  await page.evaluate(s=>localGame(s),teams);await expect(page.locator(".team-results")).toContainText("Coral team£1,650");
  await expect(page.locator(".team-results")).toContainText("Blue team£1,500");await expect(page.locator(".team-results")).toContainText("Winning margin£150");
  await page.locator("#rematch").click();expect(await page.evaluate(()=>game.players[1].botDifficulty)).toBe("easy");
});
