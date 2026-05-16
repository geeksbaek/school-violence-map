/**
 * High-school graduation career outcomes from Schoolinfo b06.
 *
 * This is the closest public Schoolinfo item to "college admission results":
 * it is not university-by-university acceptances, but registered outcomes
 * grouped as junior college, university, overseas study, employment, and other.
 *
 * Input:
 *   data/schools.json
 *   data/school_ids.json (SCHUL_CODE -> SHL_IDF_CD UUID)
 *
 * Output:
 *   data/graduation_careers.json
 *
 * Usage:
 *   bun src/collect_graduation_careers.ts
 *   bun src/collect_graduation_careers.ts --year 2025
 *   bun src/collect_graduation_careers.ts --years 2025,2024,2023
 *   bun src/collect_graduation_careers.ts --from 0 --limit 100
 *   bun src/collect_graduation_careers.ts --refresh
 *   bun src/collect_graduation_careers.ts --quiet --sleep-ms 20
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { DATA_DIR, sleep } from "./_env.ts";

const BASE = "https://www.schoolinfo.go.kr";
const OUT_PATH = join(DATA_DIR, "graduation_careers.json");

const args = process.argv.slice(2);
const yearArg = args.includes("--year") ? args[args.indexOf("--year") + 1] : null;
const yearsArg = args.includes("--years") ? args[args.indexOf("--years") + 1] : null;
const startIdx = args.includes("--from") ? parseInt(args[args.indexOf("--from") + 1]) : 0;
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]) : Infinity;
const refresh = args.includes("--refresh");
const includeClosed = args.includes("--include-closed");
const quiet = args.includes("--quiet");
const sleepMs = args.includes("--sleep-ms") ? parseInt(args[args.indexOf("--sleep-ms") + 1]) : 60;

const YEARS = yearArg
  ? [yearArg]
  : yearsArg
    ? yearsArg.split(",").map((x) => x.trim()).filter(Boolean)
    : ["2025", "2024", "2023"];

interface SchoolEntry {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  sgg: string;
  city?: string;
  district?: string;
  closeYn?: string;
}

interface SchoolIdEntry {
  uuid: string;
  nameInSearch: string;
}

interface OutcomeRow {
  graduates?: number;
  juniorCollege?: number;
  university?: number;
  overseasJuniorCollege?: number;
  overseasUniversity?: number;
  overseasTotal?: number;
  advancementTotal?: number;
  employed?: number;
  other?: number;
}

interface CareerOutcome {
  requestedYear: string;
  actualYear?: string;
  byGender: {
    male?: OutcomeRow;
    female?: OutcomeRow;
  };
  total: OutcomeRow;
  rates: Omit<OutcomeRow, "graduates">;
  availableYears?: string[];
}

type CareerResult =
  | CareerOutcome
  | { noData: true; requestedYear: string; actualYear?: string; fallbackYear?: string; availableYears?: string[] }
  | { excluded: true; requestedYear: string; actualYear?: string; reason?: string; availableYears?: string[] }
  | { parseError: true; requestedYear: string; actualYear?: string; availableYears?: string[] };

interface OutputEntry {
  _meta: {
    name: string;
    kind: string;
    sgg: string;
    city?: string;
    district?: string;
    nameInSearch?: string;
  };
  [year: string]: any;
}

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
  if (!SESSION) console.warn("세션 쿠키 없음");
}

async function fetchEucKr(url: string, opts?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Cookie: SESSION,
      Referer: `${BASE}/ei/ss/pneiss_a05_s0.do`,
      "User-Agent": "Mozilla/5.0",
      ...(opts?.headers ?? {}),
    },
  });
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

function cleanText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(raw: string): number | undefined {
  const s = cleanText(raw).replace(/,/g, "");
  if (!s || s === "-") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseActualYear(html: string): string | undefined {
  const m = html.match(/<input[^>]+name=["']JG_YEAR["'][^>]+value=["'](\d{4})["']/);
  return m?.[1];
}

function parseAvailableYears(html: string): string[] {
  const out = new Set<string>();
  const re = /<option[^>]+value=["'](\d{4})\d?["'][^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return [...out].sort((a, b) => b.localeCompare(a));
}

const TITLE_TO_KEY: Record<string, keyof OutcomeRow> = {
  "졸업자": "graduates",
  "진학자 전문대학": "juniorCollege",
  "진학자 대학교": "university",
  "진학자 국외진학 전문대학": "overseasJuniorCollege",
  "진학자 국외진학 대학교": "overseasUniversity",
  "진학자 국외진학 소계": "overseasTotal",
  "진학자 계": "advancementTotal",
  "취업자": "employed",
  "기타": "other",
};

function parseOutcomeCells(rowHtml: string): OutcomeRow {
  const row: OutcomeRow = {};
  const tdRe = /<td[^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = tdRe.exec(rowHtml)) !== null) {
    const key = TITLE_TO_KEY[cleanText(m[1])];
    if (!key) continue;
    const value = toNumber(m[2]);
    if (value !== undefined) row[key] = value;
  }
  return row;
}

function parseGraduationCareer(html: string, requestedYear: string): CareerResult {
  const actualYear = parseActualYear(html);
  const availableYears = parseAvailableYears(html);

  if (html.includes("공시제외") || html.includes("제외 처리함") || html.includes("없으므로")) {
    return { excluded: true, requestedYear, actualYear, availableYears };
  }
  if (html.includes("데이터가 없습니다") || html.includes("입력된 데이터가")) {
    return { noData: true, requestedYear, actualYear, availableYears };
  }
  if (actualYear && actualYear !== requestedYear) {
    return { noData: true, requestedYear, actualYear, fallbackYear: actualYear, availableYears };
  }

  const tableMatch =
    html.match(/<table[^>]+summary=["']졸업생의 진로현황["'][\s\S]*?<\/table>/) ??
    html.match(/<table[\s\S]*?title=["']졸업자["'][\s\S]*?<\/table>/);
  if (!tableMatch) return { parseError: true, requestedYear, actualYear, availableYears };

  const result: CareerOutcome = {
    requestedYear,
    actualYear,
    byGender: {},
    total: {},
    rates: {},
    availableYears,
  };

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(tableMatch[0])) !== null) {
    const tr = m[1];
    if (!/<td/i.test(tr)) continue;
    const ths = [...tr.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => cleanText(x[1]));
    const label = ths.join(" ");
    const parsed = parseOutcomeCells(tr);

    if (label.includes("남")) result.byGender.male = parsed;
    else if (label.includes("여")) result.byGender.female = parsed;
    else if (label.includes("합")) result.total = parsed;
    else if (label.includes("비")) result.rates = parsed;
  }

  if (!result.total.graduates && !result.total.advancementTotal && !result.total.other) {
    return { parseError: true, requestedYear, actualYear, availableYears };
  }
  return result;
}

async function fetchCareer(school: SchoolEntry, uuid: string, year: string): Promise<CareerResult> {
  const params = {
    GS_HANGMOK_CD: "06",
    GS_HANGMOK_NO: "13-다",
    GS_HANGMOK_NM: "졸업생의 진로 현황",
    GS_BURYU_CD: "JG040",
    JG_BURYU_CD: "JG130",
    JG_HANGMOK_CD: "52",
    JG_GUBUN: "1",
    JG_YEAR2: year,
    HG_NM: school.name,
    SHL_IDF_CD: uuid,
    GS_TYPE: "Y",
    JG_YEAR: year,
    CHOSEN_JG_YEAR: year,
    PRE_JG_YEAR: year,
    LOAD_TYPE: "single",
  };

  const html = await fetchEucKr(`${BASE}/ei/pp/Pneipp_b06_s0p.do?${new URLSearchParams(params)}`);
  return parseGraduationCareer(html, year);
}

async function main() {
  await initSession();

  const schools: Record<string, SchoolEntry> = await Bun.file(join(DATA_DIR, "schools.json")).json();
  const ids: Record<string, SchoolIdEntry> = await Bun.file(join(DATA_DIR, "school_ids.json")).json();

  const data: Record<string, OutputEntry> = existsSync(OUT_PATH)
    ? await Bun.file(OUT_PATH).json()
    : {};

  const targets = Object.entries(schools)
    .filter(([code, school]) => school.kind === "고등" && (includeClosed || school.closeYn !== "Y") && ids[code]?.uuid)
    .sort(([, a], [, b]) =>
      (a.city ?? "").localeCompare(b.city ?? "") ||
      (a.district ?? "").localeCompare(b.district ?? "") ||
      a.name.localeCompare(b.name)
    );

  const slice = targets.slice(startIdx, startIdx + (Number.isFinite(limit) ? limit : targets.length));
  console.log(`대상 고등학교: ${targets.length}개 중 [${startIdx}, ${startIdx + slice.length})`);
  console.log(`공시년도: ${YEARS.join(", ")}`);

  let total = 0, collected = 0, cached = 0, noData = 0, excluded = 0, parseErrors = 0, errors = 0;
  const t0 = Date.now();

  for (const [code, school] of slice) {
    if (!data[code]) {
      data[code] = {
        _meta: {
          name: school.name,
          kind: school.kind,
          sgg: school.sgg,
          city: school.city,
          district: school.district,
          nameInSearch: ids[code].nameInSearch,
        },
      };
    }

    for (const year of YEARS) {
      total++;
      if (!refresh && data[code][year] && !data[code][year].error) {
        cached++;
        continue;
      }

      if (!quiet) process.stdout.write(`[${total}/${slice.length * YEARS.length}] ${school.name} ${year}`);
      try {
        const result = await fetchCareer(school, ids[code].uuid, year);
        data[code][year] = result;

        if ("noData" in result) {
          noData++;
          if (!quiet) process.stdout.write(" 데이터없음\n");
        } else if ("excluded" in result) {
          excluded++;
          if (!quiet) process.stdout.write(" 공시제외\n");
        } else if ("parseError" in result) {
          parseErrors++;
          if (!quiet) process.stdout.write(" 파싱실패\n");
        } else {
          collected++;
          const totalRow = result.total;
          if (!quiet) {
            process.stdout.write(
              ` 졸업 ${totalRow.graduates ?? 0}, 진학 ${totalRow.advancementTotal ?? 0}, 기타 ${totalRow.other ?? 0}\n`
            );
          }
        }
      } catch (e: any) {
        data[code][year] = { error: e.message, requestedYear: year };
        errors++;
        if (!quiet) process.stdout.write(` 에러 ${e.message}\n`);
        if (String(e.message).includes("fetch failed")) {
          await initSession();
        }
      }

      await Bun.write(OUT_PATH, JSON.stringify(data, null, 2));
      if (quiet && total % 100 === 0) {
        const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
        console.log(`진행 ${total}/${slice.length * YEARS.length} · 수집 ${collected} · 기존 ${cached} · 실패 ${parseErrors + errors} · ${elapsed}분`);
      }
      await sleep(sleepMs);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\n=== 완료 (${elapsed}분) ===`);
  console.log(`수집 ${collected}, 기존 ${cached}, 데이터없음 ${noData}, 공시제외 ${excluded}, 파싱실패 ${parseErrors}, 에러 ${errors} / 총 ${total}`);
  console.log(`저장: ${OUT_PATH}`);
}

await main();
