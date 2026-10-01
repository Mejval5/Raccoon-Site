@echo off
setlocal
rem Serves site/ on a fixed port, reachable from this PC and the local network.
rem The port is picked at random once and kept in .local-port (gitignored),
rem so the URL stays the same and can be bookmarked.
set "PORTFILE=%~dp0.local-port"
if exist "%PORTFILE%" goto serve
set /a PORT=%RANDOM% %% 30000 + 20000
>"%PORTFILE%" echo %PORT%
:serve
set /p PORT=<"%PORTFILE%"
echo.
echo   Raccoon Website
echo   This PC:         http://localhost:%PORT%/
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object IPAddress"`) do echo   Local network:   http://%%i:%PORT%/
echo   (port saved in .local-port, bookmark these)
echo.
python "%~dp0scripts\serve.py" %PORT% "%~dp0site"
