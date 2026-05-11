/**
 * 수원/용인/성남/화성 시군구 코드.
 * 학교알리미 OpenAPI는 5자리 sggCode 사용 (sidoCode "41" + 시군구 5자리).
 * 학교알리미 검색 인터페이스(/ei/ss)는 10자리 SIGUNGU_CODE 사용 → 별도 변환.
 */
export interface Region {
  sgg: string;       // 5-digit sggCode for OpenAPI
  sgg10: string;     // 10-digit for ei/ss search interface
  city: string;      // 시
  district: string;  // 구 (없으면 "")
  label: string;     // 표시명
}

export const SIDO_CODE = "41"; // 경기도

export const REGIONS: Region[] = [
  // 수원시
  { sgg: "41111", sgg10: "4111100000", city: "수원시", district: "장안구", label: "수원시 장안구" },
  { sgg: "41113", sgg10: "4111300000", city: "수원시", district: "권선구", label: "수원시 권선구" },
  { sgg: "41115", sgg10: "4111500000", city: "수원시", district: "팔달구", label: "수원시 팔달구" },
  { sgg: "41117", sgg10: "4111700000", city: "수원시", district: "영통구", label: "수원시 영통구" },
  // 성남시
  { sgg: "41131", sgg10: "4113100000", city: "성남시", district: "수정구", label: "성남시 수정구" },
  { sgg: "41133", sgg10: "4113300000", city: "성남시", district: "중원구", label: "성남시 중원구" },
  { sgg: "41135", sgg10: "4113500000", city: "성남시", district: "분당구", label: "성남시 분당구" },
  // 용인시
  { sgg: "41461", sgg10: "4146100000", city: "용인시", district: "처인구", label: "용인시 처인구" },
  { sgg: "41463", sgg10: "4146300000", city: "용인시", district: "기흥구", label: "용인시 기흥구" },
  { sgg: "41465", sgg10: "4146500000", city: "용인시", district: "수지구", label: "용인시 수지구" },
  // 화성시 — 통합 코드 41590 + 효행구 41593로 누락 보완 (home 프로젝트 경험)
  { sgg: "41590", sgg10: "4159000000", city: "화성시", district: "", label: "화성시 (통합)" },
  { sgg: "41591", sgg10: "4159100000", city: "화성시", district: "만세구", label: "화성시 만세구" },
  { sgg: "41593", sgg10: "4159300000", city: "화성시", district: "효행구", label: "화성시 효행구" },
  { sgg: "41595", sgg10: "4159500000", city: "화성시", district: "병점구", label: "화성시 병점구" },
  { sgg: "41597", sgg10: "4159700000", city: "화성시", district: "동탄구", label: "화성시 동탄구" },
];

export const SCHOOL_KIND = {
  "02": "초등학교",
  "03": "중학교",
  "04": "고등학교",
} as const;

export type SchoolKindCode = keyof typeof SCHOOL_KIND;
