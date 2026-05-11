export type SchoolKind = "초등" | "중학" | "고등";

export interface SchoolViolence {
  total: number;
  cases: any;
  types: number[];
  sped?: number;
}

export interface School {
  code: string;
  name: string;
  kind: SchoolKind;
  city: string;
  district: string;
  sgg: string;
  addr: string;
  lat: number;
  lng: number;
  studentTotal: number | null;
  classTotal: number | null;
  teachers: number | null;
  genderRatio: { boy: number; girl: number } | null;
  violence: Record<string, SchoolViolence | null>;
  violenceTotal: number;
  violenceYears: number;
  violenceRatePer100: number | null;
}

export interface DataSet {
  generatedAt: string;
  years: string[];
  typeLabels: string[];
  schools: School[];
}
