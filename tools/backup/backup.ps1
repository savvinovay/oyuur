# Скачать последнюю копию базы Oyuur с сервера на этот компьютер (OYUUR-36).
# Копия зашифрована ключом владельца; здесь она проверяется (расшифровка + integrity_check) и
# кладётся в %USERPROFILE%\Oyuur-backups как oyuur-ГГГГ-ММ-ДД.oyuurbak. Хранятся 14 последних.
# Если копия этого дня уже есть — ничего не делает (можно запускать сколько угодно раз).
# Журнал: %USERPROFILE%\Oyuur-backups\backup.log. Код выхода: 0 — хорошо, 1 — ошибка.
. "$PSScriptRoot\common.ps1"

$server = Get-Server
$token = $null
$part = $null
try {
  $key = Get-OwnerKey
  $login = Invoke-RestMethod -Method Post -Uri "$server/api/owner/login" -ContentType 'application/json; charset=utf-8' `
    -Body (ConvertTo-Json @{ key = $key }) -UseBasicParsing
  $token = $login.token
  $auth = @{ Authorization = "Bearer $token" }

  $info = Invoke-RestMethod -Uri "$server/api/owner/backup" -Headers $auth -UseBasicParsing
  if (-not $info.latest) { Write-Log 'На сервере пока нет ни одной копии (первая появится после 4:00 по серверу).'; exit 0 }
  $day = $info.latest.day
  if ($day -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "Странный ответ сервера: $day" }
  $name = "oyuur-$day.oyuurbak"
  $file = Join-Path $BackupFolder $name
  if (Test-Path $file) { Write-Log "Копия за $day уже есть, скачивать нечего."; exit 0 }

  if (-not (Test-Path $BackupFolder)) { Protect-Folder $BackupFolder }
  $part = "$file.part"
  # Потоком прямо в файл (не целиком в память), и день — из заголовка этого же ответа.
  $req = [Net.HttpWebRequest]::Create("$server/api/owner/backup/latest")
  $req.Headers.Add('Authorization', "Bearer $token")
  $req.Timeout = 60000
  $req.ReadWriteTimeout = 300000
  $res = $req.GetResponse()
  try {
    $got = $res.Headers['x-backup-day']
    if ($got -match '^\d{4}-\d{2}-\d{2}$' -and $got -ne $day) {
      # Пока шёл запрос, сервер сделал новую: назовём по настоящему дню.
      $day = $got; $name = "oyuur-$day.oyuurbak"; $file = Join-Path $BackupFolder $name; $part = "$file.part"
    }
    $in = $res.GetResponseStream()
    $outStream = [IO.File]::Create($part)
    try { $in.CopyTo($outStream) } finally { $outStream.Dispose(); $in.Dispose() }
  } finally {
    $res.Dispose()
  }

  try {
    $check = Invoke-Restore -File $part -OutFile '' -Key $key
  } catch {
    # Проверить нечем (нет Node.js) — файл всё равно оставляем: копия без проверки лучше, чем никакой.
    Move-Item -Force $part "$file.unverified"
    $part = $null
    throw "Скачана, но не проверена ($($_.Exception.Message)). Лежит как $name.unverified."
  }
  if (-not $check.Ok) {
    Move-Item -Force $part "$file.unverified"
    $part = $null
    throw "Копия не прошла проверку: $($check.Text) Файл оставлен как $name.unverified."
  }
  Move-Item -Force $part $file
  Remove-Item -Force "$file.unverified" -ErrorAction SilentlyContinue
  $part = $null
  $len = (Get-Item $file).Length
  $size = if ($len -ge 1MB) { '{0:N1} МБ' -f ($len / 1MB) } else { '{0:N0} КБ' -f [math]::Max(1, $len / 1KB) }
  Write-Log "Скачана копия за $day ($size в зашифрованном виде). $($check.Text)"

  $old = Get-ChildItem -Path $BackupFolder -Filter 'oyuur-*.oyuurbak' | Sort-Object Name -Descending | Select-Object -Skip $Keep
  foreach ($f in $old) { Remove-Item -Force $f.FullName; Write-Log "Удалена старая копия $($f.Name)." }
  $old = Get-ChildItem -Path $BackupFolder -Filter 'oyuur-*.oyuurbak.unverified' | Sort-Object Name -Descending | Select-Object -Skip $Keep
  foreach ($f in $old) { Remove-Item -Force $f.FullName }

  $age = ((Get-Date).Date - [datetime]::ParseExact($day, 'yyyy-MM-dd', $null)).Days
  if ($age -ge 2) { Write-Log "ВНИМАНИЕ: последняя копия на сервере — $age дн. назад. Сервер, похоже, перестал их делать." }
  exit 0
} catch {
  $msg = $_.Exception.Message
  $code = $null
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 401) { $msg = 'Сервер не принял ключ (401). Ключ поменяли? Запустите setup.ps1 заново.' }
  elseif ($code -eq 404) { $msg = 'Сервер ответил 404: на нём не включена страница владельца или старая версия сервера.' }
  elseif ($code -eq 429) { $msg = 'Слишком много попыток (429). Попробуйте через час.' }
  elseif ($_.Exception -is [Net.WebException] -and -not $code) { $msg = "Нет связи с сервером $server ($msg). Попробую в следующий раз." }
  Write-Log "ОШИБКА: $msg"
  exit 1
} finally {
  if ($part -and (Test-Path $part)) { Remove-Item -Force $part }
  if ($token) {
    try { Invoke-RestMethod -Method Post -Uri "$server/api/owner/logout" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing | Out-Null } catch {}
  }
}
