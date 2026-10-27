/* 지하주차 계획 엔진 v0.4.
 * 정사각 셀이 아니라 직사각 구조 모듈(gx, gy)을 사용한다.
 * 실제 주차깊이와 실제 차로폭으로 주차열·차로를 만들고, 성립하지 않는 안은 상태와 이유를 돌려준다.
 */
(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({gx:8100, gy:8000, columnMm:600, stallW:2500, stallD:5000, aisleMinMm:6000, wallMm:0, angleDeg:null, ox:null, oy:null});
  const MODULES = Object.freeze([
    {id:'general-compact', name:'일반형 기본 RC', gx:8100, gy:8000, note:'일반형 3대 · 6.0m 차로'},
    {id:'general-roomy', name:'일반형 여유', gx:8400, gy:8000, note:'일반형 3대 · 폭 여유'},
    {id:'expanded', name:'확장형 중심', gx:8400, gy:8200, stallW:2600, stallD:5200, note:'확장형 3대 · 6.0m 차로'},
    {id:'service', name:'큰 기둥·설비 여유', gx:8700, gy:8200, note:'일반형 3대 · 구조 여유'}
  ]);
  const REASONS = Object.freeze({wall:'외벽(실내 면) 밖', obstacle:'코어·램프와 겹침', landing:'램프 착지와 겹침', unreachable:'램프에서 닿지 않음', deadEnd:'돌아 나올 차로 없음', junction:'차로 접속·회전 여유', column:'기둥과 겹침'});
  const finite = Number.isFinite;
  const rot = (p,d) => { const a=d*Math.PI/180,c=Math.cos(a),s=Math.sin(a); return [p[0]*c-p[1]*s,p[0]*s+p[1]*c]; };
  const rectPoly = r => [[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]];
  const bbox = p => { let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for(const [x,y] of p){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);} return [x0,y0,x1,y1]; };
  const boxHit = (a,b) => a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3];
  const cross = (a,b,c,d) => { const z=(o,p,q)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]),ab=.01*Math.hypot(b[0]-a[0],b[1]-a[1]),cd=.01*Math.hypot(d[0]-c[0],d[1]-c[1]),u=z(a,b,c),v=z(a,b,d),w=z(c,d,a),t=z(c,d,b);return ((u>ab&&v< -ab)||(u< -ab&&v>ab))&&((w>cd&&t< -cd)||(w< -cd&&t>cd)); };
  const edges = p => p.map((a,i)=>[a,p[(i+1)%p.length]]);
  function inside(poly,p){let s=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])s=!s;}return s;}
  const strictlyIn=(r,p)=>p[0]>r[0]&&p[0]<r[2]&&p[1]>r[1]&&p[1]<r[3];
  const crossesAny=(r,p)=>edges(rectPoly(r)).some(([a,b])=>edges(p).some(([c,d])=>cross(a,b,c,d)));
  function rectInside(r,p){const q=[r[0]+1,r[1]+1,r[2]-1,r[3]-1];return rectPoly(q).every(x=>inside(p,x))&&!p.some(x=>strictlyIn(q,x))&&!crossesAny(q,p);}
  function rectHits(r,p,pb=bbox(p)){if(!boxHit(r,pb))return false;const q=[r[0]+1,r[1]+1,r[2]-1,r[3]-1],m=[(q[0]+q[2])/2,(q[1]+q[3])/2];return rectPoly(q).some(x=>inside(p,x))||p.some(x=>strictlyIn(q,x))||crossesAny(q,p)||inside(p,m);}
  function autoAngle(p){let z={L:-1,a:0};p.forEach((a,i)=>{const b=p[(i+1)%p.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L>z.L)z={L,a:((Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI)%90+90)%90};});const a=Math.round(z.a*1e4)/1e4;return a<.02||90-a<.02?0:a;}
  function insetPoly(poly,d){if(!(d>0))return poly;const CL=typeof module!=='undefined'&&module.exports?require('../../../../00_shared/lib/clipper.js'):root.ClipperLib,co=new CL.ClipperOffset(2,2),out=new CL.Paths();co.AddPath(poly.map(([X,Y])=>({X:Math.round(X),Y:Math.round(Y)})),CL.JoinType.jtMiter,CL.EndType.etClosedPolygon);co.Execute(out,-d);if(!out.length)throw new RangeError('외벽 두께를 빼면 남는 면적이 없습니다');const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.X*b.Y-b.X*a.Y;},0));return out.sort((a,b)=>area(b)-area(a))[0].map(q=>[q.X,q.Y]);}
  function rampShapes(r){
    const a=r.angleDeg*Math.PI/180,u=[Math.cos(a),Math.sin(a)],n=[-u[1],u[0]],h=r.widthMm/2,P=[r.x,r.y],at=(s,t)=>[P[0]+u[0]*s+n[0]*t,P[1]+u[1]*s+n[1]*t],landing=W=>[at(0,-Math.max(h,W/2)),at(W,-Math.max(h,W/2)),at(W,Math.max(h,W/2)),at(0,Math.max(h,W/2))];
    if(r.type!=='curve')return{type:'straight',u,length:r.lengthMm,start:at(-r.lengthMm,0),body:[at(-r.lengthMm,-h),at(0,-h),at(0,h),at(-r.lengthMm,h)],landing};
    const R=r.radiusMm,sg=Math.sign(r.sweepDeg)||1,sw=Math.min(359,Math.abs(r.sweepDeg))*Math.PI/180,C=[P[0]+n[0]*R*sg,P[1]+n[1]*R*sg],v=[P[0]-C[0],P[1]-C[1]],pt=(rad,t)=>{const L=Math.hypot(...v),q=rot([v[0]/L*rad,v[1]/L*rad],-sg*t*180/Math.PI);return[C[0]+q[0],C[1]+q[1]];},k=Math.max(6,Math.ceil(sw/(Math.PI/36))),ts=[...Array(k+1)].map((_,i)=>sw*i/k);return{type:'curve',u,length:R*sw,innerRadius:R-h,start:pt(R,sw),body:ts.map(t=>pt(R+h,t)).concat(ts.slice().reverse().map(t=>pt(R-h,t))),landing};
  }
  function normalize(input){
    if(!input||!Array.isArray(input.mass)||input.mass.length<3)throw new TypeError('지하층 외곽이 필요합니다');
    const cfg={...DEFAULTS,...(input.grid||{})},cores=input.cores||[],ramp=input.ramp||null;
    for(const k of ['gx','gy','columnMm','stallW','stallD','aisleMinMm'])if(!finite(cfg[k])||cfg[k]<=0)throw new RangeError(k+' 값이 올바르지 않습니다');
    if(!finite(cfg.wallMm)||cfg.wallMm<0)throw new RangeError('외벽 두께는 0 이상이어야 합니다');
    if(ramp&&(!finite(ramp.x)||!finite(ramp.y)||!finite(ramp.angleDeg)||!finite(ramp.widthMm)||ramp.widthMm<=0))throw new TypeError('램프 값이 올바르지 않습니다');
    if(ramp&&ramp.type==='curve'&&(!finite(ramp.radiusMm)||ramp.radiusMm<=ramp.widthMm/2||!finite(ramp.sweepDeg)))throw new TypeError('곡선 램프 반경·회전각이 올바르지 않습니다');
    if(ramp&&ramp.type!=='curve'&&(!finite(ramp.lengthMm)||ramp.lengthMm<=0))throw new TypeError('직선 램프 길이가 올바르지 않습니다');
    return{mass:input.mass,cores,ramp,cfg};
  }
  const EPS=.05;
  const near=(a,b)=>Math.abs(a-b)<EPS;
  const pointOn=(p,a,b)=>Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))<=EPS*Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1]))&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
  const onBoundary=(poly,p)=>edges(poly).some(([a,b])=>pointOn(p,a,b));
  const strictInside=(poly,p)=>inside(poly,p)&&!onBoundary(poly,p);
  function polyHits(p,q){if(!boxHit(bbox(p),bbox(q)))return false;return p.some(v=>strictInside(q,v))||q.some(v=>strictInside(p,v))||edges(p).some(([a,b])=>edges(q).some(([c,d])=>cross(a,b,c,d)))||strictInside(q,p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]));}
  function polyInside(p,mass){return p.every(v=>inside(mass,v)||onBoundary(mass,v))&&edges(p).every(([a,b])=>{const m=[(a[0]+b[0])/2,(a[1]+b[1])/2];return (inside(mass,m)||onBoundary(mass,m))&&!edges(mass).some(([c,d])=>cross(a,b,c,d));})&&!mass.some(v=>strictInside(p,v));}
  const lineRect=(s,a)=>[Math.min(s.p[0],s.q[0])-a/2,Math.min(s.p[1],s.q[1])-a/2,Math.max(s.p[0],s.q[0])+a/2,Math.max(s.p[1],s.q[1])+a/2];
  function planningBounds(poly){
    const b=bbox(poly);if(rectInside(b,poly))return b;
    const w=b[2]-b[0],h=b[3]-b[1],shapes=[[1,1],[.8,1],[.6,1],[1,.8],[1,.6]],centers=[[.5,.5],[.35,.35],[.65,.35],[.35,.65],[.65,.65]];let best=null,area=0;
    // The box is a conservative planning envelope, not the polygon's bounding
    // box. In particular a 89.99° rectangle must not put its edge stalls outside.
    for(const [cx,cy] of centers)for(const [sx,sy] of shapes){const x=b[0]+w*cx,y=b[1]+h*cy;if(!inside(poly,[x,y]))continue;let lo=0,hi=1;for(let i=0;i<22;i++){const m=(lo+hi)/2,r=[x-w*sx*m/2,y-h*sy*m/2,x+w*sx*m/2,y+h*sy*m/2];if(rectInside(r,poly))lo=m;else hi=m;}const r=[x-w*sx*lo/2+1,y-h*sy*lo/2+1,x+w*sx*lo/2-1,y+h*sy*lo/2-1],a=(r[2]-r[0])*(r[3]-r[1]);if(a>area&&r[2]>r[0]&&r[3]>r[1]){area=a;best=r;}}
    return best||b;
  }

  // A sweep returns maximal, full-width corridors. Polygon vertices and the
  // intersections at both strip edges are the only places feasibility changes.
  // This is independent of the structural x module and never joins a thin overlap.
  function stripRuns(K,axis,at,width){
    const t=axis==='h'?0:1,v=1-t,lo=at-width/2,hi=at+width/2,cut=[K.mb[t],K.mb[t+2]];
    for(const p of [K.mass,...K.obstacles.map(o=>o.p)])for(const [a,b] of edges(p)){
      if(a[v]>=lo-EPS&&a[v]<=hi+EPS)cut.push(a[t]);
      if(!near(a[v],b[v]))for(const y of [lo,hi])if(y>=Math.min(a[v],b[v])-EPS&&y<=Math.max(a[v],b[v])+EPS)cut.push(a[t]+(b[t]-a[t])*(y-a[v])/(b[v]-a[v]));
    }
    const xs=[...new Set(cut.map(x=>Math.round(x*1000)/1000))].sort((a,b)=>a-b),runs=[];
    for(let i=1;i<xs.length;i++){
      if(xs[i]-xs[i-1]<EPS)continue;
      const r=axis==='h'?[xs[i-1],lo,xs[i],hi]:[lo,xs[i-1],hi,xs[i]];
      if(!K.free(r))continue;
      const last=runs.at(-1);if(last&&near(last[1],xs[i-1]))last[1]=xs[i];else runs.push([xs[i-1],xs[i]]);
    }
    return runs.filter(r=>r[1]-r[0]>width+EPS).map(r=>({p:axis==='h'?[r[0]+width/2,at]:[at,r[0]+width/2],q:axis==='h'?[r[1]-width/2,at]:[at,r[1]-width/2],axis}));
  }

  // Centerline intersections are valid because every segment includes an a×a
  // clear square at both ends. Collinear overlap is split and deduplicated too.
  function makeGraph(lines){
    const cuts=lines.map(s=>[s.p,s.q]),nodes=[],nodeMap=new Map(),links=[],linkMap=new Map();
    for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
      const a=lines[i],b=lines[j];
      if(a.axis!==b.axis){const h=a.axis==='h'?a:b,v=a.axis==='v'?a:b,p=[v.p[0],h.p[1]];if(pointOn(p,a.p,a.q)&&pointOn(p,b.p,b.q)){cuts[i].push(p);cuts[j].push(p);}}
      else for(const p of [a.p,a.q,b.p,b.q])if(pointOn(p,a.p,a.q)&&pointOn(p,b.p,b.q)){cuts[i].push(p);cuts[j].push(p);}
    }
    const id=p=>{const key=p.map(x=>Math.round(x*100)).join(',');if(!nodeMap.has(key)){nodeMap.set(key,nodes.length);nodes.push({id:nodes.length,p:[...p]});}return nodeMap.get(key);};
    lines.forEach((s,i)=>{const t=s.axis==='h'?0:1,ps=cuts[i].sort((a,b)=>a[t]-b[t]);for(let k=1;k<ps.length;k++){if(Math.hypot(ps[k][0]-ps[k-1][0],ps[k][1]-ps[k-1][1])<EPS)continue;const a=id(ps[k-1]),b=id(ps[k]),key=[Math.min(a,b),Math.max(a,b)].join(',');let e=linkMap.get(key);if(!e){e={id:links.length,a,b,axis:s.axis,roles:[]};links.push(e);linkMap.set(key,e);}if(!e.roles.includes(s.role))e.roles.push(s.role);}});
    return{nodes,edges:links};
  }
  function graphInfo(g,rootId=null){
    const adj=g.nodes.map(()=>[]);for(const e of g.edges){adj[e.a].push([e.b,e.id]);adj[e.b].push([e.a,e.id]);}
    const seen=new Set(),components=[];for(const n of g.nodes){if(seen.has(n.id))continue;const ns=[],todo=[n.id];seen.add(n.id);while(todo.length){const u=todo.pop();ns.push(u);for(const[v]of adj[u])if(!seen.has(v)){seen.add(v);todo.push(v);}}components.push(ns);}
    let time=0;const disc=[],low=[],bridges=new Set();function dfs(u,pe){disc[u]=low[u]=++time;for(const[v,eid]of adj[u]){if(eid===pe)continue;if(!disc[v]){dfs(v,eid);low[u]=Math.min(low[u],low[v]);if(low[v]>disc[u])bridges.add(eid);}else low[u]=Math.min(low[u],disc[v]);}}for(const n of g.nodes)if(!disc[n.id])dfs(n.id,-1);
    const reached=new Set();if(rootId!==null){const todo=[rootId];reached.add(rootId);while(todo.length){const u=todo.pop();for(const[v]of adj[u])if(!reached.has(v)){reached.add(v);todo.push(v);}}}
    return{adj,components,bridges,reached,cycleRank:g.edges.length-g.nodes.length+components.length,deadEndCount:adj.filter((es,i)=>es.length===1&&i!==rootId).length};
  }
  function cyclicLines(g){
    const info=graphInfo(g),out=[];for(const e of g.edges)if(!info.bridges.has(e.id))out.push({p:g.nodes[e.a].p,q:g.nodes[e.b].p,axis:e.axis,role:e.roles.find(r=>['l','r','top','bottom'].includes(r))||'row'});
    return mergeLines(out);
  }
  function mergeLines(lines){
    const groups=new Map();for(const s of lines){const key=[s.axis,s.role,Math.round(s.p[s.axis==='h'?1:0]*100)].join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
    const out=[];for(const group of groups.values()){const t=group[0].axis==='h'?0:1;group.sort((a,b)=>Math.min(a.p[t],a.q[t])-Math.min(b.p[t],b.q[t]));for(const s of group){const p=s.p[t]<=s.q[t]?[...s.p]:[...s.q],q=s.p[t]<=s.q[t]?[...s.q]:[...s.p],last=out.at(-1);if(last&&last.axis===s.axis&&last.role===s.role&&near(last.p[1-t],p[1-t])&&p[t]<=last.q[t]+EPS)last.q[t]=Math.max(last.q[t],q[t]);else out.push({...s,p,q});}}
    return out;
  }
  function accessRoute(K,start,lines){
    if(!lines.length)return null;
    const a=K.laneW,xs=[start[0]],ys=[start[1]];
    for(const s of lines)for(const p of [s.p,s.q]){xs.push(p[0]);ys.push(p[1]);}
    for(const o of K.obstacles){xs.push(o.b[0]-a/2-1,o.b[2]+a/2+1);ys.push(o.b[1]-a/2-1,o.b[3]+a/2+1);}
    xs.push(K.planBounds[0]+a/2,K.planBounds[2]-a/2);ys.push(K.planBounds[1]+a/2,K.planBounds[3]-a/2);
    const uniq=vs=>vs.sort((a,b)=>a-b).filter((v,i,arr)=>!i||!near(v,arr[i-1])),xx=uniq(xs),yy=uniq(ys),nodes=[],ids=new Map();let root=null;
    for(let i=0;i<xx.length;i++)for(let j=0;j<yy.length;j++){const p=[xx[i],yy[j]];if(!K.free([p[0]-a/2,p[1]-a/2,p[0]+a/2,p[1]+a/2]))continue;const id=nodes.length;nodes.push({p,i,j,goal:lines.some(s=>pointOn(p,s.p,s.q)),cost:Infinity,prev:null,done:false});ids.set(i+','+j,id);if(Math.hypot(p[0]-start[0],p[1]-start[1])<EPS)root=id;}
    if(root===null)return null;nodes[root].cost=0;
    for(;;){let id=null;for(let i=0;i<nodes.length;i++)if(!nodes[i].done&&finite(nodes[i].cost)&&(id===null||nodes[i].cost<nodes[id].cost))id=i;if(id===null)return null;const cur=nodes[id];cur.done=true;
      if(cur.goal){const points=[];for(let j=id;j!==null;j=nodes[j].prev)points.push(nodes[j].p);points.reverse();const path=[];for(let j=1;j<points.length;j++)path.push({p:points[j-1],q:points[j],axis:near(points[j-1][1],points[j][1])?'h':'v',role:'access'});return{path:mergeLines(path),cost:cur.cost,target:cur.p};}
      for(const[di,dj]of [[-1,0],[1,0],[0,-1],[0,1]]){const next=ids.get((cur.i+di)+','+(cur.j+dj));if(next===undefined||nodes[next].done)continue;const q=nodes[next],cost=cur.cost+Math.hypot(q.p[0]-cur.p[0],q.p[1]-cur.p[1]);if(cost>=q.cost)continue;const s={p:cur.p,q:q.p};if(K.free(lineRect(s,a))){q.cost=cost;q.prev=id;}}
    }
  }
  function rampAccess(K,lines){
    if(!K.rampL||!K.landing||!K.polyFree(K.landing))return null;
    const cacheKey=JSON.stringify(lines.map(s=>[s.p,s.q]));if(K.accessCache.has(cacheKey))return K.accessCache.get(cacheKey);
    const {p,u,width}=K.rampL,a=K.laneW,h=Math.max(width,a)/2,starts=[];let best=null;
    for(const dist of [a/2,a,a*1.5,a*2,a*3]){
      const q=[p[0]+u[0]*dist,p[1]+u[1]*dist],n=[-u[1]*h,u[0]*h],approach=[[p[0]+n[0],p[1]+n[1]],[q[0]+n[0],q[1]+n[1]],[q[0]-n[0],q[1]-n[1]],[p[0]-n[0],p[1]-n[1]]];
      if(!K.polyFree(approach)||!K.free([q[0]-a/2,q[1]-a/2,q[0]+a/2,q[1]+a/2]))continue;
      starts.push({q,p,approach,dist});
      for(const s of lines){const t=s.axis==='h'?0:1,target=[...s.p];target[t]=Math.max(s.p[t],Math.min(s.q[t],q[t]));
        for(const corner of [[target[0],q[1]],[q[0],target[1]]]){
          const ps=[q,corner,target],path=[];let cost=dist;for(let i=1;i<ps.length;i++){if(Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1])<EPS)continue;path.push({p:ps[i-1],q:ps[i],axis:near(ps[i][1],ps[i-1][1])?'h':'v',role:'access'});cost+=Math.hypot(ps[i][0]-ps[i-1][0],ps[i][1]-ps[i-1][1]);}
          if(best&&cost>=best.cost)continue;if(path.every(s=>K.free(lineRect(s,a))))best={q,p,approach,path,cost,target};
        }
      }
    }
    if(!best)for(const s of starts){const route=accessRoute(K,s.q,lines);if(route){best={...s,...route,cost:s.dist+route.cost};break;}}
    K.accessCache.set(cacheKey,best);return best;
  }
  function layout(K,ox,oy){
    const {cfg,mb,landing}=K,pb=K.planBounds,{gx,gy,columnMm:c,stallW:w,stallD:d}=cfg,a=K.laneW,n=Math.floor((gx-c)/w),x=i=>ox+i*gx,y=k=>oy+(2*k+.5)*gy;
    const i0=Math.floor((mb[0]-ox)/gx)-1,i1=Math.ceil((mb[2]-ox)/gx)+1,k0=Math.floor((mb[1]-oy)/(2*gy))-1,k1=Math.ceil((mb[3]-oy)/(2*gy))+1,rows=[];
    for(let k=k0;k<=k1;k++)for(const s of stripRuns(K,'h',y(k),a))rows.push({...s,role:'row',k});
    let best=null;
    // Parking-depth and wall-side return aisles are independent geometric
    // candidates. A pair must create a real cycle before parking is considered.
    for(const insetL of [d,0])for(const insetR of [d,0]){
      const lx=pb[0]+insetL+a/2,rx=pb[2]-insetR-a/2;if(rx-lx<2*a)continue;
      const topOptions=[pb[1]+d+a/2,pb[1]+a/2,...K.obstacles.map(o=>o.b[3]+a/2).sort((a,b)=>a-b)],bottomOptions=[pb[3]-d-a/2,pb[3]-a/2,...K.obstacles.map(o=>o.b[1]-a/2).sort((a,b)=>b-a)],full=y=>y>=pb[1]+a/2-EPS&&y<=pb[3]-a/2+EPS&&K.free([lx-a/2,y-a/2,rx+a/2,y+a/2]),topY=topOptions.find(full)??topOptions[0],bottomY=bottomOptions.find(full)??bottomOptions[0];
      if(bottomY-topY<2*a)continue;
      const borderRows=[...stripRuns(K,'h',topY,a).map(s=>({...s,role:'top'})),...stripRuns(K,'h',bottomY,a).map(s=>({...s,role:'bottom'}))];
      const activeRows=[...rows.filter(s=>Math.abs(s.p[1]-topY)>=a+d&&Math.abs(s.p[1]-bottomY)>=a+d),...borderRows];
      const returns=[...stripRuns(K,'v',lx,a).map(s=>({...s,role:'l'})),...stripRuns(K,'v',rx,a).map(s=>({...s,role:'r'}))],rawGraph=makeGraph([...activeRows,...returns]),cycle=cyclicLines(rawGraph),access=rampAccess(K,cycle);
      let retained=cycle,g=makeGraph(cycle),rootId=null;
      if(access){
        // The attachment point must split its host even when the path has zero
        // length (the landing already lies on a corridor centerline).
        g=makeGraph([...cycle,...access.path,{p:access.q,q:access.q,axis:'h',role:'access'}]);
        rootId=g.nodes.find(n=>Math.hypot(n.p[0]-access.q[0],n.p[1]-access.q[1])<EPS)?.id;
        if(rootId!==undefined){const info=graphInfo(g,rootId);retained=cycle.filter(s=>g.nodes.some(n=>info.reached.has(n.id)&&pointOn(n.p,s.p,s.q)));g=makeGraph([...retained,...access.path,{p:access.q,q:access.q,axis:'h',role:'access'}]);rootId=g.nodes.find(n=>Math.hypot(n.p[0]-access.q[0],n.p[1]-access.q[1])<EPS)?.id;}
      }
      const connected=!!access&&rootId!==undefined&&rootId!==null,info=graphInfo(g,connected?rootId:null),hasLoop=info.cycleRank>0,hasPerimeterLoop=hasLoop&&retained.some(s=>s.role==='l')&&retained.some(s=>s.role==='r'),lanes=connected?mergeLines([...retained,...access.path]):[],aisles=lanes.map(s=>lineRect(s,a));
      const drivePolys=aisles.map(rectPoly);if(connected)drivePolys.push(access.approach);
      const junctions=[];for(const node of g.nodes){const es=info.adj[node.id],bend=es.length===2&&g.edges[es[0][1]].axis!==g.edges[es[1][1]].axis;if(es.length>=3||bend||(connected&&node.id===rootId)){const h=a/2+Math.max(1500,w/2);junctions.push([node.p[0]-h,node.p[1]-h,node.p[0]+h,node.p[1]+h]);}}
      const cols=[],h=c/2;for(let i=i0;i<=i1;i++)for(let j=Math.floor((mb[1]-oy)/gy);j<=Math.ceil((mb[3]-oy)/gy);j++){const r=[x(i)-h,oy+j*gy-h,x(i)+h,oy+j*gy+h];if(K.free(r)&&!drivePolys.some(p=>rectHits(r,p)))cols.push(r);}
      const stalls=[],excluded=Object.fromEntries(Object.keys(REASONS).map(k=>[k,[]])),lb=landing&&bbox(landing);
      const accept=(r,side,supported,kind='internal')=>{
        const why=!rectInside(r,K.mass)?'wall':K.obstacles.some(o=>rectHits(r,o.p,o.b))?'obstacle':landing&&rectHits(r,landing,lb)?'landing':drivePolys.some(p=>rectHits(r,p))||junctions.some(j=>boxHit(r,j))?'junction':!connected?'unreachable':!supported?'deadEnd':cols.some(q=>boxHit(r,q))?'column':stalls.some(s=>boxHit(r,bbox(s.pts)))?'junction':null;
        if(why)excluded[why].push(rectPoly(r));else stalls.push({pts:rectPoly(r),side,kind});
      };
      for(const rowY of [...new Set(activeRows.map(s=>s.p[1]))]){const support=retained.filter(s=>s.axis==='h'&&near(s.p[1],rowY));
        for(let i=i0;i<i1;i++){const start=x(i)+(gx-n*w)/2;for(const side of ['b','t'])for(let m=0;m<n;m++){const yy=side==='b'?rowY-a/2-d:rowY+a/2,r=[start+m*w,yy,start+(m+1)*w,yy+d],supported=support.some(s=>r[0]>=s.p[0]-EPS&&r[2]<=s.q[0]+EPS),perimeter=(near(rowY,topY)&&side==='b')||(near(rowY,bottomY)&&side==='t');accept(r,side,supported,perimeter?'perimeter':'internal');}}
      }
      for(const s of retained.filter(s=>s.role==='l'||s.role==='r')){
        const count=Math.floor((s.q[1]-s.p[1])/w),margin=(s.q[1]-s.p[1]-count*w)/2,sx=s.role==='l'?s.p[0]-a/2-d:s.p[0]+a/2;
        for(let m=0;m<count;m++)accept([sx,s.p[1]+margin+m*w,sx+d,s.p[1]+margin+(m+1)*w],s.role,true,'perimeter');
      }
      const dead=activeRows.filter(s=>!retained.some(t=>t.axis==='h'&&near(t.p[1],s.p[1])&&t.p[0]<=s.q[0]&&t.q[0]>=s.p[0])).map(s=>lineRect(s,a)),perimeterCount=stalls.filter(s=>s.kind==='perimeter').length,sideParking=stalls.filter(s=>s.side==='l'||s.side==='r').length;
      const circulation={hasLoop,hasPerimeterLoop,connected,componentCount:connected?info.components.length:0,cycleCount:info.cycleRank,deadEndCount:connected?info.deadEndCount:0,rootNodeId:connected?rootId:null,nodes:g.nodes,edges:g.edges.map(e=>({...e,onCycle:!info.bridges.has(e.id)})),perimeterStallCount:perimeterCount,clearWidthMm:a};
      const result={stalls,excluded,aisles,drivePolys,dead,cols,crossCount:retained.filter(s=>s.role==='l'||s.role==='r').length,origin:{ox,oy},circulation,score:(connected&&hasPerimeterLoop?1e8:0)+(sideParking>=2?1e6:0)+stalls.length*1000+perimeterCount*20-(access?access.cost/1000:0),access};
      if(!best||result.score>best.score)best=result;
    }
    if(best)return best;
    return{stalls:[],excluded:Object.fromEntries(Object.keys(REASONS).map(k=>[k,[]])),aisles:[],drivePolys:[],dead:rows.map(s=>lineRect(s,a)),cols:[],crossCount:0,origin:{ox,oy},score:-1,circulation:{hasLoop:false,hasPerimeterLoop:false,connected:false,componentCount:0,cycleCount:0,deadEndCount:0,rootNodeId:null,nodes:[],edges:[],perimeterStallCount:0,clearWidthMm:a}};
  }
  function generate(input){
    const {mass,cores,ramp,cfg}=normalize(input),aisle=2*cfg.gy-2*cfg.stallD,n=Math.floor((cfg.gx-cfg.columnMm)/cfg.stallW);
    if(n<3)throw new RangeError('가로 모듈에 주차칸 3대와 기둥이 들어가지 않습니다');
    if(aisle<cfg.aisleMinMm)throw new RangeError('세로 모듈로 만든 차로가 최소 폭보다 좁습니다');
    if(cfg.stallD<(cfg.gy+cfg.columnMm)/2)throw new RangeError('기둥이 실제 차로 안으로 들어옵니다 — 세로 모듈을 줄이거나 주차 깊이를 늘리세요');
    const inner=insetPoly(mass,cfg.wallMm),angle=finite(cfg.angleDeg)?cfg.angleDeg:autoAngle(inner),L=p=>rot(p,-angle),W=p=>rot(p,angle).map(Math.round),massL=inner.map(L),rs=ramp?rampShapes(ramp):null,landing=rs?rs.landing(aisle).map(L):null,obs=cores.map(p=>p.map(L)).concat(rs?[rs.body.map(L)]:[]).map(p=>({p,b:bbox(p)})),mb=bbox(massL),K={cfg,mass:massL,mb,obstacles:obs,landing,laneW:aisle,rampL:rs?{p:L([ramp.x,ramp.y]),u:L(rs.u),width:ramp.widthMm}:null};
    K.planBounds=planningBounds(massL);K.accessCache=new Map();
    K.free=r=>r[2]-r[0]>EPS&&r[3]-r[1]>EPS&&rectInside(r,massL)&&!obs.some(o=>rectHits(r,o.p,o.b));
    K.polyFree=p=>polyInside(p,massL)&&!obs.some(o=>polyHits(p,o.p));
    const xs=finite(cfg.ox)?[cfg.ox]:[...Array(8)].map((_,i)=>mb[0]+i*cfg.gx/8),ys=finite(cfg.oy)?[cfg.oy]:[...Array(8)].map((_,i)=>mb[1]+i*2*cfg.gy/8);let best=null;for(const ox of xs)for(const oy of ys){const q=layout(K,ox,oy);if(!best||q.score>best.score)best=q;}
    const rampCoreConflict=!!rs&&cores.some(p=>polyHits(rs.body,p));
    const violations=[];if(!ramp)violations.push({id:'LANDING',note:'램프가 없어 유효 배치를 확정할 수 없습니다'});else if(!best.circulation.connected)violations.push({id:'LANDING',note:'램프 착지에서 순환차로까지 필요한 폭의 진입로를 확보하지 못했습니다'});if(!best.circulation.hasPerimeterLoop)violations.push({id:'NO_LOOP',note:'양쪽 외곽 반환차로로 돌아 나오는 폐쇄 순환을 만들지 못했습니다'});if(best.circulation.deadEndCount)violations.push({id:'DEAD_END',note:'돌아 나올 수 없는 차로 끝이 있습니다'});if(rampCoreConflict)violations.push({id:'RAMP_CORE',note:'램프 본체가 코어와 겹칩니다'});
    let rampInfo=null;if(rs){const curved=rs.type==='curve',slope=finite(input.floorMm)&&input.floorMm>0?input.floorMm/rs.length*100:null,max=curved?14:17,minW=curved?3600:3300,need=best.stalls.length<=50?5000:6000;rampInfo={type:rs.type,lengthMm:Math.round(rs.length),slopePct:slope===null?null:Math.round(slope*10)/10,maxSlopePct:max,innerRadiusMm:curved?Math.round(rs.innerRadius):null,needInnerRadiusMm:curved?need:null};if(slope!==null&&slope>max)violations.push({id:'RAMP_SLOPE',note:`램프 경사 ${Math.round(slope*10)/10}%가 기준을 넘습니다`});if(ramp.widthMm<minW)violations.push({id:'RAMP_WIDTH',note:'램프 폭이 기준보다 좁습니다'});if(curved&&rs.innerRadius<need)violations.push({id:'RAMP_RADIUS',note:'곡선 램프 내측 반경이 기준보다 작습니다'});}
    const ex=Object.fromEntries(Object.entries(best.excluded).map(([k,v])=>[k,v.map(p=>p.map(W))])),exCount=Object.fromEntries(Object.entries(ex).map(([k,v])=>[k,v.length])),valid=!!ramp&&!rampCoreConflict&&best.stalls.length>0&&best.circulation.connected&&best.circulation.hasPerimeterLoop&&best.circulation.deadEndCount===0,status=!valid?'INFEASIBLE':violations.length?'CONDITIONAL':'FEASIBLE';
    const glx=[],gly=[];for(let x=best.origin.ox+Math.floor((mb[0]-best.origin.ox)/cfg.gx)*cfg.gx;x<=mb[2]+cfg.gx;x+=cfg.gx)glx.push(x);for(let y=best.origin.oy+Math.floor((mb[1]-best.origin.oy)/cfg.gy)*cfg.gy;y<=mb[3]+cfg.gy;y+=cfg.gy)gly.push(y);
    return{schema:'ug-engine/0.4',status,valid,rules:'독립 주차열 후보 + 폭을 확보한 접속 + 램프 연결·폐쇄 순환 확인',angleDeg:angle,origin:best.origin,gridMm:null,moduleMm:{gx:cfg.gx,gy:cfg.gy},centerStallMm:cfg.stallW,aisleMm:aisle,stallCount:valid?best.stalls.length:0,lostCount:exCount.unreachable+exCount.deadEnd,columnCount:best.cols.length,crossCount:best.crossCount,excluded:ex,excludedCount:exCount,stalls:(valid?best.stalls:[]).map(s=>({pts:s.pts.map(W),side:s.side,kind:s.kind})),lost:ex.unreachable.concat(ex.deadEnd),aisles:best.drivePolys.map(p=>p.map(W)),deadAisles:best.dead.map(rectPoly).map(p=>p.map(W)),columns:best.cols.map(rectPoly).map(p=>p.map(W)),circulation:{...best.circulation,nodes:best.circulation.nodes.map(n=>({...n,p:W(n.p)})),junctionClearanceMm:Math.max(1500,cfg.stallW/2)},planningEnvelope:rectPoly(K.planBounds).map(W),limitations:['차량이 회전하며 차지하는 실제 궤적과 구조기둥의 연속성은 별도 검토가 필요합니다','사선·오목한 외곽은 내부에 들어오는 사각 범위로 후보를 제한합니다'],violations,warnings:violations.map(v=>v.note),innerOutline:cfg.wallMm?inner:null,gridLines:{angleDeg:angle,x:glx,y:gly,box:mb},ramp:rs?{...rampInfo,body:rs.body,landing:rs.landing(aisle),start:rs.start.map(Math.round)}:null};
  }
  function recommend(input){const out=[];for(const m of MODULES){try{const grid={...(input.grid||{}),gx:m.gx,gy:m.gy,stallW:m.stallW||(input.grid&&input.grid.stallW)||2500,stallD:m.stallD||(input.grid&&input.grid.stallD)||5000,ox:null,oy:null},r=generate({...input,grid});out.push({...m,stallCount:r.stallCount,status:r.status,violations:r.violations.length,aisleMm:r.aisleMm});}catch(e){out.push({...m,stallCount:0,status:'INFEASIBLE',error:e.message});}}return out.sort((a,b)=>b.stallCount-a.stallCount||a.violations-b.violations);}
  const api={generate,recommend,DEFAULTS,MODULES,REASONS,_internal:{rectInside,rectHits,inside,rampShapes,insetPoly,autoAngle,polyInside,polyHits,makeGraph,graphInfo}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.UGEngine=api;
})(this);
