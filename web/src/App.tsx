import { useEffect, useMemo, useState } from "react";
import { APIProvider, Map as GMap, MapControl, ControlPosition, useMap } from "@vis.gl/react-google-maps";
import type { DataSet, School, SchoolKind } from "@/types";
import type { Metric } from "@/lib/severity";
import { computeStat, setToBits, type SchoolStat } from "@/lib/stats";
import { SchoolMarker } from "@/components/SchoolMarker";
import { SchoolDetail } from "@/components/SchoolDetail";
import { Sidebar, type FilterState } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;

const DATA_URL = `${import.meta.env.BASE_URL}data.json`;

const DEFAULT_CENTER = { lat: 37.32, lng: 127.05 };
const ALL_KINDS: SchoolKind[] = ["초등", "중학", "고등"];

export function App() {
  const [data, setData] = useState<DataSet | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [metric, setMetric] = useState<Metric>("rate");
  const [filter, setFilter] = useState<FilterState>({
    cities: new Set(),
    kinds: new Set(ALL_KINDS),
    query: "",
    types: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
  });

  useEffect(() => {
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((d: DataSet) => {
        setData(d);
        // 모든 시 기본 활성
        setFilter((prev) => ({
          ...prev,
          cities: new Set(d.schools.map((s) => s.city)),
        }));
      })
      .catch((e) => console.error("data load fail", e));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.query.trim();
    return data.schools.filter((s) => {
      if (!filter.kinds.has(s.kind)) return false;
      if (filter.cities.size > 0 && !filter.cities.has(s.city)) return false;
      if (q && !s.name.includes(q)) return false;
      return true;
    });
  }, [data, filter]);

  // 학교별 stat (선택 유형 기준 합산) — code → SchoolStat
  const stats = useMemo(() => {
    const m = new Map<string, SchoolStat>();
    if (!data) return m;
    const mask = setToBits(filter.types);
    for (const s of data.schools) m.set(s.code, computeStat(s, data.years, mask));
    return m;
  }, [data, filter.types]);

  if (!KEY) {
    return (
      <div className="h-screen flex items-center justify-center text-center text-sm">
        <Card className="p-6">
          <div className="font-semibold mb-1">Google Maps API 키 누락</div>
          <code className="text-xs">.env에 VITE_GOOGLE_MAPS_KEY 설정</code>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
        데이터 로딩 중...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        data={data}
        filtered={filtered}
        stats={stats}
        filter={filter}
        setFilter={setFilter}
        selected={selected}
        onPick={(s) => setSelected(s)}
        metric={metric}
        setMetric={setMetric}
      />
      <main className="flex-1 relative">
        <APIProvider apiKey={KEY}>
          <GMap
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={11}
            gestureHandling="greedy"
            disableDefaultUI={false}
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            className="absolute inset-0"
          >
            {filtered.map((s) => (
              <SchoolMarker
                key={s.code}
                school={s}
                stat={stats.get(s.code)!}
                selected={selected?.code === s.code}
                metric={metric}
                onClick={(picked) => setSelected(picked)}
              />
            ))}
            <FlyToSelected school={selected} />
            <MapControl position={ControlPosition.TOP_RIGHT}>
              <div className="m-2 bg-white/90 backdrop-blur rounded-md px-2 py-1 text-xs shadow">
                마커 표시 {filtered.length}개 / 전체 {data.schools.length}
              </div>
            </MapControl>
          </GMap>
        </APIProvider>
        {selected && (
          <div className="absolute top-3 right-3 w-[340px] max-h-[calc(100vh-1.5rem)] overflow-y-auto z-10">
            <SchoolDetail
              school={selected}
              stat={stats.get(selected.code)!}
              data={data}
              metric={metric}
              selectedTypes={filter.types}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function FlyToSelected({ school }: { school: School | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !school) return;
    map.panTo({ lat: school.lat, lng: school.lng });
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, school]);
  return null;
}
