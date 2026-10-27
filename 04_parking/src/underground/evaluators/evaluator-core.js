(function(root,factory){'use strict';const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.UGEvaluator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const freeze=Object.freeze;
  const IDS=freeze({G:freeze(['G01','G02','G03','G04','G05','G06','G07','G08','G09','G10']),R:freeze(['R01','R02','R03','R04','R09','R05','R06','R07','R08']),V:freeze(['V01','V02','V03','V04','V05','V06']),S:freeze(['S01','S02','S03','S04']),P:freeze(['P01','P02','P03','P04','P05']),L:freeze(['L01','L02','L03','L04','L05'])});
  const ALL=Object.entries(IDS).flatMap(([d,ids])=>ids.map(id=>({id,domain:d})));
  const DOMAIN_OF=new Map(ALL.map(x=>[x.id,x.domain]));
  const DONE_1A=new Set(['G01','R01','R02','R03','R04','R09','L01','L04']);
  const DOMAIN_NAME={G:'도형',R:'램프·단면',V:'차량',S:'구조',P:'보행·코어',L:'법규·종류'};
  const TOL_LEN_MM=1;
  const SCOPE_NOTE='계약 범위 한정이며 인허가 적합을 뜻하지 않음';
  const EXCLUDED='방화·피난 전체, 구조계산, 환기·설비 용량, 전기차 세부의무, 개별 인허가 조건';
  const APP_11='제11조제1항 준용';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const has=x=>x!==undefined&&x!==null;
  const nonEmpty=s=>typeof s==='string'&&s.trim().length>0;
  const uniq=a=>[...new Set(a)];
  const DATE_RE=/^(\d{4})-(\d{2})-(\d{2})$/;
  const validDate=s=>{const m=DATE_RE.exec(s);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3];};

  // ---- 항목 틀 ----
  const MSG={MISSING_INPUT:'필요한 입력이 없어 확인할 수 없습니다.',BRANCH_DIVERGES:'입력만으로 적용 규칙이 하나로 정해지지 않아 확인할 수 없습니다.',OPEN_BRANCH_SET:'주차칸 종류가 지정되지 않아 비교할 기준을 정할 수 없습니다.',RULE_UNVERIFIED:'필요한 규칙이 규칙 데이터에서 확인되지 않아 판정할 수 없습니다.',RULE_EDITION_ASSUMED:'허가 기준일이 없어 현행 판본을 가정했습니다.',EDITION_NOT_LOADED:'허가 기준일에 유효한 규칙 판본이 규칙 데이터에 없어 판정할 수 없습니다.',NOT_IMPLEMENTED:'이 항목은 이번 단계에서 아직 구현되지 않아 확인할 수 없습니다.',STRUCT_EXCEPTION_UNRESOLVED:'구조 예외 협의가 끝나지 않아 확인할 수 없습니다.',INVALID_INPUT:'입력 값의 형식이 올바르지 않아 판정할 수 없습니다.',MEETS_RULE:'적용 기준을 충족합니다.',VIOLATES_RULE:'적용 기준을 충족하지 못합니다.',NOT_APPLICABLE:'이 규칙이 적용되지 않는 항목입니다.'};
  const makeItem=(id,domain,verdict,reason,extra={})=>{const na=reason==='NOT_APPLICABLE',v=na?null:(verdict||'UNDETERMINED'),rs=reason||(v==='PASS'?'MEETS_RULE':v==='FAIL'?'VIOLATES_RULE':v==='INPUT_ERROR'?'INVALID_INPUT':'MISSING_INPUT');return{id,domain,subjectId:has(extra.subjectId)?extra.subjectId:null,applicability:na?'NOT_APPLICABLE':'APPLICABLE',verdict:v,reason:rs,message:extra.message||MSG[rs]||MSG.MISSING_INPUT,missingInputs:extra.missingInputs||[],evidence:extra.evidence||{},...(extra.ruleRef?{ruleRef:extra.ruleRef}:{}),...(extra.editionAssumed!==undefined?{editionAssumed:extra.editionAssumed}:{})};};
  const item=(id,verdict,reason,extra)=>makeItem(id,DOMAIN_OF.get(id),verdict,reason,extra);
  const fromSpec=(id,cm,s,ev={})=>item(id,s.verdict,s.reason,{...cm,missingInputs:s.missingInputs||[],message:s.message,evidence:{...ev,...(s.evidence||{})}});
  const ie=(id,cm,lists)=>{const fields=uniq([].concat(...lists));return item(id,'INPUT_ERROR','INVALID_INPUT',{...cm,evidence:{fields},message:`입력 값의 형식이 올바르지 않아 판정할 수 없습니다(${fields.join(', ')}).`});};

  // ---- 집계 ----
  function aggregate(items){
    const list=Array.isArray(items)?items.filter(isObj):[];
    const dom=x=>x.domain||DOMAIN_OF.get(x.id)||'?',key=x=>`${x.id}|${has(x.subjectId)?x.subjectId:''}`;
    const cnt=new Map();for(const x of list)cnt.set(key(x),(cnt.get(key(x))||0)+1);
    const blank=()=>({pass:0,fail:0,undetermined:0,inputError:0,notApplicable:0,complete:false,domainPassed:false,notApplicableDomain:false});
    const domains={};for(const d of Object.keys(IDS))domains[d]=blank();
    const present=new Set(list.map(x=>x.id)),missingItemIds=ALL.filter(x=>!present.has(x.id)).map(x=>x.id);
    const duplicateItemKeys=[...cnt].filter(([,n])=>n>1).map(([k])=>k),seen=new Set();
    for(const x of list){const k=key(x),s=domains[dom(x)]||(domains[dom(x)]=blank());
      if(cnt.get(k)>1){if(!seen.has(k)){seen.add(k);s.inputError++;}continue;}
      if(x.applicability==='NOT_APPLICABLE')s.notApplicable++;else if(x.verdict==='PASS')s.pass++;else if(x.verdict==='FAIL')s.fail++;else if(x.verdict==='INPUT_ERROR')s.inputError++;else s.undetermined++;}
    for(const id of missingItemIds)domains[DOMAIN_OF.get(id)].undetermined++;
    for(const [d,s] of Object.entries(domains)){const miss=false;s.complete=!miss&&s.fail===0&&s.undetermined===0&&s.inputError===0;s.domainPassed=s.complete&&s.pass>0;s.notApplicableDomain=s.complete&&s.pass===0&&s.notApplicable>0;}
    return{list,domains,missingItemIds,duplicateItemKeys};
  }
  const summarize=items=>aggregate(items).domains;
  function computeOverall(items,opt){
    opt=isObj(opt)?opt:{};
    const a=aggregate(items),s=a.domains,sum=k=>Object.values(s).reduce((n,x)=>n+x[k],0);
    const counts={fail:sum('fail'),inputError:sum('inputError'),undetermined:sum('undetermined')};
    const editionAssumed=!!opt.editionAssumed||a.list.some(x=>x.editionAssumed===true);
    const mode=opt.mode==='numeric-test'?'numeric-test':'candidate';
    const undetermined=counts.undetermined>0||a.missingItemIds.length>0;
    const assumptions=uniq([...(editionAssumed?['허가 기준일이 없어 현행 판본을 가정함']:[]),...a.list.map(x=>x.evidence&&x.evidence.assumption).filter(nonEmpty)]);
    const notImpl=uniq(a.list.filter(x=>x.reason==='NOT_IMPLEMENTED').map(x=>x.id)).concat(a.missingItemIds);
    const limitations=[...(notImpl.length?[`구현되지 않은 항목: ${uniq(notImpl).join(', ')}`]:[]),...(mode==='numeric-test'?['주차칸 치수는 선언된 시험 값의 비교이며 도형으로 측정하지 않음']:[]),`이 판정에 포함되지 않는 것: ${EXCLUDED}`];
    let grade=null,head;
    if(counts.fail||counts.inputError)head=counts.inputError?`입력 수정 필요(${counts.inputError}건)`:`부적합 항목 ${counts.fail}건`;
    else if(!undetermined&&!editionAssumed)grade='검토 완료';
    else if(s.G.domainPassed){const other=Object.entries(s).some(([d,x])=>d!=='G'&&x.domainPassed);if(other&&(undetermined||editionAssumed))grade='부분 검토';else if(!other&&undetermined)grade='기하 초안';}
    if(mode==='numeric-test'){grade=null;head=head||'수치 비교 시험 모드';}
    head=head||grade||'검토 범위 미충족';
    const unverified=Object.entries(s).filter(([,x])=>!x.complete).map(([d])=>DOMAIN_NAME[d]);
    // 기하 영역의 실제 검사 범위(4-1 v1.1.3): 예 'G01–G07 검사, G08–G10 미검증'
    const G=IDS.G,runs=ids=>{const ix=ids.map(id=>G.indexOf(id)),out=[];for(let k=0;k<ix.length;k++){let j=k;while(j+1<ix.length&&ix[j+1]===ix[j]+1)j++;out.push(j>k?`${G[ix[k]]}–${G[ix[j]]}`:G[ix[k]]);k=j;}return out.join(', ');};
    const gDone=G.filter(id=>a.list.some(x=>x.id===id&&x.reason!=='NOT_IMPLEMENTED')),gOpen=G.filter(id=>!gDone.includes(id));
    const gNote=gDone.length&&gOpen.length?`. 기하 일부 검토 — ${runs(gDone)} 검사, ${runs(gOpen)} 미검증`:'';
    return{grade,scopeLabel:`${head} — ${SCOPE_NOTE}. 미검증 범위: ${unverified.length?unverified.join(', '):'없음'}${gNote}`,counts,notes:{missingItemIds:a.missingItemIds,duplicateItemKeys:a.duplicateItemKeys,assumptions,limitations},editionAssumed,mode};
  }

  // ---- 입력 읽기: 사용하는 경로만 명시적으로 검사한다. 값은 고치지 않는다 ----
  const flag=(ctx,grps,path)=>{for(const g of grps)g.push(path);ctx.bad.push(path);};
  const rd=(ctx,grps,obj,key,path,kind)=>{const v=obj[key];if(!has(v))return{s:'missing',path};
    const ok=Array.isArray(kind)?kind.includes(v):kind==='dim'?finite(v)&&v>=0:kind==='pos'?finite(v)&&v>0:kind==='level'?finite(v):kind==='int'?Number.isSafeInteger(v)&&v>=0:kind==='str'?nonEmpty(v):kind==='bool'?typeof v==='boolean':false;
    if(!ok){flag(ctx,grps,path);return{s:'bad',path};}return{s:'ok',v,path};};
  const sub=(ctx,grps,obj,key,path)=>{const v=obj[key];if(!has(v))return null;if(isObj(v))return v;flag(ctx,grps,path);return null;};
  const gen=p=>p.replace(/^ramps\[\d+\]/,'ramp').replace(/^fixed\.entrances\[\d+\]/,'entrance');
  const idCounts=(arr,pick)=>{const c=new Map();for(const x of arr)if(isObj(x)&&nonEmpty(pick(x)))c.set(pick(x),(c.get(pick(x))||0)+1);return c;};

  function parseProject(ctx){const E=ctx.errs,p=sub(ctx,[E.permit,E.kind],ctx.input,'project','project')||{};
    ctx.proj={permit:rd(ctx,[E.permit],p,'permitDate','project.permitDate','str'),kind:rd(ctx,[E.kind],p,'parkingKind','project.parkingKind',['noeoe','buseol','unknown']),use:rd(ctx,[E.use],p,'facilityUse','project.facilityUse','str'),def:rd(ctx,[E.def],p,'stallDefaultType','project.stallDefaultType','str')};
    if(ctx.proj.permit.s==='ok'&&!validDate(ctx.proj.permit.v)){flag(ctx,[E.permit],'project.permitDate');ctx.proj.permit={s:'bad',path:'project.permitDate'};}
    ctx.ed=ctx.proj.permit.s==='missing';
    const f=sub(ctx,[E.fh],ctx.input,'floor','floor')||{};
    ctx.floor={h:rd(ctx,[E.fh],f,'heightMm','floor.heightMm','dim')};rd(ctx,[],f,'levelMm','floor.levelMm','level');
    parseLots(ctx,p);parseSystems(ctx,p);}
  function parseLots(ctx,p){const E=ctx.errs,raw=p.parkingLots;ctx.lots=null;if(!has(raw))return;
    if(!Array.isArray(raw)){flag(ctx,[E.lotsS],'project.parkingLots');return;}
    if(!raw.length)return;
    const cnt=idCounts(raw,l=>l.id);ctx.lots=new Map();
    raw.forEach((l,i)=>{const path=`project.parkingLots[${i}]`;if(!isObj(l)){flag(ctx,[E.lotsS],path);return;}
      const id=rd(ctx,[E.lotsS],l,'id',path+'.id','str');if(id.s==='missing')flag(ctx,[E.lotsS],path+'.id');else if(id.s==='ok'&&cnt.get(id.v)>1)flag(ctx,[E.lotsS],path+'.id');
      const total=rd(ctx,[],l,'totalStalls',path+'.totalStalls','int');if(id.s==='ok'&&cnt.get(id.v)===1)ctx.lots.set(id.v,{total});});}
  function parseSystems(ctx,p){const E=ctx.errs,raw=p.rampSystems;ctx.systems=null;if(!has(raw))return;
    if(!Array.isArray(raw)){flag(ctx,[E.sysS],'project.rampSystems');return;}
    if(!raw.length)return;
    const cnt=idCounts(raw,s=>s.id);ctx.systems=new Map();
    raw.forEach((s,i)=>{const path=`project.rampSystems[${i}]`;if(!isObj(s)){flag(ctx,[E.sysS],path);return;}
      const id=rd(ctx,[E.sysS],s,'id',path+'.id','str');if(id.s==='missing')flag(ctx,[E.sysS],path+'.id');else if(id.s==='ok'&&cnt.get(id.v)>1)flag(ctx,[E.sysS],path+'.id');
      const err=[];let lotIds=null;
      if(has(s.lotIds)){if(!Array.isArray(s.lotIds)||!s.lotIds.length)flag(ctx,[err],path+'.lotIds');
        else{lotIds=s.lotIds;if(s.lotIds.some(x=>!nonEmpty(x))||new Set(s.lotIds).size!==s.lotIds.length)flag(ctx,[err],path+'.lotIds');}}
      if(id.s==='ok'&&cnt.get(id.v)===1)ctx.systems.set(id.v,{lotIds,err});});}
  // 램프 체계 전체 주차대수: 입력에 적힌 값만 합산. 하나라도 비면 미상, 형식 오류면 error
  function sysInfo(ctx,sid,label){const E=ctx.errs;
    if(E.lotsS.length||E.sysS.length)return{state:'error',fields:[...E.lotsS,...E.sysS]};
    const s=has(sid)&&ctx.systems?ctx.systems.get(sid):null;
    if(s&&s.err.length)return{state:'error',fields:s.err};
    const lots=[];let miss=[];
    if(s&&s.lotIds)for(const lid of s.lotIds){const l=ctx.lots&&ctx.lots.get(lid);if(l&&l.total.s==='bad')return{state:'error',fields:[l.total.path]};lots.push({id:lid,l});}
    const T='project.parkingLots[].totalStalls';
    if(!s)miss.push(label);else if(!s.lotIds)miss.push(T);
    if(!ctx.lots)miss.push(T);
    else for(const {l} of lots)if(!l||l.total.s==='missing')miss.push(T);
    if(miss.length)return{state:'missing',missing:uniq(miss)};
    const total=lots.reduce((n,{l})=>n+l.total.v,0);
    if(!Number.isSafeInteger(total)){ctx.bad.push('project.parkingLots');return{state:'error',fields:['project.parkingLots']};}
    return{state:'ok',total,lots:lots.map(({id,l})=>({id,total:l.total.v}))};}

  // ---- 규칙 사용 공통 관문(7-5) ----
  const RID={w:{straight:{1:'kr.rule6.p1.5.ramp-straight-one-lane-width',2:'kr.rule6.p1.5.ramp-straight-two-lane-width'},curve:{1:'kr.rule6.p1.5.ramp-curve-one-lane-width',2:'kr.rule6.p1.5.ramp-curve-two-lane-width'}},
    thr:'kr.rule6.p1.5.large-ramp-threshold',large:'kr.rule6.p1.5.large-ramp-two-lane-width',
    slope:{straight:'kr.rule6.p1.5.ramp-straight-slope',curve:'kr.rule6.p1.5.ramp-curve-slope'},
    rad:'kr.rule6.p1.5.curve-inner-radius',radSmall:'kr.rule6.p1.5.small-curve-inner-radius',
    offset:'kr.rule6.p1.5.curb-wall-offset',
    tr:{convex:'kr.rule6.p1.5.transition-convex-50',concave:'kr.rule6.p1.5.transition-concave-100',thr:'kr.rule6.p1.5.transition-concave-threshold',straight:'kr.rule6.p1.5.transition-break-straight',curve:'kr.rule6.p1.5.transition-break-curve',ratio:'kr.rule6.p1.5.transition-max-slope-ratio'},
    hMin:'kr.rule6.p1.5.curb-min-height',
    hMax:'kr.rule6.p1.5.curb-max-height',
    ent:'kr.rule6.p1.4.entrance-width',entLarge:'kr.rule6.p1.4.large-entrance-width',
    stall:t=>'kr.rule3.p1.2.'+t,parallel:t=>'kr.rule3.p1.1.'+t,p11:'kr.rule11.p1.attached-application'};
  const Q=(id,name,unit,cmp)=>({id,kind:'q',name,unit,cmp});
  const SPEC={thr:Q(RID.thr,'minStalls','stall','>='),thrValue:Q(RID.thr,'minStalls','stall',null),large:Q(RID.large,'minWidthMm','mm','>='),
    slope:{straight:Q(RID.slope.straight,'maxSlopePct','%','<='),curve:Q(RID.slope.curve,'maxSlopePct','%','<=')},
    rad:Q(RID.rad,'minRadiusMm','mm','>='),radSmall:Q(RID.radSmall,'minRadiusMm','mm','>='),
    offset:Q(RID.offset,'minOffsetMm','mm','>='),hMin:Q(RID.hMin,'minHeightMm','mm','>='),hMax:Q(RID.hMax,'maxHeightMm','mm','<='),
    ent:Q(RID.ent,'minWidthMm','mm','>='),entLarge:Q(RID.entLarge,'minWidthMm','mm','>='),
    p11:{id:RID.p11,kind:'status'},
    tr:{convex:Q(RID.tr.convex,'minLengthMm','mm','>='),concave:Q(RID.tr.concave,'minLengthMm','mm','>='),thr:Q(RID.tr.thr,'minStalls','stall','>='),straight:Q(RID.tr.straight,'minChangePct','%','>='),curve:Q(RID.tr.curve,'minChangePct','%','>='),ratio:Q(RID.tr.ratio,'maxRatioPct','%','<=')}};
  const wSpec=(t,l)=>Q(RID.w[t][l],'minWidthMm','mm','>=');
  const records=(ctx,id)=>isObj(ctx.ruleSet)&&Array.isArray(ctx.ruleSet.rules)?ctx.ruleSet.rules.filter(x=>isObj(x)&&x.ruleId===id):[];
  const rawVal=(ctx,id)=>{const r=records(ctx,id);return r.length===1&&isObj(r[0].quantity)&&finite(r[0].quantity.value)?r[0].quantity.value:null;};
  const qv=(ctx,id)=>records(ctx,id)[0].quantity.value;
  const refOf=(ctx,id)=>{const r=records(ctx,id)[0],e=isObj(r.edition)?r.edition:{};return{ruleId:id,edition:e.name,textValidFrom:e.textValidFrom,citation:r.citation,namespace:r.namespace||'law'};};
  const refsOf=(ctx,ids)=>uniq(ids).map(id=>refOf(ctx,id));
  function editionBlocked(ctx,r){const d=ctx.proj.permit;if(d.s!=='ok')return false;const e=isObj(r.edition)?r.edition:{},from=e.textValidFrom;
    if(typeof from!=='string'||!DATE_RE.test(from))return true;if(d.v<from)return true;if(has(e.effectiveTo)&&d.v>e.effectiveTo)return true;return false;}
  function stateProblem(spec,r){
    if(spec.kind!=='val'){if(r.status!=='verified'||!isObj(r.source)||r.source.secondCheck!=='done')return'unverified';if(r.namespace!=='law')return'namespace';}
    if(spec.kind==='status')return null;
    const q=r.quantity;if(!isObj(q))return'damaged';
    if(spec.kind==='dims')return finite(q.widthMm)&&q.widthMm>0&&finite(q.depthMm)&&q.depthMm>0&&(q.unit===undefined||q.unit==='mm')?null:'damaged';
    if(q.name!==spec.name||!finite(q.value)||q.value<=0||q.unit!==spec.unit)return'damaged';
    if(spec.cmp&&has(r.comparator)&&r.comparator!==spec.cmp)return'damaged';
    return null;}
  // 반환: null(통과) 또는 {reason,evidence}. 순서: 판본 → 상태·손상. light는 존재·판본만 본다(R03 직선 해당 없음)
  function gate(ctx,specs,opt={}){
    const set=ctx.ruleSet;if(!(isObj(set)&&Array.isArray(set.rules)))return{reason:'RULE_UNVERIFIED',evidence:{ruleProblems:['ruleSet']}};
    const list=[...new Map(specs.map(s=>[s.id,s])).values()],problems=[],ok=[];
    for(const s of list){const f=records(ctx,s.id);if(f.length!==1)problems.push({ruleId:s.id,problem:f.length?'duplicate':'missing'});else ok.push([s,f[0]]);}
    const eds=ok.filter(([,r])=>editionBlocked(ctx,r)).map(([s,r])=>({ruleId:s.id,problem:'edition-not-loaded',permitDate:ctx.proj.permit.v,textValidFrom:isObj(r.edition)?r.edition.textValidFrom:undefined,effectiveTo:isObj(r.edition)?r.edition.effectiveTo:undefined}));
    if(eds.length)return{reason:'EDITION_NOT_LOADED',evidence:{ruleProblems:eds}};
    if(!opt.light)for(const [s,r] of ok){const p=stateProblem(s,r);if(p)problems.push({ruleId:s.id,problem:p});}
    if(problems.length)return{reason:'RULE_UNVERIFIED',evidence:{ruleProblems:problems}};
    return null;}
  const gateBlock=(id,cm,g)=>item(id,'UNDETERMINED',g.reason,{...cm,missingInputs:[],evidence:g.evidence});

  // 제11조(부설) 단계: 적용 범위 단계에서 판단. null이면 제6조 기준으로 계속.
  // 제11조제5항(8대 이하)은 지평식 한정이라 지하주차에는 적용하지 않는다(v1.1.4)
  function scope(ctx){const k=ctx.proj.kind;
    if(k.s!=='ok'||k.v==='unknown')return{verdict:'UNDETERMINED',reason:'MISSING_INPUT',missingInputs:['project.parkingKind'],message:'부설·노외 구분이 없어 적용 기준을 정할 수 없습니다.'};
    if(k.v==='noeoe')return null;
    const g=gate(ctx,[SPEC.p11]);if(g)return{verdict:'UNDETERMINED',...g};
    const app='제11조 적용 확인 필요';
    if(ctx.errs.use.length)return{verdict:'INPUT_ERROR',reason:'INVALID_INPUT',evidence:{fields:[...ctx.errs.use]}};
    if(ctx.proj.use.s==='missing')return{verdict:'UNDETERMINED',reason:'MISSING_INPUT',missingInputs:['project.facilityUse'],message:'시설 용도가 없어 부설주차장 준용 여부를 정할 수 없습니다.',evidence:{application:app}};
    if(['단독주택','다세대주택'].includes(ctx.proj.use.v))return{verdict:'UNDETERMINED',reason:'BRANCH_DIVERGES',missingInputs:['지자체 준용 제외 인정 여부'],message:'단독·다세대주택은 지자체 인정 여부에 따라 제6조 준용 여부가 갈려 확인할 수 없습니다.',evidence:{application:app}};
    return null;}
  const appEv=ctx=>ctx.proj.kind.s==='ok'&&ctx.proj.kind.v==='buseol'?{application:APP_11}:{};

  // ---- 램프 입력 해석 ----
  function parseRamp(ctx,r,i,idCnt){
    const path=`ramps[${i}]`,e={id:[],type:[],sys:[],r01:[],r02:[],r03:[],r09:[]},m={i,path,e};
    const id=rd(ctx,[e.id],r,'id',path+'.id','str');if(id.s==='missing')flag(ctx,[e.id],path+'.id');else if(id.s==='ok'&&idCnt.get(id.v)>1)flag(ctx,[e.id],path+'.id');
    m.subject=id.s==='ok'&&idCnt.get(id.v)===1?id.v:path;
    const shape=sub(ctx,[e.type],r,'shape',path+'.shape')||{};
    m.type=rd(ctx,[e.type],shape,'type',path+'.shape.type',['straight','curve']);
    m.len=rd(ctx,[e.r02],shape,'lengthMm',path+'.shape.lengthMm','pos');
    m.rad=rd(ctx,[e.r03],shape,'innerRadiusMm',path+'.shape.innerRadiusMm','dim');
    m.lanes=rd(ctx,[e.r01],r,'lanes',path+'.lanes',[1,2]);
    m.op=rd(ctx,[e.r01],r,'operation',path+'.operation',['oneWay','twoWay']);
    m.sep=rd(ctx,[e.r01],r,'separatedInOut',path+'.separatedInOut','bool');
    if(m.lanes.s==='ok'&&m.lanes.v===1&&m.op.s==='ok'&&m.op.v==='twoWay')flag(ctx,[e.r01],path+'.lanes');
    m.sys=rd(ctx,[e.sys],r,'systemId',path+'.systemId','str');
    const sec=sub(ctx,[e.r01,e.r09],r,'section',path+'.section')||{};
    m.legal=rd(ctx,[e.r01],sec,'legalLaneWidthMm',path+'.section.legalLaneWidthMm','dim');
    m.wtw=rd(ctx,[e.r01],sec,'wallToWallMm',path+'.section.wallToWallMm','dim');
    const wtc=sub(ctx,[e.r01,e.r09],sec,'wallToCurbMm',path+'.section.wallToCurbMm')||{};
    m.wtcL=rd(ctx,[e.r01,e.r09],wtc,'left',path+'.section.wallToCurbMm.left','dim');
    m.wtcR=rd(ctx,[e.r01,e.r09],wtc,'right',path+'.section.wallToCurbMm.right','dim');
    const cu=sub(ctx,[e.r09],sec,'curb',path+'.section.curb')||{};
    const cl=sub(ctx,[e.r09],cu,'left',path+'.section.curb.left')||{},cr=sub(ctx,[e.r09],cu,'right',path+'.section.curb.right')||{};
    m.cuL=rd(ctx,[e.r09],cl,'heightMm',path+'.section.curb.left.heightMm','dim');
    m.cuR=rd(ctx,[e.r09],cr,'heightMm',path+'.section.curb.right.heightMm','dim');
    // 구간
    m.segs=null;const sg=r.segments;
    if(has(sg)){if(!Array.isArray(sg))flag(ctx,[e.r02],path+'.segments');else if(sg.length){const sc=idCounts(sg,s=>s.id);
      m.segs=sg.map((s,k)=>{const p=`${path}.segments[${k}]`;if(!isObj(s)){flag(ctx,[e.r02],p);return{bad:true,k,path:p};}
        const sid=rd(ctx,[e.r02],s,'id',p+'.id','str');if(sid.s==='ok'&&sc.get(sid.v)>1)flag(ctx,[e.r02],p+'.id');
        return{k,path:p,sub:sid.s==='ok'&&sc.get(sid.v)===1?sid.v:k,kind:rd(ctx,[e.r02],s,'kind',p+'.kind',['straight','curve','transition']),len:rd(ctx,[e.r02],s,'lengthMm',p+'.lengthMm','pos'),st:rd(ctx,[e.r02],s,'startLevelMm',p+'.startLevelMm','level'),en:rd(ctx,[e.r02],s,'endLevelMm',p+'.endLevelMm','level')};});}}
    const cn=sub(ctx,[e.r02],r,'connects',path+'.connects')||{};
    m.cn={present:has(r.connects),up:rd(ctx,[e.r02],cn,'upperLevelMm',path+'.connects.upperLevelMm','level'),lo:rd(ctx,[e.r02],cn,'lowerLevelMm',path+'.connects.lowerLevelMm','level')};
    m.cn.ok=m.cn.up.s==='ok'&&m.cn.lo.s==='ok';
    if(m.segs&&!m.segs.some(s=>s.bad)){const S=m.segs;
      for(let k=1;k<S.length;k++)if(S[k-1].en.s==='ok'&&S[k].st.s==='ok'&&S[k-1].en.v!==S[k].st.v)flag(ctx,[e.r02],S[k].path+'.startLevelMm');
      if(m.cn.ok&&S[0].st.s==='ok'&&S[S.length-1].en.s==='ok'){const a=S[0].st.v,b=S[S.length-1].en.v,u=m.cn.up.v,l=m.cn.lo.v;if(!((a===u&&b===l)||(a===l&&b===u)))flag(ctx,[e.r02],path+'.connects');}
      if(m.len.s==='ok'&&S.every(s=>s.len.s==='ok')&&Math.abs(S.reduce((n,s)=>n+s.len.v,0)-m.len.v)>TOL_LEN_MM)flag(ctx,[e.r02],path+'.shape.lengthMm');
      // 형상 모순: 직선 선언인데 곡선 구간, 곡선 선언인데 곡선 구간이 하나도 없음(kind 누락 구간이 있으면 모순 아님)
      if(m.type.s==='ok'){const kinds=S.map(s=>s.kind.s==='ok'?s.kind.v:s.kind.s);
        if(m.type.v==='straight'&&kinds.includes('curve'))flag(ctx,[e.type],path+'.segments');
        if(m.type.v==='curve'&&!kinds.includes('curve')&&!kinds.includes('missing'))flag(ctx,[e.type],path+'.segments');}}
    return m;}

  // ---- R01 법령상 차로 너비 ----
  function evalR01(ctx,m){const cm={subjectId:m.subject,editionAssumed:ctx.ed};
    const errs=[m.e.id,m.e.type,m.e.r01,m.e.sys,ctx.errs.permit,ctx.errs.kind].flat();if(errs.length)return ie('R01',cm,[errs]);
    const tot=sysInfo(ctx,m.sys.v,'ramp.systemId');if(tot.state==='error')return ie('R01',cm,[tot.fields]);
    const types=m.type.s==='ok'?[m.type.v]:['straight','curve'];
    const lanes=m.lanes.s==='ok'?[m.lanes.v]:(m.op.s==='ok'&&m.op.v==='twoWay'?[2]:[1,2]);
    const seps=m.sep.s==='ok'?[m.sep.v]:[true,false];
    const thr=rawVal(ctx,RID.thr),bands=tot.state==='ok'&&thr!==null?[tot.total>=thr?'large':'small']:['small','large'];
    const specs=[SPEC.thr];for(const t of types)for(const l of lanes)specs.push(wSpec(t,l));
    if(bands.includes('large')&&seps.includes(false))specs.push(SPEC.large);
    const g=gate(ctx,specs);if(g)return gateBlock('R01',cm,g);
    const sc=scope(ctx);if(sc)return fromSpec('R01',cm,sc,{rampSystemTotalStalls:tot.state==='ok'?tot.total:null});
    let w=null,ub=null,source=null,miss=[];
    if(m.legal.s==='ok'){w=m.legal.v;source='legalLaneWidthMm';}
    else if(m.wtw.s==='ok'&&m.wtcL.s==='ok'&&m.wtcR.s==='ok'){w=m.wtw.v-m.wtcL.v-m.wtcR.v;source='derived';}
    else if(m.wtw.s==='ok'){ub=m.wtw.v;source='wallToWallMm';miss=['ramp.section.wallToCurbMm'];}
    else miss=['ramp.section.legalLaneWidthMm'];
    const total=tot.state==='ok'?tot.total:null,br=[];
    for(const t of types)for(const l of lanes)for(const s of seps)for(const b of bands){
      const basicId=RID.w[t][l],basic=qv(ctx,basicId),strong=b==='large'&&!s,largeNeed=strong?qv(ctx,RID.large):0,need=Math.max(basic,largeNeed),laneBad=strong&&l!==2;
      const res=laneBad?'FAIL':w!==null?(w>=need?'PASS':'FAIL'):ub!==null&&ub<need?'FAIL':'MISSING';
      br.push({shapeType:t,lanes:l,separatedInOut:s,band:b,totalStalls:total,result:res,requiredMm:need,laneCountViolation:laneBad,ruleIds:strong?[basicId,RID.large]:[basicId],decisiveRuleId:strong&&largeNeed>=basic?RID.large:basicId});}
    const rs=new Set(br.map(x=>x.result));
    const ev={...appEv(ctx),rampSystemTotalStalls:total,thresholdStalls:thr,atOrAboveThreshold:total===null?null:total>=thr,measuredMm:w!==null?w:ub,source,branches:br,ruleRefs:refsOf(ctx,br.flatMap(x=>x.ruleIds).concat(RID.thr))};
    if(rs.size===1&&rs.has('PASS')||rs.size===1&&rs.has('FAIL')){const pass=rs.has('PASS'),b=br[0];
      const msg=pass?`법령상 차로 너비 ${w}mm가 기준 ${b.requiredMm}mm 이상입니다.`:b.laneCountViolation?`주차대수 ${thr}대 이상 경사로는 너비 ${qv(ctx,RID.large)}mm 이상인 2차로이거나 진입·진출 차로를 분리해야 하는데 1차로이고 분리되지 않았습니다.`:`${w!==null?'법령상 차로 너비':'벽 사이 전체 너비'} ${w!==null?w:ub}mm가 기준 ${b.requiredMm}mm에 미달합니다.`;
      return item('R01',pass?'PASS':'FAIL',null,{...cm,message:msg,evidence:{...ev,requiredMm:b.requiredMm,ruleId:b.decisiveRuleId},ruleRef:refOf(ctx,b.decisiveRuleId)});}
    if(rs.has('PASS')&&rs.has('FAIL')){const mi=uniq([...(tot.state==='missing'?tot.missing:[]),...(m.lanes.s!=='ok'?['ramp.lanes']:[]),...(m.sep.s!=='ok'?['ramp.separatedInOut']:[]),...(m.type.s!=='ok'?['ramp.shape.type']:[])]);
      return item('R01','UNDETERMINED','BRANCH_DIVERGES',{...cm,missingInputs:mi,message:'대수·차로 수·분리 여부에 따라 통과와 실패가 갈려 입력이 더 필요합니다.',evidence:ev});}
    return item('R01','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:miss,message:'법령상 차로 너비를 확정할 입력이 부족해 확인할 수 없습니다.',evidence:ev});}

  // ---- R02 경사 ----
  const exceeds=(rise,len,max)=>rise*100>max*len;
  function evalR02(ctx,m){const cm={subjectId:m.subject,editionAssumed:ctx.ed};
    const usesFloor=!m.segs&&!m.cn.present;
    const errs=[m.e.id,m.e.type,m.e.r02,m.e.sys,ctx.errs.permit,ctx.errs.kind,usesFloor?ctx.errs.fh:[]].flat();if(errs.length)return ie('R02',cm,[errs]);
    const kinds=new Set();
    if(m.segs)for(const s of m.segs){const k=s.kind.s==='ok'?s.kind.v:null;if(k==='straight'||k==='curve')kinds.add(k);else{kinds.add('straight');kinds.add('curve');}}
    else if(m.type.s==='ok')kinds.add(m.type.v);else{kinds.add('straight');kinds.add('curve');}
    const specs=[...kinds].map(k=>SPEC.slope[k]);
    const g=gate(ctx,specs);if(g)return gateBlock('R02',cm,g);
    const sc=scope(ctx);if(sc)return fromSpec('R02',cm,sc);
    const maxOf={straight:qv(ctx,RID.slope.straight),curve:kinds.has('curve')?qv(ctx,RID.slope.curve):null};
    const refIds=specs.map(s=>s.id);
    if(m.segs){const rs=[];
      for(const s of m.segs){const miss=[['len','lengthMm'],['st','startLevelMm'],['en','endLevelMm']].filter(([k])=>s[k].s!=='ok').map(([,n])=>`ramp.segments[${s.k}].${n}`);
        if(miss.length){rs.push({k:s.k,sub:s.sub,status:'MISSING',miss});continue;}
        const rise=Math.abs(s.en.v-s.st.v),k=s.kind.s==='ok'?s.kind.v:null,pct=rise/s.len.v*100;
        if(k==='straight'||k==='curve'){const max=qv(ctx,RID.slope[k]);rs.push({k:s.k,sub:s.sub,status:exceeds(rise,s.len.v,max)?'FAIL':'PASS',pct,max,ruleId:RID.slope[k]});}
        else{const xs=exceeds(rise,s.len.v,qv(ctx,RID.slope.straight)),xc=exceeds(rise,s.len.v,qv(ctx,RID.slope.curve));rs.push({k:s.k,sub:s.sub,status:xs&&xc?'FAIL':!xs&&!xc?'PASS':'DIVERGE',pct,max:Math.min(qv(ctx,RID.slope.straight),qv(ctx,RID.slope.curve)),ruleId:RID.slope.curve});}}
      const ev={segmentCount:m.segs.length,segments:rs.map(x=>({segmentId:x.sub,status:x.status,slopePct:x.pct})),ruleRefs:refsOf(ctx,refIds),...appEv(ctx)};
      const fail=rs.find(x=>x.status==='FAIL');
      if(fail)return item('R02','FAIL',null,{...cm,message:`구간 ${fail.sub}의 경사 ${fail.pct}%가 상한 ${fail.max}%를 초과합니다.`,evidence:{...ev,failedSegmentId:fail.sub,slopePct:fail.pct,maxSlopePct:fail.max},ruleRef:refOf(ctx,fail.ruleId)});
      if(rs.every(x=>x.status==='PASS'))return item('R02','PASS',null,{...cm,message:`모든 구간(${rs.length}개)의 경사가 상한 이내입니다.`,evidence:ev,ruleRef:refOf(ctx,rs[0].ruleId)});
      const miss=uniq(rs.flatMap(x=>x.miss||[]));
      if(miss.length)return item('R02','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:miss,message:'구간의 길이 또는 시작·끝 고도가 없어 경사를 확인할 수 없습니다.',evidence:ev});
      return item('R02','UNDETERMINED','BRANCH_DIVERGES',{...cm,message:'구간 종류(직선·곡선)가 정해지지 않아 상한이 갈려 확인할 수 없습니다.',evidence:ev});}
    // 구간이 없을 때: 고저차 우선순위는 완전한 connects → (connects가 없을 때만) 층고
    let rise=null,riseSource=null,miss=[];
    if(m.cn.present){if(m.cn.ok){rise=Math.abs(m.cn.up.v-m.cn.lo.v);riseSource='connects';}else miss=[m.cn.up,m.cn.lo].filter(x=>x.s!=='ok').map(x=>gen(x.path));}
    else if(ctx.floor.h.s==='ok'){rise=ctx.floor.h.v;riseSource='floor.heightMm';}else miss=['floor.heightMm'];
    if(m.len.s!=='ok')miss.push('ramp.shape.lengthMm');
    const ev={riseMm:rise,riseSource,lengthMm:m.len.v,ruleRefs:refsOf(ctx,refIds),...appEv(ctx),...(riseSource==='floor.heightMm'?{assumption:'고저차를 층고(floor.heightMm)만큼 오르내린다고 가정함'}:{})};
    if(rise===null||m.len.s!=='ok')return item('R02','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:[...miss,'ramp.segments'],message:'고저차 또는 램프 길이가 없어 경사를 확인할 수 없습니다.',evidence:ev});
    const max=m.type.s==='ok'?maxOf[m.type.v]:Math.max(maxOf.straight,maxOf.curve),ruleId=m.type.s==='ok'?RID.slope[m.type.v]:(maxOf.straight>=maxOf.curve?RID.slope.straight:RID.slope.curve),pct=rise/m.len.v*100;
    if(exceeds(rise,m.len.v,max))return item('R02','FAIL',null,{...cm,message:`평균 경사 ${pct}%가 상한 ${max}%를 초과합니다.`,evidence:{...ev,averageSlopePct:pct,maxSlopePct:max},ruleRef:refOf(ctx,ruleId)});
    return item('R02','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:['ramp.segments'],message:`평균 경사 ${pct}%는 상한 ${max}% 이내이지만 구간별 최대 경사를 알 수 없어 확인할 수 없습니다.`,evidence:{...ev,averageSlopePct:pct,maxSlopePct:max}});}

  // ---- R03 곡선 내변반경 ----
  function evalR03(ctx,m){const cm={subjectId:m.subject,editionAssumed:ctx.ed},straight=m.type.s==='ok'&&m.type.v==='straight';
    const errs=[m.e.id,m.e.type,m.e.sys,ctx.errs.permit,...(straight?[]:[m.e.r03,ctx.errs.kind])].flat();if(errs.length)return ie('R03',cm,[errs]);
    if(straight){const g=gate(ctx,[SPEC.rad],{light:true});if(g)return gateBlock('R03',cm,g);
      return item('R03',null,'NOT_APPLICABLE',{...cm,message:'곡선 부분이 없는 직선 램프라서 곡선 내변반경 기준의 대상이 아닙니다.',evidence:{shapeType:'straight',appliesWhen:'곡선 부분이 있는 램프',ruleRefs:[refOf(ctx,RID.rad)]}});}
    const g=gate(ctx,[SPEC.thrValue,SPEC.rad,SPEC.radSmall]);if(g)return gateBlock('R03',cm,g);
    const sc=scope(ctx);if(sc)return fromSpec('R03',cm,sc);
    if(m.type.s!=='ok')return item('R03','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:['ramp.shape.type'],message:'램프가 직선인지 곡선인지 알 수 없어 곡선 내변반경 기준의 적용 여부를 확인할 수 없습니다.',evidence:{...appEv(ctx)}});
    if(m.rad.s!=='ok')return item('R03','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:['ramp.shape.innerRadiusMm'],message:'곡선 램프의 내변반경 입력이 없어 확인할 수 없습니다.',evidence:{...appEv(ctx)}});
    const rad=m.rad.v,lo=qv(ctx,RID.radSmall),hi=qv(ctx,RID.rad),thr=qv(ctx,RID.thr),ev={...appEv(ctx),innerRadiusMm:rad,thresholdStalls:thr,ruleRefs:refsOf(ctx,[RID.rad,RID.radSmall,RID.thr])};
    if(rad<lo)return item('R03','FAIL',null,{...cm,message:`내변반경 ${rad}mm가 모든 경우의 최소 기준 ${lo}mm에 미달합니다.`,evidence:{...ev,requiredMm:lo},ruleRef:refOf(ctx,RID.radSmall)});
    if(rad>=hi)return item('R03','PASS',null,{...cm,message:`내변반경 ${rad}mm가 기준 ${hi}mm 이상입니다.`,evidence:{...ev,requiredMm:hi},ruleRef:refOf(ctx,RID.rad)});
    const tot=sysInfo(ctx,m.sys.v,'ramp.systemId');
    if(tot.state==='error')return ie('R03',cm,[tot.fields]);
    if(tot.state==='missing')return item('R03','UNDETERMINED','BRANCH_DIVERGES',{...cm,missingInputs:tot.missing,message:`내변반경 ${rad}mm는 주차대수 규모에 따라 통과와 실패가 갈리는데 대수를 알 수 없어 확인할 수 없습니다.`,evidence:{...ev,rampSystemTotalStalls:null}});
    const small=tot.total<=thr,rid=small?RID.radSmall:RID.rad,need=small?lo:hi;
    return item('R03',rad>=need?'PASS':'FAIL',null,{...cm,message:rad>=need?`내변반경 ${rad}mm가 기준 ${need}mm 이상입니다.`:`내변반경 ${rad}mm가 기준 ${need}mm에 미달합니다.`,evidence:{...ev,rampSystemTotalStalls:tot.total,atOrBelowThreshold:small,requiredMm:need},ruleRef:refOf(ctx,rid)});}

  // ---- R04 완화구간 ----
  function evalR04(ctx,m){const cm={subjectId:m.subject,editionAssumed:ctx.ed};
    const tot=sysInfo(ctx,m.sys.v,'ramp.systemId');
    const errs=[m.e.id,m.e.sys,ctx.errs.permit,ctx.errs.kind,tot.state==='error'?tot.fields:[]].flat();if(errs.length)return ie('R04',cm,[errs]);
    const g=gate(ctx,[SPEC.thr]);if(g)return gateBlock('R04',cm,g);
    const thr=qv(ctx,RID.thr),ev={...appEv(ctx),thresholdStalls:thr,rampSystemTotalStalls:tot.state==='ok'?tot.total:null,ruleRefs:[refOf(ctx,RID.thr)]};
    if(tot.state==='ok'&&tot.total<thr)return item('R04',null,'NOT_APPLICABLE',{...cm,message:`램프 체계 전체 주차대수 ${tot.total}대가 기준 ${thr}대 미만이라 완화구간 기준의 대상이 아닙니다.`,evidence:ev});
    const sc=scope(ctx);if(sc)return fromSpec('R04',cm,sc,ev);
    if(tot.state==='missing')return item('R04','UNDETERMINED','BRANCH_DIVERGES',{...cm,missingInputs:tot.missing,message:'주차대수에 따라 완화구간 기준의 적용 여부가 갈리는데 대수를 알 수 없어 확인할 수 없습니다.',evidence:ev});
    if(!m.segs)return item('R04','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:['ramp.segments'],message:'완화구간을 확인할 램프 구간 입력이 없어 확인할 수 없습니다.',evidence:ev});
    if(m.e.r02.length)return ie('R04',cm,[m.e.r02]);
    // 완화구간 계약 v0.1: 오르막 방향으로 완화구간이 아닌 이웃 요소(구간·층 바닥 0%) 사이의 경사 변화가 기준 이상이면 그 사이 완화구간을 본다
    const T=SPEC.tr,g2=gate(ctx,[T.thr,T.convex,T.straight,T.curve,T.ratio]);if(g2)return gateBlock('R04',cm,g2);
    const big=tot.total>=qv(ctx,RID.tr.thr);if(big){const g3=gate(ctx,[T.concave]);if(g3)return gateBlock('R04',cm,g3);}
    const miss=m.segs.flatMap(s=>[['kind','kind'],['len','lengthMm'],['st','startLevelMm'],['en','endLevelMm']].filter(([k])=>s[k].s!=='ok').map(([,n])=>`ramp.segments[${s.k}].${n}`));
    if(miss.length)return item('R04','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:miss,message:'구간의 종류·길이·고도가 없어 완화구간을 확인할 수 없습니다.',evidence:ev});
    // 정확한 비교: 길이·고도는 0.001mm 단위, 규칙 수치는 1e-6 단위 정수(BigInt)로 교차곱
    const N=v=>BigInt(Math.round(v*1000)),Q6=v=>BigInt(Math.round(v*1e6)),abs=x=>x<0n?-x:x,mm=x=>Number(x)/1000;
    let S=m.segs.map(s=>({id:s.sub,kind:s.kind.v,len:N(s.len.v),a:N(s.st.v),b:N(s.en.v)}));
    if(S[0].a>S[S.length-1].b)S=S.reverse().map(s=>({...s,a:s.b,b:s.a}));
    const fl=id=>({id,kind:'floor',len:1n,r:0n}),E=[fl('lowerFloor'),...S.map(s=>({...s,r:s.b-s.a})),fl('upperFloor')];
    const mx=E.filter(x=>x.kind!=='transition'&&x.kind!=='floor').reduce((p,x)=>abs(x.r)*p.len>p.r*x.len?{r:abs(x.r),len:x.len}:p,{r:0n,len:1n});
    const ratio=qv(ctx,RID.tr.ratio),R6=Q6(ratio),pct=x=>Number(x.r)/Number(x.len)*100,breaks=[];
    // 완화구간이라 표시됐어도 경사가 최대의 ½을 넘으면 정의상 완화구간이 아니다(자리와 상관없이 실패)
    const tooSteep=t=>abs(t.r)*mx.len*100000000n>R6*mx.r*t.len,fake=E.filter(x=>x.kind==='transition'&&tooSteep(x)).map(x=>x.id);
    let i=0;for(let j=1;j<E.length;j++){if(E[j].kind==='transition')continue;
      const A=E[i],B=E[j],tr=E.slice(i+1,j),kk=B.kind==='floor'?A.kind:B.kind,thr=qv(ctx,kk==='curve'?RID.tr.curve:RID.tr.straight),lhs=(B.r*A.len-A.r*B.len)*100000000n,rhs=Q6(thr)*A.len*B.len;
      const type=-lhs>=rhs?'convex':lhs>=rhs?'concave':null;i=j;
      if(!type)continue;const need=type==='convex'?qv(ctx,RID.tr.convex):big?qv(ctx,RID.tr.concave):null;
      const have=tr.reduce((n,t)=>n+t.len,0n),steep=tr.filter(tooSteep).map(t=>t.id),ok=need===null||(have>=N(need)&&!steep.length);
      let adv=null;if(need!==null&&ok){const ch=[A,...tr,B],lim=Q6(thr+0.5);let worst=0n,wd=1n;
        for(let q=1;q<ch.length;q++){const x=ch[q-1],y=ch[q],d=abs(y.r*x.len-x.r*y.len),dn=x.len*y.len;if(d*wd>worst*dn){worst=d;wd=dn;}}
        adv={maxRemainingChangePct:Number(worst)/Number(wd)*100,limitPct:thr+0.5,ok:worst*100000000n<=lim*wd};}
      breaks.push({type,advisory:adv,lower:A.id,upper:B.id,changePct:pct(B)-pct(A),thresholdPct:thr,required:need!==null,requiredMm:need,transitionIds:tr.map(t=>t.id),transitionLengthMm:mm(have),tooSteepTransitionIds:steep,result:need===null?'NOT_REQUIRED':ok?'PASS':'FAIL'});}
    const e2={...ev,maxSlopePct:pct(mx),maxTransitionSlopePct:pct(mx)*ratio/100,rampSystemTotalStalls:tot.total,breaks,tooSteepTransitionIds:fake,assumption:'램프 위·아래 끝 바깥 층 바닥을 평평(0%)하다고 가정함',ruleRefs:refsOf(ctx,[RID.thr,RID.tr.thr,RID.tr.convex,RID.tr.straight,RID.tr.curve,RID.tr.ratio,...(big?[RID.tr.concave]:[])])};
    const bad=breaks.find(b=>b.result==='FAIL'),kor=t=>t==='convex'?'볼록형':'오목형';
    if(bad)return item('R04','FAIL',null,{...cm,message:`${kor(bad.type)} 부분(${bad.lower}–${bad.upper}, 경사 변화 ${Math.abs(bad.changePct).toFixed(2)}%p)에 완화구간 ${bad.requiredMm}mm 이상(경사 ${(pct(mx)*ratio/100).toFixed(2)}% 이하)이 필요한데 ${bad.tooSteepTransitionIds.length?`완화구간 ${bad.tooSteepTransitionIds.join(', ')}의 경사가 너무 급합니다`:`${bad.transitionLengthMm}mm뿐입니다`}.`,evidence:{...e2,failedBreak:bad},ruleRef:refOf(ctx,bad.type==='convex'?RID.tr.convex:RID.tr.concave)});
    if(fake.length)return item('R04','FAIL',null,{...cm,message:`완화구간으로 표시된 ${fake.join(', ')}의 경사가 램프 최대 경사의 ${ratio}%(${(pct(mx)*ratio/100).toFixed(2)}%)를 넘어 완화구간의 정의에 맞지 않습니다.`,evidence:e2,ruleRef:refOf(ctx,RID.tr.ratio)});
    const req=breaks.filter(b=>b.required).length,warn=breaks.filter(b=>b.advisory&&!b.advisory.ok);
    return item('R04','PASS',null,{...cm,message:(req?`완화구간이 필요한 부분 ${req}곳 모두 기준 길이·경사를 충족합니다.`:'경사 변화가 기준 이상인 볼록·오목 부분이 없어 완화구간이 요구되지 않습니다.')+(warn.length?` 설계 권장 경고 ${warn.length}건: 완화구간을 두고도 남은 경사 변화가 기준+0.5%p를 넘습니다(법 판정 아님).`:''),evidence:{...e2,advisories:warn.map(b=>({lower:b.lower,upper:b.upper,...b.advisory}))},ruleRef:refOf(ctx,RID.tr.convex)});}

  // ---- R09 연석 위치·높이 ----
  function evalR09(ctx,m){const cm={subjectId:m.subject,editionAssumed:ctx.ed};
    const errs=[m.e.id,m.e.r09,m.e.sys,ctx.errs.permit,ctx.errs.kind].flat();if(errs.length)return ie('R09',cm,[errs]);
    const g=gate(ctx,[SPEC.offset,SPEC.hMin,SPEC.hMax]);if(g)return gateBlock('R09',cm,g);
    const sc=scope(ctx);if(sc)return fromSpec('R09',cm,sc);
    const off=qv(ctx,RID.offset),lo=qv(ctx,RID.hMin),hi=qv(ctx,RID.hMax),viol=[],miss=[];
    for(const [x,kind] of [[m.wtcL,'offset'],[m.wtcR,'offset'],[m.cuL,'height'],[m.cuR,'height']]){
      if(x.s!=='ok'){miss.push(gen(x.path));continue;}
      if(kind==='offset'&&x.v<off)viol.push(`벽에서 연석까지 ${x.v}mm(기준 ${off}mm 이상)`);
      if(kind==='height'&&(x.v<lo||x.v>hi))viol.push(`연석 높이 ${x.v}mm(기준 ${lo}–${hi}mm)`);}
    const ev={...appEv(ctx),leftOffsetMm:m.wtcL.v,rightOffsetMm:m.wtcR.v,leftHeightMm:m.cuL.v,rightHeightMm:m.cuR.v,violations:viol,ruleRefs:refsOf(ctx,[RID.offset,RID.hMin,RID.hMax])};
    if(viol.length)return item('R09','FAIL',null,{...cm,message:`연석 기준 위반: ${viol.join(', ')}.`,evidence:ev,ruleRef:refOf(ctx,RID.offset)});
    if(miss.length)return item('R09','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:miss,message:'연석 위치 또는 높이 입력이 없어 확인할 수 없습니다.',evidence:ev});
    return item('R09','PASS',null,{...cm,message:'연석 설치 위치와 높이가 기준 범위 안입니다.',evidence:ev,ruleRef:refOf(ctx,RID.offset)});}

  function evalRamps(ctx){const R5=['R01','R02','R03','R04','R09'],raw=ctx.input.ramps;
    if(!has(raw)||(Array.isArray(raw)&&!raw.length))return R5.map(id=>item(id,'UNDETERMINED','MISSING_INPUT',{missingInputs:['ramps'],message:'램프 입력이 없어 확인할 수 없습니다.'}));
    if(!Array.isArray(raw)){flag(ctx,[],'ramps');return R5.map(id=>item(id,'INPUT_ERROR','INVALID_INPUT',{evidence:{fields:['ramps']}}));}
    const idCnt=idCounts(raw,r=>r.id),out=[];
    raw.forEach((r,i)=>{if(!isObj(r)){flag(ctx,[],`ramps[${i}]`);for(const id of R5)out.push(item(id,'INPUT_ERROR','INVALID_INPUT',{subjectId:`ramps[${i}]`,editionAssumed:ctx.ed,evidence:{fields:[`ramps[${i}]`]}}));return;}
      const m=parseRamp(ctx,r,i,idCnt),its=[evalR01(ctx,m),evalR02(ctx,m),evalR03(ctx,m),evalR04(ctx,m),evalR09(ctx,m)];
      // 생성기가 선언한 측정 기준·가정은 판정에 쓰지 않고 근거에 옮겨 적기만 한다(7장 보완안 1). 없으면 결과 불변
      const decl={...(has(r.measurement)?{measurement:isObj(r.measurement)?{...r.measurement}:r.measurement}:{}),...(Array.isArray(r.assumptions)&&r.assumptions.length?{rampAssumptions:r.assumptions.slice()}:{})};
      if(Object.keys(decl).length)for(const x of its)x.evidence={...x.evidence,...decl};
      out.push(...its);});
    return out;}

  // ---- L04 출입구 ----
  function evalEntrances(ctx){const fx=ctx.input.fixed;
    if(has(fx)&&!isObj(fx)){flag(ctx,[],'fixed');return[item('L04','INPUT_ERROR','INVALID_INPUT',{editionAssumed:ctx.ed,evidence:{fields:['fixed']}})];}
    const raw=(fx||{}).entrances;
    if(!has(raw)||(Array.isArray(raw)&&!raw.length))return[item('L04','UNDETERMINED','MISSING_INPUT',{missingInputs:['fixed.entrances'],message:'차량 출입구 입력이 없어 확인할 수 없습니다.'})];
    if(!Array.isArray(raw)){flag(ctx,[],'fixed.entrances');return[item('L04','INPUT_ERROR','INVALID_INPUT',{evidence:{fields:['fixed.entrances']}})];}
    const cnt=idCounts(raw,x=>x.id);
    return raw.map((x,i)=>{const path=`fixed.entrances[${i}]`;if(!isObj(x)){flag(ctx,[],path);return item('L04','INPUT_ERROR','INVALID_INPUT',{subjectId:path,editionAssumed:ctx.ed,evidence:{fields:[path]}});}
      const e=[],id=rd(ctx,[e],x,'id',path+'.id','str');if(id.s==='missing')flag(ctx,[e],path+'.id');else if(id.s==='ok'&&cnt.get(id.v)>1)flag(ctx,[e],path+'.id');
      const cm={subjectId:id.s==='ok'&&cnt.get(id.v)===1?id.v:path,editionAssumed:ctx.ed};
      const w=rd(ctx,[e],x,'widthMm',path+'.widthMm','dim'),sid=rd(ctx,[e],x,'systemId',path+'.systemId','str'),sepR=rd(ctx,[e],x,'separated',path+'.separated','bool');
      const tot=sysInfo(ctx,sid.v,'entrance.systemId');
      const errs=[e,ctx.errs.permit,ctx.errs.kind,tot.state==='error'?tot.fields:[]].flat();if(errs.length)return ie('L04',cm,[errs]);
      const seps=sepR.s==='ok'?[sepR.v]:[true,false],thr=rawVal(ctx,RID.thr),bands=tot.state==='ok'&&thr!==null?[tot.total>=thr?'large':'small']:['small','large'];
      const specs=[SPEC.ent,SPEC.thr];if(bands.includes('large')&&seps.includes(false))specs.push(SPEC.entLarge);
      const g=gate(ctx,specs);if(g)return gateBlock('L04',cm,g);
      const total=tot.state==='ok'?tot.total:null,sc=scope(ctx);if(sc)return fromSpec('L04',cm,sc,{rampSystemTotalStalls:total});
      if(w.s!=='ok')return item('L04','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:[`${path}.widthMm`],message:'출입구 너비 입력이 없어 확인할 수 없습니다.',evidence:{...appEv(ctx),rampSystemTotalStalls:total}});
      const base=qv(ctx,RID.ent),br=[];
      for(const s of seps)for(const b of bands){const strong=b==='large'&&!s,need=strong?qv(ctx,RID.entLarge):base;br.push({band:b,separated:s,totalStalls:total,requiredMm:need,result:w.v>=need?'PASS':'FAIL',ruleId:strong?RID.entLarge:RID.ent});}
      const rs=new Set(br.map(y=>y.result)),ev={...appEv(ctx),rampSystemTotalStalls:total,thresholdStalls:thr,widthMm:w.v,branches:br,ruleRefs:refsOf(ctx,br.map(y=>y.ruleId).concat(RID.thr))};
      if(rs.size===1){const b=br[0],pass=rs.has('PASS');return item('L04',pass?'PASS':'FAIL',null,{...cm,message:pass?`출입구 너비 ${w.v}mm가 기준 ${b.requiredMm}mm 이상입니다.`:`출입구 너비 ${w.v}mm가 기준 ${b.requiredMm}mm에 미달합니다.`,evidence:{...ev,requiredMm:b.requiredMm},ruleRef:refOf(ctx,b.ruleId)});}
      return item('L04','UNDETERMINED','BRANCH_DIVERGES',{...cm,missingInputs:uniq([...(tot.state==='missing'?tot.missing:[]),...(sepR.s!=='ok'?[`${path}.separated`]:[])]),message:'대수 또는 출입구 분리 여부에 따라 통과와 실패가 갈려 입력이 더 필요합니다.',evidence:ev});});}

  // ---- 1B 도형: 00_shared/lib/clipper.js 교집합 면적으로 독립 계산(8-2). v0.4 _internal은 쓰지 않는다 ----
  // 허용오차(100mm²·1mm·0.01도)는 좌표 계산 잡음용이며 법규 수치 비교에는 쓰지 않는다
  const TOL_AREA_MM2=100,TOL_ANGLE_DEG=0.01,SCALE=1000;
  let CL=null;const clip=()=>CL||(CL=typeof module!=='undefined'&&module.exports?require('../../../../00_shared/lib/clipper.js'):globalThis.ClipperLib);
  const toPath=p=>p.map(([x,y])=>({X:Math.round(x*SCALE),Y:Math.round(y*SCALE)}));
  const pathsArea=ps=>ps.reduce((n,p)=>n+clip().Clipper.Area(p),0)/(SCALE*SCALE);
  function interScaled(subj,paths){const C=clip(),c=new C.Clipper(),out=new C.Paths();c.AddPaths(subj,C.PolyType.ptSubject,true);c.AddPaths(paths,C.PolyType.ptClip,true);c.Execute(C.ClipType.ctIntersection,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);return pathsArea(out);}
  const interArea=(poly,paths)=>interScaled([toPath(poly)],paths);
  function xorArea(a,b){const C=clip(),c=new C.Clipper(),out=new C.Paths();c.AddPaths(a,C.PolyType.ptSubject,true);c.AddPaths(b,C.PolyType.ptClip,true);c.Execute(C.ClipType.ctXor,out,C.PolyFillType.pftEvenOdd,C.PolyFillType.pftNonZero);return pathsArea(out);}
  // 좌표 크기(최대 수십만 mm)에서 실수 계산 오차는 1e-10mm 수준. 그보다 크고 좌표 해상도(0.001mm)보다 훨씬 작은 값
  const GAP_NOISE_MM=1e-9;
  const inPoly=(r,p)=>{let s=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[j],b=r[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])s=!s;}return s;};
  // 외곽 각 꼭짓점을 안쪽 마이터 방향으로 w만큼 옮긴다(clipper 마이터 줄임과 같은 모양). 안쪽 방향은 변 옆 점이 짝홀 영역 안인지로 정한다. w=0이면 원래 좌표 그대로
  function insetRings(rings,w){return rings.map(r=>{const n=r.length,N=r.map((a,i)=>{const b=r[(i+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[-(b[1]-a[1])/L,(b[0]-a[0])/L],d=Math.min(0.01,L/4),m=[(a[0]+b[0])/2+u[0]*d,(a[1]+b[1])/2+u[1]*d];return rings.reduce((s,q)=>s!==inPoly(q,m),false)?u:[-u[0],-u[1]];});
    return r.map((v,i)=>{const p=N[(i+n-1)%n],q=N[i],k=1+p[0]*q[0]+p[1]*q[1];return[v[0]+w*(p[0]+q[0])/k,v[1]+w*(p[1]+q[1])/k];});});}
  // 양의 방향으로 맞춘 경로(영역 합칠 때 감김수 상쇄 방지)
  const positive=p=>clip().Clipper.Orientation(p)?p:p.slice().reverse();
  const shoelace=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
  const bbox=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
  const bbHit=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
  const centroid=p=>[Math.round(p.reduce((n,v)=>n+v[0],0)/p.length),Math.round(p.reduce((n,v)=>n+v[1],0)/p.length)];
  const mm2=x=>Math.max(0,Math.round(x));
  // 닫는 점(첫 점 반복)은 표기로 보고 읽을 때만 뺀다. 입력은 고치지 않는다
  const ring=p=>p.length>3&&p[0][0]===p[p.length-1][0]&&p[0][1]===p[p.length-1][1]?p.slice(0,-1):p;
  const orient=(a,b,c)=>Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
  const onSeg=(a,b,c)=>Math.min(a[0],b[0])<=c[0]&&c[0]<=Math.max(a[0],b[0])&&Math.min(a[1],b[1])<=c[1]&&c[1]<=Math.max(a[1],b[1]);
  const meet=(a,b,c,d)=>{const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);return o1!==o2&&o3!==o4||!o1&&onSeg(a,b,c)||!o2&&onSeg(a,b,d)||!o3&&onSeg(c,d,a)||!o4&&onSeg(c,d,b);};
  // G01 다각형 검사: 좌표 유한, 점 3개 이상, 중복 점·되접힘 없음, 면적 있음, 자기교차(접촉 포함) 없음
  function polyProblem(p){
    if(!Array.isArray(p)||!p.every(v=>Array.isArray(v)&&v.length===2&&finite(v[0])&&finite(v[1])))return'not-finite-points';
    const r=ring(p),n=r.length;if(n<3)return'too-few-points';
    for(let i=0;i<n;i++){const a=r[i],b=r[(i+1)%n],c=r[(i+2)%n];if(a[0]===b[0]&&a[1]===b[1])return'duplicate-vertex';if(!orient(a,b,c)&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)return'self-intersection';}
    if(Math.abs(shoelace(r))<=TOL_AREA_MM2)return'zero-area';
    for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(meet(r[i],r[(i+1)%n],r[j],r[(j+1)%n]))return'self-intersection';}
    return null;}
  const ent=(id,kind,poly)=>({id,kind,poly,cp:toPath(poly),bb:bbox(poly),area:Math.abs(shoelace(poly))});
  // 도형 목록 읽기. 문제 있는 원소는 list에서 빼고 bad와 G01(ctx.bad)에 경로를 남긴다
  function group(ctx,arr,path,kind,keys){const out={list:[],bad:[]},bad=p=>{out.bad.push(p);ctx.bad.push(p);};if(!has(arr))return out;
    if(!Array.isArray(arr)){bad(path);return out;}
    const cnt=idCounts(arr,x=>x.id);
    arr.forEach((x,i)=>{const p=`${path}[${i}]`,n=out.bad.length;if(!isObj(x)){bad(p);return;}
      if(!nonEmpty(x.id)||cnt.get(x.id)>1)bad(p+'.id');
      for(const k of keys){const opt=k.endsWith('?'),key=opt?k.slice(0,-1):k;if(opt&&!has(x[key]))continue;if(polyProblem(x[key]))bad(`${p}.${key}`);}
      if(out.bad.length===n){const e=ent(x.id,kind,ring(x[keys[0]]));e.raw=x;const lk=keys[1]&&keys[1].slice(0,-1);if(lk&&has(x[lk]))e.landing=ent(x.id+'.landing','ramp-landing',ring(x[lk]));out.list.push(e);}});
    return out;}
  // 1B candidate 모드: 외곽·후보 도형이 없으면(undefined/null) 미입력, 잘못된 형식이면 입력 오류(1-9 v1.1.5)
  function parseGeo(ctx){const f=isObj(ctx.input.floor)?ctx.input.floor:{},o=f.outline,R={bad:[],missing:!has(o)},bad=(g,p)=>{g.bad.push(p);ctx.bad.push(p);};
    if(R.missing);else if(!isObj(o))bad(R,'floor.outline');else{const outer=o.kind==='outer';
      if(!['inner','outer'].includes(o.kind))bad(R,'floor.outline.kind');
      if(!Array.isArray(o.polygons)||!o.polygons.length)bad(R,'floor.outline.polygons');else o.polygons.forEach((p,i)=>{if(polyProblem(p))bad(R,`floor.outline.polygons[${i}]`);});
      if(outer&&!(finite(f.wallMm)&&f.wallMm>=0))bad(R,'floor.wallMm');
      // 외곽 다각형끼리 부분 겹침은 입력 오류(v1.1.9). 접촉(겹친 면적 ≤ 100mm²)과 한쪽이 다른 쪽에 완전히 들어간 구멍은 허용
      if(!R.bad.length){const rs=o.polygons.map(p=>toPath(ring(p))),A=rs.map(p=>Math.abs(pathsArea([p])));
        for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const I=interScaled([rs[i]],[rs[j]]);
          if(I>TOL_AREA_MM2&&I<Math.min(A[i],A[j])-TOL_AREA_MM2){bad(R,`floor.outline.polygons[${i}]`);bad(R,`floor.outline.polygons[${j}]`);}}}
      // 여러 영역과 구멍: 짝홀 규칙으로 합친 뒤, 바깥면(outer)이면 벽 두께만큼 안으로 줄인다
      if(!R.bad.length){const C=clip();let ps=C.Clipper.SimplifyPolygons(o.polygons.map(p=>toPath(ring(p))),C.PolyFillType.pftEvenOdd);
        R.outerPaths=ps;
        if(outer&&f.wallMm>0){const co=new C.ClipperOffset(2,0.25),out=new C.Paths();co.AddPaths(ps,C.JoinType.jtMiter,C.EndType.etClosedPolygon);co.Execute(out,-f.wallMm*SCALE);ps=out;}
        if(pathsArea(ps)<=TOL_AREA_MM2)bad(R,outer?'floor.wallMm':'floor.outline');else{R.paths=ps;
          // 거리 측정용 경계(v1.1.8): inner·outer 모두 둥글리기 전 원래 좌표에서 벽 두께 w(inner는 0)만큼 안쪽으로 옮긴 경계.
          // 면적 판정 경계(ps, 0.001mm 격자)와 대칭차 면적이 둘레×0.002mm 이하인지 확인하고, 어긋나면 격자 경계로 잰다(보고 참조)
          const raw=o.polygons.map(ring),ex=insetRings(raw,outer?f.wallMm:0),per=ex.reduce((n,r)=>n+r.reduce((m,a,i)=>m+Math.hypot(r[(i+1)%r.length][0]-a[0],r[(i+1)%r.length][1]-a[1]),0),0);
          R.exact=xorArea(ex.map(toPath),ps)<=per*2/SCALE;R.edges=R.exact?ex:ps.map(p=>p.map(q=>[q.X/SCALE,q.Y/SCALE]));}}}
    const cand=ctx.cand,C0={bad:[],missing:!has(cand)||isObj(cand)&&!has(cand.geometry)},P='candidate.geometry',fx=isObj(ctx.input.fixed)?ctx.input.fixed:{};
    const g=isObj(cand)&&isObj(cand.geometry)?cand.geometry:(C0.missing||bad(C0,'candidate.geometry'),{});
    // 램프의 외곽 밖 허용 구간: ramps[].roadConnection.outsidePolygon(지상 도로 접속 구간, 6장 G07 v1.1.5)
    // 같은 id 램프 입력이 둘 이상이면 어느 선언을 쓸지 정할 수 없으므로 G07 입력 오류(v1.1.6)
    const RC={bad:[],byId:new Map()},rIds=Array.isArray(ctx.input.ramps)?idCounts(ctx.input.ramps,r=>r.id):new Map();
    if(Array.isArray(ctx.input.ramps))ctx.input.ramps.forEach((r,i)=>{if(isObj(r)&&rIds.get(r.id)>1)bad(RC,`ramps[${i}].id`);});
    if(Array.isArray(ctx.input.ramps))ctx.input.ramps.forEach((r,i)=>{if(!isObj(r)||!has(r.roadConnection))return;const p=`ramps[${i}].roadConnection`,rc=r.roadConnection;
      if(!isObj(rc)){bad(RC,p);return;}if(!has(rc.outsidePolygon))return;if(polyProblem(rc.outsidePolygon)){bad(RC,p+'.outsidePolygon');return;}
      if(nonEmpty(r.id))RC.byId.set(r.id,positive(toPath(ring(rc.outsidePolygon))));});
    return{region:R,cand:C0,road:RC,stalls:group(ctx,g.stalls,P+'.stalls','stall',['polygon']),lanes:group(ctx,g.lanes,P+'.lanes','lane',['polygon']),
      ramps:group(ctx,g.ramps,P+'.ramps','ramp-body',['bodyPolygon','landingPolygon?']),cols:group(ctx,g.columns,P+'.columns','column',['polygon']),
      res:group(ctx,g.reserved,P+'.reserved','reserved',['polygon']),turn:group(ctx,g.turnaround,P+'.turnaround','turnaround',['polygon']),
      cores:group(ctx,fx.cores,'fixed.cores','core',['polygon']),fcols:group(ctx,fx.columns,'fixed.columns','fixed-column',['polygon']),fres:group(ctx,fx.reservedZones,'fixed.reservedZones','reserved-zone',['polygon'])};}
  const outsideOf=(e,R)=>e.area-interArea(e.poly,R.paths);
  // 두 다각형 변 사이 최소 거리(mm). 교차하면 0
  const ptSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  const edgesOf=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
  const polyDist=(P,Q)=>{let m=Infinity;for(const [a,b] of edgesOf(P))for(const [c,d] of edgesOf(Q))m=Math.min(m,meet(a,b,c,d)?0:ptSeg(a,c,d),ptSeg(b,c,d),ptSeg(c,a,b),ptSeg(d,a,b));return m;};
  function overlaps(A,B,same,key='stallId'){const v=[];let mx=0;
    A.forEach((a,i)=>B.forEach((b,j)=>{if(same&&j<=i||!bbHit(a.bb,b.bb))return;const o=interArea(a.poly,[b.cp]);mx=Math.max(mx,o);if(o>TOL_AREA_MM2)v.push({[key]:a.id,withId:b.id,withKind:b.kind,overlapAreaMm2:mm2(o),location:centroid(a.poly)});}));
    return{v,mx:mm2(mx)};}
  function evalGeo(ctx,G){const out=[],S=G.stalls.list,badOf=(...gs)=>gs.flatMap(x=>x.bad),T={toleranceMm2:TOL_AREA_MM2};
    const noStalls=id=>item(id,'UNDETERMINED','MISSING_INPUT',{missingInputs:['candidate.geometry.stalls'],message:'후보의 주차칸 도형이 없어 확인할 수 없습니다.'});
    const pair=(id,groups,B,same,what,needB)=>{const b=badOf(G.cand,G.stalls,...groups);if(b.length)return ie(id,{},[b]);if(!S.length)return noStalls(id);
      if(needB&&!B.length)return item(id,'UNDETERMINED','MISSING_INPUT',{missingInputs:[needB],message:`후보의 차로 도형이 없어 확인할 수 없습니다.`});
      const r=overlaps(S,B,same);
      return r.v.length?item(id,'FAIL',null,{message:`주차칸이 ${what} 겹칩니다(${r.v.length}건, 예: ${r.v[0].stallId}–${r.v[0].withId} ${r.v[0].overlapAreaMm2}mm², 허용 ${TOL_AREA_MM2}mm²).`,evidence:{...T,violations:r.v}})
        :item(id,'PASS',null,{message:`주차칸 ${S.length}개가 ${what} 겹치지 않습니다(접촉은 겹침으로 보지 않음).`,evidence:{...T,stallCount:S.length,maxOverlapAreaMm2:r.mx}});};
    const noOutline=(id,cm={})=>item(id,'UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:['floor.outline'],message:'외곽(floor.outline) 입력이 없어 확인할 수 없습니다.'});
    // G02 칸이 외곽 안
    let b=badOf(G.cand,G.region,G.stalls);
    if(b.length)out.push(ie('G02',{},[b]));else if(G.region.missing)out.push(noOutline('G02'));else if(!S.length)out.push(noStalls('G02'));else{const v=[];let mx=0;
      for(const s of S){const o=outsideOf(s,G.region);mx=Math.max(mx,o);if(o>TOL_AREA_MM2)v.push({stallId:s.id,outsideAreaMm2:mm2(o),location:centroid(s.poly)});}
      out.push(v.length?item('G02','FAIL',null,{message:`주차칸 ${v.length}개가 외곽 밖으로 나갑니다(예: ${v[0].stallId}, 밖 면적 ${v[0].outsideAreaMm2}mm²).`,evidence:{...T,violations:v}})
        :item('G02','PASS',null,{message:`주차칸 ${S.length}개가 모두 외곽 안에 있습니다.`,evidence:{...T,stallCount:S.length,maxOutsideAreaMm2:mm2(mx)}}));}
    out.push(pair('G03',[G.lanes],G.lanes.list,false,'차로와','candidate.geometry.lanes'));
    const obst=[...G.cores.list,...G.fcols.list,...G.fres.list,...G.ramps.list.flatMap(r=>r.landing?[r,r.landing]:[r]),...G.cols.list,...G.res.list];
    out.push(pair('G04',[G.cores,G.fcols,G.fres,G.ramps,G.cols,G.res],obst,false,'코어·기둥·램프·예약영역과'));
    out.push(pair('G05',[],S,true,'다른 주차칸과'));
    // G06 코어와 계획영역(6-1). 위치는 면적으로 판단: 밖 면적 ≤ 허용이면 안, 안 면적 ≤ 허용이면 밖, 그 사이면 걸침.
    // 걸침은 선언과 상관없이 입력 오류. abutting은 영역 밖이면서 경계에서 1mm 안에 닿는 코어에만 허용(v1.1.5)
    b=badOf(G.region,G.cores);
    if(b.length)out.push(ie('G06',{},[b]));else if(G.region.missing)out.push(noOutline('G06'));else if(!G.cores.list.length)out.push(item('G06','UNDETERMINED','MISSING_INPUT',{missingInputs:['fixed.cores'],message:'코어 입력이 없어 코어와 계획영역의 관계를 확인할 수 없습니다.'}));
    else for(const c of G.cores.list){const cm={subjectId:c.id},rel=c.raw.relation,path=`fixed.cores[${G.cores.list.indexOf(c)}].relation`;
      if(has(rel)&&!['inside','abutting','external-separate'].includes(rel)){ctx.bad.push(path);out.push(ie('G06',cm,[[path]]));continue;}
      const outA=outsideOf(c,G.region),inA=c.area-outA,pos=outA<=TOL_AREA_MM2?'inside':inA<=TOL_AREA_MM2?'outside':'straddle',ev={position:pos,relation:has(rel)?rel:null,insideAreaMm2:mm2(inA),outsideAreaMm2:mm2(outA),location:centroid(c.poly)};
      // 간격은 외곽과 같은 좌표 기준으로 잰다. 1e-9mm는 실수 계산 잡음만 지우는 값이며 1mm 기준은 그대로다(v1.1.7)
      // 1e-9mm(GAP_NOISE_MM)는 실수 계산 잡음만 지우는 값. 간격 ≤ 1mm 기준은 그대로(12-11)
      if(pos==='outside'){const cp=G.region.exact?c.poly:c.cp.map(q=>[q.X/SCALE,q.Y/SCALE]);ev.distanceBoundary=G.region.exact?'exact':'grid';ev.gapToBoundaryMm=Math.min(...G.region.edges.map(p=>polyDist(cp,p)));ev.touchesBoundary=ev.gapToBoundaryMm<=TOL_LEN_MM+GAP_NOISE_MM;}
      const ok=pos==='inside'?!has(rel)||rel==='inside':pos==='outside'&&(rel==='external-separate'||rel==='abutting'&&ev.touchesBoundary);
      if(ok){out.push(item('G06','PASS',null,{...cm,message:`코어 ${c.id}의 위치(${pos==='inside'?'영역 안':pos==='outside'?'영역 밖':'경계에 걸침'})가 관계 선언과 맞습니다.`,evidence:ev}));continue;}
      const straddle=pos==='straddle',reason=straddle?'ZONE_STRADDLE':'ZONE_MISMATCH';
      out.push(item('G06','INPUT_ERROR',reason,{...cm,message:straddle?`코어 ${c.id}가 계획영역 경계를 가로질러 안(${ev.insideAreaMm2}mm²)과 밖(${ev.outsideAreaMm2}mm²)에 모두 걸쳐 있어 입력을 확인해야 합니다. 관계 선언으로 해소되지 않으며 법규 위반이 아닙니다.`:`코어 ${c.id}의 위치(${pos==='inside'?'영역 안':pos==='outside'?'영역 밖':'경계에 걸침'})와 관계 선언(${has(rel)?rel:'미선언'})이 맞지 않아 입력 좌표나 계획영역을 확인해야 합니다. 법규 위반이 아닙니다.`,evidence:ev}));}
    // G07 램프 몸체: 코어·고정 요소와 겹치면 실패. 외곽 밖 부분은 같은 id 램프 입력의 roadConnection.outsidePolygon 안에 있을 때만 허용, 그 밖이면 실패(v1.1.5)
    b=badOf(G.cand,G.region,G.road,G.ramps,G.cores,G.fcols,G.fres);
    if(b.length)out.push(ie('G07',{},[b]));else if(!G.ramps.list.length)out.push(item('G07','UNDETERMINED','MISSING_INPUT',{missingInputs:['candidate.geometry.ramps'],message:'후보의 램프 몸체 도형이 없어 확인할 수 없습니다.'}));
    else for(const r of G.ramps.list){const cm={subjectId:r.id},hit=overlaps([r],[...G.cores.list,...G.fcols.list,...G.fres.list],false,'rampId'),road=G.road.byId.get(r.id);
      if(hit.v.length){out.push(item('G07','FAIL',null,{...cm,message:`램프 몸체 ${r.id}가 ${hit.v[0].withId}와 ${hit.v[0].overlapAreaMm2}mm² 겹칩니다.`,evidence:{...T,location:centroid(r.poly),violations:hit.v}}));continue;}
      if(G.region.missing){out.push(noOutline('G07',cm));continue;}
      // Generated ramp bodies include their outer wall faces. Test that explicit
      // reference against the physical outer envelope; legacy bodies keep inner-floor rules.
      if(has(r.raw.bodyReference)&&!['inner','outer'].includes(r.raw.bodyReference)){out.push(ie('G07',cm,[['candidate.geometry.ramps.bodyReference']]));continue;}
      const region=r.raw.bodyReference==='outer'?{paths:G.region.outerPaths||G.region.paths}:G.region;
      const outA=outsideOf(r,region),loose=r.area-interArea(r.poly,road?[...region.paths,road]:region.paths),ev={...T,boundaryReference:r.raw.bodyReference||'inner',outsideAreaMm2:mm2(outA),undeclaredOutsideAreaMm2:mm2(loose),roadConnectionDeclared:!!road,location:centroid(r.poly)};
      if(loose>TOL_AREA_MM2)out.push(item('G07','FAIL',null,{...cm,message:`램프 몸체 ${r.id}의 일부(${mm2(loose)}mm²)가 외곽 밖이면서 지상 도로 접속 구간(roadConnection.outsidePolygon)으로 선언되지 않은 곳에 있습니다.`,evidence:ev}));
      else out.push(item('G07','PASS',null,{...cm,message:outA>TOL_AREA_MM2?`램프 몸체 ${r.id}의 외곽 밖 부분은 선언된 지상 도로 접속 구간 안에 있고, 코어·고정 요소와 겹치지 않습니다.`:`램프 몸체 ${r.id}가 외곽 안에 있고 코어·고정 요소와 겹치지 않습니다.`,evidence:{...ev,maxOverlapAreaMm2:hit.mx}}));}
    return out;}
  // 칸 도형의 폭·깊이 측정: 네 각이 직각(0.01도)인 사각형만. 짧은 변을 폭으로, mm로 반올림(8-2)
  function rectDims(p){if(p.length!==4)return null;const s=p.map((a,i)=>[p[(i+1)%4][0]-a[0],p[(i+1)%4][1]-a[1]]);
    for(let i=0;i<4;i++){const a=s[i],b=s[(i+1)%4];if(Math.abs(Math.abs(Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]))*180/Math.PI-90)>TOL_ANGLE_DEG)return null;}
    const a=Math.round(Math.hypot(...s[0])),b=Math.round(Math.hypot(...s[1]));return{widthMm:Math.min(a,b),depthMm:Math.max(a,b)};}

  // ---- L01 주차칸 치수: numeric-test는 선언 수치, candidate는 후보 칸 도형 측정(1-5a). 비교 로직은 공유 ----
  function evalStalls(ctx,G){
    const E=ctx.errs,stRaw=ctx.input.stalls;
    if(has(stRaw)&&!isObj(stRaw)){flag(ctx,[],'stalls');return[item('L01','INPUT_ERROR','INVALID_INPUT',{editionAssumed:ctx.ed,evidence:{fields:['stalls']}})];}
    if(G&&G.cand.bad.length)return[ie('L01',{editionAssumed:ctx.ed},[G.cand.bad])];
    const st=stRaw||{},oriS=rd(ctx,[E.stOri],st,'orientation','stalls.orientation',['perpendicular','parallel','angled']),P=G?'candidate.geometry.stalls':'stalls.items',raw=G?(G.cand.missing?undefined:ctx.cand.geometry.stalls):st.items;
    if(!has(raw)||(Array.isArray(raw)&&!raw.length))return[item('L01','UNDETERMINED','MISSING_INPUT',{missingInputs:[P],message:G?'후보의 주차칸 도형이 없어 확인할 수 없습니다.':'주차칸 시험 입력(stalls.items)이 없어 확인할 수 없습니다.'})];
    if(!Array.isArray(raw)){flag(ctx,[],P);return[item('L01','INPUT_ERROR','INVALID_INPUT',{evidence:{fields:[P]}})];}
    const cnt=idCounts(raw,x=>x.id),base=G?{measurementSource:'candidate-geometry',geometryVerified:true}:{measurementSource:'declared-test-values',geometryVerified:false};
    return raw.map((x,i)=>{const path=`${P}[${i}]`;if(!isObj(x)){flag(ctx,[],path);return item('L01','INPUT_ERROR','INVALID_INPUT',{subjectId:path,editionAssumed:ctx.ed,evidence:{...base,fields:[path]}});}
      const e=[],id=rd(ctx,[e],x,'id',path+'.id','str');if(id.s==='missing')flag(ctx,[e],path+'.id');else if(id.s==='ok'&&cnt.get(id.v)>1)flag(ctx,[e],path+'.id');
      const cm={subjectId:id.s==='ok'&&cnt.get(id.v)===1?id.v:path,editionAssumed:ctx.ed};
      const ori=rd(ctx,[e],x,'orientation',path+'.orientation',['perpendicular','parallel','angled']),dt=rd(ctx,[e],x,'declaredType',path+'.declaredType','str');
      let w,d;
      if(G){const pb=polyProblem(x.polygon),m=pb?null:rectDims(ring(x.polygon));if(pb)e.push(path+'.polygon');w={s:m?'ok':'missing',v:m?m.widthMm:undefined,path:path+'.polygon'};d={s:m?'ok':'missing',v:m?m.depthMm:undefined,path:path+'.polygon'};}
      else{w=rd(ctx,[e],x,'widthMm',path+'.widthMm','dim');d=rd(ctx,[e],x,'depthMm',path+'.depthMm','dim');}
      const orient=ori.s==='ok'?ori.v:oriS.s==='ok'?oriS.v:null;
      const errs=[e,E.permit,ori.s==='ok'?[]:E.stOri,dt.s==='ok'?[]:E.def].flat();if(errs.length)return ie('L01',cm,[errs]);
      if(!orient)return item('L01','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:['stall.orientation','stalls.orientation'],message:'주차 방향이 없어 비교할 치수 표를 정할 수 없습니다.',evidence:base});
      const ev={...base,orientation:orient,widthMm:w.v,depthMm:d.v};
      const type=dt.s==='ok'?dt.v:ctx.proj.def.s==='ok'?ctx.proj.def.v:null,defaultTypeApplied=dt.s!=='ok';
      if(!type)return item('L01','UNDETERMINED','OPEN_BRANCH_SET',{...cm,missingInputs:['stall.declaredType','project.stallDefaultType'],message:'주차칸 종류가 지정되지 않아 폭만으로 종류를 특정할 수 없고(이륜전용 등 더 좁은 종류가 있음) 비교할 수 없습니다.',evidence:ev});
      const rid=orient==='parallel'?RID.parallel(type):RID.stall(type),g=gate(ctx,[{id:rid,kind:'dims'}]);if(g)return gateBlock('L01',cm,{reason:g.reason,evidence:{...ev,declaredType:type,...g.evidence}});
      if(G&&w.s!=='ok')return item('L01','UNDETERMINED','NOT_IMPLEMENTED',{...cm,message:'직사각형이 아닌 칸 도형의 폭·깊이 측정은 구현되지 않아 확인할 수 없습니다.',evidence:{...ev,declaredType:type}});
      if(w.s!=='ok'||d.s!=='ok')return item('L01','UNDETERMINED','MISSING_INPUT',{...cm,missingInputs:[w,d].filter(y=>y.s!=='ok').map(y=>y.path),message:'주차칸의 폭 또는 깊이 입력이 없어 확인할 수 없습니다.',evidence:{...ev,declaredType:type}});
      const req=records(ctx,rid)[0].quantity,fail=w.v<req.widthMm||d.v<req.depthMm;
      return item('L01',fail?'FAIL':'PASS',null,{...cm,message:fail?`칸 ${w.v}×${d.v}mm가 ${type} 기준 ${req.widthMm}×${req.depthMm}mm에 미달합니다.`:`칸 ${w.v}×${d.v}mm가 ${type} 기준 ${req.widthMm}×${req.depthMm}mm 이상입니다.`,evidence:{...ev,declaredType:type,required:{widthMm:req.widthMm,depthMm:req.depthMm},defaultTypeApplied,ruleRefs:[refOf(ctx,rid)]},ruleRef:refOf(ctx,rid)});});}

  // ---- 진입점 ----
  function skeleton(why){return ALL.map(x=>makeItem(x.id,x.domain,'UNDETERMINED',x.id==='G01'?'MISSING_INPUT':'NOT_IMPLEMENTED',{message:x.id==='G01'?'판정기 내부 오류로 입력을 확인하지 못했습니다.':undefined,evidence:x.id==='G01'?{exception:String(why)}:{}}));}
  const EVALUATOR={name:'underground-stage1b',version:'0.3.0'},GEO_1B=['G02','G03','G04','G05','G06','G07'];
  function run(args){
    const input=args.input,ctx={ruleSet:args.ruleSet,cand:args.candidate,mode:isObj(args.options)&&args.options.mode==='numeric-test'?'numeric-test':'candidate',bad:[],errs:{permit:[],kind:[],use:[],def:[],fh:[],lotsS:[],sysS:[],stOri:[]}};
    ctx.input=isObj(input)?input:{};if(!isObj(input))ctx.bad.push('input');
    parseProject(ctx);
    // 도형 판정(1B)은 candidate 모드에서 항상 한다. numeric-test는 도형을 요구하지 않는다(1-5a)
    const G=ctx.mode==='candidate'?parseGeo(ctx):null;
    const items=[...evalRamps(ctx),...evalStalls(ctx,G),...evalEntrances(ctx),...(G?evalGeo(ctx,G):[])];
    const fields=uniq(ctx.bad);
    items.push(fields.length?item('G01','INPUT_ERROR','INVALID_INPUT',{message:`입력 형식·수치 또는 도형 오류가 있어 판정에 쓸 수 없는 입력이 있습니다(${fields.join(', ')}).`,evidence:{fields}})
      :G&&(G.region.missing||G.cand.missing)?item('G01','UNDETERMINED','MISSING_INPUT',{missingInputs:[...(G.region.missing?['floor.outline']:[]),...(G.cand.missing?['candidate.geometry']:[])],message:'필수 도형(외곽 또는 후보 도형) 입력이 없어 도형 유효성을 확인할 수 없습니다.',evidence:{checked:'input-format-and-numbers,polygon-validity'}})
      :G?item('G01','PASS',null,{message:'입력 형식·수치와 다각형(좌표 유한, 닫힘, 자기교차 없음)을 검사했고 오류가 없습니다.',evidence:{checked:'input-format-and-numbers,polygon-validity'}})
      :item('G01','UNDETERMINED','NOT_IMPLEMENTED',{message:'수치 시험 모드는 입력 형식·수치만 검사하고 다각형 유효성은 검사하지 않아 확인할 수 없습니다.',evidence:{checked:'input-format-and-numbers',remaining:'polygon-validity'}}));
    const done=new Set([...DONE_1A,...(G?GEO_1B:[])]);
    for(const x of ALL)if(!done.has(x.id))items.push(item(x.id,'UNDETERMINED','NOT_IMPLEMENTED',GEO_1B.includes(x.id)?{message:'수치 시험 모드라 도형 판정을 하지 않아 확인할 수 없습니다.'}:{}));
    const order=new Map(ALL.map((x,i)=>[x.id,i]));items.sort((a,b)=>order.get(a.id)-order.get(b.id));
    const ruleSet=args.ruleSet,overall=computeOverall(items,{editionAssumed:ctx.ed,mode:ctx.mode});
    const recomputed=['rampSystem.totalStalls','ramp.section.legalLaneWidthMm','ramp.slope',...(G?['polygon.validity','stall.containment.area','overlap.area','core.zone','ramp.body.area','stall.dimensions']:[])];
    return{schema:'ug-evaluation/0.1',evaluator:EVALUATOR,ruleSets:[{id:isObj(ruleSet)?ruleSet.id:null,edition:isObj(ruleSet)?ruleSet.edition:null,editionAssumed:ctx.ed}],items,domainSummary:summarize(items),overall,independence:{recomputed,shared:ctx.mode==='numeric-test'?['stall.declaredTestValues']:G?['input.coordinates','candidate.coordinates','00_shared/lib/clipper.js']:[]}};}
  function evaluate(args){args=isObj(args)?args:{};
    try{return run(args);}catch(e){const items=skeleton(e&&e.message),overall=computeOverall(items,{});return{schema:'ug-evaluation/0.1',evaluator:EVALUATOR,ruleSets:[],items,domainSummary:summarize(items),overall,independence:{recomputed:[],shared:[]}};}}
  return{evaluate,makeItem,summarize,computeOverall,registry:IDS};
});
