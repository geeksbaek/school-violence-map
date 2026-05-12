# 전국 학교폭력 지도 (school-violence-map)

전국 12,652개 초·중·고의 **학교폭력 심의·자체해결·예방교육** 4개년(2023~2026 공시) 데이터를 한 화면에서 비교할 수 있는 인터랙티브 지도.

배포: https://geeksbaek.github.io/school-violence-map/

## 데이터 출처

| 출처 | 용도 | 비고 |
|------|------|------|
| 학교알리미 OpenAPI | 학교 마스터 / 상세 17종 | API key 필요 |
| 학교알리미 검색 인터페이스 | `SHL_IDF_CD` (UUID) 매핑 | 키워드 검색 → 주소 disambiguation |
| 학교알리미 공시 페이지 | 학폭 GS 항목 (`Pneipp_b{cd}_s0p.do`) | **CAPTCHA 보호** |
| Kakao 행정구역 API | 시군구 polygon | dong.geojson / admin.geojson |

학폭 GS 항목 코드:
- **69** — 학교폭력 심의 결과 (`violence.json`)
- **75** — 학교의 장의 학교폭력사건 자체해결 결과 (`self_resolved.json`)
- **66** — 학생 대상 정규 수업 / 교원·학부모 연수 / 예방프로그램 (`prevention_edu.json`)

## 현재 커버리지

| 항목 | 수치 |
|------|------|
| 활성 학교 | 12,652 |
| UUID 매핑 | 12,652 (100%) |
| 학폭 심의 entry (학교 × 년도) | 50,632 |
| 자체해결 entry | 50,596 |
| 예방교육 entry | 50,596 |

## 아키텍처

```
학교알리미 ─┬─ OpenAPI ──────┬─→ schools.json / school_info.json
            │                │
            └─ 검색/공시 ────┴─→ school_ids.json (UUID)
                                  │
                                  ▼
                          collect_violence.ts
                          (cd 69/75/66 × 4-way 병렬)
                                  │   │   │
                                  ▼   ▼   ▼
                violence.json  self_resolved.json  prevention_edu.json
                                  │
                                  ▼
                          build_web_data.ts
                                  │
                                  ▼
                          web/public/data.json
                                  │
                                  ▼
                  Vite + React + Google Maps + deck.gl
                                  │
                                  ▼
                          GitHub Pages (gh-pages)
```

## 핵심 기술 결정

### 1. CAPTCHA — macOS Vision OCR

학교알리미 공시 페이지 (`Pneipp_b{cd}_s0p.do`)는 페이지 로드 직전 4자리 숫자 CAPTCHA를 요구한다. **외부 LLM 호출 없이** macOS의 내장 Vision framework로 OCR 처리한다.

- `src/_macocr.py` — pyobjc-framework-Vision 래퍼
- 실패 시 자동 재요청 + 다음 CAPTCHA 시도 (최대 N회)
- 1건당 ~5–10s

### 2. UUID 매핑 — 주소 기반 disambiguation

학교알리미 검색 결과는 동명이인이 많다. 단순 키워드 검색은 **첫 2장 카드만** 노출된다.

- 1차: `collect_school_ids.ts` — 학교명 / normalize(학교명) 키워드 검색
- 2차: `_fix_unmapped_ids.ts` — `SEARCH_TYPE=2 + SEARCH_MODE=1|2|3` 으로 카테고리별 전체 후보 가져온 뒤, 각 후보의 학교 상세 페이지(`Pneiss_b01_s0.do`)에서 주소를 fetch → city 매칭

이 방식으로 화성 청룡초/반송초 같은 동명학교들이 정확히 분리됨.

### 3. 4-way 병렬 + cd별 순차

스크래핑은 학교 수 / 4 슬라이스로 4 인스턴스 동시 실행, cd 69/75/66은 순차 처리.

```bash
TOTAL=12652  →  CHUNK=3163
part 0: [   0, 3163)
part 1: [3163, 6326)
part 2: [6326, 9489)
part 3: [9489,12652)
```

기존 수집분은 `mergedCache`로 자동 skip → 증분 수집 효율 보장.

### 4. 매 건 저장

프로세스 크래시·CAPTCHA 실패 대비. 1건 처리할 때마다 `violence_part_*.json`에 즉시 flush.

