'use strict';
// 계획 엔진 위치·회전 불변: 같은 형상(매스·램프)을 옮기고 돌려도(UCS도 같이 돌림) 대수·순환·막다른 끝이 같아야 한다.
// 저장 좌표가 mm로 반올림되는 흔들림까지 포함한다. Codex 66차 검토의 500개 입력(5형상 × 4방향 × 25위치)과 같은 구성.
const assert = require('assert');
const E = require('../01_src/CLAUDE_ug_plan_engine.js');
const rot = (p, deg) => { const t = deg * Math.PI / 180; return [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)]; };
const SHAPES = {
  직사각: [[0, 0], [80, 0], [80, 60], [0, 60]],
  L자: [[0, 0], [80, 0], [80, 30], [40, 30], [40, 70], [0, 70]],
  사선깎임: [[0, 0], [80, 0], [80, 30], [55, 60], [0, 60]],
  좁은날개: [[0, 0], [100, 0], [100, 20], [60, 20], [60, 60], [0, 60]],
  전변사선: [[0, 0], [80, 5], [72, 60], [12, 64]],
};
const RAMP = [30, 52]; // m, UCS 기준 동향
const fails = [];
for (const [name, shape] of Object.entries(SHAPES)) {
  const seen = new Map();
  for (const ang of [0, 17.3, -25.8, 41]) for (let i = 0; i < 25; i++) {
    const t = [i * 1370, i * 2110], W = (q) => rot([q[0] * 1000 + t[0], q[1] * 1000 + t[1]], ang).map(Math.round), rp = W(RAMP);
    let key;
    try { const r = E.generate({ucs: ang, mass: shape.map(W), cores: [], ramp: {x: rp[0], y: rp[1], angleDeg: ang, widthMm: 6000, lengthMm: 24000}, floorMm: 3800}); key = `${r.stallCount}/${r.graph.hasLoop}/${r.graph.deadEnds.length}/${r.status}`; }
    catch (e) { key = 'throw:' + e.message; }
    if (!seen.has(key)) seen.set(key, []); seen.get(key).push(`${ang}°#${i}`);
  }
  if (seen.size !== 1) fails.push(`${name}: ${[...seen].map(([k, v]) => `${k} ×${v.length}(${v.slice(0, 3).join(',')})`).join(' | ')}`);
  else console.log(name, [...seen.keys()][0]);
}
assert.strictEqual(fails.length, 0, '위치·회전에 따라 결과가 달라짐:\n' + fails.join('\n'));
console.log('invariance ok (500)');
