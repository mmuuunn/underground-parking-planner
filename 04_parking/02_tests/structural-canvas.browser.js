// Run with browser_run_code_unsafe(filename) while the active repo is served on 8874.
// Uses a separate browser context; never changes the user's SGHS pilot document.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
  const p=await context.newPage(),checks=[],errors=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  const snapshot=()=>p.evaluate(()=>JSON.stringify(doc));
  const state=()=>p.evaluate(()=>({axes:doc.columnAxes,cores:doc.cores,ramp:doc.ramp,mass:doc.mass,hist:hist.i,ucs:doc.ucs,count:ui.res.stallCount,status:ui.res.status,columns:ui.res.columns.length}));
  const span=(axis,index)=>p.locator(`[data-axis-span="${axis}"][data-index="${index}"]`);
  const drag=async(name,delta)=>{
    const box=await p.locator(`[data-axis-handle="${name}"]`).boundingBox();check(box,'missing '+name);
    const k=await p.evaluate(()=>scale()),x=box.x+box.width/2,y=box.y+box.height/2;
    await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+(name[0]==='X'?delta*k:0),y-(name[0]==='Y'?delta*k:0),{steps:4});
  };
  p.on('pageerror',e=>errors.push(e.message));
  try{
    await p.goto('http://127.0.0.1:8874/04_parking/underground-compare.html');
    await p.waitForFunction(()=>window.UGPlanningUI?.structure&&!!ui.res&&!ui.busy);
    await p.evaluate(()=>{
      doc=defaultDoc();const base=UGP.geom.bbox(doc.mass.map(p=>rot(p,-doc.ucs)));
      doc.columnAxes={x:[10000,16000,25000,33400].map(v=>Math.round(base[0]+v)),y:[10000,19000,28000,37000].map(v=>Math.round(base[1]+v))};
      hist.stack=[];hist.i=-1;pushHist();recompute(null);fit();
    });
    const initial=await snapshot(),before=await state();check(before.ucs!==0,'rotated fixture required');
    await p.locator('#editStructureCanvas').click();check(await snapshot()===initial,'enter edit mutated document');
    check(await p.locator('[data-axis-handle]').count()===8,'missing axis controls');
    check(await span('X',1).isVisible(),'6m dimension missing');checks.push('visible controls; enter mode preserves document');
    await span('X',2).click();await p.locator('#axisDimensionValue').fill('8.2');await p.locator('#axisDimensionEditor button[type=submit]').click();
    const dim=await state(),dimDoc=await snapshot();check(dim.axes.x[2]===before.axes.x[1]+8200,'dimension did not move X3');
    check(dim.axes.x.every((v,i)=>i===2||v===before.axes.x[i]),'dimension moved other X axes');
    for(const key of ['cores','ramp','mass'])check(JSON.stringify(dim[key])===JSON.stringify(before[key]),'dimension changed '+key);
    check(JSON.stringify(dim.axes.y)===JSON.stringify(before.axes.y),'dimension moved Y axes');
    await p.locator('#undoBtn').click();check(await snapshot()===initial,'undo mismatch');
    await p.locator('#redoBtn').click();check(await snapshot()===dimDoc,'redo mismatch');
    await p.reload();await p.waitForFunction(()=>!!ui.res&&!ui.busy);check(await snapshot()===dimDoc,'reload mismatch');
    await p.locator('#editStructureCanvas').click();checks.push('dimension changes one axis; undo/redo/reload; rotated UCS');
    await span('X',2).click();await p.locator('#axisDimensionValue').fill('99');await p.locator('#axisDimensionEditor button[type=submit]').click();
    check(await p.locator('#axisDimensionError').innerText(),'missing crossed-axis error');check(await snapshot()===dimDoc,'invalid interval changed document');
    await p.locator('#axisDimensionValue').fill('0.1');await p.locator('#axisDimensionEditor button[type=submit]').click();check(await snapshot()===dimDoc,'sub-column interval applied');
    await p.keyboard.press('Escape');check(!await p.locator('#axisDimensionEditor').isVisible(),'Escape left editor open');
    const prior=await state();await drag('X2',900);check(await snapshot()===dimDoc,'drag preview mutated document');check(await p.locator('[data-axis-preview]').count()>0,'no column preview');await p.mouse.up();
    const moved=await state();check(moved.axes.x[1]===prior.axes.x[1]+900,'X2 drag coordinate wrong');check(moved.hist===prior.hist+1,'drag must create one history entry');
    check(moved.axes.x.every((v,i)=>i===1||v===prior.axes.x[i]),'drag moved other X axes');check(JSON.stringify(moved.cores)===JSON.stringify(prior.cores),'drag moved cores');
    check(await p.locator('#axisSpansX').inputValue()==='6.9 7.3 9.2','panel not synchronized');
    const xDoc=await snapshot();await drag('Y2',600);await p.mouse.up();const yMoved=await state();check(yMoved.axes.y[1]===moved.axes.y[1]+600,'Y drag direction wrong');checks.push('X/Y drag; preview; one history entry; panel synchronization');
    let stable=await snapshot();await p.keyboard.press('Control+z');check(await snapshot()===xDoc,'keyboard undo mismatch');await p.keyboard.press('Control+Shift+z');check(await snapshot()===stable,'keyboard redo mismatch');
    await span('Y',2).click();await p.locator('#axisDimensionValue').fill('7.8');await p.locator('#axisDimensionEditor button[type=submit]').click();
    const yDim=await state();check(yDim.axes.y[2]===yMoved.axes.y[1]+7800,'Y dimension moved wrong row');check(yDim.axes.y.every((v,i)=>i===2||v===yMoved.axes.y[i]),'Y dimension moved other rows');await p.locator('#undoBtn').click();check(await snapshot()===stable,'Y dimension undo mismatch');checks.push('Y dimension indexing; keyboard undo/redo');
    await drag('X2',500);await p.keyboard.press('Escape');await p.mouse.up();check(await snapshot()===stable,'Escape changed model');
    await drag('X2',500);await p.evaluate(()=>svg.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await p.mouse.up();check(await snapshot()===stable,'pointercancel changed model');
    await drag('X2',20000);await p.mouse.up();check(await snapshot()===stable,'crossed axis drag changed model');check((await p.locator('#axisCanvasGuide').innerText()).includes('적용하지 않았습니다'),'missing drag error');
    await drag('X1',-9500);await p.mouse.up();check(await snapshot()===stable,'boundary clipping changed model');checks.push('invalid interval; Escape; pointercancel; crossed axes; boundary rejection');
    await p.locator('[data-axis-handle="X2"]').focus();await p.keyboard.press('Enter');check(await p.locator('#axisDimensionEditor').isVisible(),'keyboard activation failed');await p.keyboard.press('Escape');checks.push('keyboard dimension entry');
    await p.locator('#editStructureCanvas').click();check(await p.locator('[data-axis-handle]').count()===0,'controls persisted after exit');check(await snapshot()===stable,'exit mode changed document');
    await p.evaluate(()=>{delete doc.columnAxes;commit('test uniform restore');});const auto=await snapshot();
    await p.locator('#editStructureCanvas').click();check(await snapshot()===auto,'enter auto edit mutated document');
    check((await p.locator('#axisCanvasGuide').innerText()).includes('처음 적용'),'auto conversion not explained');
    const autoAxes=await p.evaluate(()=>UGPlanningUI.structure.axes());await drag('X2',100);await p.mouse.up();const converted=await state();
    check(converted.axes?.x[1]===autoAxes.x[1]+100,'auto grid edit did not fix axes');checks.push('automatic grid remains unchanged until a valid edit');
    check(errors.length===0,'browser errors: '+errors.join(';'));
    return {checks,fixedFixture:{columns:before.columns,initialCount:before.count,initialStatus:before.status,ucs:before.ucs},consoleErrors:errors};
  }finally{await context.close();}
}
