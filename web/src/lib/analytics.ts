/**
 * Google Analytics 4 (gtag.js) 통합.
 * VITE_GA_ID 환경변수가 설정된 경우에만 활성화 (G-XXXXXXXXXX 형식).
 *
 * 사용:
 *   initAnalytics()           — 앱 진입 시 1회 호출 (스크립트 로드 + config)
 *   trackPageView(path)       — SPA 내부 라우팅용 (현재는 자동 page_view 사용)
 *   trackEvent(name, params)  — 커스텀 이벤트 (학교 선택, 지역 선택 등)
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

  // gtag 스크립트 동적 삽입
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
  window.gtag("config", GA_ID, {
    // SPA 라우팅 변경은 수동 이벤트로 처리 — 초기 page_view는 자동
    send_page_view: true,
  });
}

export function trackEvent(name: string, params?: Record<string, any>): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params ?? {});
}

export function trackSelection(kind: "school" | "region", label: string, extra?: Record<string, any>): void {
  trackEvent("select_item", {
    item_category: kind,
    item_name: label,
    ...extra,
  });
}
