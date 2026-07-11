param(
  [int]$Port = 5173,
  [string]$ServerHost = "127.0.0.1"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

Write-Host "Starting Budget OS local dev server on http://${ServerHost}:$Port ..."

$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run start -- --host $ServerHost --port $Port" -WorkingDirectory $scriptDir -NoNewWindow -PassThru

$uri = "http://${ServerHost}:$Port"
for ($i = 0; $i -lt 20; $i++) {
  try {
    $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      Write-Host "Server is ready. Opening browser at $uri"
      Start-Process $uri
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if ($i -ge 20) {
  Write-Host "Unable to confirm the server is ready after 20 seconds. Open $uri manually once the app has started."
}

Write-Host "Budget OS startup script is running. Keep this window open to keep the dev server alive."
