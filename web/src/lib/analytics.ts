/**
 * Google Analytics 4 통합 — gtag.js 동적 로드 + 표준/커스텀 이벤트 헬퍼.
 * VITE_GA_ID env var 있으면 활성화 (G-XXXXXXXXXX 형식).
 *
 * 트래킹 항목:
 *   page_view      — 초기 진입 + 학교/지역 선택 시 가상 페이지뷰
 *   select_item    — 학교/지역 선택 (source=marker/list/keyboard/url)
 *   filter_change  — 학교종류/성별/학폭유형 토글
 *   metric_change  — 비율/건수 토글
 *   search         — 자동완성 입력 (2자 이상)
 *   section_open   — 공시정보 아코디언 열기
 *   map_zoom       — 줌 레벨 변경 (debounced)
 */
const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined)?.trim();

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

let initialized = false;

export function initAnalytics(): void {
  if (initialized || !GA_ID || typeof window === "undefined") return;
  initialized = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  // 초기 page_view는 trackPageView로 직접 발화 (URL params 포함)
  window.gtag("config", GA_ID, { send_page_view: false });
}

export function trackEvent(name: string, params?: Record<string, any>): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params ?? {});
}

export function trackPageView(path: string, title: string): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: window.location.origin + path,
  });
}

export type SelectSource = "marker" | "list" | "keyboard" | "url" | "search";

export function trackSelection(
  kind: "school" | "region",
  label: string,
  source: SelectSource,
  extra?: Record<string, any>,
): void {
  trackEvent("select_item", {
    item_category: kind,
    item_name: label,
    source,
    ...extra,
  });
}

export function trackFilter(name: string, value: string | number | string[] | boolean): void {
  trackEvent("filter_change", {
    filter_name: name,
    filter_value: Array.isArray(value) ? value.join(",") : String(value),
  });
}

export function trackMetric(metric: string): void {
  trackEvent("metric_change", { metric });
}

export function trackSearch(term: string): void {
  if (!term || term.length < 2) return;
  trackEvent("search", { search_term: term });
}

export function trackSection(section: string): void {
  trackEvent("section_open", { section });
}

// 줌 변경은 빈번 → 디바운스 + 마일스톤만 발화
const zoomMilestones = [10, 11, 12, 13, 14, 15, 16];
let lastReportedZoom = -1;
let zoomTimer: number | null = null;
export function trackZoom(zoom: number): void {
  if (typeof window === "undefined") return;
  if (zoomTimer) window.clearTimeout(zoomTimer);
  zoomTimer = window.setTimeout(() => {
    const m = zoomMilestones.findLast((mm) => zoom >= mm) ?? 0;
    if (m === lastReportedZoom) return;
    lastReportedZoom = m;
    trackEvent("map_zoom", { zoom_level: m });
  }, 800);
}
