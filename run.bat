@echo off
cd /d %~dp0

echo.
echo ========================================
echo   UNDERGHENT / EVENTGHENT PIPELINE
echo   Multi-source event aggregator
echo ========================================
echo.

python main.py

echo.
echo ========================================
pause
