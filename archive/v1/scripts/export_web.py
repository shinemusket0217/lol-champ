"""data/ 의 파이썬 데이터를 웹에서 쓰는 web/data.json 하나로 뽑는다.

실행: python3 scripts/export_web.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from data.cc_source import CHAMPIONS as CC_SOURCE, TARGETED_DODGE  # noqa: E402
from data.champions import CHAMPIONS  # noqa: E402
from data.damage_class import AUTO_ATTACKERS, BY_LANE, damage_class, is_anti_tank, is_frontline  # noqa: E402
from data.vetoes import DUELISTS, VETOES  # noqa: E402
from data.jungle_picks import JUNGLE_PICKS  # noqa: E402
from data.my_pool import MY_POOL  # noqa: E402
from data.survival import HIGH_HP_TANKS, PROTECTORS, SELF_SURVIVAL  # noqa: E402
from data.sylas_ults import sylas_ult_group  # noqa: E402
from data.wildcards import WILDCARDS  # noqa: E402
from extract_names import extract  # noqa: E402


def main():
    champs = {}
    for name, c in CHAMPIONS.items():
        dmg = damage_class(name)
        champs[name] = {
            "lanes": c["라인"],
            "role": c["역할"],
            "damage": dmg,
            "damageByLane": BY_LANE.get(name, {}),
            "tank": "탱커" in dmg,
            "auto": name in AUTO_ATTACKERS,
            "antiTank": is_anti_tank(name),
            "frontline": is_frontline(name),
            "power": c["강한_시기"],
            "sylasUlt": sylas_ult_group(name),
        }

    cc = {}
    for name, _, rows in CC_SOURCE:
        cc[name] = [
            {
                "key": k, "skill": s, "kind": kind, "shape": shape, "target": tgt, "use": use, "memo": memo,
                "dodge": TARGETED_DODGE.get((name, k)),
            }
            for k, s, kind, shape, tgt, use, memo in rows
        ]

    protectors = {n: tier for tier, group in PROTECTORS.items() for n in group}
    self_survival = {}
    for kind, items in SELF_SURVIVAL.items():
        for item in items:
            for n in extract(item):
                self_survival.setdefault(n, []).append(kind)

    data = {
        "champions": champs,
        "cc": cc,
        "wildcards": [{"champ": w["챔피언"], "skill": w["스킬"], "type": w["종류"], "effect": w["효과"]} for w in WILDCARDS],
        "protectors": protectors,
        "selfSurvival": self_survival,
        "highHpTanks": HIGH_HP_TANKS,
        "pool": {
            n: {
                "prof": v["숙련도"], "damage": v["딜"], "vuln": v.get("CC_취약도"), "dangerCC": v.get("위험_CC", ""),
                "rare": v.get("자주_안_꺼냄", False), "extraDanger": v.get("위험_스킬_추가", []), "ban": v.get("필밴", False), "memo": v.get("메모", ""),
            }
            for n, v in MY_POOL.items()
        },
        "picks": JUNGLE_PICKS,
        "vetoes": VETOES,
        "duelists": DUELISTS,
    }
    out = ROOT / "web" / "data.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024}KB, 챔피언 {len(champs)}, 내 챔피언 {len(data['pool'])}")


if __name__ == "__main__":
    main()
