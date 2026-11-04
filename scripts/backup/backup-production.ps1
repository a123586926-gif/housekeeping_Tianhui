# Local Windows export — run in a trusted PowerShell window, NOT in GitHub/CI.
# Preconditions: Supabase CLI, Docker Desktop, Node 22+, encrypted destination.
# Requires local, temporary SUPABASE_SERVICE_ROLE_KEY to read Storage bytes.
# Creates a NEW backup folder. Never updates or deletes production data.
param(
  [Parameter(Mandatory=$true)][string]$EncryptedBackupParent,
  [switch]$IUnderstandCliProcessArgumentsCanExposeDbUrl
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = 'xmdznhkkvtohwxkahisr'
if (-not $IUnderstandCliProcessArgumentsCanExposeDbUrl) {
  throw 'CLI --db-url can appear in local process listings. Re-run with explicit acknowledgement on a trusted machine.'
}
if (-not (Test-Path -LiteralPath $EncryptedBackupParent -PathType Container)) {
  throw 'Encrypted backup parent must already exist.'
}
$drive = (Get-Item -LiteralPath $EncryptedBackupParent).PSDrive.Root
if ($drive -notmatch '^[A-Za-z]:\\') { throw 'Use a local encrypted Windows drive.' }
if (-not (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue)) {
  throw 'BitLocker verification unavailable. No backup was attempted.'
}
$volume = Get-BitLockerVolume -MountPoint $drive
if ($null -eq $volume -or $volume.ProtectionStatus -ne 'On') {
  throw 'The destination drive is not verified as BitLocker protected.'
}
foreach ($exe in @('supabase','node','docker')) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "$exe is missing" }
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) {
  throw 'Set SUPABASE_SERVICE_ROLE_KEY securely in this local PowerShell process before running.'
}
$env:SUPABASE_URL = "https://$project.supabase.co"
$secret = Read-Host 'Enter production DB connection string (never paste into chat)' -AsSecureString
$bstr = [IntPtr]::Zero
$dbUrl = $null
try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $dbUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  try { $uri = [uri]$dbUrl } catch { throw 'Invalid database connection URL' }
  if ($uri.Scheme -notin @('postgres','postgresql')) { throw 'Expected PostgreSQL URL' }
  $directHost = "db.$project.supabase.co"
  $isDirect = $uri.Host -eq $directHost
  $isPooler = $uri.Host.EndsWith('.pooler.supabase.com') -and
              $uri.UserInfo.StartsWith("postgres.$project" + ':')
  if (-not ($isDirect -or $isPooler)) {
    throw 'Connection URL must point to the allowlisted production Supabase project.'
  }
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $dest = Join-Path $EncryptedBackupParent "Housekeeping-$stamp"
  if (Test-Path -LiteralPath $dest) { throw 'Backup target already exists.' }
  New-Item -ItemType Directory -Path $dest -ErrorAction Stop | Out-Null
  $dbDir = Join-Path $dest 'database'
  New-Item -ItemType Directory -Path $dbDir | Out-Null
  foreach ($entry in @(
    @{Name='roles.sql'; Flags=@('--role-only')},
    @{Name='schema.sql'; Flags=@()},
    @{Name='data.sql'; Flags=@('--use-copy','--data-only')}
  )) {
    $target = Join-Path $dbDir $entry.Name
    [string[]]$flags = $entry.Flags
    & supabase db dump --db-url $dbUrl -f $target @flags
    if ($LASTEXITCODE -ne 0) { throw "Database dump failed for $($entry.Name)" }
    if (-not (Test-Path -LiteralPath $target) -or (Get-Item -LiteralPath $target).Length -eq 0) {
      throw "Database dump file missing or empty: $($entry.Name)"
    }
  }
  $storageOut = Join-Path $dest 'storage-export'
  & node (Join-Path $PSScriptRoot 'backup-storage.mjs') --out $storageOut
  if ($LASTEXITCODE -ne 0) { throw 'Storage export failed; backup is INCOMPLETE.' }
  $files = Get-ChildItem -LiteralPath $dbDir -File | Sort-Object Name | ForEach-Object {
    [pscustomobject]@{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  $report = [ordered]@{
    sourceProject=$project
    takenAtUtc=(Get-Date).ToUniversalTime().ToString('o')
    databaseFiles=$files
    storageManifest='storage-export/storage-manifest.json'
    result='EXPORTED_NOT_RESTORED'
    restoreVerified=$false
    instructions='Keep this entire directory encrypted and offline. Do not upload to GitHub or chat.'
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $dest 'backup-report.json') -Encoding UTF8
  Write-Output "Export files created in encrypted location: $dest"
  Write-Output 'Backup file hashes created. RESTORE HAS NOT BEEN VERIFIED.'
} finally {
  if ($bstr -ne [IntPtr]::Zero) {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
  $dbUrl = $null
  $env:SUPABASE_URL = $null
  $env:SUPABASE_SERVICE_ROLE_KEY = $null
}
