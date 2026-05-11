/**
 * 단일 학교 b75 (학교의 장의 학교폭력사건 자체해결 결과) 페이지 캡차 풀어 가져오기.
 * 추출된 표 구조 출력.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { DATA_DIR } from "./_env.ts";

const BASE = "https://www.schoolinfo.go.kr";
const OCR_SCRIPT = join(import.meta.dir, "_ocr.py");
const CD = process.argv[2] ?? "75";

const ids = await Bun.file(join(DATA_DIR, "school_ids.json")).json();
const code = "S120002462"; // 천안신방중학교 (2025년 43건 — 자체해결 가능성 높음)
const uuid = ids[code].uuid;
const name = ids[code].nameInSearch;
const year = "2025";

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

async function fetchEucKr(url: string, opts?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...opts,
    headers: { Cookie: SESSION, Referer: `${BASE}/ei/ss/pneiss_a05_s0.do`, ...(opts?.headers ?? {}) },
  });
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

const baseParams = {
  GS_HANGMOK_CD: CD,
  GS_HANGMOK_NO: "11-다",
  GS_BURYU_CD: "JG160",
  JG_BURYU_CD: "JG110",
  JG_HANGMOK_CD: "97",
  JG_GUBUN: "1",
  JG_YEAR2: year,
  HG_NM: name,
  SHL_IDF_CD: uuid,
  GS_TYPE: "Y",
  JG_YEAR: year,
  CHOSEN_JG_YEAR: year,
  PRE_JG_YEAR: year,
  LOAD_TYPE: "single",
};

// 1) 초기 fetch — 캡차 요구 응답 확인
const initHtml = await fetchEucKr(`${BASE}/ei/pp/Pneipp_b${CD}_s0p.do?${new URLSearchParams(baseParams)}`);
console.log("초기 fetch len:", initHtml.length, "캡차:", initHtml.includes("숫자를 입력") || initHtml.includes("CaptCha"));

// 2) 캡차 이미지 다운로드 + OCR
for (let attempt = 0; attempt < 5; attempt++) {
  const png = join(DATA_DIR, `_probe_b75_${attempt}.png`);
  const captchaUrl = `${BASE}/captcha/CaptChaImg.jsp?rand=${Math.random()}&gsHangmokCd=${CD}`;
  const imgRes = await fetch(captchaUrl, { headers: { Cookie: SESSION } });
  await Bun.write(png, await imgRes.arrayBuffer());

  const ocr = spawnSync("python3", [OCR_SCRIPT, png], { encoding: "utf-8", timeout: 10_000 });
  const ans = (ocr.stdout || "").trim();
  console.log(`attempt ${attempt + 1}: OCR="${ans}"`);
  if (!ans) continue;

  // 3) 캡차 제출
  await fetch(`${BASE}/ei/pp/Pneipp_b${CD}_s0p.do`, {
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

  // 4) 데이터 GET
  const dataParams = {
    SHL_IDF_CD: uuid,
    GS_BURYU_CD: "JG160", GS_HANGMOK_CD: CD,
    JG_BURYU_CD: "JG110", JG_HANGMOK_CD: "97", JG_GUBUN: "1",
    JG_YEAR: year, JG_CHASU: "1",
    adminYN: "N", isCaptcha: "N", JG_INVE_TME: "1",
    CHOSEN_JG_YEAR: year, LOAD_TYPE: "single", passLine: ans,
  };
  const dataHtml = await fetchEucKr(`${BASE}/ei/pp/Pneipp_b${CD}_s0p.do?${new URLSearchParams(dataParams)}`);
  if (dataHtml.includes("숫자를 입력")) { console.log("  → 캡차 실패, 재시도"); continue; }
  console.log(`\\n=== 성공 (attempt ${attempt + 1}) ===`);
  console.log("len:", dataHtml.length);

  // 본문 표 추출
  const tableMatches = [...dataHtml.matchAll(/<table[\s\S]*?<\/table>/g)];
  console.log("table 개수:", tableMatches.length);
  for (let i = 0; i < tableMatches.length; i++) {
    const tbl = tableMatches[i][0];
    const text = tbl.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    console.log(`\n--- table ${i + 1} ---`);
    console.log(text.slice(0, 600));
  }

  // 모든 td 값
  const tds = [...dataHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  console.log("\n전체 td:", tds.length, "개");
  console.log(tds);
  // 본문 일부 raw 저장
  await Bun.write(join(DATA_DIR, "_probe_b75.html"), dataHtml);
  console.log("\n전체 응답 저장: data/_probe_b75.html");
  console.log("\n본문 'tbody' 찾기:");
  const bodyIdx = dataHtml.indexOf("<tbody");
  if (bodyIdx > 0) console.log(dataHtml.slice(bodyIdx, bodyIdx + 2000));
  console.log("\n'심의' or '학교장' 키워드:");
  for (const kw of ["심의건수", "자체해결", "학교장", "건수", "사례", "학교폭력사건"]) {
    const idx = dataHtml.indexOf(kw);
    if (idx > 0) console.log(`  ${kw} @${idx}: ...${dataHtml.slice(Math.max(0,idx-50), idx+150).replace(/\s+/g," ")}...`);
  }
  break;
}
