import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base=process.env.IRON_PREVIEW_BASE_URL ?? "http://127.0.0.1:4173";
const artifacts=process.env.IRON_UI_ARTIFACT_DIR ?? "artifacts/iron-ui-runtime";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[];
const check=(condition,message)=>{try{assert.ok(condition,message)}catch(error){failures.push(error.message)}};
const viewports=[
 {name:"360x800",width:360,height:800},
 {name:"390x844",width:390,height:844},
 {name:"412x915",width:412,height:915},
 {name:"1280x900",width:1280,height:900}
];

try{
 for(const viewport of viewports){
  const page=await browser.newPage({viewport});
  const consoleErrors=[];
  page.on("console",msg=>{if(msg.type()==="error")consoleErrors.push(msg.text())});
  await page.goto(base+"/preview/student.html",{waitUntil:"networkidle"});
  check(await page.locator("[data-capability]").count()===7,viewport.name+": seven capabilities");
  const order=await page.locator("[data-capability]").evaluateAll(nodes=>nodes.map(n=>n.id));
  assert.deepEqual(order,["officialBookContent","tamkeenExplanationHtml","lessonSummaryHtml","mindMapHtml","labExperimentHtml","officialBookQuestions","selfTest"]);
  const size=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  check(size.scrollWidth<=size.clientWidth+1,viewport.name+": no outer horizontal overflow");
  await page.getByRole("button",{name:"أسئلة الكتاب"}).click();
  await page.locator("#official-list .card").first().waitFor();
  check(await page.locator("#official-list .card").count()===5,viewport.name+": five official question groups");
  await page.getByRole("button",{name:"الاختبار الذاتي"}).click();
  await page.locator("#self-list .card").first().waitFor();
  check(await page.locator("#self-list .card").count()===40,viewport.name+": 40 self-test questions");
  check(await page.locator("#selfTest").getByText(/correct_option|rationale|answer_key/i).count()===0,viewport.name+": no answer leak");
  await page.screenshot({path:`${artifacts}/preview-${viewport.name}.png`,fullPage:true});
  check(consoleErrors.length===0,viewport.name+": console errors: "+consoleErrors.join(" | "));
  await page.close();
 }

 const official=await browser.newPage({viewport:{width:390,height:844}});
 await official.goto(base+"/official-content.html",{waitUntil:"networkidle"});
 check(await official.locator("table").count()===1,"official table present");
 check(await official.locator("table thead tr").count()===2,"official table has two header rows");
 check(await official.locator("table tbody tr").count()===3,"official table has three element rows");
 check(await official.locator(".equation").count()>=15,"official equations complete");
 check(await official.locator('.equation:has-text("394")').count()===1&&await official.locator('.equation:has-text("173")').count()===1,"official thermochemistry equations visible");
 const officialSource=await official.locator("html").innerHTML();
 check(officialSource.includes("ΔH"),"official ΔH retained in rendered source");
 const image=official.locator('[data-block-id="furnace-figure"] img');
 await image.waitFor();
 check(await image.evaluate(img=>img.complete&&img.naturalWidth>0),"actual furnace figure loads");
 await official.screenshot({path:`${artifacts}/official-content-mobile.png`,fullPage:true});
 await image.screenshot({path:`${artifacts}/furnace-figure-mobile.png`});
 await official.close();

 const mind=await browser.newPage({viewport:{width:390,height:844}});
 await mind.goto(base+"/mindmap.html",{waitUntil:"networkidle"});
 check(await mind.locator("script").count()===0,"mindmap contains zero JavaScript");
 await mind.locator("details").evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
 const targets=await mind.locator("summary").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
 check(targets.every(height=>height>=44),"mindmap touch targets are at least 44px");
 const mindSize=await mind.evaluate(()=>({c:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));
 check(mindSize.s<=mindSize.c+1,"mindmap has no horizontal overflow");
 await mind.screenshot({path:`${artifacts}/mindmap-expanded.png`,fullPage:true});
 await mind.close();

 const lab=await browser.newPage({viewport:{width:390,height:844}});
 const cspErrors=[],external=[];
 lab.on("console",msg=>{if(/content security policy|refused to/i.test(msg.text()))cspErrors.push(msg.text())});
 lab.on("request",request=>{if(new URL(request.url()).origin!==new URL(base).origin)external.push(request.url())});
 await lab.goto(base+"/lab.html",{waitUntil:"networkidle"});
 await lab.selectOption("#ion",{label:"Fe2+"});await lab.click("#run");
 check((await lab.locator("#result").innerText()).includes("Fe(OH)2"),"Fe2+ flow works");
 await lab.screenshot({path:`${artifacts}/lab-fe2.png`,fullPage:true});
 await lab.selectOption("#ion",{label:"Fe3+"});await lab.click("#run");
 check((await lab.locator("#result").innerText()).includes("Fe(OH)3"),"Fe3+ flow works");
 await lab.screenshot({path:`${artifacts}/lab-fe3.png`,fullPage:true});
 await lab.click("#reset");
 check((await lab.locator("#result").innerText()).includes("لم يبدأ"),"lab reset works");
 check(cspErrors.length===0,"lab CSP has no violations: "+cspErrors.join(" | "));
 check(external.length===0,"lab performs zero external network requests");
 const policy=await lab.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
 check(policy.includes("connect-src 'none'"),"lab connect-src remains none");
 await lab.close();
}finally{await browser.close()}

if(failures.length){console.error("IRON_UI_RUNTIME_FAIL");for(const failure of failures)console.error("- "+failure);process.exitCode=1}else{console.log("IRON_UI_RUNTIME_PASS viewports=4 capabilities=7 self_test=40 csp=PASS network=0")}
