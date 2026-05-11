# CLAUDE.md

수원/용인/성남/화성 학교폭력 지도 — 데이터 수집 + Google Maps 시각화.

## 작업 원칙

- **매 호출 즉시 저장**: 학폭 스크래핑은 캡차당 한 건이라 중간 크래시 시 손실 큼. 매 (학교, 공시년도) 후 `JSON.stringify` 즉시 저장.
- **API 키는 .env**: 어떤 키도 코드/문서에 평문으로 두지 않는다.
- **이름 매칭에 좌표 검증 필수**: home 프로젝트와 동일. 단지 이름이 같아도 코드/좌표가 다르면 다른 학교.

## 프로젝트 구조

- `src/_env.ts` — `.env` 직접 로드 + 공통 상수
- `src/regions.ts` — 수원/용인/성남/화성 시군구 코드 (sgg 5자리 OpenAPI / sgg10 10자리 검색 인터페이스 / 화성시 통합 41590 + 신설 4구)
- `src/collect_schools.ts` — 학교 마스터 (학교알리미 OpenAPI apiType=00, 좌표·주소 포함)
- `src/collect_info.ts` — 학교 상세 17개 apiType (학년별 학생수, 시설, 급식, 학폭 예방교육 시간 등)
- `src/collect_school_ids.ts` — `SCHUL_CODE` ↔ `SHL_IDF_CD`(UUID) 매핑 (학폭 스크래핑용)
- `src/collect_violence.ts` — 학폭 스크래핑 (캡차 필요)

## 데이터 파일

- `data/schools.json` — 학교 마스터 (`SCHUL_CODE` 키)
- `data/school_info.json` — apiType별 raw row (학교 단위)
- `data/school_ids.json` — `{SCHUL_CODE: {uuid, nameInSearch}}`
- `data/violence.json` — 학교 × 공시년도 학폭 (`{SCHUL_CODE: {2023..2026: parsed}}`)
- `data/_*` — 캡차 임시 파일 (gitignored)

## 학교알리미 OpenAPI

- 엔드포인트: `https://www.schoolinfo.go.kr/openApi.do`
- 필수 파라미터: `apiKey, apiType(2자리), sidoCode, sggCode, schulKndCode, pbanYr`
- `apiType=00` (학교기본정보)만 `pbanYr` 없이도 동작. 나머지는 모두 필수.
- `sggCode`는 5자리 (예: `41117`).
- `schulKndCode`: `02` 초등 / `03` 중학 / `04` 고등.
- 한 호출로 시군구의 해당 종류 학교 전체가 list로 반환됨 (효율적).
- 화성시는 통합 코드(`41590`) + 신설 4구(`41591/93/95/97`) 둘 다 호출해야 누락 최소화.

## 학폭 스크래핑 (검색 인터페이스)

- 엔드포인트: `https://www.schoolinfo.go.kr/ei/pp/Pneipp_b69_s0p.do`
- `SHL_IDF_CD`(UUID) 필요 — `selectSchoolListLocation.do`로 조회 (sigungu_code 10자리)
- 매 학교 매 년도마다 캡차 1회 통과 필요
- 캡차 답 입력 방식 2가지:
  - **파일 폴링 (기본)**: 스크립트가 `data/_captcha.png`를 띄움 → 사람이 답을 `data/_captcha_answer.txt`에 저장
  - **stdin 모드** (`--stdin`): 터미널에서 직접 입력
- 캡차 틀리면 자동 재시도

## 화성시 60개 미매핑

화성시 통합(41590) OpenAPI에는 있지만 검색 인터페이스(신설 4구 + 통합)에서 안 나오는 학교 60개 존재. 학폭 스크래핑 대상에서 제외됨. 추후 학교명 검색 API 발견 시 보완.

## API 키

- `.env`의 `SCHOOLINFO_API_KEY` — 학교알리미 OpenAPI
- `.env`의 `KAKAO_REST_API_KEY` — (예비) 좌표 보강용
- `.env`의 `GOOGLE_API_KEY` — Google Elevation / Maps
- `.env`의 `NEIS_API_KEY` — (예비) 학교 정보 보강
