// 추천 엔진 예시 테스트. 실행: node web/test_engine.js
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));

const t = (s) => s.split(",").map((x) => {
  const [lane, name] = x.trim().split(":");
  return { lane, name };
});

const cases = [
  {
    title: "미드 AD + 상대 평타 위주 (람머스 기대)",
    ally: t("탑:가렌, 미드:제드, 원딜:징크스, 서폿:레오나"),
    enemy: t("탑:피오라, 정글:마스터 이, 미드:야스오, 원딜:베인, 서폿:파이크"),
  },
  {
    title: "상대 미드 빅토르 (브라이어 비추천 기대)",
    ally: t("탑:다리우스, 미드:아리, 원딜:카이사, 서폿:노틸러스"),
    enemy: t("탑:오른, 정글:리 신, 미드:빅토르, 원딜:케이틀린, 서폿:럭스"),
  },
  {
    title: "우리 원딜 비원딜, 상대 탱커 많음",
    ally: t("탑:말파이트, 미드:아리, 원딜:직스, 서폿:레오나"),
    enemy: t("탑:문도 박사, 정글:세주아니, 미드:갈리오, 원딜:징크스, 서폿:알리스타"),
  },
  {
    title: "밴픽 초반: 상대 2명만",
    ally: t("탑:레넥톤"),
    enemy: t("정글:카서스, 서폿:룰루"),
  },
];

for (const c of cases) {
  const r = E.recommend(data, c.ally, c.enemy);
  console.log(`\n=== ${c.title}`);
  console.log(`AD/AP: ${r.ally.need} (${r.ally.why})`);
  r.recs.slice(0, 5).forEach((x, i) => {
    console.log(`${i + 1}. ${x.name} ${x.score} (숙련도 ${x.prof}, ${x.damage})`);
    x.pros.forEach((p) => console.log(`   + ${p}`));
    x.cons.forEach((p) => console.log(`   - ${p}`));
    x.notes.forEach((p) => console.log(`   * ${p}`));
  });
  const worst = r.recs.slice(-3).map((x) => `${x.name} ${x.score}`).join(", ");
  console.log(`하위: ${worst}`);
}