## 디렉토리 구조

```
school-violence-map/
├── data/                        # 수집 데이터 (git 관리)
│   ├── schools.json             # 학교 마스터 (코드/이름/주소/closeYn)
│   ├── school_info.json         # 학교 상세 17종 (학생/학급/교원/시설...)
│   ├── school_ids.json          # 학교코드 → UUID 매핑
│   ├── violence.json            # cd 69 — 심의 (4년 × 12,652)
│   ├── self_resolved.json       # cd 75 — 자체해결
│   └── prevention_edu.json      # cd 66 — 예방교육
├── src/
│   ├── _env.ts                  # .env 로더 + DATA_DIR
│   ├── _macocr.py               # macOS Vision OCR
│   ├── _fix_unmapped_ids.ts     # 미매핑 보정 (주소 disambiguation)
│   ├── regions.ts               # 시·도/시군구 코드 정의
│   ├── collect_schools.ts       # 학교 마스터 수집
│   ├── collect_info.ts          # 학교 상세 17 apiType
│   ├── collect_school_ids.ts    # UUID 매핑
│   ├── collect_violence.ts      # 학폭 스크래핑 (cd/part/from/limit)
│   ├── collect_student_trend.ts # 학생수 추이
│   ├── parse_raw_html.ts        # raw HTML 재파싱 (파서 변경 시)
│   ├── merge_violence.ts        # part_*.json 머지 (--base 별)
│   └── build_web_data.ts        # → web/public/data.json
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── SchoolDetail.tsx # 학교 상세 패널
│   │   │   └── ...
│   │   ├── lib/stats.ts         # 학폭 집계 로직
│   │   └── types.ts
│   ├── public/
│   │   ├── data.json            # 빌드 결과 (~29MB)
│   │   ├── admin.geojson        # 시군구 폴리곤
│   │   └── dong.geojson         # 동 폴리곤
│   └── vite.config.ts
└── scripts/
    ├── run_pipeline.sh          # 전체 파이프라인
    └── deploy.sh                # gh-pages 배포
```

## 사용법

### 환경 변수

루트 `.env`:
```
SCHOOLINFO_API_KEY=...    # 학교알리미 OpenAPI
NEIS_API_KEY=...          # 나이스 (백업)
KAKAO_REST_API_KEY=...    # geocoding
GOOGLE_API_KEY=...        # 보조
```

`web/.env`:
```
VITE_GOOGLE_MAPS_KEY=...
VITE_GOOGLE_MAPS_MAP_ID=...
VITE_GA_ID=...            # GA4 (선택)
```

### 의존성 설치

```bash
# 런타임
bun install
(cd web && bun install)

# Python (CAPTCHA OCR)
pip install pyobjc-framework-Vision Pillow
```

### 파이프라인 실행

```bash
# 학폭 증분 수집 + 빌드 + 배포 (가장 일반적)
bash scripts/run_pipeline.sh

# 학교 마스터/상세/UUID 매핑까지 풀 갱신
bash scripts/run_pipeline.sh --schools --info --ids

# 배포 스킵 (로컬 검증용)
bash scripts/run_pipeline.sh --no-deploy

# 학폭 스킵, 머지·빌드·배포만
bash scripts/run_pipeline.sh --skip-violence

# 특정 cd만
bash scripts/run_pipeline.sh --cd 69
```

진행 상황:
```bash
tail -f logs/violence_69_*.log
```

### 프론트엔드 개발

```bash
cd web
bun run dev       # http://localhost:5173/school-violence-map/
bun run build     # → web/dist/
```

## 데이터 갱신 주기

학교알리미 공시는 **연 1회 (4월 말)** 갱신. 신학년 데이터가 올라온 직후 한번만 풀 파이프라인 돌리면 된다.

신규 학교 매핑:
1. `--schools` 로 마스터 갱신 (closeYn=N 신규 진입)
2. `--ids` 로 UUID + 미매핑 보정
3. 학폭 스크래핑은 자동 증분 (이미 수집한 학교는 skip)

## 라이선스 / 출처 표기

- 학교알리미 데이터는 교육부 공시 정보 (CC-BY 4.0 준용)
- 본 프로젝트 코드는 비상업적 개인 프로젝트
