/**
 * 학교폭력 데이터 스크래핑 (학교알리미 b69 페이지, CAPTCHA 필요).
 *
 * 입력: data/school_ids.json (SCHUL_CODE → UUID 매핑)
 * 출력: data/violence.json
 *   { [SCHUL_CODE]: { [공시년도]: parsed | { zero|noData|newSchool|skipped|error } } }
 *
 * 매 (school, year) 완료 후 즉시 저장. CAPTCHA는 자동으로 이미지 열고 stdin 입력 대기.
 *
 * Usage:
 *   bun src/collect_violence.ts                # 전체
 *   bun src/collect_violence.ts --year 2026    # 특정 공시년도만
 *   bun src/collect_violence.ts --kind 초등    # 학교종류 필터
 *   bun src/collect_violence.ts --skip-existing  # 기존 데이터 스킵 (기본)
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DATA_DIR, sleep } from "./_env.ts";

const BASE = "https://www.schoolinfo.go.kr";
// 캡차 png는 시도별로 별개 파일에 저장 (병렬 실행 가능 + 디버깅 용이)
const tmpCaptcha = (id: string) => join(DATA_DIR, `_captcha_${id}.png`);

const args = process.argv.slice(2);
const yearArg = args.includes("--year") ? args[args.indexOf("--year") + 1] : null;
const kindArg = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : null;
const startIdx = args.includes("--from") ? parseInt(args[args.indexOf("--from") + 1]) : 0;
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]) : Infinity;
const debugCaptcha = args.includes("--debug-captcha"); // 캡차 png 보존
// 병렬 인스턴스 충돌 방지: --part 0..N 으로 별도 파일 (violence_part_N.json)에 저장.
// 미지정 시 단일 인스턴스로 violence.json에 직접.
const partArg = args.includes("--part") ? args[args.indexOf("--part") + 1] : null;

const YEARS = yearArg ? [yearArg] : ["2026", "2025", "2024", "2023"];

interface SchoolEntry {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  sgg: string;
  city?: string;
  district?: string;
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
  if (!SESSION) console.warn("⚠ 세션 쿠키 없음");
}

async function fetchEucKr(url: string, opts?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Cookie: SESSION,
      Referer: `${BASE}/ei/ss/pneiss_a05_s0.do`,
      ...(opts?.headers ?? {}),
    },
  });
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

// ── CAPTCHA OCR (claude CLI) ───────────────────────────
const PROMPT = "이 이미지의 숫자 6자리만 출력. 다른 설명·공백·문자 금지. 정확히 6자리 숫자만.";

function ocrOnce(pngPath: string, model: "haiku" | "sonnet" | "opus", timeoutMs = 180_000): string {
  const res = spawnSync(
    "claude",
    [
      "-p",
      "--model", model,
      "--no-session-persistence",
      "--output-format", "text",
      `${PROMPT} 이미지: @${pngPath}`,
    ],
    { encoding: "utf-8", timeout: timeoutMs },
  );
  if (res.error || res.status !== 0) return "";
  const digits = (res.stdout || "").replace(/[^0-9]/g, "");
  return digits.length === 6 ? digits : "";
}

interface OcrStat { haiku: number; sonnet: number; opus: number; failed: number; }
const stats: OcrStat = { haiku: 0, sonnet: 0, opus: 0, failed: 0 };

function solveCaptcha(pngPath: string): { ans: string; via: "haiku" | "sonnet" | "opus" | "fail" } {
  // Haiku 2회 → Sonnet 1회 → Opus 1회
  for (let i = 0; i < 2; i++) {
    const ans = ocrOnce(pngPath, "haiku");
    if (ans) { stats.haiku++; return { ans, via: "haiku" }; }
  }
  const sonAns = ocrOnce(pngPath, "sonnet");
  if (sonAns) { stats.sonnet++; return { ans: sonAns, via: "sonnet" }; }
  const opusAns = ocrOnce(pngPath, "opus");
  if (opusAns) { stats.opus++; return { ans: opusAns, via: "opus" }; }
  stats.failed++;
  return { ans: "", via: "fail" };
}

// ── 학폭 페이지 요청 ────────────────────────────────────
const MAX_CAPTCHA_ATTEMPTS = 6; // 한 (학교, 년도)당 최대 캡차 시도 횟수
const ATTEMPT_KEY = (s: string) => `${process.pid}_${s}`;

async function fetchData(school: SchoolEntry, year: string, attempt = 0): Promise<any> {
  const baseParams = {
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
  const html = await fetchEucKr(`${BASE}/ei/pp/Pneipp_b69_s0p.do?${new URLSearchParams(baseParams)}`);

  if (html.includes("제외 처리함") || html.includes("없으므로") || html.includes("공시제외")) return { zero: true };
  if (html.includes("데이터가 없습니다") || html.includes("입력된 데이터가")) return { noData: true };
  if (html.includes("신설 또는 재개교")) return { newSchool: true };
  if (html.includes("심의건수")) return parseHtml(html);

  if (attempt >= MAX_CAPTCHA_ATTEMPTS) {
    return { error: `captcha-exhausted-${attempt}` };
  }

  // CAPTCHA 필요 — 이미지 다운로드 + OCR + 제출
  const png = tmpCaptcha(ATTEMPT_KEY(`${school.code}_${year}_${attempt}`));
  const captchaUrl = `${BASE}/captcha/CaptChaImg.jsp?rand=${Math.random()}&gsHangmokCd=69`;
  const imgRes = await fetch(captchaUrl, { headers: { Cookie: SESSION } });
  await Bun.write(png, await imgRes.arrayBuffer());

  const { ans, via } = solveCaptcha(png);
  if (!debugCaptcha) {
    try { await Bun.file(png).delete?.(); } catch {}
    try { (await import("node:fs")).unlinkSync(png); } catch {}
  }

  if (!ans) {
    process.stdout.write(` ⚠ OCR 실패(${attempt + 1}/${MAX_CAPTCHA_ATTEMPTS})`);
    return fetchData(school, year, attempt + 1);
  }

  // 캡차 제출
  await fetch(`${BASE}/ei/pp/Pneipp_b69_s0p.do`, {
    method: "POST",
    headers: {
      Cookie: SESSION,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/ei/ss/pneiss_a05_s0.do`,
      Origin: BASE,
    },
    body: `passLine=${ans}`,
  });

  // 데이터 GET
  const dataParams = {
    SHL_IDF_CD: school.code,
    GS_BURYU_CD: "JG160", GS_HANGMOK_CD: "69",
    JG_BURYU_CD: "JG110", JG_HANGMOK_CD: "97", JG_GUBUN: "1",
    JG_YEAR: year, JG_CHASU: "1",
    adminYN: "N", isCaptcha: "N", JG_INVE_TME: "1",
    CHOSEN_JG_YEAR: year, LOAD_TYPE: "single", passLine: ans,
  };
  const dataHtml = await fetchEucKr(`${BASE}/ei/pp/Pneipp_b69_s0p.do?${new URLSearchParams(dataParams)}`);

  if (dataHtml.includes("숫자를 입력") || (!dataHtml.includes("심의건수") && !dataHtml.includes("제외") && !dataHtml.includes("데이터가"))) {
    process.stdout.write(` ❌(${via} ${ans})`);
    return fetchData(school, year, attempt + 1);
  }
  process.stdout.write(`[${via}]`);
  return parseHtml(dataHtml);
}

// ── HTML 파싱 (home/collect_violence.ts와 동일 로직) ────
function parseHtml(html: string): any {
  if (html.includes("제외 처리함") || html.includes("없으므로") || html.includes("공시제외")) return { zero: true };
  if (html.includes("데이터가 없습니다")) return { noData: true };

  const result: any = {};

  try {
    const m = html.match(/학교폭력 사안 심의 결과[\s\S]*?(<table[\s\S]*?<\/table>)/);
    if (m) {
      const tdVals: string[] = [];
      const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let mm; while ((mm = re.exec(m[1])) !== null) tdVals.push(mm[1].replace(/<[^>]*>/g, "").trim());
      if (tdVals.length >= 12) {
        result.cases = {
          s1: { n: +tdVals[0]||0, v: +tdVals[2]||0, vm: +tdVals[3]||0, p: +tdVals[4]||0, pm: +tdVals[5]||0 },
          s2: { n: +tdVals[6]||0, v: +tdVals[8]||0, vm: +tdVals[9]||0, p: +tdVals[10]||0, pm: +tdVals[11]||0 },
        };
      }
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

  try {
    const m = html.match(/피해학생 보호조치 현황[\s\S]*?(<table[\s\S]*?<\/table>)/);
    if (m) {
      const tdVals: string[] = [];
      const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let mm; while ((mm = re.exec(m[1])) !== null) tdVals.push(mm[1].replace(/<[^>]*>/g, "").trim());
      const rows: number[][] = [];
      for (let i = 0; i < tdVals.length - 5; i++) {
        if (!tdVals[i].includes(".") && !isNaN(+tdVals[i]) && +tdVals[i] >= 0) {
          const r = tdVals.slice(i, i + 6).map(Number);
          if (r.every(v => !isNaN(v))) { rows.push(r); i += 5; }
        }
      }
      if (rows.length >= 4) result.vp = { s1: rows[0], s2: rows[2] };
    }
  } catch {}

  try {
    const m = html.match(/가해학생 선도[\s\S]*?(<table[\s\S]*?<\/table>)/);
    if (m) {
      const tdVals: string[] = [];
      const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let mm; while ((mm = re.exec(m[1])) !== null) tdVals.push(mm[1].replace(/<[^>]*>/g, "").trim());
      const rows: number[][] = [];
      for (let i = 0; i < tdVals.length - 9; i++) {
        if (!tdVals[i].includes(".") && !isNaN(+tdVals[i])) {
          const r = tdVals.slice(i, i + 10).map(Number);
          if (r.every(v => !isNaN(v))) { rows.push(r); i += 9; }
        }
      }
      if (rows.length >= 4) result.ps = { s1: rows[0], s2: rows[2] };
    }
  } catch {}

  try {
    const m = html.match(/특별교육 현황[\s\S]*?(<table[\s\S]*?<\/table>)/);
    if (m) {
      const tdVals: string[] = [];
      const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let mm; while ((mm = re.exec(m[1])) !== null) {
        const v = mm[1].replace(/<[^>]*>/g, "").trim();
        if (!v.includes("%")) tdVals.push(v);
      }
      const nums = tdVals.filter(v => !isNaN(+v) && v !== "").map(Number);
      if (nums.length >= 10) {
        result.sped = { s1: [nums[0], nums[1], nums[3]], s2: [nums[5], nums[6], nums[8]] };
      }
    }
  } catch {}

  return Object.keys(result).length > 0 ? result : { parseError: true };
}

// ── 메인 ────────────────────────────────────────────────
async function main() {
  await initSession();

  const schools: Record<string, SchoolEntry> = await Bun.file(join(DATA_DIR, "schools.json")).json();
  const ids: Record<string, { uuid: string; nameInSearch: string }> = await Bun.file(join(DATA_DIR, "school_ids.json")).json();

  const targets: SchoolEntry[] = [];
  for (const code of Object.keys(ids)) {
    const sch = schools[code];
    if (!sch) continue;
    if ((sch as any).closeYn === "Y") continue;
    if (kindArg && sch.kind !== kindArg) continue;
    // SHL_IDF_CD를 code로 swap (스크래핑은 UUID 사용)
    targets.push({ ...sch, code: ids[code].uuid });
  }

  targets.sort((a, b) =>
    (a.city ?? "").localeCompare(b.city ?? "") ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name)
  );

  // --from / --limit 적용 (병렬 실행 시 슬라이스용)
  const slice = targets.slice(startIdx, startIdx + (Number.isFinite(limit) ? limit : targets.length));
  console.log(`전체 ${targets.length} 중 [${startIdx}, ${startIdx + slice.length}) 처리`);

  // 인스턴스별 출력 파일 — 동시 쓰기 race 방지
  const outPath = partArg != null
    ? join(DATA_DIR, `violence_part_${partArg}.json`)
    : join(DATA_DIR, "violence.json");
  // 기존 머지된 메인 파일이 있으면 캐시 정보로 활용 (이미 수집한 학교는 건너뜀)
  const mergedPath = join(DATA_DIR, "violence.json");

  const uuidToCode: Record<string, string> = {};
  for (const [code, v] of Object.entries(ids)) uuidToCode[v.uuid] = code;

  const data: Record<string, Record<string, any>> = existsSync(outPath)
    ? await Bun.file(outPath).json()
    : {};
  // 메인 파일에 이미 있는 항목도 캐시로 인식
  let mergedCache: Record<string, Record<string, any>> = {};
  if (partArg != null && existsSync(mergedPath)) {
    try { mergedCache = await Bun.file(mergedPath).json(); } catch {}
  }

  let total = 0, done = 0, cached = 0, errors = 0;
  const t0 = Date.now();

  for (const t of slice) {
    const code = uuidToCode[t.code];
    if (!data[code]) data[code] = {};

    for (const year of YEARS) {
      total++;
      const existing = data[code][year] ?? mergedCache[code]?.[year];
      if (existing && !existing.error && !existing.skipped && !existing.parseError) {
        cached++;
        continue;
      }

      const idx = done + cached + errors + 1;
      process.stdout.write(`[${idx}/${slice.length * YEARS.length}] ${t.kind} ${t.name}(${year})`);

      try {
        const res = await fetchData(t, year);
        data[code][year] = res;
        if (res.error) errors++; else done++;
        if (res.zero) process.stdout.write(" 0건\n");
        else if (res.noData || res.newSchool) process.stdout.write(" 데이터없음\n");
        else if (res.error) process.stdout.write(` ❌ ${res.error}\n`);
        else if (res.cases) {
          const total = (res.cases.s1?.n || 0) + (res.cases.s2?.n || 0);
          process.stdout.write(` ${total}건\n`);
        } else process.stdout.write(" ⚠ parse 실패\n");
      } catch (e: any) {
        data[code][year] = { error: e.message };
        errors++;
        process.stdout.write(` ❌ ${e.message}\n`);
      }

      // 매 (school, year) 즉시 저장
      await Bun.write(outPath, JSON.stringify(data, null, 2));
    }
  }

  const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\n=== 완료 (${elapsed}분) ===`);
  console.log(`수집 ${done}, 기존 ${cached}, 에러 ${errors} / 총 시도 ${total}`);
  console.log(`OCR: haiku ${stats.haiku} · sonnet ${stats.sonnet} · opus ${stats.opus} · 실패 ${stats.failed}`);
  process.exit(0);
}

await main();
