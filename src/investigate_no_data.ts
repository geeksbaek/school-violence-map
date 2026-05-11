/**
 * 학폭 4년 모두 noData인 학교 샘플을 다시 fetch해
 * "원천 진짜 noData" vs "수집 로직 미스"를 분류.
 *
 * 사용:
 *   bun src/investigate_no_data.ts [--sample 30]
 *
 * 출력: data/_no_data_audit.json + 콘솔 요약
 */
import { join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(import.meta.dir, "..");
const DATA_DIR = join(ROOT, "data");
const BASE = "https://www.schoolinfo.go.kr";

const args = process.argv.slice(2);
const SAMPLE = args.includes("--sample") ? parseInt(args[args.indexOf("--sample") + 1]) : 30;

const schools: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const violence: Record<string, any> = await Bun.file(join(DATA_DIR, "violence.json")).json();

const YEARS = ["2026", "2025", "2024", "2023"];

// 1) 4년 모두 noData인 학교 수집
const candidates: Array<{ code: string; name: string; kind: string; city: string; district: string }> = [];
for (const code of Object.keys(violence)) {
  const r = violence[code];
  let allNo = true, has4 = 0;
  for (const y of YEARS) {
    const e = r[y];
    if (!e) { allNo = false; break; }
    has4++;
    if (!e.noData) { allNo = false; break; }
  }
  if (allNo && has4 === 4) {
    const s = schools[code];
    if (!s || s.closeYn === "Y") continue;
    candidates.push({ code, name: s.name, kind: s.kind, city: s.city, district: s.district });
  }
}
console.log(`전체 noData 학교: ${candidates.length}개 → ${SAMPLE}개 샘플 조사`);

// 2) 시·도 다양하게 샘플링 (도시별 비율 보존)
const byCity = new Map<string, typeof candidates>();
for (const c of candidates) {
  const arr = byCity.get(c.city) ?? [];
  arr.push(c);
  byCity.set(c.city, arr);
}
const sample: typeof candidates = [];
const cityList = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [, arr] of cityList) {
  // 도시별 1-2개씩 무작위
  const pick = Math.min(arr.length, Math.max(1, Math.floor(SAMPLE * arr.length / candidates.length)));
  for (let i = 0; i < pick && sample.length < SAMPLE; i++) {
    sample.push(arr[Math.floor(Math.random() * arr.length)]);
  }
  if (sample.length >= SAMPLE) break;
}

// 3) 세션 + fetch
let SESSION = "";
{
  const res = await fetch(`${BASE}/ei/ss/pneiss_a05_s0.do`, { redirect: "manual" });
  const cookies = res.headers.getSetCookie?.() ?? [];
  let js = "", wm = "";
  for (const c of cookies) {
    if (c.includes("JSESSIONID")) js = c.split(";")[0];
    if (c.includes("WMONID")) wm = c.split(";")[0];
  }
  SESSION = [wm, js].filter(Boolean).join("; ");
}

async function fetchHtml(school: typeof candidates[0], year: string): Promise<string> {
  const params = {
    GS_HANGMOK_CD: "69",
    GS_HANGMOK_NO: "11-다",
    GS_HANGMOK_NM: "학교폭력대책심의위원회 심의 결과",
    GS_BURYU_CD: "JG160",
    JG_BURYU_CD: "JG110",
    JG_HANGMOK_CD: "97",
    JG_GUBUN: "1",
    JG_YEAR2: year,
    HG_NM: school.name,
    SHL_IDF_CD: school.code,
    GS_TYPE: "Y",
    JG_YEAR: year,
    CHOSEN_JG_YEAR: year,
    PRE_JG_YEAR: year,
    LOAD_TYPE: "single",
  };
  const res = await fetch(`${BASE}/ei/pp/Pneipp_b69_s0p.do?${new URLSearchParams(params)}`, {
    headers: {
      Cookie: SESSION,
      Referer: `${BASE}/ei/ss/pneiss_a05_s0.do`,
    },
  });
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

interface AuditRow {
  code: string;
  name: string;
  kind: string;
  region: string;
  year: string;
  classification: "noData_확인" | "공시제외" | "신설_재개교" | "심의건수_있음" | "캡차_요구" | "기타";
  excerpt: string;  // 분류 근거 부분 200자
}

const audit: AuditRow[] = [];
for (const s of sample) {
  // 가장 최신 년도(2026) 1개만 검사 — 충분히 대표성 있음
  const year = "2026";
  try {
    const html = await fetchHtml(s, year);
    let cls: AuditRow["classification"] = "기타";
    if (html.includes("데이터가 없습니다") || html.includes("입력된 데이터가")) cls = "noData_확인";
    else if (html.includes("제외 처리함") || html.includes("없으므로") || html.includes("공시제외")) cls = "공시제외";
    else if (html.includes("신설 또는 재개교")) cls = "신설_재개교";
    else if (html.includes("심의건수")) cls = "심의건수_있음";
    else if (html.includes("숫자를 입력") || html.includes("captcha")) cls = "캡차_요구";

    // 본문 핵심 부분 추출 (script/style 제거 후 처음 200자)
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = stripped.slice(0, 250);

    audit.push({
      code: s.code, name: s.name, kind: s.kind,
      region: `${s.city} ${s.district}`,
      year, classification: cls, excerpt,
    });
    process.stdout.write(`. ${s.name} → ${cls}\n`);
  } catch (e) {
    process.stdout.write(`✗ ${s.name}: ${e}\n`);
  }
  await new Promise(r => setTimeout(r, 200));
}

// 4) 분류별 집계
const summary: Record<string, number> = {};
for (const a of audit) summary[a.classification] = (summary[a.classification] ?? 0) + 1;

console.log("\n분류별 집계:");
for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);

const out = {
  generatedAt: new Date().toISOString(),
  totalNoDataSchools: candidates.length,
  sampleSize: audit.length,
  summary,
  rows: audit,
};
const outPath = join(DATA_DIR, "_no_data_audit.json");
await Bun.write(outPath, JSON.stringify(out, null, 2));
console.log(`\n저장: ${outPath}`);

// 결론 요약
const realNoData = (summary["noData_확인"] ?? 0) + (summary["공시제외"] ?? 0) + (summary["신설_재개교"] ?? 0);
const ratio = audit.length > 0 ? (realNoData / audit.length * 100).toFixed(1) : "0";
console.log(`\n결론: 샘플 ${audit.length}개 중 ${realNoData}개(${ratio}%)가 진짜 원천 미보고`);
if (audit.length - realNoData > 0) {
  console.log(`  나머지 ${audit.length - realNoData}개는 수집 로직 점검 필요`);
}
