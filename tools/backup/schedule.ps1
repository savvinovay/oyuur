# Шаг 3: поставить скачивание копий в Планировщик заданий Windows — раз в день в 14:00 и при входе в систему.
# Пропущенный запуск (компьютер был выключен) выполнится, как только компьютер включат.
# Скрипты копируются в %LOCALAPPDATA%\Oyuur\tools: задача не сломается, если проект переключить на
# старую версию или удалить его копию. После обновления скриптов запустите этот файл ещё раз.
# Убрать: Unregister-ScheduledTask -TaskName 'Oyuur backup'
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$lib = Join-Path $src '..\..\server\src\backup.js'
if (-not (Test-Path $lib)) { throw "Не найден $lib — запускайте из папки tools\backup проекта." }
$dest = Join-Path $env:LOCALAPPDATA 'Oyuur\tools'
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item -Force -Path "$src\backup.ps1", "$src\common.ps1", "$src\restore.ps1", "$src\restore.mjs" -Destination $dest
Copy-Item -Force -Path $lib -Destination (Join-Path $dest 'backup.mjs')
$script = Join-Path $dest 'backup.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At '14:00'),
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'Oyuur backup' -Action $action -Trigger $triggers -Settings $settings `
  -Description 'Копия базы Oyuur с сервера в %USERPROFILE%\Oyuur-backups (скрипты в %LOCALAPPDATA%\Oyuur\tools)' -Force | Out-Null
Write-Host "Готово: задача «Oyuur backup» в Планировщике заданий (каждый день в 14:00 и при входе)."
Write-Host "Скрипты: $dest"
