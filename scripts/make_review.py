"""챔피언 특징 데이터를 검토용 표(REVIEW.md)로 만든다.

실행: python3 scripts/make_review.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data.champions import CHAMPIONS  # noqa: E402
from data.cc_source import CHAMPIONS as CC_SOURCE  # noqa: E402


def cell(text):
    return str(text).replace("|", "/").replace("\n", " ")


def main():
    names = sorted(CHAMPIONS)
    cc_names = {name for name, _, _ in CC_SOURCE}
    missing_in_cc = [n for n in names if n not in cc_names]
    missing_in_features = sorted(cc_names - set(names))

    lines = [
        "# 챔피언 특징 검토표",
        "",
        "`scripts/make_review.py`로 자동 생성한 파일이다. 직접 고치지 말고 `data/champions/`를 고친 뒤 다시 생성한다.",
        "",
        f"- 전체: {len(names)}명",
        f"- 검토 완료: {sum(1 for n in names if CHAMPIONS[n].get('검토'))}명",
        "",
    ]
    if missing_in_cc or missing_in_features:
        lines += ["## 데이터 불일치", ""]
        if missing_in_cc:
            lines.append("- CC 초안에 없음: " + ", ".join(missing_in_cc))
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
        lines.append(
            "| "
            + " | ".join(
                cell(x)
                for x in [
                    n,
                    ", ".join(c["라인"]),
                    c["역할"],
                    c["딜_유형"],
                    ", ".join(c["탱킹_방식"]) or "-",
                    c["강한_시기"],
                    ", ".join(c["CC"]["하드"]) or "없음",
                    "O" if c.get("검토") else "",
                ]
            )
            + " |"
        )

    lines += ["", "## 상세", ""]
    for n in names:
        c = CHAMPIONS[n]
        lines += [
            f"### {n}",
            "",
            f"- **딜 방식**: {', '.join(c['딜_방식'])}",
            f"- **이동**: {c['이동']}",
            f"- **약한 CC**: {', '.join(c['CC']['약한']) or '없음'}",
            f"- **강점**: {c['강점']}",
            f"- **약점**: {c['약점']}",
            f"- **정글 (우리 편)**: {c['정글_관점']['우리_편일_때']}",
            f"- **정글 (상대)**: {c['정글_관점']['상대일_때']}",
        ]
        for m in c.get("메모", []):
            lines.append(f"- 메모: {m}")
        lines.append("")

    (ROOT / "REVIEW.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(names)}명 작성, 불일치: {missing_in_cc} / {missing_in_features}")


if __name__ == "__main__":
    main()
