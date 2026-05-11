import { useEffect, useMemo, useState } from "react";
import { APIProvider, Map as GMap, MapControl, ControlPosition, useMap } from "@vis.gl/react-google-maps";
import { Menu } from "lucide-react";
import type { DataSet, School, SchoolKind, SchoolGender } from "@/types";
import type { Metric } from "@/lib/severity";
import { computeStat, setToBits, type SchoolStat } from "@/lib/stats";
import { SchoolMarker } from "@/components/SchoolMarker";
import { SchoolDetail } from "@/components/SchoolDetail";
import { Sidebar, type FilterState } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;

// 빌드 시 시각 — data.json 캐시 무효화용 (gh-pages는 정적이라 ETag 외엔 cache-bust 수단 없음)
const BUILD_TS = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const DATA_URL = `${import.meta.env.BASE_URL}data.json?v=${BUILD_TS}`;

const DEFAULT_CENTER = { lat: 37.32, lng: 127.05 };
const ALL_KINDS: SchoolKind[] = ["초등", "중학", "고등"];
const ALL_GENDERS: SchoolGender[] = ["공학", "여", "남"];

export function App() {
  const [data, setData] = useState<DataSet | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [metric, setMetric] = useState<Metric>("rate");
  const [sidebarOpen, setSidebarOpen] = useState(false); // 모바일용
  const [filter, setFilter] = useState<FilterState>({
    cities: new Set(),
    kinds: new Set(ALL_KINDS),
    genders: new Set(ALL_GENDERS),
    query: "",
    types: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
  });

  useEffect(() => {
    fetch(DATA_URL, { cache: "no-cache" })
      .then((r) => r.json())
      .then((d: DataSet) => {
        for (const s of d.schools) {
          if (!s.gender) (s as any).gender = "공학";
        }
        setData(d);

        // city별 학교 평균 좌표 → 가장 가까운 city 1개를 기본 선택
        const cityCenters = new Map<string, { lat: number; lng: number; n: number }>();
        for (const s of d.schools) {
          const c = cityCenters.get(s.city) ?? { lat: 0, lng: 0, n: 0 };
          c.lat += s.lat; c.lng += s.lng; c.n += 1;
          cityCenters.set(s.city, c);
        }
        const cityCentroid = new Map<string, { lat: number; lng: number }>();
        for (const [city, c] of cityCenters) {
          cityCentroid.set(city, { lat: c.lat / c.n, lng: c.lng / c.n });
        }
        const cityList = Array.from(cityCentroid.keys());

        const pickByLocation = (lat: number, lng: number) => {
          let best = cityList[0];
          let bestD = Infinity;
          for (const [city, c] of cityCentroid) {
            const d2 = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
            if (d2 < bestD) { bestD = d2; best = city; }
          }
          return best;
        };

        // 1차: 학교가 가장 많은 city를 default (즉시 표시)
        let defaultCity = cityList[0];
        let max = 0;
        for (const [city, c] of cityCenters) {
          if (c.n > max) { max = c.n; defaultCity = city; }
        }
        setFilter((prev) => ({ ...prev, cities: new Set([defaultCity]) }));

        // 2차: geolocation 받으면 더 정확한 city로 갱신
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const c = pickByLocation(pos.coords.latitude, pos.coords.longitude);
              setFilter((prev) => {
                // 사용자가 이미 직접 변경했다면 덮어쓰지 않음 (size=1 + defaultCity일 때만)
                if (prev.cities.size !== 1 || !prev.cities.has(defaultCity)) return prev;
                return { ...prev, cities: new Set([c]) };
              });
            },
            () => {/* permission denied — 기본값 유지 */},
            { timeout: 5000, maximumAge: 600_000 },
          );
        }
      })
      .catch((e) => console.error("data load fail", e));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.query.trim();
    return data.schools.filter((s) => {
      if (!filter.kinds.has(s.kind)) return false;
      if (!filter.genders.has(s.gender)) return false;
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
    <div className="flex h-[100dvh] w-screen overflow-hidden">
      {/* 사이드바 — 데스크톱 고정 / 모바일 슬라이드 */}
      <div
        className={cn(
          "fixed md:static inset-y-0 left-0 z-30 w-full max-w-[360px] md:max-w-none md:w-auto",
          "transform transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <Sidebar
          data={data}
          filtered={filtered}
          stats={stats}
          filter={filter}
          setFilter={setFilter}
          selected={selected}
          onPick={(s) => {
            setSelected(s);
            setSidebarOpen(false);
          }}
          metric={metric}
          setMetric={setMetric}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* 모바일 사이드바 backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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
            zoomControl={false}
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
                {filtered.length}/{data.schools.length}
              </div>
            </MapControl>
          </GMap>
        </APIProvider>

        {/* 모바일 햄버거 + 타이틀 — 지도 위 floating */}
        <div className="md:hidden absolute top-3 left-3 z-10 flex items-center gap-2">
          <Button
            variant="default"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="shadow-md"
          >
            <Menu className="size-5" />
          </Button>
          <div className="bg-white/90 backdrop-blur rounded-md px-2 py-1 text-xs shadow-md font-medium">
            학교폭력 지도
          </div>
        </div>

        {/* 디테일 패널 — 데스크톱 우상단 / 모바일 하단 시트 */}
        {selected && (
          <div
            className={cn(
              "absolute z-10 overflow-y-auto",
              // 모바일: 하단 시트, 화면 70%까지
              "left-2 right-2 bottom-2 max-h-[70dvh]",
              // 데스크톱: 우상단 카드
              "md:left-auto md:bottom-auto md:right-3 md:top-3 md:w-[340px] md:max-h-[calc(100dvh-1.5rem)]",
            )}
          >
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
