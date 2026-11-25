// 정글 추천 엔진 (2차)
// 브라우저와 Node 양쪽에서 쓴다. data는 web/data.json (scripts/export_web.py로 생성).
//
// 순서
//   1. 절대 금지: data.vetoes 조건에 걸리면 추천에서 빼고 이유를 따로 보여준다
//   2. 점수: 남은 챔피언만. 우선순위가 높은 묶음일수록 무게가 크다
//      조합에 필요한 것 > 숙련도 > 상대 대응 > 상성
//
// 입력
//   ally : 우리 팀 [{name, lane}] (정글 제외)
//   enemy: 상대 팀 [{name, lane}] (덜 골라도 됨)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JungleEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LANES = ["탑", "정글", "미드", "원딜", "서폿"];
  const STEALTH = ["이블린", "트위치", "샤코", "아칼리", "렝가", "카직스", "티모", "파이크", "케인"];
  const FEAR_IGNORE = ["오른", "올라프", "사이온", "문도 박사", "워윅", "볼리베어"];
  const ASSASSIN_JUNGLE = ["나피리", "카직스", "이블린", "에코", "다이애나", "녹턴"];

  // 점수 무게 (묶음별)
  const W = {
    // 1. 조합에 필요한 것
    apMatch: 4, apMismatch: 4,
    needFrontline: 3, needEngage: 3, needCC: 2, needAntiTank: 3, pureTankWhenAntiTank: 2, needCarry: 1.5,
    // 2. 숙련도
    prof: { 4: 3, 3: 2, 2: 0 }, rare: 1,
    // 3. 상대 대응
    vulnBase: 2, vulnNear: 1, vulnMax: 5, aaNullEach: 1, aaNullMax: 3, timing: 1.5,
    protectorTop: 2, manyTanks: 2, highHp: 1,
    // 4. 상성
    matchJungle: 1.5, matchLane: 0.5,
  };

  const dmgOf = (data, p) => {
    const c = data.champions[p.name];
    if (!c) return "AD";
    return (c.damageByLane && c.damageByLane[p.lane]) || c.damage;
  };
  const apValue = (cls) => (cls === "AP" || cls === "혼합" ? 1 : cls === "반AP" ? 0.5 : 0);
  const isTank = (cls) => cls.endsWith("탱커") || cls === "반AP";
  const champ = (data, n) => data.champions[n] || {};

  // ---------- 조합 분석 ----------

  function analyzeAlly(data, ally) {
    const byLane = {};
    ally.forEach((p) => (byLane[p.lane] = p));
    const mid = byLane["미드"];
    const midCls = mid ? dmgOf(data, mid) : "AP";
    const apOthers = ally.filter((p) => p.lane !== "미드").reduce((s, p) => s + apValue(dmgOf(data, p)), 0);

    let need, why;
    if (midCls === "AP") {
      need = "AD"; why = mid ? `미드 ${mid.name}가 AP` : "미드가 아직 안 골라서 AP로 가정";
    } else if (apOthers >= 2) {
      need = "AD"; why = `미드를 뺀 AP·혼합이 ${apOthers}명`;
    } else if (apOthers >= 1) {
      need = "혼합또는AP"; why = `미드 ${mid.name}가 AD이고 미드를 뺀 AP가 ${apOthers}명`;
    } else {
      need = "AP"; why = `미드 ${mid ? mid.name : ""}가 AD이고 미드를 뺀 AP가 없음`;
    }

    const frontline = ally.filter((p) => champ(data, p.name).frontline);
    const engage = ally.filter((p) => (data.cc[p.name] || []).some((c) => c.use.includes("이니시")));
    const antiTank = ally.filter((p) => champ(data, p.name).antiTank);
    const adc = byLane["원딜"];
    const adcIsMage = adc ? dmgOf(data, adc) === "AP" : false;
    const carries = ally.filter((p) => p.lane !== "서폿" && !isTank(dmgOf(data, p)));
    const yasuo = ally.some((p) => p.name === "야스오");
    const ccList = [];
    ally.forEach((p) => (data.cc[p.name] || []).forEach((c) => ccList.push({ ...c, champ: p.name, lane: p.lane })));
    const shapes = {};
    ccList.forEach((c) => (shapes[c.shape] = (shapes[c.shape] || 0) + 1));
    const dmgCount = { AD: 0, AP: 0, 혼합: 0, 탱커: 0 };
    ally.forEach((p) => {
      const c = dmgOf(data, p);
      if (isTank(c)) dmgCount.탱커 += 1;
      else dmgCount[c] = (dmgCount[c] || 0) + 1;
    });
    const auto = ally.filter((p) => champ(data, p.name).auto);
    return { byLane, count: ally.length, midCls, apOthers, need, why, frontline, engage, antiTank, adcIsMage, carries, yasuo, ccList, shapes, dmgCount, auto };
  }

  function analyzeEnemy(data, enemy) {
    const byLane = {};
    enemy.forEach((p) => (byLane[p.lane] = p));
    const ccList = [];
    enemy.forEach((p) => (data.cc[p.name] || []).forEach((c) => ccList.push({ ...c, champ: p.name, lane: p.lane })));
    const wild = data.wildcards.filter((w) => enemy.some((p) => p.name === w.champ));
    const cls = enemy.map((p) => ({ p, cls: dmgOf(data, p) }));
    const dealers = cls.filter((x) => !isTank(x.cls));
    const shapes = {};
    ccList.forEach((c) => (shapes[c.shape] = (shapes[c.shape] || 0) + 1));
    const catchCC = ccList.filter((c) => ["확정", "직선", "광역즉시"].includes(c.shape) && (c.use.includes("이니시") || c.use.includes("잡기")));
    const adc = byLane["원딜"];
    return {
      byLane, count: enemy.length, ccList, wild, shapes, catchCC,
      adCount: cls.filter((x) => x.cls === "AD").length,
      autoCount: enemy.filter((p) => champ(data, p.name).auto).length,
      allAD: dealers.length > 0 && dealers.every((x) => x.cls === "AD"),
      tanks: cls.filter((x) => isTank(x.cls)).map((x) => x.p.name),
      frontline: enemy.filter((p) => champ(data, p.name).frontline).map((p) => p.name),
      highHp: enemy.filter((p) => data.highHpTanks.includes(p.name)).map((p) => p.name),
      protectors: enemy.filter((p) => data.protectors[p.name]).map((p) => ({ name: p.name, tier: data.protectors[p.name] })),
      stealth: enemy.filter((p) => STEALTH.includes(p.name)).map((p) => p.name),
      longMobility: enemy.filter((p) => (data.selfSurvival[p.name] || []).includes("거리가 먼 이동기")).map((p) => p.name),
      adcIsMage: adc ? dmgOf(data, adc) === "AP" : false,
      assassins: enemy.filter((p) => /암살/.test(champ(data, p.name).role || "")).map((p) => p.name),
      duelists: enemy.filter((p) => data.duelists.includes(p.name)).map((p) => p.name),
      jungle: byLane["정글"],
    };
  }

  // 우리 팀 경고 (3명 이상 골랐을 때)
  function allyWarnings(A, E) {
    const w = [];
    if (A.count < 3) return w;
    if (!A.frontline.length) w.push({ level: "위험", text: "앞라인이 없어요. 탱커나 브루저 정글이 좋아요." });
    if (!A.engage.length) w.push({ level: "위험", text: "한타를 열 이니시가 없어요." });
    if (E.tanks.length && !A.antiTank.length)
      w.push({ level: E.tanks.length >= 2 ? "위험" : "주의", text: `상대 탱커(${E.tanks.join(", ")})를 잡을 챔피언이 없어요. 최대 체력 % 피해나 고정 피해가 있는 정글이 좋아요.` });
    if (A.ccList.length <= 2) w.push({ level: A.ccList.length ? "주의" : "위험", text: `하드 CC가 ${A.ccList.length}개뿐이에요.` });
    if (A.carries.length <= 1) w.push({ level: "주의", text: "딜러가 부족해요. 캐리할 수 있는 정글이 좋아요." });
    if (A.adcIsMage) w.push({ level: "참고", text: "원딜 자리가 비원딜이에요. 원딜 역할을 할 정글이 좋아요." });
    if (A.yasuo) w.push({ level: "참고", text: "야스오가 있어요. 넉업, 넉백, 끌어당김 CC가 있는 정글과 연계돼요." });
    return w;
  }

  // ---------- 1. 절대 금지 ----------

  function unavoidableMidAdc(data, name, E) {
    const extra = (data.pool[name] && data.pool[name].extraDanger) || [];
    const out = [];
    ["미드", "원딜"].forEach((l) => {
      const p = E.byLane[l];
      if (!p) return;
      E.ccList.filter((c) => c.champ === p.name && (c.shape === "광역지연" || extra.includes(`${c.champ} ${c.key}`)))
        .forEach((c) => out.push(`${l} ${p.name} ${c.key}`));
    });
    return out;
  }

  const VETO_RULES = {
    unavoidable_midadc: (data, name, A, E) => {
      const hits = unavoidableMidAdc(data, name, E);
      return hits.length ? hits.join(", ") : null;
    },
    tanks_ge2: (data, name, A, E) => (E.tanks.length >= 2 ? E.tanks.join(", ") : null),
    assassin_or_duelist: (data, name, A, E) => {
      const list = [...new Set([...E.assassins, ...E.duelists])];
      return list.length ? list.join(", ") : null;
    },
    aa_null: (data, name, A, E) => {
      const aa = E.wild.filter((w) => w.type === "평타 무력화");
      return aa.length ? aa.map((w) => `${w.champ} ${w.skill}`).join(", ") : null;
    },
    pick_heavy: (data, name, A, E) => {
      const sure = E.ccList.filter((c) => c.shape === "확정");
      if (sure.length >= 3) return `확정 CC ${sure.length}개: ${sure.map((c) => `${c.champ} ${c.key}`).join(", ")}`;
      if (E.catchCC.length >= 4) return `물기 좋은 CC ${E.catchCC.length}개: ${E.catchCC.map((c) => `${c.champ} ${c.key}`).join(", ")}`;
      return null;
    },
  };

  function checkVetoes(data, name, A, E) {
    const reasons = [];
    (data.vetoes[name] || []).forEach((v) => {
      if (v.rule) {
        const hit = VETO_RULES[v.rule] && VETO_RULES[v.rule](data, name, A, E);
        if (hit) reasons.push(`${v.why} (${hit})`);
      } else {
        const p = Object.values(E.byLane).find((x) => x.name === v.champ && (!v.lane || x.lane === v.lane));
        if (p) reasons.push(`상대 ${v.lane || p.lane} ${v.champ}: ${v.why}`);
      }
    });
    return reasons;
  }

  // ---------- 2. 점수 ----------

  function dangerTokens(pool) {
    return (pool.dangerCC || "").split(",").map((s) => s.trim()).filter(Boolean);
  }

  function countDangerCC(pool, E) {
    const tokens = dangerTokens(pool);
    if (!tokens.length) tokens.push("확정");
    const hits = [];
    const cc = E.ccList;
    const add = (label, list) => list.forEach((x) => hits.push([`${x.champ} ${x.key}`, label]));
    tokens.forEach((t) => {
      if (t === "광역지연") add(t, cc.filter((c) => c.shape === "광역지연"));
      else if (t === "직선") add(t, cc.filter((c) => c.shape === "직선"));
      else if (t === "확정") add(t, cc.filter((c) => c.shape === "확정"));
      else if (t === "바로 걸리는 확정" || t === "근접 확정") add(t, cc.filter((c) => c.shape === "확정" && !c.dodge));
      else if (t === "근접 광역") add(t, cc.filter((c) => c.shape === "광역즉시"));
      else if (t === "한 명 물기 좋은 스킬") add("한 명 물기", cc.filter((c) => c.target === "단일" && c.use.includes("잡기") && c.shape !== "확정"));
      else if (t === "이동기 봉쇄" || t === "평타 무력화") E.wild.filter((w) => w.type === t).forEach((w) => hits.push([`${w.champ} ${w.skill}`, t]));
    });
    (pool.extraDanger || []).forEach((s) => { if (cc.some((x) => `${x.champ} ${x.key}` === s)) hits.push([s, "직접 지정"]); });
    const seen = new Map();
    hits.forEach(([k, label]) => { if (!seen.has(k)) seen.set(k, label); });
    return [...seen].map(([k, label]) => `${k} (${label})`);
  }

  function scoreChampion(data, name, A, E) {
    const pool = data.pool[name];
    const pick = data.picks[name] || {};
    const me = champ(data, name);
    const myCC = data.cc[name] || [];
    const groups = { 조합: [], 숙련도: [], 대응: [], 상성: [] };
    let score = 0;
    const add = (group, n, text) => { if (!n) return; score += n; groups[group].push({ n: Math.round(n * 10) / 10, text }); };

    // 1. 조합에 필요한 것
    const d = pool.damage;
    const table = {
      AD: { AD: 1, 혼합: 0, AP: -1, AP탱커: -0.25, 반AP: -0.25 },
      AP: { AP: 1, 혼합: -0.25, AD: -1, AP탱커: -0.25, 반AP: 0.25 },
      혼합또는AP: { AP: 1, 혼합: 1, AD: -0.5, AP탱커: -0.25, 반AP: 0.25 },
    };
    const needText = A.need === "혼합또는AP" ? "혼합 딜이나 AP" : A.need;
    const ap = (table[A.need] || {})[d] || 0;
    if (ap > 0) add("조합", ap * W.apMatch, `${needText} 정글이 필요 (${A.why})`);
    else if (ap < 0) add("조합", ap * W.apMismatch, `${needText} 정글이 필요한데 ${d} (${A.why})`);

    if (A.count >= 3) {
      // 탱커 처리: 상대 탱커 기준 (브루저는 % 피해 없이도 잡을 수 있음, 사용자)
      const needAnti = E.tanks.length >= 1 && !A.antiTank.length;
      const pureTank = me.frontline && !me.antiTank && (d.endsWith("탱커") || d === "반AP");
      if (!A.frontline.length && me.frontline)
        add("조합", needAnti && pureTank ? W.needFrontline / 3 : W.needFrontline, "우리 팀에 앞라인이 없음");
      if (!A.engage.length && myCC.some((c) => c.use.includes("이니시"))) add("조합", W.needEngage, "우리 팀에 이니시가 없음");
      if (A.ccList.length <= 2 && myCC.length >= 2) add("조합", W.needCC, `우리 팀 하드 CC가 ${A.ccList.length}개뿐인데 하드 CC ${myCC.length}개`);
      if (needAnti && me.antiTank)
        add("조합", E.tanks.length >= 2 ? W.needAntiTank : W.needAntiTank - 1, `상대 탱커(${E.tanks.join(", ")})를 잡을 딜이 있음`);
      if (needAnti && pureTank) add("조합", -W.pureTankWhenAntiTank, "탱커를 더해도 상대 탱커를 잡을 챔피언이 없음");
      if (A.carries.length <= 1 && !pureTank) add("조합", W.needCarry, "우리 팀에 딜러가 부족함");
    }

    // 2. 숙련도
    add("숙련도", W.prof[pool.prof] || 0, `숙련도 ${pool.prof}`);
    if (pool.rare) add("숙련도", -W.rare, "평소에 자주 안 꺼내는 챔피언");

    // 3. 상대 대응
    if (pool.vuln) {
      const hits = countDangerCC(pool, E);
      const limit = { 높음: 2, 중간: 3, 낮음: 5 }[pool.vuln];
      if (hits.length >= limit) add("대응", -Math.min(W.vulnMax, W.vulnBase + (hits.length - limit)), `CC 취약도 ${pool.vuln}, 위험한 CC ${hits.length}개: ${hits.join(", ")}`);
      else if (hits.length && hits.length === limit - 1) add("대응", -W.vulnNear, `위험한 CC ${hits.length}개: ${hits.join(", ")}`);
    }
    if (me.auto && !dangerTokens(pool).includes("평타 무력화")) {
      const aa = E.wild.filter((w) => w.type === "평타 무력화");
      if (aa.length) add("대응", -Math.min(W.aaNullMax, W.aaNullEach * aa.length), `평타 위주인데 평타 무력화: ${aa.map((w) => `${w.champ} ${w.skill}`).join(", ")}`);
    }
    const when = pick["시점"] || "";
    if (E.count < 3 && /보고/.test(when) && !/빨리|무난/.test(when))
      add("대응", -W.timing, `상대를 보고 고르는 챔피언인데 상대가 ${E.count}명만 나옴`);
    if (ASSASSIN_JUNGLE.includes(name)) {
      const top = E.protectors.filter((p) => p.tier === "최상");
      if (top.length) add("대응", -W.protectorTop, `상대 보호력 최상 서폿: ${top.map((p) => p.name).join(", ")}`);
      if (E.tanks.length >= 2) add("대응", -W.manyTanks, `상대 탱커 ${E.tanks.length}명`);
      if (E.highHp.length) add("대응", -W.highHp, `체력이 매우 높은 탱커: ${E.highHp.join(", ")}`);
    }
    const R = RULES[name];
    if (R) R({ data, A, E, add, pool, me });

    // 4. 상성
    const bad = pick["상성_불리"] || [], good = pick["상성_유리"] || [];
    Object.values(E.byLane).forEach((p) => {
      const jg = p.lane === "정글";
      if (bad.includes(p.name)) add("상성", -(jg ? W.matchJungle : W.matchLane), `불리: ${p.name}${jg ? " (상대 정글)" : ""}`);
      if (good.includes(p.name)) add("상성", jg ? W.matchJungle : W.matchLane, `유리: ${p.name}${jg ? " (상대 정글)" : ""}`);
    });

    return { name, score: Math.round(score * 10) / 10, prof: pool.prof, damage: d, groups };
  }

  // 챔피언별 규칙 (상대 대응 묶음)
  const RULES = {
    "브라이어": ({ E, add }) => {
      if (!E.byLane["미드"] || !E.byLane["원딜"]) add("대응", -2, "상대 미드와 원딜이 나온 뒤에 고르는 챔피언 (아직 안 나옴)");
    },
    "그레이브즈": ({ A, E, add }) => {
      if (A.adcIsMage) add("대응", 3, "우리 원딜이 비원딜이라 원딜 역할을 대신함");
      if (E.allAD && A.count >= 3 && A.carries.length <= 1) add("대응", 2, "상대 전원 AD + 우리 팀 딜러 부족 (E 방어력 중첩)");
    },
    "나피리": ({ E, add }) => {
      if (E.longMobility.length) add("대응", -1.5, `거리가 먼 이동기는 못 따라감: ${E.longMobility.join(", ")}`);
    },
    "녹턴": ({ E, add }) => {
      const adc = E.byLane["원딜"];
      if (!adc) add("대응", -1, "상대 바텀을 보고 고르는 챔피언 (아직 안 나옴)");
      else if (!E.tanks.includes(adc.name)) add("대응", 1, `상대 원딜 ${adc.name}를 R로 노릴 수 있음`);
    },
    "다이애나": ({ A, add }) => {
      if (A.yasuo) add("대응", 3, "우리 편 야스오와 R 에어본 연계");
    },
    "그웬": ({ E, add }) => {
      if (E.tanks.length >= 2) add("대응", 3, `상대 탱커 ${E.tanks.length}명 (최대 체력 % 피해)`);
      if (E.highHp.length) add("대응", 1, `체력 높은 탱커: ${E.highHp.join(", ")}`);
    },
    "피들스틱": ({ E, add }) => {
      if (E.stealth.length) add("대응", 2, `은신 챔피언을 잘 잡음: ${E.stealth.join(", ")}`);
      const kb = E.ccList.filter((c) => /넉백/.test(c.kind));
      if (kb.length) add("대응", -Math.min(3, kb.length), `R을 끊는 넉백: ${kb.map((c) => `${c.champ} ${c.key}`).join(", ")}`);
      const fi = Object.values(E.byLane).filter((p) => FEAR_IGNORE.includes(p.name));
      if (fi.length) add("대응", -fi.length, `공포가 잘 안 통함: ${fi.map((p) => p.name).join(", ")}`);
    },
    "헤카림": ({ E, add }) => {
      if (E.adcIsMage) add("대응", 3, "상대 원딜이 비원딜이라 카이팅이 약함");
    },
    "람머스": ({ E, add }) => {
      if (Object.values(E.byLane).some((p) => p.name === "마스터 이")) add("대응", 5, "상대 마스터 이가 있으면 바로 람머스");
      if (E.adCount >= 4 && E.autoCount >= 3) add("대응", 4, `상대 AD ${E.adCount}명, 평타 위주 ${E.autoCount}명`);
    },
    "말파이트": ({ E, add }) => {
      if (E.allAD && E.autoCount < 3 && E.count >= 3) add("대응", 4, `상대 전원 AD, 평타 위주 ${E.autoCount}명 (람머스 대신)`);
    },
    "사일러스": ({ data, E, add }) => {
      const good = Object.values(E.byLane).filter((p) => champ(data, p.name).sylasUlt);
      if (good.length >= 2) add("대응", 3, `빼앗기 좋은 궁극기 ${good.length}개: ${good.map((p) => p.name).join(", ")}`);
      else if (E.count >= 4) add("대응", -2, "빼앗기 좋은 궁극기가 부족함");
    },
    "바이": ({ E, add }) => {
      if (E.longMobility.length) add("대응", 1, `거리가 먼 이동기도 따라감: ${E.longMobility.join(", ")}`);
    },
    "렉사이": ({ E, add }) => {
      if (E.longMobility.length) add("대응", 1, `거리가 먼 이동기도 따라감: ${E.longMobility.join(", ")}`);
      if (E.stealth.length) add("대응", 1, `진동 감지로 은신을 찾음: ${E.stealth.join(", ")}`);
    },
  };

  function recommend(data, ally, enemy, opts) {
    opts = opts || {};
    const minProf = opts.minProf || 2;
    const bans = new Set(opts.bans || []);
    const taken = new Set([...ally, ...enemy].map((p) => p.name));
    const A = analyzeAlly(data, ally);
    const E = analyzeEnemy(data, enemy);
    A.warnings = allyWarnings(A, E);
    const recs = [], vetoed = [];
    Object.keys(data.pool)
      .filter((n) => data.pool[n].prof >= minProf && !taken.has(n) && !bans.has(n))
      .forEach((n) => {
        const reasons = checkVetoes(data, n, A, E);
        if (reasons.length) vetoed.push({ name: n, prof: data.pool[n].prof, reasons });
        else recs.push(scoreChampion(data, n, A, E));
      });
    recs.sort((a, b) => b.score - a.score || b.prof - a.prof);
    vetoed.sort((a, b) => b.prof - a.prof);
    return { ally: A, enemy: E, recs, vetoed };
  }

  return { recommend, analyzeAlly, analyzeEnemy, dmgOf, LANES, W };
});
