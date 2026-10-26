@echo off
REM Sobe um servidor local e abre o navegador. Requer Python 3 (ou Node.js como alternativa).
cd /d "%~dp0"
set PORT=8080
echo Servidor em http://localhost:%PORT%  (Ctrl+C para parar)
start "" http://localhost:%PORT%
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT%
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT%
  goto :eof
)
where node >nul 2>nul
if %errorlevel%==0 (
  node tools\serve.mjs
  goto :eof
)
echo Instale Python 3 ou Node.js 18+ para iniciar o servidor local.
pause
