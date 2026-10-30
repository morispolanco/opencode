@echo off
chcp 65001 >nul
bun "%~dp0servidor.mjs" %*
pause
