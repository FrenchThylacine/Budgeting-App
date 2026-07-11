Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Resolve-Path "$PROJECT_DIR\.."
$DEV_PORT = 5173
$PREVIEW_PORT = 4173
$GHPAGES_URL = 'https://FrenchThylacine.github.io/Budgeting-App/'

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Budgeting App Launcher (repo)'
$form.Size = New-Object System.Drawing.Size(420,260)
$form.StartPosition = 'CenterScreen'

$btnDev = New-Object System.Windows.Forms.Button
$btnDev.Text = 'Start Dev Server'
$btnDev.Size = New-Object System.Drawing.Size(160,40)
$btnDev.Location = New-Object System.Drawing.Point(20,20)
$form.Controls.Add($btnDev)

$btnPreview = New-Object System.Windows.Forms.Button
$btnPreview.Text = 'Build & Preview'
$btnPreview.Size = New-Object System.Drawing.Size(160,40)
$btnPreview.Location = New-Object System.Drawing.Point(220,20)
$form.Controls.Add($btnPreview)

$btnOpen = New-Object System.Windows.Forms.Button
$btnOpen.Text = 'Open GitHub Pages'
$btnOpen.Size = New-Object System.Drawing.Size(160,40)
$btnOpen.Location = New-Object System.Drawing.Point(20,80)
$form.Controls.Add($btnOpen)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = 'Stop Servers'
$btnStop.Size = New-Object System.Drawing.Size(160,40)
$btnStop.Location = New-Object System.Drawing.Point(220,80)
$form.Controls.Add($btnStop)

$btnOpenProject = New-Object System.Windows.Forms.Button
$btnOpenProject.Text = 'Open Project Folder'
$btnOpenProject.Size = New-Object System.Drawing.Size(360,36)
$btnOpenProject.Location = New-Object System.Drawing.Point(20,140)
$form.Controls.Add($btnOpenProject)

$label = New-Object System.Windows.Forms.Label
$label.Text = 'Status: Idle'
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(20,190)
$form.Controls.Add($label)

$btnDev.Add_Click({
    $label.Text = 'Status: Starting dev server...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/k cd /d `"$PROJECT_DIR`" && if not exist node_modules (npm ci) && npm run dev" -WindowStyle Normal
    Start-Job -ScriptBlock { param($p) Start-Sleep -Seconds 1; & { $tries=0; while($tries -lt 120){ try{ $c=Test-NetConnection -ComputerName 'localhost' -Port $using:DEV_PORT -WarningAction SilentlyContinue; if($c.TcpTestSucceeded){ break } } catch{}; Start-Sleep -Seconds 1; $tries++ }; if($tries -lt 120){ Start-Process 'http://localhost:$using:DEV_PORT' } } } | Out-Null
    Start-Job -ScriptBlock { param($p) Start-Sleep -Seconds 1; & { $tries=0; while($tries -lt 120){ try{ $c=Test-NetConnection -ComputerName 'localhost' -Port $using:DEV_PORT -WarningAction SilentlyContinue; if($c.TcpTestSucceeded){ break } } catch{}; Start-Sleep -Seconds 1; $tries++ }; if($tries -lt 120){ try{ $ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1 -ExpandProperty IPAddress); if($ip){ Start-Process "http://$ip:$using:DEV_PORT" } } catch{} } } } | Out-Null
    $label.Text = 'Status: Dev server started (check browser)'
})

$btnPreview.Add_Click({
    $label.Text = 'Status: Building & previewing...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/k cd /d `"$PROJECT_DIR`" && if not exist node_modules (npm ci) && npm run build && npm run preview" -WindowStyle Normal
    Start-Job -ScriptBlock { Start-Sleep -Seconds 2; & { $tries=0; while($tries -lt 120){ try{ $c=Test-NetConnection -ComputerName 'localhost' -Port $using:PREVIEW_PORT -WarningAction SilentlyContinue; if($c.TcpTestSucceeded){ break } } catch{}; Start-Sleep -Seconds 1; $tries++ }; if($tries -lt 120){ Start-Process 'http://localhost:$using:PREVIEW_PORT' } } } | Out-Null
    $label.Text = 'Status: Preview started (check browser)'
})

$btnOpen.Add_Click({ Start-Process $GHPAGES_URL })

$btnStop.Add_Click({
    $label.Text = 'Status: Stopping servers...'
    try{ Get-NetTCPConnection -LocalPort $DEV_PORT -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } } catch{}
    try{ Get-NetTCPConnection -LocalPort $PREVIEW_PORT -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } } catch{}
    $label.Text = 'Status: Servers stopped'
})

$btnOpenProject.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$PROJECT_DIR`"" })

[void] $form.ShowDialog()
