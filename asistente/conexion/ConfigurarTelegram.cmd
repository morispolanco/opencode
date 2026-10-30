@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar-telegram.ps1"
if errorlevel 1 goto fin
bun "%~dp0emparejar.mjs"
:fin
pause
