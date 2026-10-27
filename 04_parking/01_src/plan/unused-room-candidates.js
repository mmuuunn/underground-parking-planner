/* Planning suggestions from the space left after aisles, stalls, ramp and cores.
 * These are uncommitted room shapes, not equipment or access approvals.
 * Structural columns may lie inside a suggestion and remain visible for review.
 */
(function (root) {
  'use strict';
  const isNode=typeof module!=='undefined'&&module.exports;
  const Geom=isNode?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const {CL,boolOp}=Geom;
  const turn=(p,deg)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [p[0]*c-p[1]*s,p[0]*s+p[1]*c];};
  const inside=(poly,p)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }return hit;};
  const squaredDistance=(p,r)=>{const dx=Math.max(r[0]-p[0],0,p[0]-r[2]),dy=Math.max(r[1]-p[1],0,p[1]-r[3]);return dx*dx+dy*dy;};
  const rightCorners=poly=>poly.filter((p,i)=>{
    const prev=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length];
    const a=[prev[0]-p[0],prev[1]-p[1]],b=[next[0]-p[0],next[1]-p[1]];
    return Math.hypot(...a)>1000&&Math.hypot(...b)>1000&&Math.abs((a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b)))<0.12;
  });
  function find(plan,options={}){
    if(!plan?.innerOutline||!plan.stallCount)return [];
    const step=options.stepMm||500,limit=options.limit||6,ucs=options.ucs||0;
    const occupied=[...(plan.aisles||[]),...(plan.stalls||[]).map(s=>s.pts),...(plan.cores||[]).map(c=>c.pts),...(plan.occupants||[]).map(c=>c.pts),...(plan.ramp?[plan.ramp.body]:[])];
    const paths=boolOp([plan.innerOutline],occupied,CL.ClipType.ctDifference).map(poly=>poly.map(p=>turn(p,-ucs)));
    if(!paths.length)return [];
    const outline=plan.innerOutline.map(p=>turn(p,-ucs));
    // The recurring pocket is usually made by a 90-degree aisle turn, not
    // necessarily by the outer wall. Examine both boundaries.
    const corners=[...rightCorners(outline),...(plan.aisles||[]).flatMap(p=>rightCorners(p.map(q=>turn(q,-ucs))))];
    const xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]);
    const x0=Math.floor(Math.min(...xs)/step)*step,y0=Math.floor(Math.min(...ys)/step)*step;
    const nx=Math.ceil((Math.max(...xs)-x0)/step),ny=Math.ceil((Math.max(...ys)-y0)/step);
    if(nx*ny>150000)return [];
    const cells=Array.from({length:ny},(_,y)=>Array.from({length:nx},(_,x)=>{
      const p=[x0+(x+.5)*step,y0+(y+.5)*step];return paths.reduce((n,poly)=>n+(inside(poly,p)?1:0),0)%2===1;
    }));
    const results=[];
    for(let pick=0;pick<limit;pick++){
      const heights=Array(nx).fill(0);let best=null;
      for(let y=0;y<ny;y++){
        for(let x=0;x<nx;x++)heights[x]=cells[y][x]?heights[x]+1:0;
        const stack=[];
        for(let x=0;x<=nx;x++){
          const h=x<nx?heights[x]:0;let start=x;
          while(stack.length&&stack.at(-1).h>h){
            const item=stack.pop();start=item.x;
            const w=x-start;if(w<4||item.h<4||Math.max(w,item.h)*step>10000||Math.max(w,item.h)/Math.min(w,item.h)>2.5)continue;
            const r=[x0+start*step,y0+(y-item.h+1)*step,x0+x*step,y0+(y+1)*step];
            const area=w*item.h*step*step/1e6;if(area<4)continue;
            const cornerIndex=corners.findIndex(p=>squaredDistance(p,r)<=1500*1500);
            const corner=cornerIndex>=0,score=(corner?100000:0)+area;
            if(!best||score>best.score)best={r,area,corner,cornerIndex,score,cell:[start,y-item.h+1,x,y+1]};
          }
          if(!stack.length||stack.at(-1).h<h)stack.push({x:start,h});
        }
      }
      if(!best||!best.corner)break;
      corners.splice(best.cornerIndex,1);
      const [xa,ya,xb,yb]=best.cell;
      for(let y=ya;y<yb;y++)for(let x=xa;x<xb;x++)cells[y][x]=false;
      const [a,b,c,d]=best.r;let polygon=null,areaM2=0;
      // Raster cells only nominate a rectangle. Verify the whole shape against
      // the exact geometry, reducing its boundary until it is fully clear.
      for(let inset=0;inset<=3*step;inset+=step/2){
        if(c-a-2*inset<2000||d-b-2*inset<2000)break;
        const q=[[a+inset,b+inset],[c-inset,b+inset],[c-inset,d-inset],[a+inset,d-inset]].map(p=>turn(p,ucs).map(Math.round));
        const clash=Math.abs(Geom.areaOf(boolOp([q],occupied,CL.ClipType.ctIntersection)));
        const outside=Math.abs(Geom.areaOf(boolOp([q],[plan.innerOutline],CL.ClipType.ctDifference)));
        if(clash<1e4&&outside<1e4){polygon=q;areaM2=(c-a-2*inset)*(d-b-2*inset)/1e6;break;}
      }
      if(polygon&&areaM2>=4)results.push({id:'unused-'+(results.length+1),polygon,areaM2:Math.round(areaM2*10)/10,nearRightCorner:best.corner,status:'review'});
    }
    return results;
  }
  const api={find};if(isNode)module.exports=api;else root.UGUnusedRooms=api;
})(this);
