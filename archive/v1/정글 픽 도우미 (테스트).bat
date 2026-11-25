@echo off
chcp 65001 > nul
cd /d "%~dp0"
set PY=python
where python > nul 2> nul || set PY=py
%PY% tools\live_helper.py --mock %*
if errorlevel 1 (
  echo.
  echo 실행 중 문제가 생겼어요. 위 내용을 캡처해서 알려주세요.
  pause
)
