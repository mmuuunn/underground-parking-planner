'use strict';
// Summarizes supplied results and bound audit reports; never runs or replaces a vehicle verifier.
const crypto = require('node:crypto');
const G = require('./CLAUDE_ugp_geom.js');
const PHASES = ['ramp-entry', 'loop-to-parking', 'parking-entry', 'parking-exit', 'loop-to-ramp', 'ramp-exit'];
const finite = Number.isFinite;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const area = paths => Math.abs(G.areaOf(paths));
function requireValue(ok, message) { if (!ok) throw new TypeError(message); }
function point(p, dimensions) { return Array.isArray(p) && p.length === dimensions && p.every(finite); }
function polygons(paths, label) {
  requireValue(Array.isArray(paths) && paths.every(p => Array.isArray(p) && p.length >= 3 && p.every(q => point(q, 2))), `${label}: 유한한 좌표의 다각형이 필요합니다`);
  return paths;
}
function polygonKey(p) {
  const vertices = p.map(q => JSON.stringify(q));
  if (vertices[0] === vertices.at(-1)) vertices.pop();
  return [vertices, vertices.slice().reverse()].flatMap(order =>
    order.map((_, i) => order.slice(i).concat(order.slice(0, i)).join(';'))).sort()[0];
}
function normalize(candidate) {
  requireValue(candidate && typeof candidate.id === 'string' && candidate.id.trim(), '후보 id가 필요합니다');
  const fixed = candidate.fixed;
  requireValue(fixed && typeof fixed === 'object', `${candidate.id}: 고정 입력이 필요합니다`);
  polygons([fixed.mass, fixed.innerOutline], '외곽'); polygons(fixed.columns, '기둥'); polygons(fixed.cores, '코어');
  if (fixed.ramp !== null) polygons([fixed.ramp], '램프');
  requireValue(fixed.landing === null || point(fixed.landing, 2), '램프 착지점이 올바르지 않습니다');
  if (fixed.floorPaths) polygons(fixed.floorPaths, '층 바닥');
  const aisles = polygons(candidate.aisles, '차로');
  requireValue(Array.isArray(candidate.stalls), '주차칸 목록이 필요합니다');
  const stalls = polygons(candidate.stalls.map(s => s?.pts || s), '주차칸');
  requireValue(new Set(stalls.map(polygonKey)).size === stalls.length, 'duplicate-stall-geometry');
  return {...candidate, fixed, aisles, stalls, computedHash: digest({fixed, aisles, stalls}), fixedHash: digest(stable(fixed))};
}
function fromPlan(id, input, plan, title = id) {
  requireValue(input && plan && Array.isArray(plan.stalls), '생성 입력과 생성 결과가 필요합니다');
  return {id, title, fixed: {
    input, mass: input.mass, innerOutline: plan.innerOutline, floorPaths: plan.parkingInnerPaths || [plan.innerOutline],
    columns: plan.columns, cores: (plan.cores || []).map(c => c.pts), ramp: plan.ramp?.body || null, landing: plan.ramp?.landing || null,
  }, aisles: plan.aisles, stalls: plan.stalls, sourceStatus: plan.status, generatorStallCount: plan.stallCount};
}
function metrics(candidate) {
  const solid = p => G.signedArea(p) < 0 ? p.slice().reverse() : p;
  const occupied = candidate.stalls.concat(candidate.fixed.columns, candidate.fixed.cores, candidate.fixed.ramp ? [candidate.fixed.ramp] : []).map(solid);
  const aisles = G.boolOp(candidate.aisles, [], G.CL.ClipType.ctUnion);
  const used = G.boolOp(aisles, occupied, G.CL.ClipType.ctUnion);
  return {placedStalls: candidate.stalls.length, aisleM2: area(aisles) / 1e6,
    stallM2: candidate.stalls.reduce((sum, p) => sum + area([p]), 0) / 1e6,
    unallocatedM2: area(G.boolOp(candidate.fixed.floorPaths || [candidate.fixed.innerOutline], used, G.CL.ClipType.ctDifference)) / 1e6};
}
function conditionsValid(c, audit) {
  return c && c.sameVehicle === true && typeof c.scope === 'string' && c.scope.trim()
    && ['drivingMarginMm', 'parkingAndLocalConnectionMarginMm', 'minRearAxleRadiusMm', 'sampleMm', 'intermediateGuardMm'].every(k => finite(c[k]) && c[k] >= 0)
    && c.minRearAxleRadiusMm > 0 && c.sampleMm > 0 && c.sampleMm === audit?.stepMm && c.intermediateGuardMm === audit?.extraGuardMm;
}
function same(a, b) {
  return point(a, 3) && point(b, 3) && Math.hypot(a[0] - b[0], a[1] - b[1]) < .01 && Math.abs(wrap(a[2] - b[2])) < 1e-7;
}
function advance(q, distance, curvature) {
  const angle = q[2] + distance * curvature;
  return Math.abs(curvature) < 1e-12
    ? [q[0] + distance * Math.cos(q[2]), q[1] + distance * Math.sin(q[2]), q[2]]
    : [q[0] + (Math.sin(angle) - Math.sin(q[2])) / curvature, q[1] + (Math.cos(q[2]) - Math.cos(angle)) / curvature, wrap(angle)];
}
function journey(record, candidate, criteria) {
  requireValue(Array.isArray(record.phases) && record.phases.length === PHASES.length, 'whole-journey-phases-missing');
  const entry = candidate.ramps?.find(r => r.id === 'R-IN'), exit = candidate.ramps?.find(r => r.id === 'R-OUT');
  requireValue(point(entry?.start, 3) && point(exit?.end, 3), 'ramp-terminals-missing');
  let q = entry.start, lastGear = 1, switches = 0, distance = 0;
  for (let i = 0; i < PHASES.length; i++) {
    const phase = record.phases[i], parking = phase?.id?.startsWith('parking-');
    requireValue(phase?.id === PHASES[i] && same(q, phase.start) && Array.isArray(phase.controls), 'journey-discontinuity');
    requireValue(phase.margin === (parking ? criteria.parkingAndLocalConnectionMarginMm : criteria.drivingMarginMm), 'journey-margin-mismatch');
    for (const c of phase.controls) {
      requireValue(c && [1, -1].includes(c.gear) && finite(c.lengthMm) && c.lengthMm >= 0 && finite(c.curvature)
        && Math.abs(c.curvature) <= 1 / criteria.minRearAxleRadiusMm + 1e-12 && (parking || c.gear === 1), 'invalid-journey-control');
      if (c.gear !== lastGear) switches++; lastGear = c.gear; distance += c.lengthMm;
      q = advance(q, c.gear * c.lengthMm, c.curvature);
    }
    requireValue(same(q, phase.end), 'journey-endpoint-mismatch');
    if (i === 2) {
      requireValue(same(q, record.parked), 'parked-pose-mismatch');
      requireValue(G.CL.Clipper.PointInPolygon({X: record.parked[0], Y: record.parked[1]},
        candidate.stalls[record.index].map(([X, Y]) => ({X, Y}))) !== 0, 'parked-stall-mismatch');
    }
  }
  requireValue(same(q, exit.end), 'ramp-terminal-mismatch');
  requireValue(record.roundTripGearChanges === switches && finite(record.travelM) && Math.abs(record.travelM - distance / 1000) < .0001, 'journey-summary-mismatch');
  return {switches, travelM: distance / 1000};
}
function evidenceFor(candidate, report, group) {
  const unknown = {state: 'missing', fullJourneyCount: null, unverifiedStalls: candidate.stalls.length,
    gearChangeDistribution: null, meanTravelM: null, reasons: [], physicalRecheck: false};
  if (!group) return unknown;
  try {
    requireValue(group.geometryHash === candidate.computedHash && (!candidate.geometryHash || candidate.geometryHash === candidate.computedHash), 'geometry-hash-mismatch');
    const audit = report.audit, receipt = audit?.candidates?.filter(r => r.id === candidate.id);
    requireValue(audit?.passed === true && finite(audit.maxOutsideMm2) && audit.maxOutsideMm2 >= 0 && audit.maxOutsideMm2 <= 1
      && finite(audit.maxObstacleMm2) && audit.maxObstacleMm2 >= 0 && audit.maxObstacleMm2 <= 1, 'audit-not-passed');
    requireValue(receipt?.length === 1 && receipt[0].geometryHash === candidate.computedHash, 'audit-binding-mismatch');
    const criteria = group.criteria || report.criteria;
    requireValue(conditionsValid(criteria, audit), 'measurement-conditions-missing-or-invalid');
    requireValue(Array.isArray(group.results), 'journey-records-missing');
    const seen = new Set(), found = [];
    for (const record of group.results) {
      requireValue(record && Number.isInteger(record.index) && record.index >= 0 && record.index < candidate.stalls.length && !seen.has(record.index), 'duplicate-or-invalid-stall-index');
      requireValue(typeof record.state === 'string', 'journey-state-missing'); seen.add(record.index);
      if (record.state === 'full-planar-journey-found') found.push(journey(record, candidate, criteria));
    }
    requireValue(receipt[0].placed === candidate.stalls.length && receipt[0].fullJourneys === found.length
      && group.summary?.fullJourneys === found.length, 'audit-count-mismatch');
    const distribution = {};
    for (const record of found) distribution[record.switches] = (distribution[record.switches] || 0) + 1;
    return {state: 'imported-bound-report', fullJourneyCount: found.length, unverifiedStalls: candidate.stalls.length - found.length,
      gearChangeDistribution: distribution, meanTravelM: found.length ? found.reduce((s, r) => s + r.travelM, 0) / found.length : null,
      reasons: [], physicalRecheck: false};
  } catch (error) { return {...unknown, state: 'rejected', reasons: [error.message]}; }
}
function compare(candidates, report = null) {
  requireValue(Array.isArray(candidates) && candidates.length > 0, '비교할 후보가 필요합니다');
  const normalized = candidates.map(normalize), ids = normalized.map(c => c.id);
  requireValue(new Set(ids).size === ids.length, '후보 id가 중복되었습니다');
  if (report) requireValue(Array.isArray(report.groups) && report.groups.every(g => g && typeof g.id === 'string')
    && new Set(report.groups.map(g => g.id)).size === report.groups.length, '검증 보고의 후보 목록이 올바르지 않습니다');
  const reference = normalized[0], referenceGroup = report?.groups.find(g => g.id === reference.id);
  const referenceConditions = referenceGroup?.criteria || report?.criteria;
  const rows = normalized.map(candidate => {
    const group = report?.groups.find(g => g.id === candidate.id), conditions = group?.criteria || report?.criteria;
    const fixedMatches = candidate.fixedHash === reference.fixedHash;
    const conditionsMatch = !conditions || !referenceConditions ? null : digest(stable(conditions)) === digest(stable(referenceConditions));
    return {id: candidate.id, title: candidate.title || candidate.id, geometryHash: candidate.computedHash, fixedHash: candidate.fixedHash,
      sourceStatus: candidate.sourceStatus || null, generatorStallCount: candidate.generatorStallCount ?? null,
      ...metrics(candidate), evidence: evidenceFor(candidate, report, group),
      comparison: {fixedInputMatches: fixedMatches, measurementConditionsMatch: conditionsMatch,
        layoutDeltaStalls: fixedMatches ? candidate.stalls.length - reference.stalls.length : null,
        reasons: [...(fixedMatches ? [] : ['fixed-input-mismatch']), ...(conditionsMatch === null ? ['measurement-conditions-missing'] : conditionsMatch ? [] : ['measurement-conditions-mismatch'])]}};
  });
  for (const row of rows) row.comparison.journeyDeltaStalls = row.comparison.fixedInputMatches && row.comparison.measurementConditionsMatch === true
    && row.evidence.fullJourneyCount !== null && rows[0].evidence.fullJourneyCount !== null ? row.evidence.fullJourneyCount - rows[0].evidence.fullJourneyCount : null;
  return {schema: 'candidate-comparison/1', referenceId: reference.id, rows, feasibilityVerdict: null,
    scope: 'geometry metrics and imported audit evidence; no new physical or legal validation',
    limits: ['경로 수는 현재 배치에 결속된 제공 보고의 요약이며 이 기능이 충돌 검사를 새로 실행한 결과가 아닙니다.',
      '미발견과 증거 누락은 불가능 판정이 아닙니다. 조작 횟수와 거리는 찾은 경로의 값이며 최솟값이 아닙니다.',
      '측정 조건의 동일성은 보고서의 선언을 비교합니다. 보고서 작성자의 신원이나 독립성을 인증하지 않습니다.']};
}
module.exports = {fromPlan, compare};
