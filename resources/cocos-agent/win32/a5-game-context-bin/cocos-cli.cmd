@echo off
setlocal
REM The cocos-cli cocos-agent bundles, run by the app's Electron as Node. Git Bash uses the script beside it.
for %%I in ("%~dp0..") do set "RESOURCES=%%~fI"
for %%I in ("%RESOURCES%\..") do set "APP_DIR=%%~fI"
REM Why Orca.exe: the Windows build keeps Orca's executable name, which native\windows-cli-launcher also expects.
set "ELECTRON=%APP_DIR%\Orca.exe"
set "PACKAGE_ROOT=%RESOURCES%\a5-game-context"
if not exist "%ELECTRON%" (
  echo Unable to find cocos-agent's Orca.exe next to "%RESOURCES%" 1>&2
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
set "A5_NODE_EXE=%ELECTRON%"
set "A5_NODE_BINARY=%ELECTRON%"
set "A5_GAME_CONTEXT_PACKAGE_ROOT=%PACKAGE_ROOT%"
REM Why: options set for the user's own Node may not be valid for Electron's.
set "NODE_OPTIONS="
"%ELECTRON%" "%PACKAGE_ROOT%\dist\cli\cocos-cli.js" %*
exit /b %ERRORLEVEL%
