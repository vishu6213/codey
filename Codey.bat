@echo off
title Codey Desktop
cd /d "%~dp0"
node apps/desktop/scripts/start-electron.mjs %*

