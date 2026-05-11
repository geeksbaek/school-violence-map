/**
 * deck.gl GoogleMapsOverlay로 모든 학교 마커를 GPU 렌더.
 * - ScatterplotLayer: 색·반경·stroke를 학교 종류/심각도/메트릭에 따라 동적 결정
 * - 클릭 → onPick 콜백 (App에서 SchoolDetail 열기)
 *
 * 1만+ 마커도 60fps 유지 (WebGL).
 */
import { useEffect, useRef, useMemo } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { School } from "@/types";
import { severityOf, SEVERITY_COLOR, type Metric } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";

interface Props {
  schools: School[];
  stats: Map<string, SchoolStat>;
  metric: Metric;
  selectedCode: string | null;
  onPick: (s: School) => void;
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

export function SchoolDeckLayer({ schools, stats, metric, selectedCode, onPick }: Props) {
  const map = useMap();
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);

  // 클릭 핸들러는 stale closure 방지 위해 ref로
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // 데이터 가공: deck.gl이 직접 사용할 형태
  const layerData = useMemo(() => {
    return schools.map((s) => ({
      code: s.code,
      kind: s.kind,
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
      getPosition: (d: any) => [d.lng, d.lat],
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
      // 색·크기 변경 시 GPU 재계산
      updateTriggers: {
        getFillColor: [metric, selectedCode, stats],
        getLineColor: [selectedCode],
        getRadius: [metric, selectedCode, stats],
        getLineWidth: [selectedCode],
      },
      // 단지 zoom 인 비례 — radiusScale 안 쓰고 픽셀 단위로 고정
    });

    overlayRef.current.setProps({ layers: [layer] });
  }, [map, layerData, metric, selectedCode, stats, schools]);

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
