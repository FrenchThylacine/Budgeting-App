@echo off
setlocal

:: Repo copy of the launcher for version control
set "PROJECT_DIR=%~dp0.."
for %%i in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fi"
set "DEV_PORT=5173"
set "PREVIEW_PORT=4173"
set "GHPAGES_URL=https://FrenchThylacine.github.io/Budgeting-App/"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Please install Node.js from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

:MENU
cls
echo Budgeting App Launcher (repo script)
echo Project: %PROJECT_DIR%
echo.
echo 1) Start dev server
echo 2) Build & Preview
echo 3) Open GitHub Pages site
echo 4) Stop servers
echo 5) Exit
set /p choice="Choose [1-5]: "
if "%choice%"=="1" start "Budget Dev" cmd /k "cd /d "%PROJECT_DIR%" && if not exist node_modules (npm ci) && npm run dev" & goto MENU
if "%choice%"=="2" start "Budget Preview" cmd /k "cd /d "%PROJECT_DIR%" && if not exist node_modules (npm ci) && npm run build && npm run preview" & goto MENU
if "%choice%"=="3" start "" "%GHPAGES_URL%" & goto MENU
if "%choice%"=="4" (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%DEV_PORT% "') do taskkill /PID %%a /F >nul 2>&1
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PREVIEW_PORT% "') do taskkill /PID %%a /F >nul 2>&1
  echo Done.
  pause
  goto MENU
)
exit /b 0
