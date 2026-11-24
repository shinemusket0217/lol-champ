"""나무위키 요약을 정글 상황(data/jungle_picks.py)에 합친다.

- 나무위키 요약에서 챔피언 이름을 뽑아 상성_불리, 상성_유리 목록을 만든다
- 사용자 피드백과 충돌하는 것은 OVERRIDES로 뺀다 (피드백 우선)
- jungle_picks에 없는 숙련도 2 이상 챔피언은 나무위키 기반 초안을 새로 만든다

실행: python3 scripts/merge_namuwiki.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from data.jungle_picks import JUNGLE_PICKS  # noqa: E402
from data.my_pool import MY_POOL  # noqa: E402
from data.namuwiki import NAMUWIKI  # noqa: E402
from extract_names import extract  # noqa: E402

# (챔피언, 목록) -> 뺄 챔피언. 사용자 피드백이나 원문 해석으로 보정
OVERRIDES = {
    ("브라이어", "불리"): {"람머스"},  # 사용자: 방관 빌드로 대응 가능
    ("잭스", "불리"): {"렝가"},  # 원문: 잭스가 렝가의 하드 카운터
    ("신 짜오", "불리"): {"카직스"},  # 카직스 문서(2026 시즌)가 더 최신: 신짜오가 카직스에게 강함
    ("바이", "불리"): {"헤카림"},  # 바이 문서는 10.24 기준. 헤카림 문서(최근)는 바이가 헤카림을 억제
    ("렉사이", "불리"): {"헤카림"},  # 문서끼리 반대. 판단 보류
    ("헤카림", "불리"): {"렉사이"},  # 위와 같음
    ("사일러스", "불리"): {"아무무"},  # 초반은 아무무, 한타는 사일러스. 시기에 따라 다름
    ("아무무", "불리"): {"사일러스"},  # 위와 같음
}

# (챔피언, 목록) -> 더할 챔피언. 다른 챔피언 문서에서 확인된 상성
ADDITIONS = {
    ("신 짜오", "유리"): ["카직스"],  # 카직스 문서: 2026 시즌 리 신, 신짜오에게 특히 약함
    ("바이", "유리"): ["헤카림"],  # 헤카림 문서(최근): 바이가 헤카림을 억제
}

HEADER = '''# 사용자 정글 챔피언별 고르는 상황
#
# Claude가 초안을 쓰고 사용자가 피드백하면 반영한다.
# scripts/merge_namuwiki.py가 나무위키 상성을 합쳐서 이 파일을 다시 쓴다.
# 손으로 고친 내용은 그대로 남는다 (상성_불리, 상성_유리, 나무위키_메모만 덮어씀).
#
# 항목
#   시점           : 언제 고르는지 (먼저 골라도 되는지, 상대를 보고 고르는지)
#   고르는_조건     : 이 챔피언을 고르기 좋은 상황
#   특히_좋은_상황  : 고르는 조건 중에서도 가장 좋은 특수 상황
#   피하는_조건     : 이 챔피언을 피해야 하는 상황
#   위험_스킬       : 특히 조심할 스킬 (변수 스킬, CC 등)
#   괜찮은_것       : 위험해 보이지만 실제로는 괜찮은 것 (사용자 확인)
#   메모            : 플레이, 빌드 등
#   상성_불리       : 상대하기 어려운 챔피언 이름 (나무위키에서 뽑음, 사용자 피드백으로 보정)
#   상성_유리       : 상대하기 쉬운 챔피언 이름 (위와 같음)
#   나무위키_메모   : 나무위키 요약의 그 밖의 내용
#   확인_대기       : 사용자 확인이 필요한 것

'''

FIELD_ORDER = [
    "시점", "고르는_조건", "특히_좋은_상황", "피하는_조건", "위험_스킬", "괜찮은_것", "메모",
    "상성_불리", "상성_유리", "나무위키_메모", "확인_대기",
]


def names_from(name, kind):
    out = []
    for text in NAMUWIKI[name][kind]:
        for x in extract(text):
            if x != name and x not in out:
                out.append(x)
    drop = OVERRIDES.get((name, kind), set())
    out = [x for x in out if x not in drop]
    return out + [x for x in ADDITIONS.get((name, kind), []) if x not in out]


def draft_from_namuwiki(name):
    nw = NAMUWIKI[name]
    deal = MY_POOL[name]["딜"]
    return {
        "시점": "확인 전",
        "고르는_조건": [f"AD/AP 규칙상 {deal} 정글이 필요할 때"] + [f"(나무위키) 유리: {t}" for t in nw["유리"]],
        "특히_좋은_상황": [],
        "피하는_조건": [f"(나무위키) 불리: {t}" for t in nw["불리"]],
        "위험_스킬": [],
        "괜찮은_것": [],
        "메모": [],
        "확인_대기": ["나무위키 기반 초안. 사용자 확인 전"],
    }


def main():
    picks = dict(JUNGLE_PICKS)
    targets = [n for n, v in MY_POOL.items() if v["숙련도"] >= 2]
    created = []
    for name in targets:
        if name not in picks:
            picks[name] = draft_from_namuwiki(name)
            created.append(name)
        entry = picks[name]
        if name in NAMUWIKI:
            entry["상성_불리"] = names_from(name, "불리")
            entry["상성_유리"] = names_from(name, "유리")
            entry["나무위키_메모"] = NAMUWIKI[name]["메모"] + [f"(충돌) {c}" for c in NAMUWIKI[name]["충돌"]]
        picks[name] = {k: entry[k] for k in FIELD_ORDER if k in entry} | {
            k: v for k, v in entry.items() if k not in FIELD_ORDER
        }

    body = json.dumps(picks, ensure_ascii=False, indent=4)
    (ROOT / "data" / "jungle_picks.py").write_text(HEADER + "JUNGLE_PICKS = " + body + "\n", encoding="utf-8")
    print(f"{len(picks)}명 저장, 새로 만든 초안 {len(created)}명: {', '.join(created)}")


if __name__ == "__main__":
    main()
