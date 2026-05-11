/**
 * 학교알리미 검색 인터페이스 SHL_IDF_CD (UUID) 수집.
 * OpenAPI의 SCHUL_CODE(S0xxxxx) ↔ 검색용 SHL_IDF_CD(UUID) 매핑.
 *
 * 학폭(b69) 등 캡차 페이지는 UUID가 필요해서 별도 매핑 단계가 필요.
 *
 * 시군구 × 초/중/고 호출 → SHL_NM 으로 schools.json과 매칭.
 *
 * 출력: data/school_ids.json
 *   { [SCHUL_CODE]: { uuid, nameInSearch } }
 *
 * Usage: bun src/collect_school_ids.ts
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS } from "./regions.ts";

const BASE = "https://www.schoolinfo.go.kr";

let SESSION = "";

async function initSession() {
  const res = await fetch(`${BASE}/ei/ss/pneiss_a05_s0.do`, { redirect: "manual" });
  const cookies = res.headers.getSetCookie?.() ?? [];
  let js = "", wm = "";
  for (const c of cookies) {
    if (c.includes("JSESSIONID")) js = c.split(";")[0];
    if (c.includes("WMONID")) wm = c.split(";")[0];
  }
  SESSION = [wm, js].filter(Boolean).join("; ");
}

// 학교명 키워드 검색 — 결과 HTML에서 UUID 추출. 종류별 카드 분리.
async function searchByName(keyword: string): Promise<{ kind: "초등" | "중학" | "고등"; uuid: string }[]> {
  const params = new URLSearchParams({
    SEARCH_KEYWORD: keyword, SEARCH_SCHUL_NM: keyword, SEARCH_TYPE: "1",
    SEARCH_GS_HANGMOK_CD: "", SEARCH_GS_HANGMOK_NM: "", SEARCH_GS_BURYU_CD: "",
    SEARCH_SIGUNGU: "", SEARCH_SIDO: "", SEARCH_FOND_SC_CODE: "", SEARCH_MODE: "",
  });
  const res = await fetch(`${BASE}/ei/ss/Pneiss_f01_l0.do`, {
    method: "POST",
    headers: {
      Cookie: SESSION,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${BASE}/Main.do`,
      "User-Agent": "Mozilla/5.0",
    },
    body: params.toString(),
  });
  const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
  // 종류별 결과 섹션: srDiv1=초등, srDiv2=중학, srDiv3=고등. 각 안에 bi<UUID> 클래스.
  const out: { kind: "초등" | "중학" | "고등"; uuid: string }[] = [];
  for (const [div, kind] of [["srDiv1", "초등"], ["srDiv2", "중학"], ["srDiv3", "고등"]] as const) {
    const sec = html.match(new RegExp(`search_result ${div}[\\s\\S]*?(?=<div class=\"search_result|<!--검색결과 end|$)`));
    if (!sec) continue;
    const uuids = [...sec[0].matchAll(/basicInfo bi([0-9a-fA-F]{8}-[0-9a-fA-F\-]{27})/g)].map((m) => m[1]);
    for (const u of uuids) out.push({ kind, uuid: u });
  }
  return out;
}

async function getList(sido10: string, sgg10: string, hgJongryu: string) {
  // hgJongryu: 02 초등 / 03 중등 / 04 고등
  const url = `${BASE}/ei/ss/pneiss_a05_s0/selectSchoolListLocation.do`;
  const body = new URLSearchParams({
    HG_JONGRYU_GB: hgJongryu,
    SIDO_CODE: sido10,
    SIGUNGU_CODE: sgg10,
    SULRIP_GB: "1",
    GS_HANGMOK_CD: "69",
    PNF_YR: "2026",
    JG_HANGMOK_CD: "97",
  });
  body.append("SULRIP_GB", "2");
  body.append("SULRIP_GB", "3");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: SESSION,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });
  const j = (await res.json()) as { schoolList?: { SHL_NM: string; SHL_IDF_CD: string }[] };
  return j.schoolList ?? [];
}

interface SchoolEntry {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  sgg: string;
}

const KIND_TO_HG: Record<string, string> = { 초등: "02", 중학: "03", 고등: "04" };

function normalize(s: string): string {
  // "수원OO초등학교" / "OO초" / "OO초등학교" 등을 비교 가능하게
  return s.replace(/\s+/g, "").replace(/초등학교$|중학교$|고등학교$|초등$|중등$|고등$|초$|중$|고$/, "");
}

// 도시명 prefix(예: "화성", "수원") 떼고 normalize — fuzzy 매칭용
function relaxName(name: string, city: string): string {
  const n = normalize(name);
  const cityShort = city.replace(/(특별자치도|특별시|광역시|시|도|군|구)$/, "");
  if (cityShort && n.startsWith(cityShort)) return n.slice(cityShort.length);
  return n;
}

// 일반구 sgg10 후보 — base sgg10이 XX590 같은 통합코드면 XX591~XX599 시도
function neighborSgg10s(sgg10: string): string[] {
  // 4159000000 → 4159100000, 4159200000, ..., 4159900000
  const prefix = sgg10.slice(0, 4);
  const out: string[] = [];
  for (let i = 1; i <= 9; i++) out.push(`${prefix}${i}00000000`.slice(0, 10));
  return out;
}

async function main() {
  await initSession();

  const schools: Record<string, SchoolEntry> = await Bun.file(join(DATA_DIR, "schools.json")).json();
  const byKindSggName = new Map<string, string>(); // `${kind}|${sgg}|${normName}` → code
  for (const s of Object.values(schools)) {
    if ((s as any).closeYn === "Y") continue;
    byKindSggName.set(`${s.kind}|${s.sgg}|${normalize(s.name)}`, s.code);
  }

  const out: Record<string, { uuid: string; nameInSearch: string }> = {};

  // 검색 인터페이스: 10자리. 통합 sgg + 일반구 sgg 모두 호출.
  const searchRegions = REGIONS;

  let matched = 0, unmatched = 0;
  for (const region of searchRegions) {
    const sido10 = region.sido + "00000000";
    for (const kind of ["초등", "중학", "고등"] as const) {
      const list = await getList(sido10, region.sgg10, KIND_TO_HG[kind]);
      let added = 0;
      for (const s of list) {
        const norm = normalize(s.SHL_NM);
        // 한 학교가 여러 sgg(통합/일반구)에 다 있을 수 있음 → 모든 후보 시도
        const trySggs = [region.sgg];
        // 같은 city 내 통합/일반구 sgg 후보 추가 (매칭 누락 방지)
        for (const r of REGIONS) {
          if (r.city === region.city && !trySggs.includes(r.sgg)) trySggs.push(r.sgg);
        }
        let code: string | undefined;
        for (const sgg of trySggs) {
          code = byKindSggName.get(`${kind}|${sgg}|${norm}`);
          if (code) break;
        }
        if (code) {
          if (!out[code]) {
            out[code] = { uuid: s.SHL_IDF_CD, nameInSearch: s.SHL_NM };
            added++;
            matched++;
          }
        } else {
          unmatched++;
        }
      }
      console.log(`  ${region.label} ${kind}: 검색 ${list.length}개 → 매칭 ${added}개`);
      await sleep(120);
    }
  }

  // ── 보강 1: 미매핑 학교가 있는 도시만 일반구 sgg10 추가 호출 ──
  const allActiveFirst = Object.values(schools).filter((s: any) => s.closeYn === "N");
  const missingCities = new Set<string>();
  for (const s of allActiveFirst) if (!out[s.code]) missingCities.add((s as any).city);
  console.log(`\n미매핑 학교가 있는 도시: ${missingCities.size}개 → 일반구 sgg10 후보 호출`);

  const cityRegion = new Map<string, typeof REGIONS[number]>();
  for (const r of REGIONS) if (!cityRegion.has(r.city)) cityRegion.set(r.city, r);

  const cityPool = new Map<string, Array<{ kind: string; rawName: string; norm: string; relax: string; uuid: string }>>();
  let extraCalls = 0, extraAdded = 0;
  for (const city of missingCities) {
    const r = cityRegion.get(city);
    if (!r) continue;
    const sido10 = r.sido + "00000000";
    const candidates = neighborSgg10s(r.sgg10);
    for (const sgg10alt of candidates) {
      for (const kind of ["초등", "중학", "고등"] as const) {
        const list = await getList(sido10, sgg10alt, KIND_TO_HG[kind]);
        extraCalls++;
        if (list.length === 0) continue;
        const arr = cityPool.get(city) ?? [];
        for (const s of list) {
          arr.push({ kind, rawName: s.SHL_NM, norm: normalize(s.SHL_NM), relax: relaxName(s.SHL_NM, city), uuid: s.SHL_IDF_CD });
        }
        cityPool.set(city, arr);
        await sleep(80);
      }
    }
  }
  console.log(`일반구 추가 호출: ${extraCalls}회, 도시별 풀 ${cityPool.size}개`);

  // ── 보강 2: 미매핑 학교에 대해 cityPool fuzzy match ──
  const allActive = Object.values(schools).filter((s: any) => s.closeYn === "N");
  let stillMissing = allActive.filter((s: any) => !out[s.code]);
  for (const s of stillMissing) {
    const pool = cityPool.get((s as any).city);
    if (!pool) continue;
    const schoolNorm = normalize(s.name);
    const schoolRelax = relaxName(s.name, (s as any).city);
    // 1차: kind 일치 + norm 정확
    let hit = pool.find((p) => p.kind === s.kind && p.norm === schoolNorm);
    // 2차: kind 일치 + relax 정확
    if (!hit) hit = pool.find((p) => p.kind === s.kind && p.relax === schoolRelax);
    // 3차: kind 일치 + 한쪽이 다른쪽 substring (양방향)
    if (!hit) hit = pool.find((p) => p.kind === s.kind && (p.norm.includes(schoolNorm) || schoolNorm.includes(p.norm)));
    if (hit) {
      out[s.code] = { uuid: hit.uuid, nameInSearch: hit.rawName };
      extraAdded++;
    }
  }
  console.log(`보강 매칭: +${extraAdded}`);

  // ── 보강 3: 미매핑 학교 학교명 직접 검색 (Pneiss_f01_l0.do) ──
  stillMissing = allActive.filter((s: any) => !out[s.code]);
  console.log(`\n학교명 직접 검색 fallback: ${stillMissing.length}개 시도`);
  let nameSearchAdded = 0;
  for (let i = 0; i < stillMissing.length; i++) {
    const s = stillMissing[i] as any;
    const keyword = normalize(s.name); // suffix 떼고 검색
    if (keyword.length < 2) continue;
    try {
      const results = await searchByName(keyword);
      const candidates = results.filter((r) => r.kind === s.kind);
      if (candidates.length === 1) {
        out[s.code] = { uuid: candidates[0].uuid, nameInSearch: s.name };
        nameSearchAdded++;
      }
      // 여러 후보면 모호 → 스킵 (안정성 우선)
    } catch {}
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i+1}/${stillMissing.length} (+${nameSearchAdded})\n`);
    await sleep(150);
  }
  console.log(`학교명 검색 보강: +${nameSearchAdded}`);

  await Bun.write(join(DATA_DIR, "school_ids.json"), JSON.stringify(out, null, 2));

  stillMissing = allActive.filter((s: any) => !out[s.code]);
  console.log(`\n매칭: ${matched + extraAdded + nameSearchAdded} / 검색 미매칭 row(통합만): ${unmatched}`);
  console.log(`최종 schools.json 기준 매핑 없음: ${stillMissing.length}개`);
  if (stillMissing.length > 0 && stillMissing.length <= 30) {
    for (const m of stillMissing.slice(0, 30)) console.log(`  - ${m.kind} ${m.name} (${m.sgg})`);
  } else if (stillMissing.length > 0) {
    console.log(`샘플 10개:`);
    for (const m of stillMissing.slice(0, 10)) console.log(`  - ${m.kind} ${m.name} (${m.sgg})`);
  }
}

await main();
