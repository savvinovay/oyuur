# Превратить скачанную копию (.oyuurbak) в обычную базу (.db) и проверить её.
#   restore.ps1                      — последняя копия из %USERPROFILE%\Oyuur-backups → рядом такой же .db
#   restore.ps1 -File путь.oyuurbak  — эта копия
#   restore.ps1 -Out путь.db         — куда положить базу
#   restore.ps1 -CheckOnly           — только проверить, базу не оставлять
param([string]$File, [string]$Out, [switch]$CheckOnly)
. "$PSScriptRoot\common.ps1"

try {
  if (-not $File) {
    $last = Get-ChildItem -Path $BackupFolder -Filter 'oyuur-*.oyuurbak' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $last) { throw "В $BackupFolder нет ни одной копии." }
    $File = $last.FullName
  }
  if (-not (Test-Path $File)) { throw "Нет файла $File" }
  $File = (Resolve-Path $File).Path
  if ($CheckOnly) { $Out = '' }
  elseif (-not $Out) { $Out = [IO.Path]::ChangeExtension($File, '.db') }
  if ($Out -and (Test-Path $Out)) { throw "$Out уже есть — не перезаписываю. Укажите другое место: -Out путь.db" }

  $r = Invoke-Restore -File $File -OutFile $Out -Key (Get-OwnerKey)
  Write-Host $r.Text
  if (-not $r.Ok) { exit 1 }
  if ($Out) { Write-Host "Готово: $Out" }
  exit 0
} catch {
  Write-Host "ОШИБКА: $($_.Exception.Message)"
  exit 1
}
