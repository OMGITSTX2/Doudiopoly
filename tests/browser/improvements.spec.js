const {test,expect}=require("@playwright/test");
const E=require("../../engine.js");
test.beforeEach(async({page})=>page.route("https://fonts.googleapis.com/**",route=>route.abort()));
function playing(){
  const state=E.dispatch(E.create({name:"Tester"}),0,{type:"addBot",name:"Jamie"});
  state.players.forEach(p=>p.bot=false); state.phase="playing"; state.turnHasRolled=true;
  return state;
}
async function restore(page,state){
  await page.addInitScript(saved=>{if(!sessionStorage.getItem("doudi-active-game"))sessionStorage.setItem("doudi-active-game",JSON.stringify({state:saved,connection:null}));},state);
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#gameView")).toBeVisible();
}
test("in-game settings and searchable mobile destinations",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const state=playing(); state.pending={type:"destination",player:0}; await restore(page,state);
  await page.locator("#gameSettings").click(); await page.locator("#gameSpeed").selectOption("fast");
  await page.locator("#modalClose").click(); await page.locator("#browseProperties").click();
  await page.locator("#propertySearch").fill("Mayfair");
  await expect(page.locator("#browserPropertyList article")).toHaveCount(1);
  await expect(page.locator("#browserPropertyList")).toContainText("£400");
  await page.screenshot({path:"test-results/property-browser-mobile.png"});
  await page.locator("#browserPropertyList [data-travel]").click();
  await expect(page.locator("#destinationChoices")).toBeHidden();
  expect(await page.evaluate(()=>game.players[0].position)).toBe(42);
});
test("payment breakdown survives refresh and charges once",async({page})=>{
  const state=playing(); state.players[0].position=4; state.doudiPlayer=0; state.doudiTurnsLeft=3;
  state.pending={type:"tax",player:0,index:4}; await restore(page,state);
  await expect(page.locator("#modalContent")).toContainText("Normal charge£200");
  await expect(page.locator("#modalContent")).toContainText("Doudi discount£100");
  await expect(page.locator("#modalContent")).toContainText("Cash after payment£1,400");
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#cashBalance")).toHaveText("£1,500");
  await page.locator("#payTax").click();
  await expect(page.locator("#cashBalance")).toHaveText("£1,400");
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#cashBalance")).toHaveText("£1,400");
});
test("received trade can be countered and accepted",async({page})=>{
  const state=playing(); state.owned={1:0,3:1};
  state.trade={from:1,to:0,give:[3],receive:[1],giveCash:0,receiveCash:0}; await restore(page,state);
  await page.locator("#counterTrade").click();
  await expect(page.locator('#giveProperties input[value="1"]')).toBeChecked();
  await expect(page.locator('#receiveProperties input[value="3"]')).toBeChecked();
  await page.locator("#receiveCash").fill("50"); await page.locator("#sendTrade").click();
  await expect(page.locator("#modalContent")).toContainText("Trade offer");
  await page.evaluate(()=>{me=1;closeModal();showPending(true);}); await page.locator("#acceptTrade").click();
  expect(await page.evaluate(()=>game.players[0].balance)).toBe(1550);
  expect(await page.evaluate(()=>game.owned[3])).toBe(0);
});
test("portable pending card import and team results retain their state",async({page})=>{
  const state=playing();state.pending={type:"card",player:0,deck:"chance",card:1};
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await page.locator("#loadGameInput").setInputFiles({name:"game.txt",mimeType:"text/plain",buffer:Buffer.from(E.saveText(state))});
  await expect(page.locator("#resolveCard")).toContainText("Pay");
  await expect(page.locator("#cashBalance")).toHaveText("£1,500");
  await page.locator("#resolveCard").click();await expect(page.locator("#cashBalance")).toHaveText("£1,470");
  const teams=playing();teams.mode="teams";teams.players[0].team=0;teams.players[1].team=1;
  teams.phase="over";teams.reason="Finished";teams.players[0].balance=1700;
  await page.evaluate(state=>localGame(state),teams);
  await expect(page.locator("#modalContent")).toContainText("Coral team wins");
  await expect(page.locator("#modalContent")).toContainText("Bills paid");
  await page.locator("#rematch").click();expect(await page.evaluate(()=>game.players.map(p=>p.team))).toEqual([0,1]);
});
test("invalid building and unaffordable bids explain the rules",async({page})=>{
  const state=playing();state.owned[1]=0;await restore(page,state);
  await page.locator("#manageProperties").click();
  await expect(page.locator('[data-command="build"][data-index="1"]')).toBeDisabled();
  await expect(page.locator("#modalContent")).toContainText("Own the entire unmortgaged set");
  state.players[0].balance=5;state.pending={type:"auction",player:0,index:42,bidder:0,highBid:0,highBidder:null,passed:[]};
  await page.evaluate(state=>localGame(state),state);
  await expect(page.locator("#placeBid")).toBeDisabled();
  await expect(page.locator(".auction-players")).toContainText("Maximum bid £5");
  await page.locator("#passBid").click();await expect(page.locator(".auction-players")).toContainText("Withdrawn");
});
test("split UI scripts also work when opening index.html directly",async({page})=>{
  const {pathToFileURL}=require("node:url");
  const path=require("node:path");
  await page.goto(pathToFileURL(path.resolve(__dirname,"../../index.html")).href,{waitUntil:"domcontentloaded"});
  await page.locator("#playerName").fill("Offline");
  await page.locator("#roomForm button[type=submit]").click();
  await expect(page.locator("#board .square")).toHaveCount(44);
  await page.locator("#browseProperties").click();
  await page.locator("#propertySearch").fill("Mayfair");
  await expect(page.locator("#browserPropertyList")).toContainText("£400");
});

test("storage failures are visible while tab recovery remains available",async({page})=>{
  const state=playing();await restore(page,state);
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(this===localStorage)throw new DOMException("Full","QuotaExceededError");return original.call(this,key,value);};
    autosave();
  });
  await expect(page.locator("#saveStatus")).toContainText("save failed");
  await expect(page.locator("#toast")).toContainText("Save .txt");
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("doudi-active-game")).state.players[0].name)).toBe("Tester");
});
