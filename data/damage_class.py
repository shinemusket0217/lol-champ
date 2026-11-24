# 딜 분류와 평타 위주 챔피언 (조합 판단용)
#
# 딜 분류
#   AD, AP, 혼합(AP 규칙에서 AP로 셈), AD탱커, AP탱커, 반AP(누누, 아무무: AP 0.5)
# 규칙 (사용자 확인)
#   - 탱커는 AD든 AP든 딜 수에 세지 않는다
#   - 혼합: 코그모, 카이사, 볼리베어, 잭스
#   - 한쪽으로 정함: 요네·유나라·이즈리얼·코르키 AD, 트위스티드 페이트·카타리나·케일 AP
#   - 라인에 따라: 바루스(탑 AP, 원딜 AD), 샤코(서폿 AP, 정글 AD)
#   - 빌드따라: 쉬바나, 우디르 (기본값 AD)

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.champions import CHAMPIONS  # noqa: E402

MIXED = {"코그모", "카이사", "볼리베어", "잭스"}
FIXED = {
    "요네": "AD", "유나라": "AD", "이즈리얼": "AD", "코르키": "AD",
    "트위스티드 페이트": "AP", "카타리나": "AP", "케일": "AP",
    "쉬바나": "AD", "우디르": "AD",  # 빌드따라, 기본값
    "오른": "AD탱커",
}
HALF_AP = {"누누와 윌럼프", "아무무"}
BY_LANE = {
    "바루스": {"탑": "AP", "원딜": "AD", "미드": "AD"},
    "샤코": {"서폿": "AP", "정글": "AD"},
}

# 평타 위주 챔피언 (사용자 확인)
AUTO_ATTACKERS = {
    # 원딜
    "드레이븐", "루시안", "베인", "사미라", "세나", "아펠리오스", "애쉬", "유나라", "자야", "제리",
    "징크스", "케이틀린", "코그모", "트위치", "트리스타나", "카이사", "시비르", "닐라", "진", "칼리스타",
    # 그 외 원거리
    "아크샨", "퀸",
    # 근접
    "마스터 이", "트린다미어", "잭스", "피오라", "야스오", "요네", "이렐리아", "신 짜오", "브라이어",
    "벨베스", "우디르", "쉬바나", "트런들", "올라프", "워윅", "비에고", "킨드레드", "그레이브즈", "녹턴",
    "자헨", "세트", "카밀", "케일", "나서스", "바이",
}


def _is_tank(name):
    role = CHAMPIONS[name]["역할"]
    return "탱커" in role and "탱커 카운터" not in role


def damage_class(name, lane=None):
    if name in HALF_AP:
        return "반AP"
    if name in BY_LANE and lane in BY_LANE[name]:
        return BY_LANE[name][lane]
    if name in FIXED:
        return FIXED[name]
    if name in MIXED:
        return "혼합"
    base = CHAMPIONS[name]["딜_유형"].split(" (")[0]
    kind = "AP" if base.startswith("AP") else "AD"
    if _is_tank(name):
        return kind + "탱커"
    return kind


def count_ad(team):
    """team: [(챔피언, 라인), ...]. 탱커를 뺀 AD 챔피언 수."""
    return sum(1 for n, lane in team if damage_class(n, lane) == "AD")


def count_auto(team):
    return sum(1 for n, _ in team if n in AUTO_ATTACKERS)


def all_ad(team):
    """탱커를 빼고 딜러가 전부 AD인가."""
    dealers = [damage_class(n, l) for n, l in team if "탱커" not in damage_class(n, l)]
    return bool(dealers) and all(d == "AD" for d in dealers)
