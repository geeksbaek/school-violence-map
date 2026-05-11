/**
 * deck.gl GoogleMapsOverlay로 모든 학교 마커를 GPU 렌더.
 * - ScatterplotLayer: 색·반경·stroke를 학교 종류/심각도/메트릭에 따라 동적 결정
 * - 클릭 → onPick 콜백 (App에서 SchoolDetail 열기)
 *
 * 1만+ 마커도 60fps 유지 (WebGL).
 */
import { useEffect, useRef, useMemo, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import type { School } from "@/types";
import { severityOf, SEVERITY_COLOR, type Metric } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";

interface Props {
  schools: School[];
  stats: Map<string, SchoolStat>;
  metric: Metric;
  selectedCode: string | null;
  onPick: (s: School) => void;
  adminGeo: any | null; // admin.geojson FeatureCollection
}

type AggLevel = "school" | "district" | "city";
function aggLevelFor(zoom: number): AggLevel {
  if (zoom >= 13) return "school";
  if (zoom >= 11) return "district";
  return "city";
}

// zoom 변화에 부드러운 opacity 보간 (polygon fade in/out)
function smoothstep(z: number, low: number, high: number): number {
  const t = Math.max(0, Math.min(1, (z - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

// "#10b981" → [16, 185, 129, 255]
function hexToRgba(hex: string): [number, number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [128, 128, 128, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255];
}

const COLOR_RGBA: Record<string, [number, number, number, number]> = Object.fromEntries(
  Object.entries(SEVERITY_COLOR).map(([k, v]) => [k, hexToRgba(v)]),
);

// 학교 종류 → stroke 두께 차별 (모양 대신)
const KIND_STROKE: Record<string, number> = { 초등: 1, 중학: 2, 고등: 3 };

export function SchoolDeckLayer({ schools, stats, metric, selectedCode, onPick, adminGeo }: Props) {
  const map = useMap();
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);
  const [zoom, setZoom] = useState<number>(11);
  const aggLevel = aggLevelFor(zoom);

  // 클릭 핸들러는 stale closure 방지 위해 ref로
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // 줌 변화 추적
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom() ?? 11);
    update();
    const lis = map.addListener("zoom_changed", update);
    return () => lis.remove();
  }, [map]);

  // city / district 별 합산 stat (polygon 색 결정용)
  const aggregatedStats = useMemo(() => {
    const cityAgg = new Map<string, { total: number; rateSum: number; rateCnt: number; hasData: boolean }>();
    const distAgg = new Map<string, typeof cityAgg extends Map<string, infer V> ? V : never>();
    for (const s of schools) {
      const st = stats.get(s.code);
      if (!st) continue;
      const ck = s.city;
      const dk = `${s.city}|${s.district}`;
      for (const [m, k] of [[cityAgg, ck], [distAgg, dk]] as const) {
        const cur = m.get(k) ?? { total: 0, rateSum: 0, rateCnt: 0, hasData: false };
        cur.total += st.total;
        if (st.ratePer100 != null) {
          cur.rateSum += st.ratePer100;
          cur.rateCnt++;
        }
        if (st.hasData) cur.hasData = true;
        m.set(k, cur);
      }
    }
    return { city: cityAgg, district: distAgg };
  }, [schools, stats]);

  // 화성 신설구처럼 polygon 매칭 안 되는 district는 city polygon에 흡수
  // (frontend에서는 그냥 fallback 처리 — adminGeo의 feature가 없으면 표시 안 됨)

  // city / district 별 centroid 사전 계산
  const centroids = useMemo(() => {
    const cityAcc = new Map<string, { lat: number; lng: number; n: number }>();
    const distAcc = new Map<string, { lat: number; lng: number; n: number }>();
    for (const s of schools) {
      const c = cityAcc.get(s.city) ?? { lat: 0, lng: 0, n: 0 };
      c.lat += s.lat; c.lng += s.lng; c.n++;
      cityAcc.set(s.city, c);
      const dk = `${s.city}|${s.district}`;
      const d = distAcc.get(dk) ?? { lat: 0, lng: 0, n: 0 };
      d.lat += s.lat; d.lng += s.lng; d.n++;
      distAcc.set(dk, d);
    }
    const city = new Map<string, [number, number]>();
    for (const [k, v] of cityAcc) city.set(k, [v.lng / v.n, v.lat / v.n]);
    const district = new Map<string, [number, number]>();
    for (const [k, v] of distAcc) district.set(k, [v.lng / v.n, v.lat / v.n]);
    return { city, district };
  }, [schools]);

  // 데이터 가공: deck.gl이 직접 사용할 형태
  const layerData = useMemo(() => {
    return schools.map((s) => ({
      code: s.code,
      kind: s.kind,
      city: s.city,
      district: s.district,
      lat: s.lat,
      lng: s.lng,
      studentTotal: s.studentTotal,
      stat: stats.get(s.code),
    }));
  }, [schools, stats]);

  useEffect(() => {
    if (!map) return;
    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        // 클릭 가능한 deck.gl 레이어
        onClick: (info) => {
          const code = (info.object as any)?.code;
          if (!code) return;
          const s = schools.find((x) => x.code === code);
          if (s) onPickRef.current(s);
        },
      });
      overlayRef.current.setMap(map);
    }

    const layer = new ScatterplotLayer({
      id: "schools",
      data: layerData,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      // 줌·집계 레벨에 따라 city/district centroid로 모임 → transitions로 부드럽게 보간
      getPosition: (d: any) => {
        if (aggLevel === "city") {
          return centroids.city.get(d.city) ?? [d.lng, d.lat];
        }
        if (aggLevel === "district") {
          return centroids.district.get(`${d.city}|${d.district}`) ?? [d.lng, d.lat];
        }
        return [d.lng, d.lat];
      },
      getFillColor: (d: any) => {
        const sev = severityOf(metric, d.stat?.ratePer100 ?? null, d.stat?.total ?? 0, d.stat?.hasData ?? false);
        const c = COLOR_RGBA[sev];
        // 선택된 학교는 약간 더 진하게
        return d.code === selectedCode ? [c[0], c[1], c[2], 255] : [c[0], c[1], c[2], 220];
      },
      getLineColor: (d: any) =>
        d.code === selectedCode ? [30, 64, 175, 255] : [255, 255, 255, 230],
      getRadius: (d: any) => {
        const isSel = d.code === selectedCode;
        let base: number;
        if (metric === "rate") {
          const st = d.studentTotal ?? 300;
          base = st >= 1000 ? 9 : st >= 500 ? 7 : st >= 200 ? 5.5 : 4.5;
        } else {
          const t = d.stat?.total ?? 0;
          base = t >= 30 ? 11 : t >= 15 ? 8.5 : t >= 5 ? 6.5 : t >= 1 ? 5 : 4;
        }
        return isSel ? base * 1.5 : base;
      },
      getLineWidth: (d: any) => (d.code === selectedCode ? 2.5 : KIND_STROKE[d.kind] ?? 1),
      updateTriggers: {
        getPosition: [aggLevel, centroids],
        getFillColor: [metric, selectedCode, stats],
        getLineColor: [selectedCode],
        getRadius: [metric, selectedCode, stats],
        getLineWidth: [selectedCode],
      },
      // 부드러운 보간 — zoom 전환 시 city centroid로 모이거나 펼쳐짐
      transitions: {
        getPosition: { duration: 600, type: "interpolation" },
        getRadius: { duration: 400 },
        getFillColor: { duration: 300 },
      },
    });

    // ─── polygon (city / district) ────────────────────
    const layers: any[] = [];

    if (adminGeo) {
      // city polygon: zoom < 12.5 일 때 fade in
      // district polygon: 11 <= zoom < 14 일 때 fade in
      const cityAlpha = Math.round(160 * (1 - smoothstep(zoom, 10.5, 12.5)));
      const distAlpha = Math.round(170 * smoothstep(zoom, 10.5, 12) * (1 - smoothstep(zoom, 12.8, 14)));
      const schoolAlpha = Math.round(255 * smoothstep(zoom, 12.5, 13.5));

      const featureSeverity = (city: string, district: string, useCity: boolean) => {
        const key = useCity ? city : `${city}|${district}`;
        const agg = useCity ? aggregatedStats.city.get(key) : aggregatedStats.district.get(key);
        if (!agg) return SEVERITY_COLOR.unknown;
        const avgRate = agg.rateCnt > 0 ? agg.rateSum / agg.rateCnt : null;
        const sev = severityOf(metric, avgRate, agg.total, agg.hasData);
        return SEVERITY_COLOR[sev];
      };

      // city polygon — feature group by city, geometry는 같은 city 첫 feature 사용 (서울은 city=구별, but city="서울특별시"로 묶임)
      // 단순화: 모든 feature를 그대로 그리되 zoom < 12.5에서는 전체 city로 색 결정
      if (cityAlpha > 0) {
        layers.push(new GeoJsonLayer({
          id: "polygon-city",
          data: adminGeo,
          stroked: true,
          filled: true,
          pickable: false,
          getFillColor: (f: any) => {
            const c = featureSeverity(f.properties.city, f.properties.district, true);
            const m = c.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)!;
            return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), cityAlpha];
          },
          getLineColor: [255, 255, 255, Math.min(220, cityAlpha + 60)],
          getLineWidth: 1,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getFillColor: [metric, aggregatedStats, cityAlpha],
            getLineColor: [cityAlpha],
          },
          transitions: { getFillColor: 300 },
        }));
      }

      if (distAlpha > 0) {
        layers.push(new GeoJsonLayer({
          id: "polygon-district",
          data: adminGeo,
          stroked: true,
          filled: true,
          pickable: false,
          getFillColor: (f: any) => {
            const c = featureSeverity(f.properties.city, f.properties.district, false);
            const m = c.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)!;
            return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), distAlpha];
          },
          getLineColor: [255, 255, 255, Math.min(220, distAlpha + 60)],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getFillColor: [metric, aggregatedStats, distAlpha],
            getLineColor: [distAlpha],
          },
          transitions: { getFillColor: 300 },
        }));
      }

      // 학교 마커는 zoom 따라 fade in (z >= 12.5부터 보이기 시작)
      if (schoolAlpha > 5) {
        layer.props.opacity = schoolAlpha / 255;
        layers.push(layer);
      }
    } else {
      layers.push(layer);
    }

    overlayRef.current.setProps({ layers });
  }, [map, layerData, metric, selectedCode, stats, schools, aggLevel, centroids, zoom, adminGeo, aggregatedStats]);

  // 마운트 해제 시 cleanup
  useEffect(() => {
    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, []);

  return null;
}
