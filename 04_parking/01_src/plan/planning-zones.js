/* Computed non-parking regions. Auto regions only consume unused floor;
 * explicit DA/PIT regions participate in placement and independent verification.
 */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports,G=node?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const {CL,boolOp,areaOf,signedArea,offsP}=G,I=CL.ClipType.ctIntersection,D=CL.ClipType.ctDifference,U=CL.ClipType.ctUnion;
  const A=P=>Math.abs(areaOf(P));
  function explicit(input){
    if(input.nonParkingZones!==undefined&&!Array.isArray(input.nonParkingZones))throw new RangeError('DA/PIT 영역은 목록으로 입력하세요');
    const zs=(input.nonParkingZones||[]).map((z,i)=>{
      if(!z||!['da','pit','keep'].includes(z.kind)||!Array.isArray(z.paths)||!z.paths.length)throw new RangeError('DA/PIT 영역의 종류와 경로를 확인하세요');
      if(z.paths.some(P=>!Array.isArray(P)||P.length<3||P.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||G.selfCrossing(P)))throw new RangeError('DA/PIT 경계가 올바르지 않습니다');
      const paths=boolOp(z.paths,[],U);if(A(paths)<1)throw new RangeError('DA/PIT 영역의 면적이 없습니다');
      return {id:z.id||'zone-'+i,kind:z.kind,paths,source:'input',areaM2:A(paths)/1e6,status:'planning'};
    });
    const ids=new Set();for(let i=0;i<zs.length;i++){if(ids.has(zs[i].id))throw new RangeError('DA/PIT 영역 번호가 중복됩니다');ids.add(zs[i].id);for(let j=0;j<i;j++)if(zs[i].kind!=='keep'&&zs[j].kind!=='keep'&&A(boolOp(zs[i].paths,zs[j].paths,I))>1e4)throw new RangeError('DA/PIT 계획 영역끼리 겹칩니다');}
    return zs;
  }
  function components(paths){
    const positives=paths.filter(P=>signedArea(P)>0),holes=paths.filter(P=>signedArea(P)<0);
    // A rounded vertex can sit just outside its parent edge. Other vertices
    // still identify the hole; never fill a column merely because h[0] moved.
    return positives.map(P=>[P,...holes.filter(h=>h.some(p=>CL.Clipper.PointInPolygon({X:p[0],Y:p[1]},G.toC(P))!==0))]);
  }
  function calculate(out,input,free){
    const manual=explicit(input),protectedPaths=out.cores.filter(c=>c.plan).map(c=>c.plan.walk);
    const keep=manual.filter(z=>z.kind==='keep').flatMap(z=>z.paths),usedManual=manual.filter(z=>z.kind!=='keep').flatMap(z=>z.paths);
    const available=boolOp(free,protectedPaths.concat(keep,usedManual),D),zones=manual.filter(z=>z.kind!=='keep').slice(),domain=out.parkingInnerPaths||[out.innerOutline];
    const assignments=explicit({nonParkingZones:input.zoneAssignments}),keptZones=[],usedAssignments=new Set();
    const ids=new Set(manual.map(z=>z.id)),nextId=prefix=>{let i=0;while(ids.has(prefix+i))i++;const id=prefix+i;ids.add(id);return id;};
    if(input.autoZones!==false||assignments.length){
      const depth=input.zoneSettings?.daDepthMm??3000,minArea=input.zoneSettings?.minAreaM2??0.5;
      if(!(depth>0&&Number.isFinite(depth)&&minArea>=0.1&&Number.isFinite(minArea)))throw new RangeError('잔여공간 정리 깊이와 최소 면적을 확인하세요');
      const outline=[out.innerOutline],wallBand=boolOp(outline,offsP(outline,-depth),D),contactBand=boolOp(outline,offsP(outline,-100),D);
      // Boolean intersections are rounded to integer mm. Keep generated regions
      // 2 mm inside the permitted contour to prevent rotated-edge roundoff slivers.
      const safe=boolOp(available,offsP(domain,-2),I),da=[];
      for(const paths of components(boolOp(safe,wallBand,I))){
        const area=A(paths),contact=A(boolOp(paths,contactBand,I))/100;
        if(area>=minArea*1e6&&contact>=2000){const z={id:nextId('auto-da-'),kind:'da',paths,source:'auto',status:'proposal',areaM2:area/1e6};da.push(z);zones.push(z);}
      }
      const rest=boolOp(safe,da.flatMap(z=>z.paths),D);
      for(const paths of components(rest))if(A(paths)>=4e6&&A(offsP(paths,-500))>=0.5e6)zones.push({id:nextId('auto-pit-'),kind:'pit',paths,source:'auto',status:'proposal',areaM2:A(paths)/1e6});
    }
    // A use change to an automatic proposal must not clip the normal stalls
    // which were replaced by wider accessible stalls earlier in this build.
    // Match the complete proposal geometry, so an old ID cannot reassign a new area.
    for(let i=zones.length-1;i>=0;i--){const z=zones[i];if(z.source!=='auto')continue;
      const a=assignments.find(a=>a.id===z.id&&A(boolOp(a.paths,z.paths,CL.ClipType.ctXor))<=1e4);if(!a)continue;
      usedAssignments.add(a.id);const assigned={...z,kind:a.kind,assigned:true,status:'planning'};
      if(a.kind==='keep'){zones.splice(i,1);keptZones.push(assigned);}else zones[i]=assigned;
    }
    // OFF still resolves saved designations, but must not add hidden automatic blockers.
    if(input.autoZones===false)for(let i=zones.length-1;i>=0;i--)if(zones[i].source==='auto'&&!zones[i].assigned)zones.splice(i,1);
    const boundary=out.planningBoundary;
    const gross=boundary?A(boundary.floorPaths)/1e6:Math.abs(signedArea(out.innerOutline))/1e6;
    // The depth experiment supplies synthetic input zones and keeps its previous ledger and wall deduction.
    if(out.depthHypothesis){
      const nonParking=boolOp(boolOp(zones.flatMap(z=>z.paths),[],U),domain,I),surface=boolOp(domain,nonParking,D);
      const remaining=boolOp(available,nonParking.concat(keptZones.flatMap(z=>z.paths)),D);
      return {zones,keptZones,unmatchedAssignments:assignments.filter(a=>!usedAssignments.has(a.id)).map(a=>a.id),parkingSurface:surface,remaining,areas:{accountingBasis:'legacy-depth-hypothesis/v1',floorEnvelopeM2:gross,innerM2:A(domain)/1e6,
        parkingSurfaceM2:A(surface)/1e6,nonParkingM2:A(nonParking)/1e6,keptFreeM2:A(boolOp(keep.concat(keptZones.flatMap(z=>z.paths)),free,I))/1e6,daM2:A(boolOp(boolOp(zones.filter(z=>z.kind==='da').flatMap(z=>z.paths),[],U),domain,I))/1e6,
        pitM2:A(boolOp(boolOp(zones.filter(z=>z.kind==='pit').flatMap(z=>z.paths),[],U),domain,I))/1e6,unassignedFreeM2:A(remaining)/1e6}};
    }
    const within=paths=>boolOp(boolOp(paths,[],U),domain,I),designated=zones.filter(z=>z.source==='input'||z.assigned);
    const da=within(designated.filter(z=>z.kind==='da').flatMap(z=>z.paths)),pit=within(designated.filter(z=>z.kind==='pit').flatMap(z=>z.paths));
    const specified=boolOp(da.concat(pit),[],U),occupied=within((out.occupants||[]).filter(c=>c.vehiclePassable!==true).map(c=>c.pts));
    const nonParking=boolOp(specified.concat(occupied),[],U),surface=boolOp(domain,nonParking,D);
    const residual=boolOp(within(free),protectedPaths.concat(nonParking),D),kept=boolOp(keep.concat(keptZones.flatMap(z=>z.paths)),residual,I),remaining=boolOp(residual,kept,D);
    return {zones,keptZones,unmatchedAssignments:assignments.filter(a=>!usedAssignments.has(a.id)).map(a=>a.id),parkingSurface:surface,remaining,areas:{floorEnvelopeM2:gross,innerM2:A(domain)/1e6,
      accountingBasis:'user-designated-and-physical/v1',parkingSurfaceM2:A(surface)/1e6,nonParkingM2:A(nonParking)/1e6,otherOccupiedM2:A(boolOp(occupied,specified,D))/1e6,
      keptFreeM2:A(kept)/1e6,daM2:A(da)/1e6,pitM2:A(pit)/1e6,unassignedFreeM2:A(remaining)/1e6}};
  }
  const api={explicit,calculate,components};if(node)module.exports=api;else(root.UGP=root.UGP||{}).zones=api;
})(this);
