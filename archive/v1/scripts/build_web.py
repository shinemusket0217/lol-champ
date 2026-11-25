"""웹 페이지를 만든다.

1. data/ 를 web/data.json 으로 내보낸다 (export_web.py)
2. web/app.html 에 web/engine.js 를 넣어 web/dist/index.html 을 만든다
3. web/dist/data.json 을 복사한다

실행: python3 scripts/build_web.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def main():
    subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "export_web.py")], check=True)
    html = (WEB / "app.html").read_text(encoding="utf-8")
    engine = (WEB / "engine.js").read_text(encoding="utf-8")
    assert "/*ENGINE*/" in html
    out = WEB / "dist"
    out.mkdir(exist_ok=True)
    (out / "index.html").write_text(html.replace("/*ENGINE*/", engine), encoding="utf-8")
    shutil.copy(WEB / "data.json", out / "data.json")
    print("web/dist/index.html, web/dist/data.json 생성")


if __name__ == "__main__":
    main()
