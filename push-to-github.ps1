# Push Backend to GitHub - Helper Script

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Push Backend to GitHub                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get GitHub username
$username = Read-Host "Enter your GitHub username"

# Construct GitHub URL
$githubUrl = "https://github.com/$username/autoboost-backend.git"

Write-Host ""
Write-Host "GitHub URL: $githubUrl" -ForegroundColor Yellow
Write-Host ""

# Check if remote already exists
$remoteExists = git remote get-url origin 2>&1

if ($remoteExists -like "*fatal*") {
    Write-Host "Adding GitHub remote..." -ForegroundColor Green
    git remote add origin $githubUrl
} else {
    Write-Host "Remote already exists, updating..." -ForegroundColor Yellow
    git remote set-url origin $githubUrl
}

Write-Host ""
Write-Host "Setting main branch..." -ForegroundColor Green
git branch -M main

Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Green
Write-Host "(You'll be asked for GitHub username + token)" -ForegroundColor Yellow
Write-Host ""

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  ✅ SUCCESS!                           ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your code is now on GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step: Deploy on Render.com" -ForegroundColor Cyan
    Write-Host "Go to: https://dashboard.render.com/register" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ❌ FAILED                             ║" -ForegroundColor Red
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "1. GitHub repository not created yet" -ForegroundColor White
    Write-Host "2. Need to use Personal Access Token (not password)" -ForegroundColor White
    Write-Host "3. Create token at: https://github.com/settings/tokens/new" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
