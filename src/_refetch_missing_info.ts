/**
 * school_info.json 누락 학교들의 (sido, sgg, kind) 조합만 재수집.
 * collect_info.ts의 호출 로직을 그대로 따르되, 누락 조합만 시도.
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS, SCHOOL_KIND, type SchoolKindCode } from "./regions.ts";
import { loadSchoolInfo, saveSchoolInfo } from "./_school_info_io.ts";

const KEY = process.env.SCHOOLINFO_API_KEY!;
const ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do";
const API_TYPES = ["00","08","09","10","16","17","18","20","21","22","30","34","38","43","51","56","59"] as const;
const FALLBACK_YEARS = ["2024", "2023", "2022", "2021"];

const KIND_TO_CODE: Record<string, SchoolKindCode> = { 초등: "02", 중학: "03", 고등: "04" };

const schools: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const data: Record<string, any> = await loadSchoolInfo();

// 누락 학교의 (sgg, knd) 조합 추출
const missingByCombo = new Map<string, { sido: string; sgg: string; knd: SchoolKindCode; codes: string[] }>();
for (const s of Object.values(schools) as any[]) {
  if (s.closeYn !== "N") continue;
  const cur = data[s.code];
  if (cur && Object.keys(cur).filter(k => k !== "_meta").length > 0) continue;
  const knd = KIND_TO_CODE[s.kind];
  if (!knd) continue;
  const region = REGIONS.find((r) => r.sgg === s.sgg);
  if (!region) continue;
  const key = `${s.sgg}_${knd}`;
  if (!missingByCombo.has(key)) {
    missingByCombo.set(key, { sido: region.sido, sgg: s.sgg, knd, codes: [] });
  }
  missingByCombo.get(key)!.codes.push(s.code);
}

console.log(`누락 학교 ${[...missingByCombo.values()].reduce((a,b)=>a+b.codes.length,0)}개`);
console.log(`재호출 조합 ${missingByCombo.size}개 × ${API_TYPES.length} apiType = ${missingByCombo.size * API_TYPES.length}회`);

async function fetchOne(sido: string, sgg: string, knd: SchoolKindCode, apiType: string, year: string) {
  const url = ENDPOINT + "?" + new URLSearchParams({
    apiKey: KEY, apiType, sidoCode: sido, sggCode: sgg, schulKndCode: knd, pbanYr: year,
  });
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false as const, msg: `HTTP ${res.status}`, list: [] as any[] };
    const j = (await res.json()) as { resultCode: string; resultMsg?: string; list?: any[] };
    if (j.resultCode !== "success") return { ok: false as const, msg: j.resultMsg ?? j.resultCode, list: [] as any[] };
    return { ok: true as const, msg: "", list: j.list ?? [] };
  } catch (e: any) {
    return { ok: false as const, msg: e.message, list: [] as any[] };
  }
}

let calls = 0, added = 0, stillMissing = 0;
const targetCodes = new Set<string>();
for (const m of missingByCombo.values()) for (const c of m.codes) targetCodes.add(c);

for (const m of missingByCombo.values()) {
  let gotForCombo = 0;
  for (const year of FALLBACK_YEARS) {
    for (const apiType of API_TYPES) {
      const r = await fetchOne(m.sido, m.sgg, m.knd, apiType, year);
      calls++;
      if (!r.ok) { await sleep(60); continue; }
      for (const row of r.list) {
        const code: string | undefined = row.SCHUL_CODE;
        if (!code || !targetCodes.has(code)) continue;
        const sch = schools[code];
        if (!data[code]) data[code] = { _meta: { name: sch.name, kind: sch.kind, sgg: sch.sgg, year } };
        if (!data[code][apiType]) {
          data[code][apiType] = row;
          added++;
          gotForCombo++;
        }
      }
      await sleep(60);
    }
    // 이 조합의 모든 학교가 채워졌으면 다음 year 안 봄
    const allFilled = m.codes.every((c) => data[c] && Object.keys(data[c]).filter(k => k !== "_meta").length >= 5);
    if (allFilled) break;
  }
  if (calls % 200 === 0) await saveSchoolInfo(data, schools);
  process.stdout.write(`${SCHOOL_KIND[m.knd].slice(0,2)}/${m.sgg}(${m.codes.length}교): +${gotForCombo}\n`);
}

await saveSchoolInfo(data, schools);

// 여전히 누락 학교 카운트
for (const c of targetCodes) {
  if (!data[c] || Object.keys(data[c]).filter(k => k !== "_meta").length === 0) stillMissing++;
}
console.log(`\n=== 완료 ===`);
console.log(`호출 ${calls}회, 신규 row ${added}개`);
console.log(`재수집 시도 ${targetCodes.size}교 → 여전히 누락 ${stillMissing}교`);
