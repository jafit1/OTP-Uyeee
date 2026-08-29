@echo off
title OTP Uyeee - Shopee Checker Starter
color 0A
echo.
echo  ========================================
echo    OTP Uyeee - Shopee Checker Starter
echo  ========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python tidak ditemukan!
    pause
    exit /b 1
)

REM Check cloudflared
if not exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    echo  [ERROR] cloudflared tidak ditemukan!
    pause
    exit /b 1
)

REM Check bot.py
if not exist "D:\Project\otp-uyeee\telegram-checker\bot.py" (
    echo  [ERROR] bot.py tidak ditemukan!
    pause
    exit /b 1
)

echo  [OK] All checks passed
echo.

REM Kill old cloudflared
taskkill /F /IM cloudflared.exe >nul 2>&1

REM Start bot.py
echo  [1/3] Starting Bot Checker...
start "Bot Checker" cmd /k "cd /d D:\Project\otp-uyeee\telegram-checker && python bot.py"

REM Wait for bot to start
echo  [2/3] Waiting 12 seconds for bot to start...
timeout /t 12 /nobreak

REM Start tunnel
echo  [3/3] Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "& ""C:\Program Files (x86)\cloudflared\cloudflared.exe"" tunnel --url http://localhost:5000"

echo.
echo  ========================================
echo    Services started!
echo    - Bot Checker: Terminal 1
echo    - Tunnel:      Terminal 2
echo.
echo    IMPORTANT: Check terminal 2 for URL
echo    and update Vercel if URL changed!
echo  ========================================
echo.
pause
