export type SchoolKind = "초등" | "중학" | "고등";
export type SchoolGender = "여" | "남" | "공학";

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
    sportsClassrooms?: number | null;
    maleToilets?: number | null;
    femaleToilets?: number | null;
    showers?: number | null;
    auditorium?: number | null;
    pool?: string | null;
    boardingCapacity?: number | null;
  };
  meal?: {
    students?: number | null;
    nutritionists?: number | null;
    cooks?: number | null;
    cookAssistants?: number | null;
    operationMethod?: string | null;
  };
  digital?: {
    allUtilStudents?: number | null;
    weeklyAvgUtilStudents?: number | null;
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
    money?: { count: number | null; amount: number | null };
    fortune?: { count: number | null; amount: number | null };
    things?: { count: number | null; amount: number | null };
    total?: { count: number | null; amount: number | null };
  };
  graduation?: {
    totalGrads?: number | null;
    advanceCount?: number | null;
    employmentCount?: number | null;
    advanceRate?: number | null;
    employmentRate?: number | null;
    foreignRate?: number | null;
  };
}

export interface DataSet {
  generatedAt: string;
  years: string[];
  typeLabels: string[];
  schools: School[];
}
