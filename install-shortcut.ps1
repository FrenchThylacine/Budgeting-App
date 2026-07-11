# install-shortcut.ps1
# Copies the repository Budget App.lnk to the current user's Desktop, or creates a shortcut from run-local.bat if source .lnk is missing.
param(
  [string] $ProjectRoot = (Split-Path -Parent $MyInvocation.MyCommand.Definition)
)
$desktop = Join-Path $env:USERPROFILE 'Desktop'
if (-not (Test-Path $desktop)) {
  Write-Host "Desktop path not found: $desktop. Cannot create shortcut automatically."
  exit 1
}
$sourceLnk = Join-Path $ProjectRoot 'Budget App.lnk'
$targetLnk = Join-Path $desktop 'Budget App.lnk'
if (Test-Path $sourceLnk) {
  Copy-Item -Path $sourceLnk -Destination $targetLnk -Force
  Write-Host "Copied Budget App.lnk to Desktop: $targetLnk"
  exit 0
}
# If Budget App.lnk not present, create shortcut from run-local.bat
$runBat = Join-Path $ProjectRoot 'run-local.bat'
if (-not (Test-Path $runBat)) {
  Write-Host "run-local.bat not found at $runBat. Nothing to create."
  exit 1
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($targetLnk)
$shortcut.TargetPath = $runBat
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.WindowStyle = 1
$shortcut.Description = 'Launch Premium Budget App'
$shortcut.Save()
Write-Host "Created shortcut on Desktop at $targetLnk"
