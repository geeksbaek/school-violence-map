import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map as GMap, MapControl, ControlPosition, useMap } from "@vis.gl/react-google-maps";
import { Menu } from "lucide-react";
import type { DataSet, School, SchoolKind, SchoolGender } from "@/types";
import type { Metric } from "@/lib/severity";
import { computeStat, setToBits, type SchoolStat } from "@/lib/stats";
import { SchoolDeckLayer, type RegionPick } from "@/components/SchoolDeckLayer";
import { SchoolDetail } from "@/components/SchoolDetail";
import { RegionDetail } from "@/components/RegionDetail";
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

// 상점·카페·관공서 등 POI 시각·클릭 모두 숨김 (학교 마커만 클릭 가능)
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
];

export function App() {
  const [data, setData] = useState<DataSet | null>(null);
  const [adminGeo, setAdminGeo] = useState<any | null>(null);
  const [dongGeo, setDongGeo] = useState<any | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionPick | null>(null);
  const [metric, setMetric] = useState<Metric>("rate");
  const [sidebarOpen, setSidebarOpen] = useState(false); // 모바일용
  const [filter, setFilter] = useState<FilterState>({
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
      })
      .catch((e) => console.error("data load fail", e));

    fetch(`${import.meta.env.BASE_URL}admin.geojson`)
      .then((r) => r.json())
      .then(setAdminGeo)
      .catch(() => setAdminGeo(null));

    fetch(`${import.meta.env.BASE_URL}dong.geojson`)
      .then((r) => r.json())
      .then(setDongGeo)
      .catch(() => setDongGeo(null));
  }, []);

  // URL → state 복원 (1회). school 우선, 없으면 region.
  // dong region은 dongGeo가 있어야 label 복원 가능 → 둘 다 로드된 후 1회만 실행.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!data || restoredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const schoolCode = params.get("school");
    if (schoolCode) {
      const s = data.schools.find((x) => x.code === schoolCode);
      if (s) {
        setSelected(s);
        restoredRef.current = true;
        return;
      }
    }
    const regionParam = params.get("region");
    if (regionParam) {
      const colon = regionParam.indexOf(":");
      if (colon > 0) {
        const type = regionParam.slice(0, colon) as RegionPick["type"];
        const key = regionParam.slice(colon + 1);
        if (type === "dong" && !dongGeo) return; // dongGeo 도착 대기
        let label = key;
        if (type === "district") label = key.split("|").join(" ");
        else if (type === "dong") {
          const f = dongGeo?.features?.find((x: any) => x.properties.code === key);
          if (f) label = `${f.properties.city ?? ""} ${f.properties.district ?? ""} ${f.properties.name ?? ""}`.trim();
        }
        setSelectedRegion({ type, key, label });
      }
      restoredRef.current = true;
    } else {
      restoredRef.current = true;
    }
  }, [data, dongGeo]);

  // state → URL 동기화 (replaceState로 history 오염 방지)
  useEffect(() => {
    if (!restoredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("school");
    params.delete("region");
    if (selected) params.set("school", selected.code);
    else if (selectedRegion) params.set("region", `${selectedRegion.type}:${selectedRegion.key}`);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [selected, selectedRegion]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.query.trim();
    return data.schools.filter((s) => {
      if (!filter.kinds.has(s.kind)) return false;
      if (!filter.genders.has(s.gender)) return false;
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
            clickableIcons={false}
            styles={MAP_STYLES}
            className="absolute inset-0"
          >
            <SchoolDeckLayer
              schools={filtered}
              stats={stats}
              metric={metric}
              selectedCode={selected?.code ?? null}
              selectedRegion={selectedRegion}
              onPick={(s) => { setSelected(s); setSelectedRegion(null); }}
              onPickRegion={(r) => { setSelectedRegion(r); setSelected(null); }}
              adminGeo={adminGeo}
              dongGeo={dongGeo}
            />
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
              "left-2 right-2 bottom-2 max-h-[70dvh]",
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

        {selectedRegion && !selected && (
          <div
            className={cn(
              "absolute z-10",
              "left-2 right-2 bottom-2 max-h-[70dvh]",
              "md:left-auto md:bottom-auto md:right-3 md:top-3 md:w-[360px] md:max-h-[calc(100dvh-1.5rem)]",
            )}
          >
            <RegionDetail
              region={selectedRegion}
              schools={filtered}
              stats={stats}
              metric={metric}
              selectedCode={null}
              onPickSchool={(s) => { setSelected(s); setSelectedRegion(null); }}
              onClose={() => setSelectedRegion(null)}
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
