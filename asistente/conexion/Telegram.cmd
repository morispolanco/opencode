@echo off
chcp 65001 >nul
bun "%~dp0puente.mjs" %*
pause
