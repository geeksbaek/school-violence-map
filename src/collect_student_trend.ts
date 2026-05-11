/**
 * 학생수 다년치 추이 수집 — apiType 09의 COL_S_SUM (학년 학생수 합계).
 *
 * 시군구 × 학교종류 × 공시년도(2021~2024) 호출. 2025는 이미 school_info.json에 있음.
 *
 * 출력: data/student_trend.json
 *   { [SCHUL_CODE]: { [year]: number } }   // year = "2021".."2025"
 *
 * Usage: bun src/collect_student_trend.ts [--years 2024,2023,2022,2021]
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS, SCHOOL_KIND, type SchoolKindCode } from "./regions.ts";

const KEY = process.env.SCHOOLINFO_API_KEY!;
const ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do";

const args = process.argv.slice(2);
const yearsArg = args.includes("--years") ? args[args.indexOf("--years") + 1] : "2024,2023,2022,2021";
const YEARS = yearsArg.split(",").map((s) => s.trim()).filter(Boolean);

const KIND_TO_CODE: Record<string, SchoolKindCode> = { 초등: "02", 중학: "03", 고등: "04" };

interface TrendData { [code: string]: { [year: string]: number } }

const outPath = join(DATA_DIR, "student_trend.json");
const data: TrendData = existsSync(outPath) ? await Bun.file(outPath).json() : {};

// 2025년치는 school_info.json에서 가져와 시드
const infoPath = join(DATA_DIR, "school_info.json");
if (existsSync(infoPath)) {
  const info: Record<string, any> = await Bun.file(infoPath).json();
  let seeded = 0;
  for (const code of Object.keys(info)) {
    const r = info[code]?.["09"];
    if (!r) continue;
    const t = parseInt(r.COL_S_SUM);
    if (!Number.isFinite(t)) continue;
    data[code] = data[code] ?? {};
    if (!data[code]["2025"]) { data[code]["2025"] = t; seeded++; }
  }
  console.log(`2025 시드: ${seeded}개 (school_info에서)`);
}

console.log(`수집 대상 공시년도: ${YEARS.join(", ")}`);

async function fetchOne(sido: string, sgg: string, schulKnd: SchoolKindCode, year: string) {
  const url = ENDPOINT + "?" + new URLSearchParams({
    apiKey: KEY, apiType: "09",
    sidoCode: sido, sggCode: sgg, schulKndCode: schulKnd, pbanYr: year,
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

const total = YEARS.length * REGIONS.length * 3;
let calls = 0, rows = 0, failed = 0;
const startTs = Date.now();

for (const year of YEARS) {
  for (const region of REGIONS) {
    for (const knd of Object.keys(SCHOOL_KIND) as SchoolKindCode[]) {
      const r = await fetchOne(region.sido, region.sgg, knd, year);
      calls++;
      if (!r.ok) { failed++; continue; }
      for (const row of r.list) {
        const code: string | undefined = row.SCHUL_CODE;
        if (!code) continue;
        const t = parseInt(row.COL_S_SUM);
        if (!Number.isFinite(t)) continue;
        data[code] = data[code] ?? {};
        if (data[code][year] !== t) {
          data[code][year] = t;
          rows++;
        }
      }
      if (calls % 50 === 0) {
        const pct = ((calls / total) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
        process.stdout.write(`\r${calls}/${total} (${pct}%) ${elapsed}s | rows=${rows} fail=${failed}`);
      }
      // 매 호출마다 즉시 저장 — 배치 저장 금지
      if (calls % 30 === 0) await Bun.write(outPath, JSON.stringify(data));
      await sleep(20);
    }
  }
}

await Bun.write(outPath, JSON.stringify(data));
console.log(`\n완료: 호출 ${calls}, 신규/갱신 행 ${rows}, 실패 ${failed}`);
console.log(`학교 ${Object.keys(data).length}개, 평균 년수 ${(Object.values(data).reduce((a, b) => a + Object.keys(b).length, 0) / Object.keys(data).length).toFixed(1)}`);
