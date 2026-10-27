$ErrorActionPreference = 'Stop'
$script:Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $script:Utf8NoBom
[Console]::OutputEncoding = $script:Utf8NoBom
$OutputEncoding = $script:Utf8NoBom

function Resolve-RepoRoot {
  param([string]$ExplicitRoot)
  if ($ExplicitRoot) { return (Resolve-Path -LiteralPath $ExplicitRoot).Path }
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}

function Read-TextUtf8 { param([string]$Path) Get-Content -LiteralPath $Path -Raw -Encoding UTF8 }

function Get-YamlScalar {
  param([string]$Text, [string]$Name)
  $match = [regex]::Match($Text, '(?m)^' + [regex]::Escape($Name) + ':\s*(.+?)\s*$')
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Get-YamlList {
  param([string]$Text, [string]$Name)
  $match = [regex]::Match($Text, '(?m)^' + [regex]::Escape($Name) + ':[ \t]*\r?\n(?<body>(?:[ \t]+-[ \t]+[^\r\n]*(?:\r?\n|$))*)')
  if (-not $match.Success) { return @() }
  return @($match.Groups['body'].Value -split '\r?\n' | Where-Object { $_ -match '^\s*-\s+' } | ForEach-Object { ($_ -replace '^\s*-\s+', '').Trim().Trim('"').Trim("'") })
}

function Write-JsonUtf8 {
  param($Value, [string]$Path)
  [System.IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Depth 12) + [Environment]::NewLine), $script:Utf8NoBom)
}

function Get-GitValue {
  param([string]$RepoRoot, [string[]]$Arguments)
  $output = & git -C $RepoRoot @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($output -join [Environment]::NewLine).Trim()
}

function Get-WorkItemInfo {
  param([string]$Path)
  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $text = Read-TextUtf8 $resolved
  return [ordered]@{
    path = $resolved; text = $text
    id = Get-YamlScalar $text 'id'; status = Get-YamlScalar $text 'status'
    stage = Get-YamlScalar $text 'stage'; authority = Get-YamlScalar $text 'authority'; owner = Get-YamlScalar $text 'owner'
    reviewer = Get-YamlScalar $text 'reviewer'; verifyProfile = Get-YamlScalar $text 'verify_profile'
    question = Get-YamlScalar $text 'question'; allowedFiles = @(Get-YamlList $text 'allowed_files')
  }
}

function New-RunId {
  param([string]$WorkItemId)
  return '{0}-{1}-{2}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $WorkItemId, ([guid]::NewGuid().ToString('N').Substring(0, 8))
}
