param(
  [Parameter(Mandatory)][string]$WorkItem,
  [string]$RepoRoot,
  [string]$RunId,
  [ValidateSet('BASELINE','VERIFY')][string]$Mode = 'VERIFY'
)
. (Join-Path $PSScriptRoot 'common.ps1')

$repo = Resolve-RepoRoot $RepoRoot
$harnessRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$info = Get-WorkItemInfo $WorkItem
if ($Mode -eq 'VERIFY' -and -not $RunId) { throw '작업 검증에는 preflight의 RunId가 필요합니다. 공통 시험만 실행하려면 npm test를 사용하세요.' }
if ($RunId) {
  if ($RunId -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid RunId' }
  $receiptDir = Join-Path $harnessRoot (Join-Path 'runs' $RunId)
  $scopeCheck = & node (Join-Path $PSScriptRoot 'completion-gate.cjs') scope $repo $info.path $receiptDir | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw '시작 시 고정한 작업 범위 또는 선행작업 검증 실패' }
}
if ($info.verifyProfile -ne 'vehicle-circulation') { Write-Error "Unsupported verify_profile: $($info.verifyProfile)" }
$tests = @(
  '04_parking/02_tests/planning-backend.test.cjs',
  '04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs',
  '04_parking/02_tests/CLAUDE_ug_plan_invariance.test.cjs',
  '04_parking/02_tests/CLAUDE_ug_curve_ramp.test.cjs',
  '04_parking/02_tests/parking-turns.test.cjs'
)
foreach ($test in $tests) { if (-not (Test-Path -LiteralPath (Join-Path $repo $test))) { Write-Error "Test file is missing: $test" } }

$started = [DateTimeOffset]::Now
$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$oldPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
Push-Location $repo
try {
  $output = & node --test --test-isolation=none @tests 2>&1
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
$ErrorActionPreference = $oldPreference; $stopwatch.Stop()
$textOutput = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
$summary = [ordered]@{
  schemaVersion=1; mode=$Mode; profile=$info.verifyProfile; workItem=$info.id
  startedAt=$started.ToString('o'); finishedAt=[DateTimeOffset]::Now.ToString('o')
  elapsedSeconds=[math]::Round($stopwatch.Elapsed.TotalSeconds,3); exitCode=$exitCode; passed=($exitCode -eq 0); testFiles=$tests
  tap=[ordered]@{
    tests=if($textOutput -match '(?m)^ℹ tests (\d+)'){[int]$Matches[1]}else{$null}
    pass=if($textOutput -match '(?m)^ℹ pass (\d+)'){[int]$Matches[1]}else{$null}
    fail=if($textOutput -match '(?m)^ℹ fail (\d+)'){[int]$Matches[1]}else{$null}
  }
}

$resultDir = if ($RunId) {
  $candidate = Join-Path $harnessRoot (Join-Path 'runs' $RunId)
  if (-not (Test-Path -LiteralPath $candidate)) { Write-Error "Run directory is missing: $RunId" }
  $candidate
} else {
  $candidate = Join-Path $harnessRoot (Join-Path 'runs' (New-RunId $info.id))
  New-Item -ItemType Directory -Path $candidate -Force | Out-Null
  $candidate
}
$verificationPath = Join-Path $resultDir 'verification.json'
$logPath = Join-Path $resultDir 'verification.log'
Write-JsonUtf8 $summary $verificationPath
[System.IO.File]::WriteAllText($logPath, $textOutput + [Environment]::NewLine, $script:Utf8NoBom)

if ($RunId) {
  $manifestPath = Join-Path $resultDir 'manifest.json'
  if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifest.verification = [ordered]@{ mode=$Mode; passed=$summary.passed; exitCode=$exitCode; tests=$summary.tap.tests; pass=$summary.tap.pass; fail=$summary.tap.fail; elapsedSeconds=$summary.elapsedSeconds; result='verification.json'; log='verification.log'; sourceDigest=$scopeCheck.sourceDigest }
    $manifest.status = if($summary.passed){if($Mode -eq 'BASELINE'){'BASELINED'}else{'TESTS_PASSED'}}else{'VERIFICATION_FAILED'}
    Write-JsonUtf8 $manifest $manifestPath
  }
}

if ($summary.passed) { Write-Host ("VERIFICATION PASSED: {0}/{1} tests, {2}s" -f $summary.tap.pass,$summary.tap.tests,$summary.elapsedSeconds) -ForegroundColor Green }
else { Write-Host ("VERIFICATION FAILED: exit {0}, {1}s" -f $exitCode,$summary.elapsedSeconds) -ForegroundColor Red }
Write-Host ("result: " + $verificationPath)
Write-Host ("log: " + $logPath)
if ($Mode -eq 'VERIFY') {
  & node (Join-Path $PSScriptRoot 'completion-gate.cjs') verify $repo $info.path $resultDir | Out-Null
  $gateExit = $LASTEXITCODE
  $completionPath = Join-Path $resultDir 'completion.json'
  if (Test-Path -LiteralPath $completionPath) {
    $g = Get-Content -LiteralPath $completionPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host ("WORK GATES: {0} | checks {1}/{2} | product {3} | review {4} | user {5}" -f $g.status, @($g.checks | Where-Object { $_.passed }).Count, @($g.checks).Count, $(if($g.product.required){$g.product.passed}else{'not credited'}), $g.review.status, $g.user.status)
    Write-Host ("completion: " + $completionPath)
  }
  exit $gateExit
}
exit $exitCode
