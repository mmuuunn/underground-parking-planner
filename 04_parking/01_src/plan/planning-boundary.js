/* Separate the parking body (grid source) from the floor envelope including a ramp.
 * All contours use nonzero fill; independent outer rings are normalized before union.
 */
(function(root){
  'use strict';
  const G=typeof module!=='undefined'&&module.exports?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const {CL,boolOp,areaOf,signedArea,offsP}=G, D=CL.ClipType.ctDifference,U=CL.ClipType.ctUnion;
  function outer(P){
    if(!Array.isArray(P)||P.length<3||P.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||G.selfCrossing(P)||Math.abs(signedArea(P))<1)throw new RangeError('계획 외곽의 점과 교차 여부를 확인하세요');
    const Q=P.map(p=>p.map(Math.round));return signedArea(Q)<0?Q.reverse():Q;
  }
  function resolve(input,ramp=input.ramp){
    const mass=outer(input.parkingMass||input.mass),holes=(input.massHoles||[]).map(outer);
    const parkingPaths=boolOp([mass],holes,D);
    const body=Array.isArray(ramp?.body)&&ramp.body.length?outer(ramp.body):null;
    const allow=input.allowExternalRamp??(ramp?.kind==='curve');
    // Separate subject/clip operands also prevents opposite winding cancellation.
    let floorPaths=body&&allow?boolOp(parkingPaths,[body],U):parkingPaths;
    floorPaths=boolOp(floorPaths,holes,D);
    if(input.floorBoundary)floorPaths=boolOp([outer(input.floorBoundary)],holes,D);
    const outers=floorPaths.filter(P=>signedArea(P)>0),disconnected=!!body&&allow&&outers.length>parkingPaths.filter(P=>signedArea(P)>0).length;
    const excluded=body?Math.abs(areaOf(boolOp([body],floorPaths,D))):0;
    const site=input.allowedBoundary?outer(input.allowedBoundary):null;
    const siteOutside=site?Math.abs(areaOf(boolOp(floorPaths,[site],D))):0;
    return {mass,parkingPaths,floorPaths,holes,joined:!!body&&Math.abs(areaOf(boolOp([body],parkingPaths,D)))>1e4,
      disconnected,outerCount:outers.length,bodyOutsideMm2:excluded,siteOutsideMm2:siteOutside,
      floorMass:outers.length===1?outers[0]:mass,
      issue:disconnected?'램프 끝이 주차 본체와 연결되지 않습니다 — 착지점과 연결 차로를 확인하세요':excluded>1e6?'램프가 허용된 층 외곽을 벗어납니다':siteOutside>1e4?'램프를 포함한 층 외곽이 지정한 허용 경계를 벗어납니다':null};
  }
  function innerFloor(input,ramp){const b=resolve(input,ramp);return offsP(b.floorPaths,-(input.grid?.wallMm??400));}
  const api={outer,resolve,innerFloor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else(root.UGP=root.UGP||{}).boundary=api;
})(this);
