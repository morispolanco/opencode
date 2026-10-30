@echo off
chcp 65001 >nul
bun "%~dp0..\conexion\gracian.mjs" %*
