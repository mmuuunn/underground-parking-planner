'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {valid,movePoint,points}=require('../01_src/manual-lane-editor.js');
const landing=[0,0],state=()=>({selection:'continuous',routes:[{id:'main',points:[[0,0],[6000,0],[12000,0]]},{id:'branch',points:[[6000,0],[6000,8000]]}]});
test('manual state rejects invalid choices, sparse points and degenerate segments',()=>{
 assert(valid(state(),landing));for(const value of [null,{...state(),selection:'other'},{...state(),routes:[]},{...state(),routes:[{points:[[0,0],new Array(2)]}]},{...state(),routes:[{points:[[0,0],[0,0]]}]},{...state(),routes:[{points:[[0,0],[Infinity,0]]}]}])assert.equal(valid(value,landing),false);
});
test('moving a junction preserves every connected occurrence without mutating the original',()=>{
 const s=state(),before=JSON.stringify(s),next=movePoint(s,0,1,[6100,100],landing);assert.equal(JSON.stringify(s),before);assert.deepEqual(next.routes[0].points[1],[6100,100]);assert.deepEqual(next.routes[1].points[0],[6100,100]);assert.deepEqual(next.routes[0].points[0],landing);assert(valid(next,landing));
});
test('the ramp landing and invalid edits cannot be committed',()=>{
 assert.throws(()=>movePoint(state(),0,0,[100,100],landing),/착지/);assert.throws(()=>movePoint(state(),0,1,[0,0],landing),/차로/);assert.throws(()=>movePoint(state(),9,2,[100,100],landing),/차로/);
});
test('editable point list excludes the fixed landing and shared duplicates',()=>{
 const p=points(state(),landing);assert.equal(p.length,3);assert.equal(p.filter(p=>p.point[0]===6000&&p.point[1]===0).length,1);assert(!p.some(p=>p.point[0]===0&&p.point[1]===0));
});
