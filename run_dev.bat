@echo off
title Onyx Music (Dev Mode)
cd /d "%~dp0"
echo Starting Onyx Music in Development Mode...
pnpm tauri dev
pause
