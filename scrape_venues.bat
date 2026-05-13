@echo off
cd /d %~dp0

echo.
echo ========================================
echo   UNDERGHENT — Venue Website Scraper
echo   (Facebook NOT included)
echo ========================================
echo.

python scrape_venues.py

echo.
echo ========================================
pause
