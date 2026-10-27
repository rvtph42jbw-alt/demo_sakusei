@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) === 24 ? 0 : 1)"
if errorlevel 1 (
  echo Please use Node.js 24.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist dist\index.html (
  call npm.cmd run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo After "Safety server listening on port 3000" appears, open:
echo http://localhost:3000/#/sitemap
echo Keep this window open. Press Ctrl+C to stop.
echo.
call npm.cmd start
pause
