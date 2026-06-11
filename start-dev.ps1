# MyButler dev servers - start each service in a separate tab
$ProjectRoot = $PSScriptRoot

function Start-InNewWindow {
    $commands = @(
        'npm run dev:backend',
        'npm run dev:frontend',
        'npm run dev:detector',
        'npm run dev:notification'
    )

    foreach ($command in $commands) {
        $psCommand = "Set-Location -LiteralPath '$ProjectRoot'; $command"
        Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-Command', $psCommand
        Start-Sleep -Milliseconds 300
    }

    Write-Host 'Started 4 PowerShell windows.' -ForegroundColor Green
}

if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    $wtArgs = @(
        '-w', '0',
        'new-tab', '-d', $ProjectRoot, '--title', 'MyButler-Backend', 'cmd', '/k', "cd /d `"$ProjectRoot`" && npm run dev:backend",
        ';',
        'new-tab', '-d', $ProjectRoot, '--title', 'MyButler-Frontend', 'cmd', '/k', "cd /d `"$ProjectRoot`" && npm run dev:frontend",
        ';',
        'new-tab', '-d', $ProjectRoot, '--title', 'MyButler-Detector', 'cmd', '/k', "cd /d `"$ProjectRoot`" && npm run dev:detector",
        ';',
        'new-tab', '-d', $ProjectRoot, '--title', 'MyButler-Notification', 'cmd', '/k', "cd /d `"$ProjectRoot`" && npm run dev:notification"
    )

    Start-Process -FilePath 'wt.exe' -ArgumentList $wtArgs
    Write-Host 'Started dev servers in Windows Terminal tabs.' -ForegroundColor Green
}
else {
    Write-Host 'Windows Terminal not found. Starting separate windows...' -ForegroundColor Yellow
    Start-InNewWindow
}

Write-Host ''
Write-Host '  Backend      -> http://localhost:3001' -ForegroundColor Cyan
Write-Host '  Frontend     -> http://localhost:5173' -ForegroundColor Cyan
Write-Host '  Detector     -> http://localhost:5001' -ForegroundColor Cyan
Write-Host '  Notification -> LINE scheduler' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Open http://localhost:5173 in your browser.' -ForegroundColor Cyan
