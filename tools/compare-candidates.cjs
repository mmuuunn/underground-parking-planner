'use strict';
const fs = require('node:fs');
const {fromPlan, compare} = require('../04_parking/01_src/plan/candidate-comparison.js');

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('사용법: node tools/compare-candidates.cjs <후보.json> [검증보고.json]\n후보는 배열 또는 {candidates:[...]}입니다. {id,input,plan} 생성 결과도 받습니다. 결과 JSON을 표준 출력으로 내보내며 입력은 수정하지 않습니다.\n');
    return;
  }
  if (args.length < 1 || args.length > 2) throw new Error('사용법: node tools/compare-candidates.cjs <후보.json> [검증보고.json]');
  const document = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const candidates = Array.isArray(document) ? document : document.candidates;
  if (!Array.isArray(candidates)) throw new Error('후보 목록이 필요합니다');
  const entries = candidates.map(c => c?.plan ? fromPlan(c.id, c.input, c.plan, c.title) : c);
  const report = args[1] ? JSON.parse(fs.readFileSync(args[1], 'utf8')) : null;
  process.stdout.write(JSON.stringify(compare(entries, report), null, 2) + '\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = {main};
