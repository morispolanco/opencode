@echo off
chcp 65001 >nul
bun "%~dp0launcher\launch.mjs" %*
pause
