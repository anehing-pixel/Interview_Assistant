@echo off
rem Double-click to run the interview assistant in dev mode.
rem Clears ELECTRON_RUN_AS_NODE so electron.exe really starts Electron instead of plain Node.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ATTACH_CONSOLE=
npm run dev
echo.
echo [dev exited]
pause
