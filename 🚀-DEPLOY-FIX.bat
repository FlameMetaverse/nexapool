@echo off
echo ========================================
echo  DEPLOY WEEKLY LEADERBOARD FIX
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Adding changes to git...
git add src/api.js
echo.

echo [2/3] Committing changes...
git commit -m "Fix: Weekly leaderboard now shows only current week (Monday 00:00 UTC)"
echo.

echo [3/3] Pushing to GitHub (triggers Render auto-deploy)...
git push origin main
echo.

echo ========================================
echo  DEPLOYMENT INITIATED!
echo ========================================
echo.
echo Render will auto-deploy in ~2 minutes.
echo.
echo Monitor deployment:
echo https://dashboard.render.com
echo.
echo Test the fix:
echo curl https://nexapool-backend.onrender.com/api/leaderboard/weekly-referrals
echo.
pause
