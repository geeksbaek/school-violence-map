import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import type { School } from "@/types";
import { severityOf, SEVERITY_COLOR, type Metric } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";

interface Props {
  school: School;
  stat: SchoolStat;
  selected: boolean;
  metric: Metric;
  onClick: (s: School) => void;
}

// google.maps.SymbolPath / SVG path 대신 SVG path string 사용 — 학교 종류별 모양 구분
const SHAPE: Record<string, { path: string; scale: number }> = {
  초등: { path: "M 0,0 m -1,0 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0", scale: 1 }, // 원
  중학: { path: "M -1,-1 L 1,-1 L 1,1 L -1,1 Z", scale: 1 },                  // 정사각
  고등: { path: "M 0,-1 L 1,0 L 0,1 L -1,0 Z", scale: 1 },                    // 다이아몬드
};

export function SchoolMarker({ school, stat, selected, metric, onClick }: Props) {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);

  const sev = severityOf(metric, stat.ratePer100, stat.total, stat.hasData);
  const color = SEVERITY_COLOR[sev];

  let baseScale: number;
  if (metric === "rate") {
    const st = school.studentTotal ?? 300;
    baseScale = st >= 1000 ? 9 : st >= 500 ? 7 : st >= 200 ? 5.5 : 4.5;
  } else {
    const c = stat.total;
    baseScale = c >= 30 ? 11 : c >= 15 ? 8.5 : c >= 5 ? 6.5 : c >= 1 ? 5 : 4;
  }
  const scale = selected ? baseScale * 1.4 : baseScale;

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const shape = SHAPE[school.kind];
    const marker = new google.maps.Marker({
      position: { lat: school.lat, lng: school.lng },
      map,
      title: `${school.name} (${school.kind})`,
      icon: {
        path: shape.path,
        fillColor: color,
        fillOpacity: 0.95,
        strokeColor: selected ? "#1e40af" : "#ffffff",
        strokeWeight: selected ? 2.5 : 1.2,
        scale,
      },
      zIndex: selected
        ? 1000
        : metric === "rate"
          ? Math.round(stat.ratePer100 ?? 0)
          : stat.total,
    });
    markerRef.current = marker;
    const listener = marker.addListener("click", () => onClick(school));
    return () => {
      listener.remove();
      marker.setMap(null);
      markerRef.current = null;
    };
    // Recreate marker on key prop changes
  }, [map, school, color, scale, selected, metric, onClick]);

  return null;
}
