@echo off
setlocal
pushd "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\launch-tools.py
) else (
  python tools\launch-tools.py
)
if errorlevel 1 pause
popd
endlocal
