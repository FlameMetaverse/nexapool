@echo off
echo ========================================
echo   DEPLOYING 500 ERROR FIX
echo ========================================
echo.
echo This will:
echo 1. Add supabase initialization check
echo 2. Commit and push to GitHub
echo 3. Render will auto-deploy
echo.
pause

cd /d "%~dp0"

echo.
echo [1/3] Git add...
git add .

echo.
echo [2/3] Git commit...
git commit -m "Fix: Add supabase initialization check to prevent 500 error in weekly leaderboard endpoint"

echo.
echo [3/3] Git push...
git push origin main

echo.
echo ========================================
echo   DEPLOYMENT INITIATED!
echo ========================================
echo.
echo Render will auto-deploy in ~2 minutes
echo Check: https://dashboard.render.com
echo.
echo After deployment, check:
echo https://nexapool-1.onrender.com/api/referrals/weekly-leaderboard
echo.
echo Expected result:
echo {
echo   "weekStart": ...,
echo   "weekEnd": ...,
echo   "totalRegistrations": 0,
echo   "totalPool": 0,
echo   "rankings": []
echo }
echo.
pause
