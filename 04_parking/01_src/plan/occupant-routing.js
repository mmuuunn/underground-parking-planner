/* Optional local detours. Occupants and the fixed grid never move.
 * A visibility graph around clearance boxes proposes only full-width paths.
 * The independent final verifier remains authoritative.
 */
(function(root){
  'use strict';
  const G=typeof module!=='undefined'&&module.exports?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const {CL,add,sub,mul,len,rectPoly,clipSeg,boolOp,areaOf}=G;
  const area=paths=>Math.abs(areaOf(paths));
  function bypass(frame,segs,allowed,occupants,columns=[]){
    const half=frame.a/2,margin=half+100,expand=b=>[b[0]-margin,b[1]-margin,b[2]+margin,b[3]+margin];
    const occupantBoxes=occupants.map(c=>expand(c.r)),columnBoxes=columns.map(P=>expand(G.bbox(P)));
    const boxes=occupantBoxes.concat(columnBoxes),blocked=occupants.map(c=>rectPoly(c.r)).concat(columns);
    // 기둥은 충돌 검사에는 모두 쓰고, 경로 후보는 막힌 자리 근처에서만 만든다.
    const candidateBoxes=occupantBoxes.concat(columnBoxes.filter(b=>occupantBoxes.some(o=>b[0]<o[2]+frame.a*2&&b[2]>o[0]-frame.a*2&&b[1]<o[3]+frame.a*2&&b[3]>o[1]-frame.a*2)));
    const pieces=[],created=[],failed=[];let blockedCount=0;
    const clear=P=>area(boolOp([P],allowed,CL.ClipType.ctDifference))<=1e4&&area(boolOp([P],blocked,CL.ClipType.ctIntersection))<=1e4;
    const square=p=>rectPoly([p[0]-half,p[1]-half,p[0]+half,p[1]+half]);
    function visible(p,q){
      if(len(sub(q,p))<1)return false;
      if(boxes.some(b=>clipSeg(p,q,[b[0]+1,b[1]+1,b[2]-1,b[3]-1])))return false;
      const u=G.norm(sub(q,p)),n=[-u[1]*half,u[0]*half];
      return clear([add(p,n),add(q,n),sub(q,n),sub(p,n)]);
    }
    function path(start,end){
      const corners=candidateBoxes.flatMap(b=>rectPoly(b)).filter(p=>clear(square(p))).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const points=[start,end,...corners],dist=points.map(()=>Infinity),prev=[],done=new Set();dist[0]=0;
      while(done.size<points.length){let at=-1;for(let i=0;i<points.length;i++)if(!done.has(i)&&(at<0||dist[i]<dist[at]))at=i;
        if(at<0||!Number.isFinite(dist[at]))return null;if(at===1)break;done.add(at);
        for(let j=0;j<points.length;j++)if(!done.has(j)&&visible(points[at],points[j])){const next=dist[at]+len(sub(points[j],points[at]));if(next<dist[j]-.01){dist[j]=next;prev[j]=at;}}
      }
      if(!Number.isFinite(dist[1]))return null;const out=[end];for(let i=1;i!==0;){i=prev[i];if(i===undefined)return null;out.push(points[i]);}return out.reverse();
    }
    for(const s of segs){
      const cuts=occupantBoxes.map(b=>clipSeg(s.a,s.b,b)).filter(Boolean).sort((a,b)=>a[0]-b[0]),merged=[];
      for(const c of cuts){const last=merged.at(-1);if(last&&c[0]<=last[1]+1e-8)last[1]=Math.max(last[1],c[1]);else merged.push(c.slice());}
      if(!merged.length){pieces.push({...s,cut:false});continue;}
      blockedCount++;
      const point=t=>add(s.a,mul(sub(s.b,s.a),t));let last=0;
      for(const[t0,t1]of merged){
        if((t0-last)*len(sub(s.b,s.a))>300)pieces.push({...s,a:point(last),b:point(t0),cut:true});
        // A node swallowed by the occupant is removed; remaining adjacent
        // roads can join another detour rather than inventing an inside route.
        if(t0>1e-6&&t1<1-1e-6){
          const p=point(t0),q=point(t1),route=path(p,q);
          if(route){created.push(route);for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];pieces.push({a,b,kind:'bypass',cut:true,h:G.isH(a,b)?(a[1]+b[1])/2:null,v:G.isV(a,b)?(a[0]+b[0])/2:null});}}
          else failed.push({a:p,b:q});
        }
        last=t1;
      }
      if((1-last)*len(sub(s.b,s.a))>300)pieces.push({...s,a:point(last),cut:true});
    }
    return {pieces,created,failed,blockedCount};
  }
  const api={bypass};if(typeof module!=='undefined'&&module.exports)module.exports=api;else(root.UGP=root.UGP||{}).occupantRouting=api;
})(this);
