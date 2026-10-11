@echo off
rem Double-click this file to start Gate on Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-gate.ps1" %*
if errorlevel 1 (
  echo.
  echo Gate did not start. See the error above and backend\work\*.log.
  pause
  exit /b 1
)
