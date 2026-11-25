// 추천 엔진 예시 테스트. 실행: node web/test_engine.js
// 각 예시에 기대하는 결과(expect)를 적어두고 맞는지 확인한다.
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));

const t = (s) => (s ? s.split(",").map((x) => {
  const [lane, name] = x.trim().split(":");
  return { lane, name };
}) : []);

const cases = [
  {
    title: "상대 마스터 이 + 평타 위주",
    ally: "탑:가렌, 미드:제드, 원딜:징크스, 서폿:레오나",
    enemy: "탑:피오라, 정글:마스터 이, 미드:야스오, 원딜:베인, 서폿:파이크",
    expect: { top: "람머스" },
  },
  {
    title: "상대 미드 빅토르 → 브라이어 금지",
    ally: "탑:다리우스, 미드:아리, 원딜:카이사, 서폿:노틸러스",
    enemy: "탑:오른, 정글:리 신, 미드:빅토르, 원딜:케이틀린, 서폿:럭스",
    expect: { vetoed: ["브라이어"] },
  },
  {
    title: "우리 원딜 비원딜",
    ally: "탑:말파이트, 미드:아리, 원딜:직스, 서폿:레오나",
    enemy: "탑:문도 박사, 정글:세주아니, 미드:갈리오, 원딜:징크스, 서폿:알리스타",
    expect: { vetoed: ["다이애나"] },
  },
  {
    title: "사용자 판: 우리 팀 탱커 처리 없음, 상대 앞라인 마오카이·헤카림",
    ally: "탑:요네, 미드:애니비아, 원딜:이즈리얼, 서폿:럭스",
    enemy: "탑:마오카이, 정글:헤카림, 미드:아칼리, 원딜:미스 포츈, 서폿:룰루",
    bans: ["리 신"],
    expect: { top3Any: ["바이", "워윅", "다리우스", "렉사이"], notTop3: ["람머스", "말파이트"] },
  },
  {
    title: "상대 티모 → 워윅 금지 (평타 무력화)",
    ally: "탑:다리우스, 미드:아리, 원딜:카이사, 서폿:노틸러스",
    enemy: "탑:티모, 미드:빅토르",
    expect: { vetoed: ["워윅"] },
  },
  {
    title: "밴픽 초반: 상대 2명만",
    ally: "탑:레넥톤",
    enemy: "정글:카서스, 서폿:룰루",
    expect: { notTop: "브라이어" },
  },
];

let fail = 0;
for (const c of cases) {
  const r = E.recommend(data, t(c.ally), t(c.enemy), { bans: c.bans || [] });
  const names = r.recs.map((x) => x.name);
  const checks = [];
  const ex = c.expect || {};
  if (ex.top) checks.push([`1위 ${ex.top}`, names[0] === ex.top]);
  if (ex.notTop) checks.push([`1위가 ${ex.notTop} 아님`, names[0] !== ex.notTop]);
  if (ex.vetoed) ex.vetoed.forEach((n) => checks.push([`${n} 금지`, r.vetoed.some((v) => v.name === n)]));
  if (ex.top3Any) checks.push([`상위 3위 안에 ${ex.top3Any.join("/")} 중 하나`, names.slice(0, 3).some((n) => ex.top3Any.includes(n))]);
  if (ex.notTop3) ex.notTop3.forEach((n) => checks.push([`${n} 상위 3위 밖`, !names.slice(0, 3).includes(n)]));

  console.log(`\n=== ${c.title}`);
  console.log(`필요: ${r.ally.need} (${r.ally.why})`);
  r.ally.warnings.forEach((w) => console.log(`  [${w.level}] ${w.text}`));
  r.recs.slice(0, 5).forEach((x, i) => {
    const parts = Object.entries(x.groups).flatMap(([g, items]) => items.map((it) => `${g} ${it.n > 0 ? "+" : ""}${it.n} ${it.text}`));
    console.log(`${i + 1}. ${x.name} ${x.score}`);
    parts.forEach((p) => console.log(`     ${p}`));
  });
  if (r.vetoed.length) console.log(`금지: ${r.vetoed.map((v) => `${v.name} (${v.reasons.join(" / ")})`).join("; ")}`);
  checks.forEach(([label, ok]) => { console.log(`  ${ok ? "통과" : "실패"}: ${label}`); if (!ok) fail++; });
}
console.log(fail ? `\n실패 ${fail}개` : "\n전부 통과");
process.exitCode = fail ? 1 : 0;
