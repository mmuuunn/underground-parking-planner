'use strict';
// Fixed-E2 planning experiment; never changes the production generator or source fixture.
const fs=require('node:fs'),crypto=require('node:crypto'),G=require('../04_parking/01_src/plan/CLAUDE_ugp_geom.js');
const {CL}=G,I=CL.ClipType.ctIntersection,D=CL.ClipType.ctDifference,U=CL.ClipType.ctUnion;
const EXPECTED='d51f044fd482235713be8cf598984ffb763aaff95e5403823998111d10c8433b';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const area=P=>Math.abs(G.areaOf(P)),solid=P=>G.signedArea(P)<0?P.slice().reverse():P;
const op=(A,B,t)=>G.boolOp(A,B,t),ensure=(ok,why)=>{if(!ok)throw Error(why);};
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function inspect(c){
  const floor=[c.fixed.innerOutline],blockers=c.fixed.columns.concat(c.fixed.cores,c.fixed.ramp?[c.fixed.ramp]:[]).map(solid);
  const failures=[],covered=new Set();
  for(const m of c.modules){
    const P=m.indices.map(i=>c.stalls[i]);
    if(P.length!==(m.kind==='structural-triple'?3:2))failures.push(m.id+': incomplete module');
    for(let j=0;j<P.length;j++){
      const p=P[j],i=m.indices[j];
      if(covered.has(i))failures.push(m.id+': duplicate stall');covered.add(i);
      const a=p[0],b=p[1],n=m.inward;
      const probe=[a,b,[b[0]-n[0]*50,b[1]-n[1]*50],[a[0]-n[0]*50,a[1]-n[1]*50]];
      const lengths=p.map((q,k)=>Math.hypot(q[0]-p[(k+1)%4][0],q[1]-p[(k+1)%4][1])).sort((a,b)=>a-b);
      if(lengths.join(',')!=='2500,2500,5000,5000')failures.push(m.id+': wrong dimensions');
      if(area(op([solid(p)],floor,D))>1)failures.push(m.id+': outside floor');
      if(area(op([solid(p)],blockers,I))>1)failures.push(m.id+': fixed collision');
      if(area(op([solid(p)],c.aisles,I))>1)failures.push(m.id+': aisle collision');
      if(area(op([solid(probe)],c.aisles,I))<125000-2)failures.push(m.id+': missing front');
      for(let k=0;k<i;k++)if(area(op([solid(p)],[solid(c.stalls[k])],I))>1)failures.push(m.id+': bay collision');
      if(j&&Math.hypot(p[0][0]-P[j-1][1][0],p[0][1]-P[j-1][1][1])>1)failures.push(m.id+': broken row');
      if(m.kind==='structural-triple'&&(n[0]!==0||p[0][1]!==m.frontY||p[2][1]!==m.frontY+n[1]*5000))failures.push(m.id+': mixed facing');
    }
    if(m.kind==='structural-triple'&&P.length===3&&
       (P[0][0][0]!==m.clearSpan[0]||P[2][1][0]!==m.clearSpan[1]))failures.push(m.id+': structural alignment');
  }
  if(covered.size!==c.stalls.length)failures.push('unassigned bay');
  if(area(op(c.aisles,blockers,I))>1||area(op(c.aisles,floor,D))>1)failures.push('aisle boundary/fixed collision');
  return {passed:failures.length===0,failures,checkedBays:c.stalls.length,checkedModules:c.modules.length};
}
function build(source){
  const original={fixed:source.fixed,aisles:source.aisles,stalls:source.stalls};
  ensure(hash(original)===EXPECTED,'Only the preserved fixed E2 geometry is accepted');
  const fixed=structuredClone(source.fixed),floor=[fixed.innerOutline];
  const extensions=[{id:'south-end',pts:rect(27600,5400,28350,11400)},
                    {id:'middle-west',pts:rect(20850,21400,21600,27400)}];
  const aisles=op(source.aisles,extensions.map(e=>e.pts),U);
  const blockers=fixed.columns.concat(fixed.cores,[fixed.ramp]).map(solid);
  const centres=axis=>[...new Set(fixed.columns.map(p=>p.reduce((s,q)=>s+q[axis]/p.length,0)))].sort((a,b)=>a-b);
  const xs=centres(0),ys=centres(1),stalls=[],modules=[],rejected=[];
  const fit=(P,n)=>{
    const reasons=new Set();
    for(const p of P){
      const a=p[0],b=p[1],probe=[a,b,[b[0]-n[0]*50,b[1]-n[1]*50],[a[0]-n[0]*50,a[1]-n[1]*50]];
      if(area(op([solid(p)],floor,D))>1)reasons.add('floor');
      if(area(op([solid(p)],blockers,I))>1)reasons.add('fixed');
      if(area(op([solid(p)],aisles,I))>1)reasons.add('aisle');
      if(area(op([solid(p)],stalls.map(solid),I))>1)reasons.add('other-module');
      if(area(op([solid(probe)],aisles,I))<125000-2)reasons.add('front');
    }return [...reasons];
  };
  const add=(m,P)=>{
    const reasons=fit(P,m.inward);
    if(reasons.length){rejected.push({...m,reasons});return;}
    m.indices=P.map((_,j)=>stalls.length+j);stalls.push(...P);modules.push(m);
  };
  for(const [row,frontY,side]of [['S-out',5400,-1],['S-in',11400,1],['M-out',21400,-1],
                               ['M-in',27400,1],['N-in',37400,-1],['N-out',43400,1]]){
    for(let k=1;k<xs.length;k++){
      const lo=xs[k-1]+300,hi=xs[k]-300;
      ensure(hi-lo===7500,'E2 structural span changed');
      const P=Array.from({length:3},(_,j)=>[[lo+2500*j,frontY],[lo+2500*(j+1),frontY],
        [lo+2500*(j+1),frontY+side*5000],[lo+2500*j,frontY+side*5000]]);
      add({id:row+'-'+k,kind:'structural-triple',frontY,inward:[0,side],clearSpan:[lo,hi]},P);
    }
  }
  // Fixed vertical bays have 7.4m clear, so wall rows explicitly retain two-bay exceptions.
  for(const [row,x,side]of [['W-wall',5400,-1],['E-wall',58600,1]])for(let k=1;k<ys.length;k++){
    const lo=ys[k-1]+300,hi=ys[k]-300,start=(lo+hi-5000)/2;
    const P=Array.from({length:2},(_,j)=>[[x,start+2500*j],[x,start+2500*(j+1)],
      [x+side*5000,start+2500*(j+1)],[x+side*5000,start+2500*j]]);
    add({id:row+'-'+k,kind:'wall-pair-exception',inward:[side,0],clearSpan:[lo,hi],
         reason:'Fixed column faces leave 7400mm, less than three 2500mm bays'},P);
  }
  const geometryHash=hash({fixed,aisles,stalls});
  const candidate={id:'E2-M1',title:'E2 기둥 구간별 3칸 모듈 검토안',fixed,aisles,stalls,modules,
    geometryHash,sourceGeometryHash:EXPECTED,state:'LAYOUT_REVIEW_PENDING',
    routeEvidence:{state:'not-evaluated',reason:'New geometry; original 50-bay journeys are not transferable'}};
  if(source.loop)candidate.loop=structuredClone(source.loop);
  if(source.ramps)candidate.ramps=structuredClone(source.ramps);
  const geometryCheck=inspect(candidate);ensure(geometryCheck.passed,geometryCheck.failures.join('; '));
  const used=op(aisles,stalls.concat(blockers).map(solid),U);
  const summary={originalBays:source.stalls.length,bays:stalls.length,
    tripleModules:modules.filter(m=>m.kind==='structural-triple').length,
    wallPairExceptions:modules.filter(m=>m.kind==='wall-pair-exception').length,
    aisleM2:area(aisles)/1e6,addedAisleM2:area(op(aisles,source.aisles,D))/1e6,
    unallocatedM2:area(op(floor,used,D))/1e6,geometryCheck,
    targetModule:modules.find(m=>m.id==='M-out-4')||null};
  return {candidate,summary,extensions,rejected};
}
module.exports={build,inspect};
if(require.main===module){
  try{ensure(process.argv.length===3,'Usage: node tools/rebuild-e2-modules.cjs preserved-E2-candidate.json');
    const doc=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),source=doc.candidates?.find(c=>c.id==='E2')||doc;
    process.stdout.write(JSON.stringify(build(source))+'\n');
  }catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
}
