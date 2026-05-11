/**
 * 학교알리미 OpenAPI apiType 탐지.
 * 1~30까지 호출해서 어떤 apiType이 동작하는지 + 첫 row 키 출력.
 *
 * Usage: bun src/_probe.ts
 */
import { sleep } from "./_env.ts";

const KEY = process.env.SCHOOLINFO_API_KEY!;
const ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do";

// 수원시 장안구 초등학교 — 작은 표본
const params = (apiType: string) =>
  new URLSearchParams({
    apiKey: KEY,
    apiType,
    sidoCode: "41",
    sggCode: "41111",
    schulKndCode: "02",
    pbanYr: "2025",
  });

for (let i = 0; i <= 60; i++) {
  const t = String(i).padStart(2, "0");
  try {
    const res = await fetch(`${ENDPOINT}?${params(t)}`);
    const j = (await res.json()) as any;
    if (j.resultCode === "success") {
      const first = (j.list ?? [])[0];
      const keys = first ? Object.keys(first) : [];
      console.log(`✅ apiType=${t} (${(j.list ?? []).length}건) keys=${keys.slice(0, 12).join(",")}${keys.length > 12 ? "..." : ""}`);
    } else {
      // 실패도 한줄
      console.log(`❌ apiType=${t} ${j.resultMsg ?? j.resultCode}`);
    }
  } catch (e: any) {
    console.log(`💥 apiType=${t} ${e.message}`);
  }
  await sleep(200);
}
