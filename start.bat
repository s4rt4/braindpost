@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "PATH=C:\Users\Sarta\.local\bin;%PATH%"

REM Backend di window terpisah
start "Braindpost Backend" cmd /k "cd /d "%PROJECT_DIR%backend" && uv run uvicorn app.main:app --reload --port 8001"

REM Frontend di window terpisah
start "Braindpost Frontend" cmd /k "cd /d "%PROJECT_DIR%frontend" && npm run dev"

REM Tunggu frontend siap, lalu buka browser
timeout /t 6 /nobreak > nul
start "" "http://localhost:5174"

endlocal
exit
