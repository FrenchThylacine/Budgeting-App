# Installer script: installs the GUI launcher and batch to Desktop and Start Menu
param(
  [string]$TargetDesktop = "$env:USERPROFILE\Desktop",
  [switch]$Force
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path "$repoRoot\.."
$srcGui = Join-Path $repoRoot 'scripts\launch-gui.ps1'
$srcBat = Join-Path $repoRoot 'scripts\launch-desktop.bat'
$destGui = Join-Path $TargetDesktop 'Budget-Launcher-GUI.ps1'
$destBat = Join-Path $TargetDesktop 'Launch-Budget-App.bat'

Write-Host "Installing launcher to Desktop: $TargetDesktop"

if (Test-Path $destGui -and -not $Force) { Write-Host "GUI already exists at $destGui. Use -Force to overwrite."; exit 1 }
if (Test-Path $destBat -and -not $Force) { Write-Host "Batch already exists at $destBat. Use -Force to overwrite."; exit 1 }

Copy-Item -Path $srcGui -Destination $destGui -Force
Copy-Item -Path $srcBat -Destination $destBat -Force

# create a shortcut that launches PowerShell with the GUI (bypass execution policy)
$WshShell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $TargetDesktop 'Budgeting App.lnk'
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$destGui`""
$shortcut.WorkingDirectory = $TargetDesktop
$shortcut.IconLocation = "$env:SystemRoot\system32\shell32.dll,4"
$shortcut.Save()

Write-Host "Launcher installed. Shortcut created: $shortcutPath"
Write-Host "You can now double-click the shortcut to open the GUI launcher."
