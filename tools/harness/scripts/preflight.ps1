param([Parameter(Mandatory)][string]$WorkItem, [string]$RepoRoot, [switch]$SkipBaseline)
. (Join-Path $PSScriptRoot 'common.ps1')

$repo = Resolve-RepoRoot $RepoRoot
$harnessRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$info = Get-WorkItemInfo $WorkItem
$errors = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath (Join-Path $harnessRoot 'policy.yaml'))) { $errors.Add('policy.yaml is missing.') }
foreach ($name in @('id','status','stage','authority','owner','reviewer','verifyProfile','question')) {
  if (-not $info[$name]) { $errors.Add("Work item is missing: $name") }
}
if ($info.status -notin @('SCOPED','BASELINED')) { $errors.Add("Invalid start status: $($info.status). Expected SCOPED or BASELINED.") }
$stagePath = Join-Path $harnessRoot ("stages\01_{0}.yaml" -f $info.stage)
if (-not (Test-Path -LiteralPath $stagePath)) { $errors.Add("Stage file is missing: $stagePath") }
if ($info.allowedFiles.Count -eq 0) { $errors.Add('allowed_files is empty.') }
foreach ($relative in $info.allowedFiles) { if (-not (Test-Path -LiteralPath (Join-Path $repo $relative))) { $errors.Add("Allowed file is missing: $relative") } }
foreach ($command in @('git','node')) { if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { $errors.Add("Required command is missing: $command") } }

$branch = Get-GitValue $repo @('branch','--show-current')
$commit = Get-GitValue $repo @('rev-parse','HEAD')
$dirty = Get-GitValue $repo @('status','--short')
if (-not $commit) { $errors.Add('Cannot read the Git baseline commit.') }
if ($dirty) { $warnings.Add('The worktree already has changes. The harness will not clean or commit them.') }

if ($errors.Count) {
  Write-Host 'PRECHECK FAILED' -ForegroundColor Red
  $errors | ForEach-Object { Write-Host ("- " + $_) }
  exit 1
}

$runId = New-RunId $info.id
$runDir = Join-Path $harnessRoot (Join-Path 'runs' $runId)
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$manifestPath = Join-Path $runDir 'manifest.json'
$workItemPath = if ($info.path.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
  $info.path.Substring($repo.Length).TrimStart('\').Replace('\','/')
} else { $info.path }
$manifest = [ordered]@{
  schemaVersion = 1; runId = $runId; workItem = $info.id
  workItemPath = $workItemPath
  question = $info.question; stage = $info.stage; authority = $info.authority; owner = $info.owner; reviewer = $info.reviewer
  status = 'PREFLIGHT_PASSED'; startedAt = [DateTimeOffset]::Now.ToString('o')
  repo = [ordered]@{ root=$repo; branch=$branch; commit=$commit; dirtyBefore=[bool]$dirty; dirtySummary=@($dirty -split '\r?\n' | Where-Object { $_ }) }
  limits = [ordered]@{
    implementationRounds = Get-YamlScalar $info.text 'max_implementation_rounds'
    reviewerCalls = Get-YamlScalar $info.text 'max_reviewer_calls'
    changedFiles = Get-YamlScalar $info.text 'max_changed_files'
    newProductionLines = Get-YamlScalar $info.text 'max_new_production_lines'
  }
  allowedFiles = $info.allowedFiles; warnings = @($warnings); verification = $null
  userGate = [ordered]@{ required=$true; status='PENDING' }
}
Write-JsonUtf8 $manifest $manifestPath
Write-Host 'PRECHECK PASSED' -ForegroundColor Green
Write-Host ("run_id: " + $runId)
Write-Host ("manifest: " + $manifestPath)
$warnings | ForEach-Object { Write-Host ("WARNING: " + $_) -ForegroundColor Yellow }

if (-not $SkipBaseline) {
  & (Join-Path $PSScriptRoot 'verify.ps1') -WorkItem $info.path -RepoRoot $repo -RunId $runId -Mode BASELINE
  exit $LASTEXITCODE
}
