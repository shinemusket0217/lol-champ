# 챔피언 특징 데이터 모음
#
# 초성별 파일에 나눠 저장하고 여기서 합친다.
# 항목 설명은 README.md 참고.

from importlib import import_module

PARTS = ["g_n", "d_r", "m_b", "s", "o", "j", "ch_k", "t_h"]

CHAMPIONS = {}
for _name in PARTS:
    try:
        CHAMPIONS.update(import_module(f"{__name__}.{_name}").CHAMPIONS)
    except ModuleNotFoundError:
        pass
