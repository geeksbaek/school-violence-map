export type SchoolKind = "초등" | "중학" | "고등";
export type SchoolGender = "여" | "남" | "공학";

export interface SchoolViolence {
  total: number;
  cases: SchoolViolenceCases | null;
  types: number[];
  sped?: number;
  victimMeasures?: number[];  // 피해학생 보호조치 6개 (학기 합산)
  perpMeasures?: number[];    // 가해학생 선도조치 10개 (학기 합산)
}

// 학교알리미 "심의 결과" 표의 학기별 raw 컬럼.
//   n  = 심의 건수
//   v  = 피해 학생 수
//   vm = 피해학생 보호조치 합계 (= victimMeasures[0..4] 합과 일치, redundant)
//   p  = 가해 학생 수
//   pm = 가해학생 선도조치 합계 (= perpMeasures[0..8] 합과 일치, redundant)
// vm/pm은 "남학생 수"가 아님. 별도 사용 권장 X — victimMeasures/perpMeasures 사용.
export interface SchoolViolenceCases {
  s1?: { n: number; v: number; vm: number; p: number; pm: number };
  s2?: { n: number; v: number; vm: number; p: number; pm: number };
}

export interface School {
  code: string;
  name: string;
  kind: SchoolKind;
  gender: SchoolGender;
  dong?: string;
  dongCode?: string;
  city: string;
  district: string;
  sido?: string;
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
  selfResolved?: Record<string, SchoolSelfResolved | null>;
  selfResolvedTotal?: number;
  preventionEdu?: Record<string, SchoolPreventionEdu | null>;
  schoolinfoUuid?: string;
  foundation?: string;
  details?: SchoolDetails;
}

export interface SchoolSelfResolved {
  s1: number;
  s2: number;
  total: number;
}

export interface SchoolPreventionEdu {
  teacherSessions?: number;
  teacherParticipants?: number;
  teacherRate?: number;
  parentSessions?: number;
  staffStudents?: number | null;
  staffTeachers?: number | null;
  progStudents?: number | null;
  progTeachers?: number | null;
}

export interface SchoolDetails {
  grades?: { label: string; classes: number | null; students: number | null; perClass: number | null }[];
  studentTrend?: { year: number; total: number }[];
  teaching?: { teachers: number | null; weeklyHours: number | null; daysPerWeek: number | null };
  facility?: {
    regularClassrooms?: number | null;
    specialClassrooms?: number | null;
    subjectClassrooms?: number | null;
    maleToilets?: number | null;
    femaleToilets?: number | null;
    showers?: number | null;
    gym?: number | null;
    auditorium?: number | null;
    pool?: string | null;
    boardingCapacity?: number | null;
    careerRoom?: number | null;
  };
  meal?: {
    students?: number | null;
    nutritionists?: number | null;
    cooks?: number | null;
    cookAssistants?: number | null;
    operationMethod?: string | null;
  };
  health?: {
    annualVisits?: number | null;
    perStudentVisits?: number | null;
  };
  safetyEducation?: {
    [category: string]: { total: number | null; sem1: number | null; sem2: number | null };
  };
  activities?: {
    creativeStudents?: number | null;
    creativeTeachers?: number | null;
    creativeExternalLecturers?: number | null;
    creativeBudget?: number | null;
    clubs?: number | null;
    clubBudget?: number | null;
  };
  afterSchool?: {
    programs?: number | null;
    students?: number | null;
    burdenAmount?: number | null;
    careRooms?: number | null;
    careStudents?: number | null;
  };
  scholarship?: {
    schoCount?: number | null;
    schoAmount?: number | null;
    aidCount?: number | null;
    aidAmount?: number | null;
    totalCount?: number | null;
    totalAmount?: number | null;
  };
  land?: {
    schoolGround?: number | null;
    sportsGround?: number | null;
    extraLand?: number | null;
    totalArea?: number | null;
    sportsPerStudent?: number | null;
  };
  openness?: {
    sports?: boolean;
    gym?: boolean;
    auditorium?: boolean;
    classroom?: boolean;
    specialClassroom?: boolean;
    avRoom?: boolean;
  };
  disability?: {
    installedCount: number;
    totalChecks: number;
    items: { label: string; installed: boolean }[];
  };
}

export interface DataSet {
  generatedAt: string;
  years: string[];
  typeLabels: string[];
  schools: School[];
}
