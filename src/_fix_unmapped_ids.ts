/**
 * school_ids.json 미매핑 학교에 대해 학교명 풀 이름 + normalize 시도해 UUID 매핑.
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

async function searchByName(keyword: string): Promise<{ kind: string; uuid: string }[]> {
  const params = new URLSearchParams({
    SEARCH_KEYWORD: keyword, SEARCH_SCHUL_NM: keyword, SEARCH_TYPE: "1",
    SEARCH_GS_HANGMOK_CD: "", SEARCH_GS_HANGMOK_NM: "", SEARCH_GS_BURYU_CD: "",
    SEARCH_SIGUNGU: "", SEARCH_SIDO: "", SEARCH_FOND_SC_CODE: "", SEARCH_MODE: "",
  });
  const res = await fetch(`${BASE}/ei/ss/Pneiss_f01_l0.do`, {
    method: "POST",
    headers: { Cookie: SESSION, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${BASE}/Main.do`, "User-Agent": "Mozilla/5.0" },
    body: params.toString(),
  });
  const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
  const out: { kind: string; uuid: string }[] = [];
  for (const [div, kind] of [["srDiv1", "초등"], ["srDiv2", "중학"], ["srDiv3", "고등"]] as const) {
    const sec = html.match(new RegExp(`search_result ${div}[\\s\\S]*?(?=<div class=\"search_result|<!--검색결과 end|$)`));
    if (!sec) continue;
    const uuids = [...sec[0].matchAll(/basicInfo bi([0-9a-fA-F]{8}-[0-9a-fA-F\-]{27})/g)].map((m) => m[1]);
    for (const u of uuids) out.push({ kind, uuid: u });
  }
  return out;
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
  for (const keyword of tryKeywords) {
    try {
      const results = await searchByName(keyword);
      const candidates = results.filter((r) => r.kind === s.kind);
      if (candidates.length === 1) { matched = candidates[0]; break; }
    } catch {}
  }
  if (matched) {
    ids[s.code] = { uuid: matched.uuid, nameInSearch: s.name };
    added++;
    process.stdout.write(`✓ ${s.kind} ${s.name}\n`);
  } else {
    stillMissing.push(s);
    process.stdout.write(`✗ ${s.kind} ${s.name}\n`);
  }
  await sleep(150);
}

await Bun.write(join(DATA_DIR, "school_ids.json"), JSON.stringify(ids, null, 2));
console.log(`\n신규 매핑: +${added}`);
console.log(`여전히 미매핑: ${stillMissing.length}`);
for (const s of stillMissing) console.log(`  - ${s.kind} ${s.name} (${s.city})`);
