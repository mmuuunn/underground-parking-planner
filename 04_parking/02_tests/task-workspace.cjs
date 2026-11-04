'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const base='http://127.0.0.1:8874/04_parking/underground-compare.html';
const ready=p=>p.waitForFunction(()=>ui.res&&!ui.busy&&document.querySelector('#layoutSave #workflowTraffic'));
const snapshot=p=>p.evaluate(()=>({doc:structuredClone(doc),result:structuredClone(ui.res),saved:localStorage.getItem(STORE)}));
const surround=p=>p.evaluate(()=>['.app-header','aside','.workspace-bar','#taskNavigation','#taskAlternatives','#plan'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [s,c.backgroundColor,c.color];}));
const captureDir=process.env.UX_CAPTURE_DIR||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ug-a-workspace-'));
(async()=>{const b=await chromium.launch({headless:true}),checks=[];try{
 for(const query of ['?reference=sghs&floor=B1&revision=calibrated&layout=manual&workflow=all','?plan=startup-order-test&shape=l-shape']){
  const c=await b.newContext(),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/planning-controls.js*',async r=>{await new Promise(resolve=>setTimeout(resolve,250));await r.continue();});
  await p.route('**/manual-lane-editor.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../01_src/manual-lane-editor.js'),'utf8')}));
  await p.goto(base+query);await p.waitForFunction(()=>ui.res&&!ui.busy&&document.querySelector('#taskNavigation'),null,{timeout:5000});
  assert.equal(await p.evaluate(()=>ui.res.stallCount),query.includes('sghs')?66:49);assert.deepEqual(errors,[]);checks.push({case:query,earlyEditorAndDelayedControls:true});await c.close();
 }
 for(const query of ['?reference=sghs&floor=B1&revision=calibrated&layout=manual&workflow=all','?plan=ux-workspace-test&shape=rectangle']){
  const context=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/task-workspace.js*',r=>r.abort());
  await p.goto(base+query);await ready(p);await p.reload();await ready(p);const before=await snapshot(p);
  await p.unroute('**/task-workspace.js*');await p.reload();await ready(p);await p.locator('#taskNavigation').waitFor();
  assert.deepEqual(await snapshot(p),before,'navigation must preserve inputs, results and storage');
  assert.equal(await p.locator('#workflowAuto').count(),1);assert.equal(await p.locator('#workflowTraffic').count(),1);
  assert.equal(await p.locator('body').getAttribute('data-workspace-task'),'conditions');assert(await p.locator('#taskConditions').isVisible());assert(await p.locator('#taskAlternatives #workflowALT1').isVisible());
  assert(await p.locator('#taskPreview').isHidden());
  await p.locator('#appearanceTab').click();await p.locator('[data-task="conditions"]').click();
  assert.equal(await p.locator('#planTab').getAttribute('aria-selected'),'true');assert(await p.locator('#taskLoad').evaluate(e=>document.activeElement===e));
  await p.locator('[data-task="layout"]').focus();await p.keyboard.press('Enter');
  assert(await p.evaluate(()=>['workflowAuto','workflowManual'].includes(document.activeElement.id)));
  assert(await p.locator('#taskMode #workflowAuto').isVisible());
  await p.locator('#workflowALT1').click();await p.waitForFunction(()=>!ui.busy);assert(await p.locator('#taskPreview').isVisible());
  assert.equal((await snapshot(p)).saved,before.saved,'preview must not replace saved data');
  await p.locator('#workflowCancel').click();await p.waitForFunction(()=>!ui.busy);assert(await p.locator('#taskPreview').isHidden());assert.deepEqual(await snapshot(p),before);
  await p.locator('[data-task="review"]').click();assert(await p.locator('#trafficDialog').isVisible());assert.deepEqual(await snapshot(p),before);
  await p.locator('#trafficDialogClose').click();
  if(query.includes('sghs')){
   assert.equal(before.result.stallCount,66);
   await p.locator('aside').evaluate(e=>e.scrollTop=0);
   await p.screenshot({path:path.join(captureDir,'A_연결후.png')});
   await p.locator('#workflowALT1').click();await p.waitForFunction(()=>!ui.busy);await p.locator('#taskPreview').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(captureDir,'A_미적용변경.png')});
   await p.locator('#workflowApply').click();await p.waitForFunction(()=>!ui.busy);assert.equal((await snapshot(p)).result.stallCount,65);
   await p.locator('#undoBtn').click();await p.waitForFunction(()=>!ui.busy);assert.equal((await snapshot(p)).result.stallCount,66);
   await p.reload();await ready(p);assert.equal((await snapshot(p)).result.stallCount,66);
   await p.locator('[data-task="lanes"]').first().click();await p.locator('#workflowTarget').selectOption('line:4:0');await p.locator('#workflowDistance').fill('0.1');const laneBefore=await snapshot(p);
   await p.locator('#workflowMove').click();await ready(p);assert(await p.locator('#workflowApply').isEnabled());assert.notDeepEqual(await p.evaluate(()=>ui.live),laneBefore.result,'changed geometry must be detected even when the stall count stays the same');assert.deepEqual(await snapshot(p),laneBefore);assert(await p.locator('#taskSaveNow').isDisabled());
   await p.locator('#workflowCancel').click();await ready(p);assert.deepEqual(await snapshot(p),laneBefore);
   await p.locator('#workflowMove').click();await ready(p);await p.locator('#workflowApply').click();await ready(p);const moved=await snapshot(p);assert.deepEqual(moved.doc.manualLayout.routes[4].points,[[33100,19550],[33100,5600]]);assert.equal(moved.saved,JSON.stringify(moved.doc));
   await p.locator('#undoBtn').click();await ready(p);assert.deepEqual(await snapshot(p),laneBefore);await p.locator('#redoBtn').click();await ready(p);assert.deepEqual(await snapshot(p),moved);
   await p.locator('[data-task="save"]').click();assert(await p.locator('#taskSaveNow').isVisible());await p.locator('#taskSaveNow').click();await p.locator('#workflowReload').click();await p.waitForLoadState();await ready(p);assert.deepEqual(await snapshot(p),moved);
   await p.locator('#taskLoad').click();assert(await p.locator('#siteDialog').isVisible());assert.equal(await p.locator('#projectShelf').evaluate(e=>e.open),true);assert.deepEqual(await snapshot(p),moved);await p.locator('#siteDialogClose').click();
   await p.locator('[data-task="lanes"]').first().click();await p.locator('#workflowTarget').selectOption('line:0:4');await p.locator('#workflowAxis').selectOption('1');await p.locator('#workflowDistance').fill('100');const invalidBefore=await snapshot(p);await p.locator('#workflowMove').click();await ready(p);assert(await p.locator('#workflowApply').isDisabled());assert.deepEqual(await snapshot(p),invalidBefore);await p.locator('#workflowCancel').click();
   await p.locator('[data-task="conditions"]').click();await p.locator('[data-feature="columns"]').first().click();assert(await p.locator('#structureEditor').isVisible());assert.deepEqual(await snapshot(p),moved);await p.locator('[data-feature="core"]').first().click();assert(await p.locator('#coreList').isVisible());assert.deepEqual(await snapshot(p),moved);await p.locator('[data-feature="ramp"]').first().click();assert(await p.locator('#rampSettings').isVisible());assert.deepEqual(await snapshot(p),moved);await p.locator('[data-feature="outline"]').first().click();assert.equal(await p.evaluate(()=>ui.sel.kind),'mass');assert.deepEqual(await snapshot(p),moved);
   await p.locator('[data-task="review"]').click();await p.locator('#manoeuvreRun').click();await ready(p);assert(await p.evaluate(()=>ui.manoeuvreReview.plan===ui.res));await p.locator('#trafficDialogClose').click();await p.locator('[data-task="lanes"]').first().click();await p.locator('#workflowTarget').selectOption('line:4:0');await p.locator('#workflowDistance').fill('-0.1');await p.locator('#workflowMove').click();await ready(p);assert.match(await p.locator('#manoeuvreStatus').textContent(),/미리보기/);await p.locator('#workflowCancel').click();assert(await p.evaluate(()=>ui.manoeuvreReview.plan===ui.res));await p.locator('#workflowMove').click();await ready(p);await p.locator('#workflowApply').click();await ready(p);assert.match(await p.locator('#manoeuvreStatus').textContent(),/다시 검사/);
   const themeBefore=await snapshot(p),lightSurround=await surround(p);assert.equal(await p.locator('#plan').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(25, 25, 25)');assert.equal(await p.locator('#content').evaluate(e=>getComputedStyle(e).filter),'none');assert.equal(await p.locator('#drawingGround').evaluate(e=>getComputedStyle(e).display),'none');await p.locator('button[data-theme="dark"]').click();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(await snapshot(p),themeBefore);assert.deepEqual(await surround(p),lightSurround,'only the drawing changes tone between themes');assert.match(await p.locator('#content').evaluate(e=>getComputedStyle(e).filter),/invert/);await p.screenshot({path:path.join(captureDir,'A_다크.png'),animations:'disabled'});await p.reload();await ready(p);assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');assert.match(await p.locator('#manoeuvreStatus').textContent(),/아직 검사/);await p.locator('button[data-theme="light"]').click();assert.equal(await p.locator('body').evaluate(e=>getComputedStyle(e).colorScheme),'dark');await p.screenshot({path:path.join(captureDir,'A_화이트_다크작업영역.png'),animations:'disabled'});
   await p.locator('[data-task="lanes"]').first().click();await p.screenshot({path:path.join(captureDir,'A_차로편집.png')});
   await p.emulateMedia({media:'print'});assert(await p.locator('#taskNavigation').isHidden());assert.equal(await p.locator('#plan').evaluate(e=>getComputedStyle(e).filter),'none');assert.equal(await p.locator('#content').evaluate(e=>getComputedStyle(e).filter),'none');assert.notEqual(await p.locator('#drawingGround').evaluate(e=>getComputedStyle(e).display),'none');await p.emulateMedia({media:'screen'});
   await p.locator('[data-task="save"]').click();const failedSaveBefore=await snapshot(p);await p.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('isolated storage failure');};});let navigations=0;p.on('framenavigated',()=>navigations++);await p.locator('#taskSaveNow').click();assert.match(await p.locator('#workflowSave').textContent(),/저장하지/);await p.locator('#workflowReload').click();assert.equal(navigations,0);assert.deepEqual(await snapshot(p),failedSaveBefore);
   checks.push({case:'B1 lane edit',previewCancel:true,applyUndoRedo:true,saveReopen:true,invalidEditBlocked:true,existingInputEntry:true,inspectionInvalidation:true,themePreservesPlan:true,storageFailureProtected:true});
  }else{
   const savedBefore=await snapshot(p);await p.locator('#taskLoad').click();await p.locator('#workspaceSaved').selectOption('ux-workspace-test');const opened=context.waitForEvent('page');await p.locator('#workspaceOpen').click();const q=await opened;await ready(q);assert.deepEqual(await snapshot(q),savedBefore,'saved general plan opens with its full input and result');assert.deepEqual(await snapshot(p),savedBefore,'opening another view preserves the source plan');await q.close();await p.locator('#siteDialogClose').click();checks.push({case:'saved general input',openExisting:true,sourcePreserved:true});
  }
  await p.setViewportSize({width:1100,height:800});assert(await p.locator('#taskNavigation').isVisible());
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);checks.push({case:query,unchanged:true,stalls:before.result.stallCount,keyboard:true,previewCancel:true,reviewShortcut:true});await context.close();
 }
 console.log(JSON.stringify({passed:true,checks}));
 }finally{await b.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
