'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),U=require('../../../src/underground/candidates/rectangular-loop-v04.js');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const box=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
const over=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));

test('외곽 잔여폭은 직각주차열과 그 앞의 순환차로로 푼다',()=>{
  const mass=rect(0,0,67200,50400),ramp={x:33600,y:4200,angleDeg:90,lengthMm:20000,widthMm:6000},cores=[rect(25200,33600,8400,8400)];
  const r=U.generate({mass,ramp,cores,grid:{gx:8400,gy:8000,angleDeg:0}});
  const edge=r.stalls.filter(s=>s.side==='r');
  const horizontal=r.aisles.map(box).filter(a=>(a[2]-a[0])>(a[3]-a[1]));
  const vertical=r.aisles.map(box).filter(a=>(a[3]-a[1])>20000&&(a[2]-a[0])>=5900);
  assert.ok(edge.length>=2,'오른쪽 외곽의 유효 구간에만 직각주차가 채워져야 한다');
  assert.ok(vertical.length>=1,'외곽 주차열 앞에 세로 순환차로가 있어야 한다');
  for(const s of edge.map(q=>box(q.pts)))for(const a of horizontal)assert.ok(!(s[1]<a[3]&&a[1]<s[3]),'가로차로 접속 높이 전체에는 외곽 주차를 두지 않는다');
  const va=vertical[0];for(const s of edge.map(q=>box(q.pts)))assert.ok(s[1]>=va[1]&&s[3]<=va[3],'순환차로 시작·끝 바깥에는 외곽 주차를 두지 않는다');
  for(const s of r.stalls.map(q=>box(q.pts)))for(const a of r.aisles.map(box))assert.ok(over(s,a)<1,JSON.stringify({s,a}));
});

test('매스 크기가 달라져도 같은 성립조건이면 외곽 로직을 우선한다',()=>{
  for(const [w,h] of [[64800,48000],[67200,50400],[68000,50000],[70000,52000]]){
    const mass=rect(0,0,w,h),ramp={x:w/2,y:4200,angleDeg:90,lengthMm:20000,widthMm:6000},cores=[rect(w*.375,h*.66,8400,8400)];
    const r=U.generate({mass,ramp,cores,grid:{gx:8400,gy:8000,angleDeg:0}});
    assert.ok(r.stalls.some(s=>s.side==='l'||s.side==='r'),`${w}×${h} 외곽열 누락`);
    assert.ok(r.aisles.map(box).some(a=>(a[3]-a[1])>20000&&(a[2]-a[0])>=5900),`${w}×${h} 순환차로 누락`);
  }
});
