"""문장에서 챔피언 이름을 뽑는다.

"진입"의 "진", "카직스"의 "직스"처럼 다른 단어 속에 섞인 이름을 잘못 뽑지 않도록
- 긴 이름부터 찾고, 찾은 부분은 지운다
- 이름 앞 글자가 한글이면 다른 단어의 일부로 본다
- 두 글자 이하 이름은 뒤에 조사나 한글이 아닌 글자가 올 때만 인정한다
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data.champions import CHAMPIONS  # noqa: E402

ALIASES = {
    "신짜오": "신 짜오",
    "리신": "리 신",
    "문도": "문도 박사",
    "누누": "누누와 윌럼프",
    "자르반": "자르반 4세",
    "탐켄치": "탐 켄치",
    "레나타": "레나타 글라스크",
    "트페": "트위스티드 페이트",
    "미포": "미스 포츈",
    "아우솔": "아우렐리온 솔",
    "케틀": "케이틀린",
    "블츠": "블리츠크랭크",
}
PARTICLES = ("은", "는", "이", "가", "을", "를", "의", "와", "과", "도", "에게", "처럼", "보다", "만", "로", "으로")


def _is_hangul(ch):
    return "가" <= ch <= "힣"


def extract(text):
    names = {n: n for n in CHAMPIONS}
    names.update(ALIASES)
    found = []
    work = text
    for key in sorted(names, key=len, reverse=True):
        start = 0
        while True:
            i = work.find(key, start)
            if i < 0:
                break
            j = i + len(key)
            before = work[i - 1] if i > 0 else " "
            after = work[j:]
            ok = not _is_hangul(before)
            if ok and len(key.replace(" ", "")) <= 2:
                ok = not after or not _is_hangul(after[0]) or after.startswith(PARTICLES)
            if ok:
                if names[key] not in found:
                    found.append(names[key])
                work = work[:i] + " " * len(key) + work[j:]
            start = j
    return found


if __name__ == "__main__":
    tests = {
        "진입이 좋고 진동 감지로 찾음": [],
        "카직스, 이렐리아, 애니비아": ["카직스", "이렐리아", "애니비아"],
        "티모, 진: 트랩으로 방해": ["티모", "진"],
        "바이는 CC가 많음, 렐 W": ["바이", "렐"],
        "리신과 신짜오가 강함": ["리 신", "신 짜오"],
    }
    for t, want in tests.items():
        got = extract(t)
        print("OK " if sorted(got) == sorted(want) else "BAD", t, got)
