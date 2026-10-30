@echo off
chcp 65001 >nul
where bun >nul 2>nul || (echo Falta Bun 1.4.4. Instala desde https://bun.sh y vuelve a abrir esta ventana. & pause & exit /b 1)
where git >nul 2>nul || (echo Falta Git. Instala desde https://git-scm.com/downloads y vuelve a abrir esta ventana. & pause & exit /b 1)
bun "%~dp0install.mjs" %*
pause
