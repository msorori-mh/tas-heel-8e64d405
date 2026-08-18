param(
  [string]$DatabaseUrl = $env:TAMKEEN_PG17_LOCAL_URL,
  [string[]]$PrerequisiteSql = @(),
  [string]$MigrationSql = (Join-Path $PSScriptRoot '..\..\supabase\migrations-pending\20260818210000_content_v3_21h_hardened_preflight.sql'),
  [string]$PostverifySql = (Join-Path $PSScriptRoot 'postverify-21h.sql')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Output 'BLOCKED_PG17_ENVIRONMENT'
  Write-Output 'Set TAMKEEN_PG17_LOCAL_URL to a local PostgreSQL 17 connection string.'
  exit 3
}

if ($DatabaseUrl -notmatch '(?i)(localhost|127\.0\.0\.1|\[?::1\]?)') {
  throw 'Refusing to mutate a non-local database. This runner is local-only.'
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psql) {
  Write-Output 'BLOCKED_PG17_ENVIRONMENT'
  Write-Output 'psql was not found; no client or server was installed automatically.'
  exit 3
}

function Invoke-PsqlFile([string]$Path) {
  & $psql.Source $DatabaseUrl --set=ON_ERROR_STOP=1 --file=$Path
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $Path" }
}

$version = (& $psql.Source $DatabaseUrl --no-align --tuples-only --command="SHOW server_version_num")
if ([int]$version.Trim() -lt 170000) { throw "PostgreSQL 17 required; got $version" }
Write-Output "PG17_VERSION=$($version.Trim())"

foreach ($file in $PrerequisiteSql) { Invoke-PsqlFile $file }
Invoke-PsqlFile $MigrationSql
Invoke-PsqlFile $PostverifySql
Write-Output 'PG17_PREFLIGHT=PASS'
