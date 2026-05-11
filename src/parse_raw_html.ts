/**
 * data/raw_html/{cd}/{code}_{year}.html 들을 일괄 재파싱하여
 * data/{base}.json 으로 저장.
 *
 * 파서 로직 변경 시 캡차 없이 즉시 재처리 가능.
 *
 * Usage:
 *   bun src/parse_raw_html.ts --cd 69    # → data/violence.json
 *   bun src/parse_raw_html.ts --cd 75    # → data/self_resolved.json
 *   bun src/parse_raw_html.ts --cd 66    # → data/prevention_edu.json
 */
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { DATA_DIR } from "./_env.ts";

const args = process.argv.slice(2);
const CD = args.includes("--cd") ? args[args.indexOf("--cd") + 1] : "69";
const OUT_BASE = ({ "69": "violence", "75": "self_resolved", "66": "prevention_edu" } as Record<string, string>)[CD] ?? `gs${CD}`;

const RAW_DIR = join(DATA_DIR, "raw_html", CD);
if (!existsSync(RAW_DIR)) {
  console.error(`raw HTML 디렉터리 없음: ${RAW_DIR}`);
  process.exit(1);
}

// 파서들 — collect_violence.ts와 동일 로직 (변경 시 양쪽 동기화 또는 import)
function parseB69(html: string): any {
  if (html.includes("제외 처리함") || html.includes("없으므로") || html.includes("공시제외")) return { zero: true };
  if (html.includes("데이터가 없습니다")) return { noData: true };
  if (html.includes("신설 또는 재개교")) return { newSchool: true };

  const result: any = {};
  try {
    const m = html.match(/학교폭력 사안 심의 결과[\s\S]*?(<table[\s\S]*?<\/table>)/);
    if (m) {
      const tdVals: string[] = [];
      const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let mm; while ((mm = re.exec(m[1])) !== null) tdVals.push(mm[1].replace(/<[^>]*>/g, "").trim());
      if (tdVals.length >= 12) result.cases = {
        s1: { n: +tdVals[0]||0, v: +tdVals[2]||0, vm: +tdVals[3]||0, p: +tdVals[4]||0, pm: +tdVals[5]||0 },
        s2: { n: +tdVals[6]||0, v: +tdVals[8]||0, vm: +tdVals[9]||0, p: +tdVals[10]||0, pm: +tdVals[11]||0 },
      };
    }
  } catch {}
  try {
    const m = html.match(/폭력 유형별 심의 현황[\s\S]*?(<table[\s\S]*?<\/table>)/);
    if (m) {
      const tdVals: number[] = [];
      const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let mm; while ((mm = re.exec(m[1])) !== null) tdVals.push(+mm[1].replace(/<[^>]*>/g, "").trim() || 0);
      if (tdVals.length >= 16) result.types = { s1: tdVals.slice(0, 8), s2: tdVals.slice(8, 16) };
    }
  } catch {}
  return Object.keys(result).length > 0 ? result : { parseError: true };
}

function parseB75(html: string): any {
  if (html.includes("제외 처리함") || html.includes("없으므로") || html.includes("공시제외")) return { zero: true };
  if (html.includes("데이터가 없습니다")) return { noData: true };
  const m = html.match(/학교의 장의 학교폭력사건 자체해결 결과[\s\S]*?(<table[\s\S]*?<\/table>)/);
  if (!m) return { parseError: true };
  const rows: { label: string; count: number }[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let trMatch;
  while ((trMatch = trRe.exec(m[1])) !== null) {
    const tr = trMatch[1];
    const thM = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    const tdM = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (!thM || !tdM) continue;
    const label = thM[1].replace(/<[^>]*>/g, "").trim();
    const valStr = tdM[1].replace(/<[^>]*>/g, "").trim();
    if (!label.includes("학기") && !label.includes("학년도")) continue;
    rows.push({ label, count: parseInt(valStr.replace(/[,]/g, "")) || 0 });
  }
  if (rows.length === 0) return { parseError: true };
  const out: any = { selfResolved: { rows } };
  if (rows.length >= 2) { out.selfResolved.s1 = rows[0].count; out.selfResolved.s2 = rows[1].count; }
  else if (rows.length === 1) { out.selfResolved.s1 = rows[0].count; }
  return out;
}

function parseB66(html: string): any {
  if (html.includes("제외 처리함") || html.includes("없으므로") || html.includes("공시제외")) return { zero: true };
  if (html.includes("데이터가 없습니다")) return { noData: true };
  const result: any = {};
  const extractRows = (tableHtml: string) => {
    const rows: { th: string[]; td: (number | string | null)[] }[] = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trM;
    while ((trM = trRe.exec(tableHtml)) !== null) {
      const tr = trM[1];
      const ths = [...tr.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => x[1].replace(/<[^>]*>/g, "").trim());
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => {
        const s = x[1].replace(/<[^>]*>/g, "").trim();
        if (s === "-" || s === "") return null;
        const n = parseFloat(s.replace(/[,]/g, ""));
        return Number.isFinite(n) ? n : s;
      });
      if (ths.length === 0 && tds.length === 0) continue;
      rows.push({ th: ths, td: tds });
    }
    return rows;
  };
  for (const [marker, key] of [
    ["학생 대상 정규 수업", "studentEdu"],
    ["교원 및 학부모 대상 연수", "staffEdu"],
    ["학생 중심 예방프로그램", "prevProgram"],
  ] as const) {
    try {
      const m = html.match(new RegExp(`${marker}[\\s\\S]*?(<table[\\s\\S]*?<\\/table>)`));
      if (m) {
        const rows = extractRows(m[1]);
        const dataRows = rows.filter((r) => r.td.length > 0);
        if (dataRows.length > 0) result[key] = dataRows;
      }
    } catch {}
  }
  return Object.keys(result).length > 0 ? result : { parseError: true };
}

function parse(html: string): any {
  if (CD === "75") return parseB75(html);
  if (CD === "66") return parseB66(html);
  return parseB69(html);
}

const outPath = join(DATA_DIR, `${OUT_BASE}.json`);
const existing: Record<string, Record<string, any>> = existsSync(outPath)
  ? await Bun.file(outPath).json()
  : {};
const merged: Record<string, Record<string, any>> = { ...existing };

const files = readdirSync(RAW_DIR);
console.log(`raw HTML 파일: ${files.length}개`);

let parsed = 0, failed = 0, skipped = 0;
for (const f of files) {
  const m = f.match(/^([^_]+)_(\d{4})\.html$/);
  if (!m) { skipped++; continue; }
  const [, code, year] = m;
  try {
    const html = await Bun.file(join(RAW_DIR, f)).text();
    const r = parse(html);
    if (!merged[code]) merged[code] = {};
    merged[code][year] = r;
    if (r.parseError) failed++; else parsed++;
  } catch (e: any) {
    failed++;
  }
  if ((parsed + failed) % 1000 === 0) process.stdout.write(`\r${parsed + failed}/${files.length}`);
}

await Bun.write(outPath, JSON.stringify(merged, null, 2));
console.log(`\n저장: ${outPath}`);
console.log(`성공 ${parsed}, 실패 ${failed}, 스킵 ${skipped}`);
