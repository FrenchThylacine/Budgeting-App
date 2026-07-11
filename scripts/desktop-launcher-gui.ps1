Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$PROJECT_DIR = 'C:\Users\iyadf\Documents\Codex\2026-07-09\build-a-premium-budget-app-from'
$DEV_PORT = 5173
$PREVIEW_PORT = 4173
$GHPAGES_URL = 'https://FrenchThylacine.github.io/Budgeting-App/'

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Budgeting App Launcher'
$form.Size = New-Object System.Drawing.Size(420,320)
$form.StartPosition = 'CenterScreen'
$form.Topmost = $false

# Notify icon (tray)
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Visible = $true
$notify.Text = 'Budgeting App Launcher'
$context = New-Object System.Windows.Forms.ContextMenu
$miOpen = New-Object System.Windows.Forms.MenuItem('Open')
$miExit = New-Object System.Windows.Forms.MenuItem('Exit')
$context.MenuItems.Add($miOpen) | Out-Null
$context.MenuItems.Add($miExit) | Out-Null
$notify.ContextMenu = $context
$miOpen.Click.Add({ $form.WindowState = 'Normal'; $form.Show(); $form.BringToFront() })
$miExit.Click.Add({ $notify.Dispose(); $form.Close() })

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

# Timer to poll ports and show notification when ready
$portTimer = New-Object System.Windows.Forms.Timer
$portTimer.Interval = 1000
$portTimerState = @{ Port = $null; Action = $null }
$portTimer.Add_Tick({
    if(-not $portTimerState.Port) { return }
    try{ $c = Test-NetConnection -ComputerName 'localhost' -Port $portTimerState.Port -WarningAction SilentlyContinue } catch{ $c = $null }
    if ($c -and $c.TcpTestSucceeded) {
        $notify.ShowBalloonTip(3000, 'Server ready', "Server is listening on port $($portTimerState.Port)", [System.Windows.Forms.ToolTipIcon]::Info)
        # open browser local + LAN
        Start-Process "http://localhost:$($portTimerState.Port)"
        try{ $ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1 -ExpandProperty IPAddress); if($ip){ Start-Process "http://$ip:$($portTimerState.Port)" } } catch{}
        $portTimer.Stop()
        $portTimerState.Port = $null
        $portTimerState.Action = $null
    }
})

function Open-BrowserWhenReady($port){
    $tries = 0
    while ($tries -lt 120) {
        try{ $c = Test-NetConnection -ComputerName 'localhost' -Port $port -WarningAction SilentlyContinue } catch{ $c = $null }
        if ($c -and $c.TcpTestSucceeded) { break }
        Start-Sleep -Seconds 1
        $tries++
    }
    if ($tries -lt 120){
        Start-Process "http://localhost:$port"
        try{ $ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1 -ExpandProperty IPAddress); if($ip){ Start-Process "http://$ip:$port" } } catch{}
    }
}

$btnDev.Add_Click({
    $label.Text = 'Status: Starting dev server...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/k cd /d `"$PROJECT_DIR`" && if not exist node_modules (npm ci) && npm run dev" -WindowStyle Normal
    $portTimerState.Port = $DEV_PORT
    $portTimerState.Action = 'dev'
    $portTimer.Start()
    $label.Text = 'Status: Dev server launching...'
})

$btnPreview.Add_Click({
    $label.Text = 'Status: Building & previewing...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/k cd /d `"$PROJECT_DIR`" && if not exist node_modules (npm ci) && npm run build && npm run preview" -WindowStyle Normal
    $portTimerState.Port = $PREVIEW_PORT
    $portTimerState.Action = 'preview'
    $portTimer.Start()
    $label.Text = 'Status: Preview launching...'
})

$btnOpen.Add_Click({ Start-Process $GHPAGES_URL })

$btnStop.Add_Click({
    $label.Text = 'Status: Stopping servers...'
    try{ Get-NetTCPConnection -LocalPort $DEV_PORT -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } } catch{}
    try{ Get-NetTCPConnection -LocalPort $PREVIEW_PORT -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } } catch{}
    $notify.ShowBalloonTip(2000, 'Servers stopped', "Stopped servers on ports $DEV_PORT and $PREVIEW_PORT", [System.Windows.Forms.ToolTipIcon]::Info)
    $label.Text = 'Status: Servers stopped'
})

$btnOpenProject.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$PROJECT_DIR`"" })

$form.add_Resize({
    if ($form.WindowState -eq 'Minimized'){
        $form.Hide()
        $notify.ShowBalloonTip(1500, 'Budgeting App', 'Launcher minimized to tray. Right-click the tray icon to restore.', [System.Windows.Forms.ToolTipIcon]::Info)
    }
})

[void] $form.ShowDialog()
