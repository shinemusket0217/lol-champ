"""롤 클라이언트 밴픽 정보를 읽어서 추천 페이지에 자동으로 채운다 (윈도우용).

실행
    python tools\\live_helper.py           롤 클라이언트에 연결
    python tools\\live_helper.py --mock    가짜 밴픽 데이터로 테스트
    python tools\\live_helper.py --league "E:\\Games\\League of Legends"   롤 설치 폴더를 직접 지정

하는 일
    1. 롤 클라이언트의 로컬 API(LCU)에서 밴픽 정보를 읽는다 (읽기만 함)
    2. web/dist 의 추천 페이지를 http://localhost:8840 에서 띄우고 브라우저를 연다
    3. 페이지는 /api/draft 를 주기적으로 불러 칸을 채운다

파이썬 기본 기능만 쓴다. 따로 설치할 것 없음.
"""

import argparse
import base64
import json
import re
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "web" / "dist"
PORT = 8840
LOCKFILE_PATHS = [
    Path(r"C:\Riot Games\League of Legends\lockfile"),
    Path(r"D:\Riot Games\League of Legends\lockfile"),
    Path(r"C:\Program Files\Riot Games\League of Legends\lockfile"),
]
POSITION = {"top": "탑", "jungle": "정글", "middle": "미드", "bottom": "원딜", "utility": "서폿"}


# ---------- 롤 클라이언트 연결 ----------

def find_client():
    """(port, token)을 찾는다. 실행 중인 클라이언트 프로세스에서 먼저 찾고, 없으면 lockfile을 본다."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | "
             "Select-Object -ExpandProperty CommandLine"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        port = re.search(r"--app-port=(\d+)", out)
        token = re.search(r"--remoting-auth-token=([\w-]+)", out)
        if port and token:
            return int(port.group(1)), token.group(1)
    except (OSError, subprocess.SubprocessError):
        pass
    for path in LOCKFILE_PATHS:
        if path.exists():
            parts = path.read_text().split(":")
            if len(parts) >= 4:
                return int(parts[2]), parts[3]
    return None


class Client:
    def __init__(self):
        self.conn = None
        self.names = {}
        # 클라이언트 인증서는 자체 서명이라 검증할 수 없다. 내 컴퓨터(127.0.0.1)에만 접속한다.
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE

    def get(self, path):
        if not self.conn:
            self.conn = find_client()
            if not self.conn:
                return None, "no_client"
        port, token = self.conn
        auth = base64.b64encode(f"riot:{token}".encode()).decode()
        req = urllib.request.Request(f"https://127.0.0.1:{port}{path}", headers={"Authorization": f"Basic {auth}"})
        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=3) as res:
                return json.loads(res.read().decode("utf-8")), "ok"
        except urllib.error.HTTPError as e:
            return None, "not_found" if e.code == 404 else f"http_{e.code}"
        except (urllib.error.URLError, OSError):
            self.conn = None  # 클라이언트가 꺼졌거나 다시 켜짐
            return None, "no_client"

    def champion_name(self, cid):
        if not cid:
            return None
        if not self.names:
            data, status = self.get("/lol-game-data/assets/v1/champion-summary.json")
            if status == "ok":
                self.names = {c["id"]: c["name"] for c in data if c.get("id", -1) > 0}
        return self.names.get(cid)

    def draft(self):
        session, status = self.get("/lol-champ-select/v1/session")
        if status == "no_client":
            return {"status": "no_client"}
        if status != "ok":
            return {"status": "not_in_select"}
        return parse_session(session, self.champion_name)


def parse_session(session, name_of):
    me = session.get("localPlayerCellId")
    ally, enemy = [], []
    my_position = None
    for p in session.get("myTeam", []):
        pos = POSITION.get(p.get("assignedPosition") or "")
        cid = p.get("championId") or p.get("championPickIntent")
        if p.get("cellId") == me:
            my_position = pos
            continue
        ally.append({"name": name_of(cid), "position": pos, "hover": not p.get("championId")})
    for p in session.get("theirTeam", []):
        n = name_of(p.get("championId"))
        if n:
            enemy.append(n)
    bans = []
    for group in session.get("actions", []):
        for a in group:
            if a.get("type") == "ban" and a.get("completed"):
                n = name_of(a.get("championId"))
                if n:
                    bans.append(n)
    return {"status": "champ_select", "myPosition": my_position, "ally": ally, "enemy": enemy, "bans": bans}


# ---------- 가짜 밴픽 (테스트용) ----------

MOCK_STEPS = [
    {"ally": [("요네", "top"), (None, "middle"), (None, "bottom"), (None, "utility")], "enemy": [], "bans": ["리 신"]},
    {"ally": [("요네", "top"), ("애니비아", "middle"), (None, "bottom"), (None, "utility")], "enemy": ["헤카림", "룰루"], "bans": ["리 신"]},
    {"ally": [("요네", "top"), ("애니비아", "middle"), ("이즈리얼", "bottom"), ("럭스", "utility")],
     "enemy": ["헤카림", "룰루", "미스 포츈", "마오카이", "아칼리"], "bans": ["리 신", "제드"]},
]


class Mock:
    def __init__(self):
        self.start = time.time()

    def draft(self):
        step = MOCK_STEPS[min(len(MOCK_STEPS) - 1, int((time.time() - self.start) // 6))]
        return {
            "status": "champ_select",
            "myPosition": "정글",
            "ally": [{"name": n, "position": POSITION[p], "hover": False} for n, p in step["ally"]],
            "enemy": step["enemy"],
            "bans": step["bans"],
        }


# ---------- 웹 서버 ----------

class Handler(SimpleHTTPRequestHandler):
    source = None

    def do_GET(self):
        if self.path.startswith("/api/draft"):
            body = json.dumps(self.source.draft(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def guess_type(self, path):
        t = super().guess_type(path)
        return t + "; charset=utf-8" if t in ("text/html", "application/json", "text/javascript") else t

    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="롤 밴픽 정보를 정글 추천 페이지에 자동으로 채운다")
    parser.add_argument("--mock", action="store_true", help="가짜 밴픽 데이터로 테스트")
    parser.add_argument("--no-browser", action="store_true", help="브라우저를 자동으로 열지 않음")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--league", help="롤 설치 폴더 (lockfile이 있는 곳). 자동으로 못 찾을 때만")
    args = parser.parse_args()

    if not (DIST / "index.html").exists():
        sys.exit(f"추천 페이지가 없어요: {DIST}. 저장소 전체를 받았는지 확인해 주세요.")
    if args.league:
        LOCKFILE_PATHS.insert(0, Path(args.league) / "lockfile")
    Handler.source = Mock() if args.mock else Client()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(DIST)))
    url = f"http://localhost:{args.port}/index.html"
    print(f"정글 픽 도우미: {url}")
    print("가짜 밴픽으로 테스트 중" if args.mock else "롤 클라이언트를 기다리는 중 (밴픽에 들어가면 자동으로 채워져요)")
    print("끝내려면 Ctrl+C")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n종료")


if __name__ == "__main__":
    main()
