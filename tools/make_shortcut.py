"""바탕화면에 "정글 픽 도우미" 바로가기를 만든다 (윈도우).

한글 경로가 깨지지 않도록 PowerShell 명령을 UTF-16으로 인코딩해서 넘긴다.
"""

import base64
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "정글 픽 도우미.bat"


def ps_quote(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    if not TARGET.exists():
        sys.exit(f"실행 파일이 없어요: {TARGET}")
    script = f"""
$desktop = [Environment]::GetFolderPath('Desktop')
$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop '정글 픽 도우미.lnk'))
$s.TargetPath = {ps_quote(TARGET)}
$s.WorkingDirectory = {ps_quote(ROOT)}
$s.WindowStyle = 7
$s.Description = '롤 밴픽을 읽어 정글 챔피언을 추천해요'
$s.Save()
"""
    encoded = base64.b64encode(script.encode("utf-16-le")).decode()
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
                       capture_output=True, text=True)
    if r.returncode == 0:
        print('바탕화면에 "정글 픽 도우미" 바로가기를 만들었어요. 이제 그걸 더블클릭하면 돼요.')
    else:
        print("바로가기를 만들지 못했어요.")
        print(r.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
