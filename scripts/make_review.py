"""데이터로 검토용 문서를 만든다.

- REVIEW.md : 챔피언 특징 검토표
- CC.md     : 하드 CC를 종류, 모양, 용도별로 모은 목록

실행: python3 scripts/make_review.py
"""

import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data.cc_source import CHAMPIONS as CC_SOURCE  # noqa: E402
from data.champions import CHAMPIONS  # noqa: E402

HEADER = "`scripts/make_review.py`로 자동 생성한 파일이다. 직접 고치지 말고 `data/`를 고친 뒤 다시 생성한다."
SHAPE_ORDER = ["확정", "직선", "광역즉시", "광역지연", "지형"]
SHAPE_DESC = {
    "확정": "지정 대상, 피할 수 없음",
    "직선": "직선 스킬샷, 방향을 피하면 됨",
    "광역즉시": "자기나 대상 주변에 바로 터지는 광역",
    "광역지연": "미리 깔거나 늦게 터지거나 계속 남는 광역",
    "지형": "벽을 세워 길을 막음",
}


def cell(text):
    return str(text).replace("|", "/").replace("\n", " ")


def cc_rows():
    """(챔피언, 키, 스킬, 종류, 모양, 대상, 용도, 메모) 목록."""
    return [(name,) + e for name, _, es in CC_SOURCE for e in es]


def hard_cc_text(name, by_champ):
    rows = by_champ.get(name, [])
    if not rows:
        return "없음"
    return ", ".join(f"{k} {kind} ({shape}, {tgt})" for _, k, _, kind, shape, tgt, _, _ in rows)


def make_review(by_champ):
    names = sorted(CHAMPIONS)
    cc_names = set(by_champ) | {n for n, _, _ in CC_SOURCE}
    missing_in_cc = [n for n in names if n not in cc_names]
    missing_in_features = sorted(cc_names - set(names))

    lines = [
        "# 챔피언 특징 검토표",
        "",
        HEADER,
        "",
        f"- 전체: {len(names)}명",
        f"- 검토 완료: {sum(1 for n in names if CHAMPIONS[n].get('검토'))}명",
        "- 하드 CC는 `data/cc_source.py`에서 가져온다. 종류별 목록은 CC.md 참고",
        "",
    ]
    if missing_in_cc or missing_in_features:
        lines += ["## 데이터 불일치", ""]
        if missing_in_cc:
            lines.append("- CC 데이터에 없음: " + ", ".join(missing_in_cc))
        if missing_in_features:
            lines.append("- 특징 데이터에 없음: " + ", ".join(missing_in_features))
        lines.append("")

    lines += [
        "## 요약",
        "",
        "| 챔피언 | 라인 | 역할 | 딜 유형 | 탱킹 방식 | 강한 시기 | 하드 CC | 검토 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for n in names:
        c = CHAMPIONS[n]
        vals = [
            n,
            ", ".join(c["라인"]),
            c["역할"],
            c["딜_유형"],
            ", ".join(c["탱킹_방식"]) or "-",
            c["강한_시기"],
            hard_cc_text(n, by_champ),
            "O" if c.get("검토") else "",
        ]
        lines.append("| " + " | ".join(cell(v) for v in vals) + " |")

    lines += ["", "## 상세", ""]
    for n in names:
        c = CHAMPIONS[n]
        lines += [
            f"### {n}",
            "",
            f"- **딜 방식**: {', '.join(c['딜_방식'])}",
            f"- **이동**: {c['이동']}",
            f"- **하드 CC**: {hard_cc_text(n, by_champ)}",
            f"- **약한 CC**: {', '.join(c['약한_CC']) or '없음'}",
            f"- **강점**: {c['강점']}",
            f"- **약점**: {c['약점']}",
            f"- **정글 (우리 편)**: {c['정글_관점']['우리_편일_때']}",
            f"- **정글 (상대)**: {c['정글_관점']['상대일_때']}",
        ]
        for m in c.get("메모", []):
            lines.append(f"- 메모: {m}")
        lines.append("")

    (ROOT / "REVIEW.md").write_text("\n".join(lines), encoding="utf-8")
    return len(names), missing_in_cc, missing_in_features


def cc_table(rows):
    out = ["| 챔피언 | 스킬 | CC | 모양 | 대상 | 용도 | 메모 |", "|---|---|---|---|---|---|---|"]
    for name, k, skill, kind, shape, tgt, use, memo in sorted(rows):
        out.append(
            "| " + " | ".join(cell(v) for v in [name, f"{k} {skill}", kind, shape, tgt, ", ".join(use), memo or ""]) + " |"
        )
    return out


def make_cc(rows):
    lines = ["# 하드 CC 목록", "", HEADER, "", f"- 전체: {len(rows)}개", ""]

    lines += ["## 모양별", ""]
    by_shape = defaultdict(list)
    for r in rows:
        by_shape[r[4]].append(r)
    for shape in SHAPE_ORDER:
        lines += [f"### {shape} ({len(by_shape[shape])}개)", "", SHAPE_DESC[shape], ""]
        lines += cc_table(by_shape[shape]) + [""]

    lines += ["## 용도별 챔피언", ""]
    for use in ["이니시", "받아치기", "잡기"]:
        champs = sorted({r[0] for r in rows if use in r[6]})
        lines += [f"### {use} ({len(champs)}명)", "", ", ".join(champs), ""]

    lines += ["## CC 종류별 챔피언", ""]
    by_kind = defaultdict(set)
    for r in rows:
        for kind in r[3].split("·"):
            by_kind[kind.strip()].add(f"{r[0]} {r[1]}")
    for kind in sorted(by_kind, key=lambda k: -len(by_kind[k])):
        lines += [f"- **{kind}** ({len(by_kind[kind])}): " + ", ".join(sorted(by_kind[kind]))]
    lines.append("")

    (ROOT / "CC.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    rows = cc_rows()
    by_champ = defaultdict(list)
    for r in rows:
        by_champ[r[0]].append(r)
    n, a, b = make_review(by_champ)
    make_cc(rows)
    print(f"챔피언 {n}명, 하드 CC {len(rows)}개, 불일치: {a} / {b}")


if __name__ == "__main__":
    main()
