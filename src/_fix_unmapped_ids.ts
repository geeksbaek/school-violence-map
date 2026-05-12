/**
 * 미매핑 school_ids에 대해 학교명 검색 + b01 학교정보 페이지에서 주소 추출 → city 매칭.
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";

const BASE = "https://www.schoolinfo.go.kr";
const init = await fetch(`${BASE}/Main.do`, { redirect: "manual" });
const cookies = init.headers.getSetCookie?.() ?? [];
const SESSION = cookies.map((c) => c.split(";")[0]).filter((c) => c.includes("JSESSIONID") || c.includes("WMONID")).join("; ");

function normalize(s: string): string {
  return s.replace(/\s+/g, "").replace(/초등학교$|중학교$|고등학교$|초등$|중등$|고등$|초$|중$|고$/, "");
}

// kind→SEARCH_MODE (1=초, 2=중, 3=고). SEARCH_TYPE=2 + MODE 지정 시 카테고리별 전체 결과 반환 (더보기+ 동작).
const KIND_TO_MODE: Record<string, string> = { "초등": "1", "중학": "2", "고등": "3" };

async function searchByName(keyword: string, kind?: string): Promise<{ kind: string; uuid: string }[]> {
  const out: { kind: string; uuid: string }[] = [];
  const modes: [string, string][] = kind && KIND_TO_MODE[kind]
    ? [[kind, KIND_TO_MODE[kind]]]
    : [["초등", "1"], ["중학", "2"], ["고등", "3"]];
  for (const [k, mode] of modes) {
    const params = new URLSearchParams({
      SEARCH_KEYWORD: keyword, SEARCH_SCHUL_NM: keyword, SEARCH_TYPE: "2", SEARCH_MODE: mode,
      SEARCH_GS_HANGMOK_CD: "", SEARCH_GS_HANGMOK_NM: "", SEARCH_GS_BURYU_CD: "",
      SEARCH_SIGUNGU: "", SEARCH_SIDO: "", SEARCH_FOND_SC_CODE: "",
    });
    const res = await fetch(`${BASE}/ei/ss/Pneiss_f01_l0.do`, {
      method: "POST",
      headers: { Cookie: SESSION, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${BASE}/Main.do`, "User-Agent": "Mozilla/5.0" },
      body: params.toString(),
    });
    const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
    const uuids = [...html.matchAll(/basicInfo bi([0-9a-fA-F]{8}-[0-9a-fA-F\-]{27})/g)].map((m) => m[1]);
    for (const u of uuids) out.push({ kind: k, uuid: u });
    await sleep(80);
  }
  return out;
}

async function getAddress(uuid: string): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=${uuid}`, {
      headers: { Cookie: SESSION, Referer: `${BASE}/ei/ss/Pneiss_f01_l0.do` },
    });
    const html = new TextDecoder("euc-kr").decode(await r.arrayBuffer());
    // meta description 안의 "주소 : XXX" 패턴
    const m = html.match(/주소\s*:\s*([^,]+)/);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const schools: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const ids: Record<string, { uuid: string; nameInSearch: string }> = await Bun.file(join(DATA_DIR, "school_ids.json")).json();

const missing = Object.values(schools).filter((s: any) => s.closeYn === "N" && !ids[s.code]);
console.log(`미매핑: ${missing.length}개`);

let added = 0;
const stillMissing: any[] = [];
for (const s of missing as any[]) {
  const tryKeywords = [s.name, normalize(s.name)].filter((k, i, a) => k.length >= 2 && a.indexOf(k) === i);
  let matched: { kind: string; uuid: string } | null = null;
  let candidatesByCity: { uuid: string; addr: string }[] = [];
  // 도시명 매칭용 prefix
  const cityShort = (s.city || "").replace(/(특별자치도|특별시|광역시|시|도|군|구)$/, "");
  for (const keyword of tryKeywords) {
    try {
      const results = await searchByName(keyword, s.kind);
      const candidates = results.filter((r) => r.kind === s.kind);
      if (candidates.length === 0) continue;
      if (candidates.length === 1) { matched = candidates[0]; break; }
      // 다중 후보 → 각각 주소 fetch해서 city 매칭
      candidatesByCity = [];
      for (const c of candidates.slice(0, 12)) {
        const addr = await getAddress(c.uuid);
        await sleep(100);
        if (!addr) continue;
        candidatesByCity.push({ uuid: c.uuid, addr });
        // city 포함하는 첫 후보 매칭
        if (s.city && addr.includes(s.city)) { matched = c; break; }
        if (cityShort && addr.includes(cityShort)) { matched = c; break; }
      }
      if (matched) break;
    } catch {}
  }
  if (matched) {
    ids[s.code] = { uuid: matched.uuid, nameInSearch: s.name };
    added++;
    process.stdout.write(`✓ ${s.kind} ${s.name} (${s.city})\n`);
  } else {
    stillMissing.push({ s, candidates: candidatesByCity });
    process.stdout.write(`✗ ${s.kind} ${s.name} (${s.city}) — 후보 ${candidatesByCity.length}개\n`);
    for (const c of candidatesByCity) process.stdout.write(`    ${c.addr}\n`);
  }
  await sleep(150);
}

await Bun.write(join(DATA_DIR, "school_ids.json"), JSON.stringify(ids, null, 2));
console.log(`\n신규 매핑: +${added}`);
console.log(`여전히 미매핑: ${stillMissing.length}`);
