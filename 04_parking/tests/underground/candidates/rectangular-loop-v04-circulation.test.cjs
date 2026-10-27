'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../../../src/underground/candidates/rectangular-loop-v04.js');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const rotate=(p,d)=>{const a=d*Math.PI/180;return[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];};
const bounds=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
function overlap(a,b){
  // SAT with a 1.5 mm tolerance for the public integer drawing coordinates.
  for(const p of [a,b])for(let i=0;i<p.length;i++){
    const q=p[(i+1)%p.length],dx=q[0]-p[i][0],dy=q[1]-p[i][1],l=Math.hypot(dx,dy);if(!l)continue;
    const project=r=>r.map(v=>(-dy*v[0]+dx*v[1])/l),aa=project(a),bb=project(b);
    if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=1.5)return false;
  }
  return true;
}
function contained(poly,mass){
  const within=p=>U._internal.inside(mass,p)||mass.some((a,i)=>{const b=mass[(i+1)%mass.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=1.5;});
  return poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return [0,.25,.5,.75].every(t=>within([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]));});
}
function inspect(result,input){
  assert.equal(result.valid,true,JSON.stringify(result.violations));
  const g=result.circulation,adj=g.nodes.map(()=>[]);
  for(const e of g.edges){adj[e.a].push([e.b,e.id]);adj[e.b].push([e.a,e.id]);}
  const visit=(start,omit=-1)=>{const seen=new Set([start]),todo=[start];while(todo.length){const u=todo.pop();for(const[v,id]of adj[u])if(id!==omit&&!seen.has(v)){seen.add(v);todo.push(v);}}return seen;};
  assert.equal(visit(g.rootNodeId).size,g.nodes.length,'all output lanes must be reachable from the ramp attachment');
  assert.equal(g.edges.length-g.nodes.length+1,g.cycleCount);
  assert.ok(g.cycleCount>0&&g.hasPerimeterLoop);
  assert.equal(g.deadEndCount,0);
  assert.equal(adj.filter((es,i)=>es.length===1&&i!==g.rootNodeId).length,0);
  for(const side of ['l','r'])assert.ok(g.edges.some(e=>e.roles.includes(side)&&e.onCycle),side+' return must belong to a cycle');
  for(const e of g.edges)assert.equal(visit(e.a,e.id).has(e.b),e.onCycle,'cycle edges need an independent return route');
  const mass=input.mass.map(p=>rotate(p,-result.angleDeg));
  for(const s of result.stalls){
    const b=bounds(s.pts.map(p=>rotate(p,-result.angleDeg))),h=result.aisleMm/2,front=s.side==='b'?[(b[0]+b[2])/2,b[3]+h]:s.side==='t'?[(b[0]+b[2])/2,b[1]-h]:s.side==='l'?[b[2]+h,(b[1]+b[3])/2]:[b[0]-h,(b[1]+b[3])/2];
    assert.ok(U._internal.rectInside(b,mass),'stall outside the footprint');
    assert.ok(g.edges.some(e=>{if(!e.onCycle)return false;const a=rotate(g.nodes[e.a].p,-result.angleDeg),b=rotate(g.nodes[e.b].p,-result.angleDeg),dx=b[0]-a[0],dy=b[1]-a[1],t=((front[0]-a[0])*dx+(front[1]-a[1])*dy)/(dx*dx+dy*dy);return t>=-1e-4&&t<=1.0001&&Math.hypot(front[0]-a[0]-t*dx,front[1]-a[1]-t*dy)<2;}),'parking must front a lane with a return route');
    for(const p of [...result.aisles,...result.columns,...input.cores,result.ramp.body,result.ramp.landing])assert.ok(!overlap(s.pts,p),'stall overlaps a drive area, obstruction, or column');
  }
  for(let i=0;i<result.stalls.length;i++)for(let j=i+1;j<result.stalls.length;j++)assert.ok(!overlap(result.stalls[i].pts,result.stalls[j].pts),'duplicate/overlapping parking');
  for(const p of result.aisles){assert.ok(contained(p,input.mass),'drive area outside the footprint');for(const q of [...input.cores,result.ramp.body])assert.ok(!overlap(p,q),'drive area intersects an obstruction');}
}
function scene(w=67200,h=50400,angle=0){return{mass:rect(0,0,w,h),cores:[rect(w*.42,h*.48,8400,8400)],ramp:{x:w/2,y:4200,angleDeg:90,lengthMm:18000,widthMm:6000},grid:{gx:8400,gy:8000,angleDeg:angle}};}

test('mass size and 0/90/near-90 grid directions retain real exterior return cycles',()=>{
  for(const[w,h]of [[64800,48000],[67200,50400],[68000,50000],[70000,52000]])for(const angle of [0,89.99,90]){
    const input=scene(w,h,angle),r=U.generate(input);inspect(r,input);
    assert.ok(r.stalls.some(s=>s.side==='l'||s.side==='r'),`${w}×${h}, ${angle}: missing exterior parking`);
  }
});
test('moving the ramp inside the floor still connects to the return loop',()=>{
  for(const angle of [0,90])for(const[x,y]of [[33600,18000],[14000,12000]]){
    const input=scene(67200,50400,angle);input.cores=[rect(28000,24000,8400,8400)];Object.assign(input.ramp,{x,y});inspect(U.generate(input),input);
  }
});
test('a rotated complete scene preserves layout geometry and parking counts',()=>{
  const base=scene(),r0=U.generate(base),angle=37,p=rotate([base.ramp.x,base.ramp.y],angle),input={...base,mass:base.mass.map(v=>rotate(v,angle)),cores:base.cores.map(c=>c.map(v=>rotate(v,angle))),ramp:{...base.ramp,x:p[0],y:p[1],angleDeg:base.ramp.angleDeg+angle},grid:{...base.grid,angleDeg:angle}},r=U.generate(input);
  inspect(r,input);assert.equal(r.stallCount,r0.stallCount);
});
test('diagonal grids either meet the same geometry checks or return zero parking',()=>{
  let supported=0;for(const angle of [15,30,45]){const input=scene(67200,50400,angle),r=U.generate(input);if(r.valid){inspect(r,input);supported++;}else{assert.equal(r.status,'INFEASIBLE');assert.equal(r.stallCount,0);assert.ok(r.violations.some(v=>v.id==='NO_LOOP'||v.id==='LANDING'));}}
  assert.ok(supported>=1,'diagonal construction should support usable inscribed layouts');
});
test('touching, blocked, and undersized ramp connections are not accepted as access',()=>{
  const outside=scene();outside.ramp.x=-6000;outside.ramp.y=10000;
  const blocked=scene();blocked.cores=[rect(27000,4200,14000,12000)];
  const narrow=scene(20000,15000);narrow.cores=[];
  for(const input of [outside,blocked,narrow]){const r=U.generate(input);assert.equal(r.status,'INFEASIBLE');assert.equal(r.stallCount,0);}
});
test('overlap between the ramp body and a core prevents a valid result',()=>{
  const input=scene();input.ramp.y=20000;input.cores=[rect(31000,5000,5000,7000)];
  const r=U.generate(input);assert.equal(r.status,'INFEASIBLE');assert.equal(r.stallCount,0);assert.ok(r.violations.some(v=>v.id==='RAMP_CORE'));
});
test('the automatic angle does not flip the rectangular module for numerical 90 degree noise',()=>{
  const p=rect(0,0,67200,50400).map(v=>rotate(v,89.99));assert.equal(U._internal.autoAngle(p),0);
});
