@echo off
start cmd /k "python -m http.server 8000" 
timeout /t 5 >nul
start http://localhost:8000