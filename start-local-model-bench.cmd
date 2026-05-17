@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte installiere Node.js 18 oder neuer und starte danach erneut.
  echo Download: https://nodejs.org/
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if "%NODE_MAJOR%"=="" (
  echo Node.js-Version konnte nicht ermittelt werden.
  exit /b 1
)

if %NODE_MAJOR% LSS 18 (
  echo Die installierte Node.js-Version ist zu alt.
  node --version
  echo Bitte installiere Node.js 18 oder neuer.
  exit /b 1
)

node .\start_ui.mjs %*
