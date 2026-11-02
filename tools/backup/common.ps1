# Общее для скриптов копий Oyuur (OYUUR-36): где что лежит, ключ, журнал, node.
# Подключается из других скриптов: . "$PSScriptRoot\common.ps1"

$ErrorActionPreference = 'Stop'
# Полоса прогресса замедляет скачивание в PowerShell 5.1 в разы.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$DefaultServer = 'https://oyuur.ayaal.savvinov.me'
# Пути можно поменять для проверки (не трогая настоящие): OYUUR_BACKUP_FOLDER и OYUUR_BACKUP_CONFIG.
$BackupFolder = if ($env:OYUUR_BACKUP_FOLDER) { $env:OYUUR_BACKUP_FOLDER } else { Join-Path $env:USERPROFILE 'Oyuur-backups' }
$ConfigDir = if ($env:OYUUR_BACKUP_CONFIG) { $env:OYUUR_BACKUP_CONFIG } else { Join-Path $env:LOCALAPPDATA 'Oyuur' }
$KeyFile = Join-Path $ConfigDir 'owner-key.dpapi'
$ServerFile = Join-Path $ConfigDir 'server.txt'
$LogFile = Join-Path $BackupFolder 'backup.log'
$Keep = 14

function Write-Log([string]$Text) {
  if (-not (Test-Path $BackupFolder)) { New-Item -ItemType Directory -Force $BackupFolder | Out-Null }
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  # Журнал не растёт бесконечно: последние 1000 строк.
  $all = @(Get-Content -Path $LogFile -Encoding UTF8)
  if ($all.Count -gt 1200) { Set-Content -Path $LogFile -Value ($all | Select-Object -Last 1000) -Encoding UTF8 }
}

# Папка только для этого пользователя Windows: без наследования прав, полный доступ — только себе.
function Protect-Folder([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Force $Path | Out-Null }
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $Path /inheritance:r /grant:r "${me}:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Не получилось закрыть папку $Path (icacls $LASTEXITCODE)" }
}

function Get-Server {
  if (Test-Path $ServerFile) {
    $s = (Get-Content -Path $ServerFile -Encoding UTF8 -TotalCount 1).Trim()
    if ($s) { return $s.TrimEnd('/') }
  }
  return $DefaultServer
}

# Ключ лежит зашифрованным средствами Windows (DPAPI): открыть его может только этот пользователь на этом компьютере.
function Get-OwnerKey {
  if (-not (Test-Path $KeyFile)) { throw "Нет ключа. Сначала запустите setup.ps1." }
  $secure = Get-Content -Path $KeyFile -TotalCount 1 | ConvertTo-SecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Find-Node {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

# Расшифровать и проверить копию через restore.mjs (Node 24). OutFile пустой — только проверка.
# Ключ передаётся через переменную окружения дочернего процесса, не в командной строке.
function Invoke-Restore([string]$File, [string]$OutFile, [string]$Key) {
  $node = Find-Node
  if (-not $node) { throw 'Не найден Node.js (нужен 24 или новее): https://nodejs.org' }
  $env:OYUUR_OWNER_KEY = $Key
  # Node пишет UTF-8, а PowerShell 5.1 без этого читает его в кодировке консоли (866) — вместо русского кракозябры.
  $enc = [Console]::OutputEncoding
  [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
  try {
    $nodeArgs = @('--no-warnings', "$PSScriptRoot\restore.mjs", $File)
    if ($OutFile) { $nodeArgs += $OutFile }
    # Без 2>&1: в PowerShell 5.1 строка в stderr при Stop превращается в ошибку.
    $out = & $node @nodeArgs | ForEach-Object { "$_" }
    return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Text = ($out -join "`n") }
  } finally {
    [Console]::OutputEncoding = $enc
    Remove-Item Env:\OYUUR_OWNER_KEY -ErrorAction SilentlyContinue
  }
}
