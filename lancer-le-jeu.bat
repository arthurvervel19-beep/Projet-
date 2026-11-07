@echo off
title Aube des Royaumes
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n est pas installe. Installez la version LTS depuis https://nodejs.org puis relancez ce fichier.
  start "" https://nodejs.org
  pause
  exit /b
)
echo Lancement du jeu... Laissez cette fenetre ouverte pendant la partie.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
