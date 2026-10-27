/* 지하주차 계획 엔진 v0.5 진입점. 실제 구현은 01_src/plan/ 의 단계별 파일(CLAUDE_ugp_*.js)이고, 순서 조립은 CLAUDE_ugp_plan.js.
 * Node: 이 파일을 require하면 같은 API(generate·snap·suggestRamps·suggestUcs)를 준다. 브라우저: plan/ 스크립트를 순서대로 불러오면 UGPlan이 생긴다.
 */
(function () {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = require('./plan/CLAUDE_ugp_plan.js');
})();
