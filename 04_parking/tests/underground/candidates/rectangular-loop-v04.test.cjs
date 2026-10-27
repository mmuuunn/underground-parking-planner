'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),U=require('../../../src/underground/candidates/rectangular-loop-v04.js');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],box=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))],over=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
const mass=rect(0,0,64800,48000),ramp={x:32400,y:3000,angleDeg:90,lengthMm:18000,widthMm:6000};
test('직사각 8.1×8.0 모듈과 실제 6m 차로를 쓴다',()=>{const r=U.generate({mass,ramp,grid:{gx:8100,gy:8000,angleDeg:0}});assert.equal(r.schema,'ug-engine/0.4');assert.equal(r.aisleMm,6000);assert.ok(r.stallCount>0);assert.notEqual(r.moduleMm.gx,r.moduleMm.gy);});
test('실제 차로 도형은 주차칸과 겹치지 않는다',()=>{const r=U.generate({mass,ramp,grid:{gx:8100,gy:8000,angleDeg:0}});for(const s of r.stalls.map(q=>box(q.pts)))for(const a of r.aisles.map(box))assert.ok(over(s,a)<1,JSON.stringify({s,a}));});
test('성립하지 않는 안은 대수 대신 배치 불가를 반환한다',()=>{const r=U.generate({mass,grid:{gx:8100,gy:8000,angleDeg:0}});assert.equal(r.status,'INFEASIBLE');assert.equal(r.stallCount,0);assert.ok(r.violations.some(v=>v.id==='LANDING'));});
test('일반형·확장형 등 고정 후보를 비교 추천한다',()=>{const a=U.recommend({mass,ramp,grid:{angleDeg:0}});assert.equal(a.length,4);assert.ok(a.every(x=>x.gx!==undefined&&x.gy!==undefined));assert.ok(a[0].stallCount>=a.at(-1).stallCount);});
test('기둥이 실제 차로로 들어오는 모듈은 거부한다',()=>{assert.throws(()=>U.generate({mass,ramp,grid:{gx:8400,gy:9800,stallD:5000,columnMm:600}}),/기둥/);});
