// 정글 추천 엔진
// 브라우저와 Node 양쪽에서 쓴다. data는 web/data.json (scripts/export_web.py로 생성).
//
// 입력
//   ally : 우리 팀 [{name, lane}] (정글 제외, 라인은 탑/미드/원딜/서폿)
//   enemy: 상대 팀 [{name, lane}] (정글 포함 가능, 덜 골라도 됨)
// 출력
//   { ally: 우리 조합 분석, enemy: 상대 조합 분석, apNeed: AD/AP 판단, recs: 추천 목록 }
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JungleEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LANES = ["탑", "정글", "미드", "원딜", "서폿"];
  const ONE_V_ONE_STRONG = ["다리우스", "이렐리아", "올라프", "피오라", "잭스", "트린다미어", "세트", "레넥톤", "일라오이"];
  const STEALTH = ["이블린", "트위치", "샤코", "아칼리", "렝가", "카직스", "티모", "파이크", "케인"];
  const FEAR_IGNORE = ["오른", "올라프", "사이온", "문도 박사", "워윅", "볼리베어"];
  const ASSASSIN_JUNGLE = ["나피리", "카직스", "이블린", "에코", "다이애나", "녹턴"];
  const CHASE_LONG = ["렉사이", "바이"];
  const SHORT_CHASE = ["나피리"];

  function dmgOf(data, p) {
    const c = data.champions[p.name];
    if (!c) return "AD";
    return (c.damageByLane && c.damageByLane[p.lane]) || c.damage;
  }

  function apValue(cls) {
    if (cls === "AP" || cls === "혼합") return 1;
    if (cls === "반AP") return 0.5;
    return 0;
  }

  function isTank(cls) {
    return cls.endsWith("탱커") || cls === "반AP";
  }

  // ---------- 조합 분석 ----------

  function analyzeAlly(data, ally) {
    const byLane = {};
    ally.forEach((p) => (byLane[p.lane] = p));
    const mid = byLane["미드"];
    const midCls = mid ? dmgOf(data, mid) : "AP"; // 안 골랐으면 AP로 가정
    const others = ally.filter((p) => p.lane !== "미드");
    const apOthers = others.reduce((s, p) => s + apValue(dmgOf(data, p)), 0);

    let need, why;
    if (midCls === "AP") {
      need = "AD";
      why = mid ? `미드 ${mid.name}가 AP` : "미드가 아직 안 골라서 AP로 가정";
    } else if (apOthers >= 2) {
      need = "AD";
      why = `미드를 뺀 AP·혼합이 ${apOthers}명`;
    } else if (apOthers >= 1) {
      need = "혼합또는AP";
      why = `미드 ${mid.name}가 AD이고 미드를 뺀 AP가 ${apOthers}명`;
    } else {
      need = "AP";
      why = `미드 ${mid ? mid.name : ""}가 AD이고 미드를 뺀 AP가 없음`;
    }

    const tanks = ally.filter((p) => isTank(dmgOf(data, p)));
    const engage = ally.filter((p) => (data.cc[p.name] || []).some((c) => c.use.includes("이니시")));
    const adc = byLane["원딜"];
    const adcIsMage = adc ? dmgOf(data, adc) === "AP" : false;
    const carries = ally.filter((p) => p.lane !== "서폿" && !isTank(dmgOf(data, p)));
    const yasuo = ally.some((p) => p.name === "야스오");

    return { midCls, apOthers, need, why, tanks, engage, adcIsMage, carries, yasuo, byLane, count: ally.length };
  }

  function analyzeEnemy(data, enemy) {
    const byLane = {};
    enemy.forEach((p) => (byLane[p.lane] = p));
    const ccList = [];
    enemy.forEach((p) => (data.cc[p.name] || []).forEach((c) => ccList.push({ ...c, champ: p.name, lane: p.lane })));
    const wild = data.wildcards.filter((w) => enemy.some((p) => p.name === w.champ));
    const cls = enemy.map((p) => ({ p, cls: dmgOf(data, p) }));
    const dealers = cls.filter((x) => !isTank(x.cls));
    const adCount = cls.filter((x) => x.cls === "AD").length;
    const autoCount = enemy.filter((p) => data.champions[p.name] && data.champions[p.name].auto).length;
    const allAD = dealers.length > 0 && dealers.every((x) => x.cls === "AD");
    const tanks = cls.filter((x) => isTank(x.cls)).map((x) => x.p.name);
    const highHp = enemy.filter((p) => data.highHpTanks.includes(p.name)).map((p) => p.name);
    const protectors = enemy.filter((p) => data.protectors[p.name]).map((p) => ({ name: p.name, tier: data.protectors[p.name] }));
    const stealth = enemy.filter((p) => STEALTH.includes(p.name)).map((p) => p.name);
    const longMobility = enemy.filter((p) => (data.selfSurvival[p.name] || []).includes("거리가 먼 이동기")).map((p) => p.name);
    const adc = byLane["원딜"];
    const adcIsMage = adc ? dmgOf(data, adc) === "AP" : false;
    const shapes = {};
    ccList.forEach((c) => (shapes[c.shape] = (shapes[c.shape] || 0) + 1));
    return {
      byLane, ccList, wild, adCount, autoCount, allAD, tanks, highHp, protectors, stealth, longMobility, adcIsMage, shapes,
      jungle: byLane["정글"], count: enemy.length,
    };
  }

  // ---------- 위험한 CC 세기 ----------

  function dangerTokens(pool) {
    return (pool.dangerCC || "").split(",").map((s) => s.trim()).filter(Boolean);
  }

  function countDangerCC(data, name, pool, E) {
    const tokens = dangerTokens(pool);
    const hits = [];
    const add = (label, list) => list.forEach((x) => hits.push(`${x.champ} ${x.key || x.skill}`.trim() + ` (${label})`));
    const cc = E.ccList;
    if (!tokens.length) tokens.push("확정");
    tokens.forEach((t) => {
      if (t === "광역지연") add("광역지연", cc.filter((c) => c.shape === "광역지연"));
      else if (t === "직선") add("직선", cc.filter((c) => c.shape === "직선"));
      else if (t === "확정") add("확정", cc.filter((c) => c.shape === "확정"));
      else if (t === "바로 걸리는 확정") add("바로 걸리는 확정", cc.filter((c) => c.shape === "확정" && !c.dodge));
      else if (t === "근접 광역") add("근접 광역", cc.filter((c) => c.shape === "광역즉시"));
      else if (t === "근접 확정") add("근접 확정", cc.filter((c) => c.shape === "확정" && !c.dodge));
      else if (t === "한 명 물기 좋은 스킬")
        add("한 명 물기", cc.filter((c) => c.target === "단일" && c.use.includes("잡기") && c.shape !== "확정"));
      else if (t === "이동기 봉쇄" || t === "평타 무력화")
        E.wild.filter((w) => w.type === t).forEach((w) => hits.push(`${w.champ} ${w.skill} (${t})`));
    });
    (pool.extraDanger || []).forEach((s) => {
      const c = cc.find((x) => `${x.champ} ${x.key}` === s);
      if (c) hits.push(`${s} (직접 지정)`);
    });
    // 같은 스킬이 두 번 세지지 않게 "챔피언 키" 기준으로 합친다
    const seen = new Set();
    return hits.filter((h) => {
      const k = h.split(" (")[0];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // ---------- 점수 ----------

  function scoreChampion(data, name, A, E) {
    const pool = data.pool[name];
    const pick = data.picks[name] || {};
    const champ = data.champions[name];
    const pros = [], cons = [], notes = [];
    let score = 0;
    const plus = (n, why) => { score += n; pros.push(why); };
    const minus = (n, why) => { score -= n; cons.push(why); };

    // 숙련도
    score += { 4: 4, 3: 2, 2: -1 }[pool.prof] || 0;
    if (pool.rare) minus(1, "잘 쓰지만 평소에 자주 안 꺼내는 챔피언");

    // AD/AP
    const d = pool.damage;
    const table = {
      AD: { AD: 3, 혼합: 0, AP: -3, AP탱커: -1, 반AP: -1 },
      AP: { AP: 3, 혼합: -1, AD: -3, AP탱커: -1, 반AP: 1 },
      혼합또는AP: { AP: 3, 혼합: 3, AD: -2, AP탱커: -1, 반AP: 1 },
    };
    const ap = (table[A.need] || {})[d] || 0;
    if (ap > 0) plus(ap, `${A.need === "혼합또는AP" ? "혼합 딜이나 AP" : A.need} 정글이 필요한 조합 (${A.why})`);
    else if (ap < 0) minus(-ap, `${A.need === "혼합또는AP" ? "혼합 딜이나 AP" : A.need} 정글이 필요한데 ${d} (${A.why})`);

    // 상성
    const bad = pick["상성_불리"] || [], good = pick["상성_유리"] || [];
    Object.values(E.byLane).forEach((p) => {
      const isJg = p.lane === "정글";
      if (bad.includes(p.name)) minus(isJg ? 4 : 1.5, `상성 불리: ${p.name}${isJg ? " (상대 정글)" : ""}`);
      if (good.includes(p.name)) plus(isJg ? 3 : 1, `상성 유리: ${p.name}${isJg ? " (상대 정글)" : ""}`);
    });

    // CC 취약도
    if (pool.vuln) {
      const hits = countDangerCC(data, name, pool, E);
      const limit = { 높음: 2, 중간: 3, 낮음: 5 }[pool.vuln];
      if (hits.length >= limit) minus(3 + (hits.length - limit), `CC 취약도 ${pool.vuln}인데 위험한 CC ${hits.length}개: ${hits.join(", ")}`);
      else if (hits.length === limit - 1 && hits.length > 0) minus(1, `위험한 CC ${hits.length}개: ${hits.join(", ")}`);
    }

    // 평타 무력화 (평타 위주 챔피언)
    if (champ && champ.auto && !dangerTokens(pool).includes("평타 무력화")) {
      const aa = E.wild.filter((w) => w.type === "평타 무력화");
      if (aa.length) minus(1.5 * aa.length, `평타 위주인데 평타 무력화: ${aa.map((w) => `${w.champ} ${w.skill}`).join(", ")}`);
    }

    // 우리 팀 부족한 것
    const myCC = data.cc[name] || [];
    if (A.count >= 3 && A.tanks.length === 0 && (pool.damage.endsWith("탱커") || pool.damage === "반AP" || name === "볼리베어"))
      plus(2, "우리 팀에 앞라인이 없음");
    if (A.count >= 3 && A.engage.length === 0 && myCC.some((c) => c.use.includes("이니시")))
      plus(2, "우리 팀에 이니시가 없음");

    // 암살·돌진 정글 공통
    if (ASSASSIN_JUNGLE.includes(name)) {
      const top = E.protectors.filter((p) => p.tier === "최상");
      if (top.length) minus(3, `상대에 보호력 최상 서폿: ${top.map((p) => p.name).join(", ")}`);
      if (E.tanks.length >= 2) minus(2, `상대에 탱커 ${E.tanks.length}명: ${E.tanks.join(", ")}`);
      if (E.highHp.length) minus(1, `체력이 매우 높은 탱커: ${E.highHp.join(", ")}`);
    }

    // 고르는 시점: 상대를 보고 고르는 챔피언은 상대가 덜 나왔을 때 점수를 낮춘다
    const when = pick["시점"] || "";
    if (E.count < 3 && /보고/.test(when) && !/빨리|무난/.test(when))
      minus(1.5, `상대를 보고 고르는 챔피언인데 아직 상대가 ${E.count}명만 나옴`);

    // 챔피언별 규칙
    const R = RULES[name];
    if (R) R({ data, A, E, plus, minus, notes, pool });

    return { name, score: Math.round(score * 10) / 10, prof: pool.prof, damage: pool.damage, pros, cons, notes };
  }

  const RULES = {
    "브라이어": ({ E, minus, pool }) => {
      if (!E.byLane["미드"] || !E.byLane["원딜"]) minus(2, "상대 미드와 원딜이 나온 뒤에 고르는 챔피언 (아직 안 나옴)");
      const extra = pool.extraDanger || [];
      ["미드", "원딜"].forEach((l) => {
        const p = E.byLane[l];
        if (!p) return;
        E.ccList.filter((c) => c.champ === p.name && (c.shape === "광역지연" || extra.includes(`${c.champ} ${c.key}`))).forEach((c) =>
          minus(3, `상대 ${l} ${p.name} ${c.key}: W로 못 피하는 CC (브라이어 핵심 카운터)`));
      });
    },
    "그레이브즈": ({ A, E, plus }) => {
      if (A.adcIsMage) plus(3, "우리 원딜이 비원딜이라 그레이브즈가 원딜 역할을 대신함");
      if (E.allAD && A.carries.length <= 1 && A.count >= 3) plus(2, "상대가 전원 AD이고 우리 팀 딜러가 부족함 (E 방어력 중첩)");
      if (A.count >= 3 && A.carries.length <= 1) plus(1, "우리 팀에 캐리할 챔피언이 부족함");
    },
    "나피리": ({ E, minus }) => {
      if (E.longMobility.length) minus(1.5, `거리가 먼 이동기는 못 따라감: ${E.longMobility.join(", ")}`);
    },
    "녹턴": ({ E, plus, notes }) => {
      const adc = E.byLane["원딜"];
      if (!adc) notes.push("상대 바텀을 보고 고르는 챔피언");
      else if (!E.tanks.includes(adc.name)) plus(1, `상대 원딜 ${adc.name}를 R로 노릴 수 있음`);
    },
    "비에고": ({ data, E, minus }) => {
      const strong = Object.values(E.byLane).filter((p) => ONE_V_ONE_STRONG.includes(p.name));
      const assassins = Object.values(E.byLane).filter((p) => data.champions[p.name] && /암살/.test(data.champions[p.name].role));
      if (strong.length) minus(5, `1:1 체급이 매우 높은 챔피언이 있으면 못 꺼냄: ${strong.map((p) => p.name).join(", ")}`);
      if (assassins.length) minus(5, `상대 암살자가 있으면 못 꺼냄: ${assassins.map((p) => p.name).join(", ")}`);
    },
    "다이애나": ({ A, E, plus, minus }) => {
      if (A.yasuo) plus(3, "우리 편 야스오와 R 에어본 연계");
      if (E.tanks.length >= 2) minus(3, "다이애나는 탱커를 심각하게 못 잡음");
    },
    "그웬": ({ E, plus }) => {
      if (E.tanks.length >= 2) plus(3, `상대 탱커 ${E.tanks.length}명 (최대 체력 % 피해)`);
      if (E.highHp.length) plus(1, `체력 높은 탱커: ${E.highHp.join(", ")}`);
    },
    "피들스틱": ({ E, plus, minus }) => {
      if (E.stealth.length) plus(2, `은신 챔피언을 잘 잡음: ${E.stealth.join(", ")}`);
      const kb = E.ccList.filter((c) => /넉백/.test(c.kind));
      if (kb.length) minus(Math.min(3, kb.length), `R을 끊는 넉백: ${kb.map((c) => `${c.champ} ${c.key}`).join(", ")}`);
      const fi = Object.values(E.byLane).filter((p) => FEAR_IGNORE.includes(p.name));
      if (fi.length) minus(fi.length, `공포가 잘 안 통함: ${fi.map((p) => p.name).join(", ")}`);
    },
    "헤카림": ({ E, plus }) => {
      if (E.adcIsMage) plus(3, "상대 원딜이 비원딜이라 카이팅이 약함");
    },
    "람머스": ({ E, plus }) => {
      if (Object.values(E.byLane).some((p) => p.name === "마스터 이")) plus(6, "상대 마스터 이가 있으면 바로 람머스");
      if (E.adCount >= 4 && E.autoCount >= 3) plus(5, `상대 AD ${E.adCount}명, 평타 위주 ${E.autoCount}명`);
    },
    "말파이트": ({ E, plus }) => {
      if (E.allAD && E.autoCount < 3 && E.count >= 3) plus(4, `상대 전원 AD인데 평타 위주는 ${E.autoCount}명 (람머스 대신)`);
    },
    "사일러스": ({ data, E, plus, minus }) => {
      const good = Object.values(E.byLane).filter((p) => data.champions[p.name] && data.champions[p.name].sylasUlt);
      if (good.length >= 2) plus(3, `빼앗기 좋은 궁극기 ${good.length}개: ${good.map((p) => p.name).join(", ")}`);
      else if (E.count >= 4) minus(2, "빼앗기 좋은 궁극기가 부족함");
    },
    "볼리베어": ({ A, plus }) => {
      if (A.count >= 3 && A.tanks.length === 0) plus(2, "우리 팀에 탱커가 필요함");
    },
    "바이": ({ E, plus }) => {
      if (E.longMobility.length) plus(1, `거리가 먼 이동기도 따라감: ${E.longMobility.join(", ")}`);
    },
    "렉사이": ({ E, plus }) => {
      if (E.longMobility.length) plus(1, `거리가 먼 이동기도 따라감: ${E.longMobility.join(", ")}`);
      if (E.stealth.length) plus(1, `진동 감지로 은신을 찾음: ${E.stealth.join(", ")}`);
    },
  };

  function recommend(data, ally, enemy, opts) {
    opts = opts || {};
    const minProf = opts.minProf || 2;
    const bans = new Set(opts.bans || []);
    const taken = new Set([...ally, ...enemy].map((p) => p.name));
    const A = analyzeAlly(data, ally);
    const E = analyzeEnemy(data, enemy);
    const recs = Object.keys(data.pool)
      .filter((n) => data.pool[n].prof >= minProf && !taken.has(n) && !bans.has(n))
      .map((n) => scoreChampion(data, n, A, E))
      .sort((a, b) => b.score - a.score || b.prof - a.prof);
    return { ally: A, enemy: E, recs };
  }

  return { recommend, analyzeAlly, analyzeEnemy, dmgOf, LANES };
});
