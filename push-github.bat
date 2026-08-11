@echo off
cd /d "%~dp0"

echo === GitHub Push Setup ===
echo.

REM Remove corrupted .git if exists
if exist ".git\config" (
    for /f %%A in (".git\config") do set size=%%~zA
    if %size% LSS 50 (
        echo Removing corrupted .git folder...
        rmdir /s /q .git
    )
)

REM Init if needed
if not exist ".git" (
    git init -b main
    git remote add origin https://github.com/soxmfhvl123/Global-Design-Leadership-Association.git
)

git config user.email "soxmfhvl123@gmail.com"
git config user.name "soxmfhvl123"

git add .
git commit -m "Initial commit: GDLA website with mobile responsive design"

echo.
echo === Pushing to GitHub ===
echo You will be asked for your GitHub credentials.
echo Username: soxmfhvl123
echo Password: use your Personal Access Token (NOT your GitHub password)
echo   To create a token: GitHub.com - Settings - Developer settings - Personal access tokens
echo.
git push -u origin main

echo.
echo Done!
pause
