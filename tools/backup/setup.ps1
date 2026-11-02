# Шаг 1: запомнить ключ владельца (OWNER_TOKEN) и адрес сервера на этом компьютере.
# Ключ хранится зашифрованным средствами Windows (DPAPI) в %LOCALAPPDATA%\Oyuur, папка — только для вас.
# Запуск: powershell -ExecutionPolicy Bypass -File setup.ps1 [-Server https://…]
param([string]$Server)
. "$PSScriptRoot\common.ps1"

Protect-Folder $ConfigDir
Protect-Folder $BackupFolder

if ($env:OYUUR_OWNER_KEY) {
  # Для проверки без вопросов: ключ из переменной окружения.
  $secure = ConvertTo-SecureString $env:OYUUR_OWNER_KEY -AsPlainText -Force
} else {
  $secure = Read-Host 'Вставьте ключ владельца (тот же, что для страницы /owner)' -AsSecureString
}
if ($secure.Length -lt 16) { throw 'Ключ короче 16 знаков — это не он.' }
$secure | ConvertFrom-SecureString | Set-Content -Path $KeyFile -Encoding ASCII

if ($Server) { Set-Content -Path $ServerFile -Value $Server.TrimEnd('/') -Encoding UTF8 }

Write-Host ''
Write-Host "Ключ сохранён: $KeyFile"
Write-Host "Сервер: $(Get-Server)"
Write-Host "Копии будут здесь: $BackupFolder"
Write-Host 'Дальше: запустите backup.ps1 один раз, чтобы проверить, затем schedule.ps1.'
