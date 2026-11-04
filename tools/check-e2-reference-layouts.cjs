'use strict';
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const dir = process.env.E2_REFERENCE_DIR || 'C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts';
// This fixed experiment verifies external review artifacts; it is not a general planner.
process.stdout.write(execFileSync('python', [path.join(dir, 'verify.py')], {encoding:'utf8'}));
