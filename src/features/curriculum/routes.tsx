import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { FullPageSpinner } from "@/features/auth/guards";

/**
 * Curriculum routes — lazy load ทั้งหมด (Phase H): โค้ดหน้าหลักสูตรไม่ถูกโหลดจนกว่าจะเปิดเมนู
 * สิทธิ์ของข้อมูลบังคับที่ RLS / RPC — ทุกบทบาทของ Office อ่านได้ตามสิทธิ์ของตน
 */
const page = <K extends string>(load: () => Promise<Record<K, () => ReactNode>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const Dashboard = page(() => import("./pages/CurriculumDashboardPage"), "CurriculumDashboardPage");
const Versions = page(() => import("./pages/VersionsPage"), "VersionsPage");
const Programs = page(() => import("./pages/ProgramsPage"), "ProgramsPage");
const Subjects = page(() => import("./pages/SubjectsPage"), "SubjectsPage");
const Structure = page(() => import("./pages/StructurePage"), "StructurePage");
const Indicators = page(() => import("./pages/IndicatorsPage"), "IndicatorsPage");
const Imports = page(() => import("./pages/ImportsPage"), "ImportsPage");
const Unified = page(() => import("./pages/UnifiedReviewPage"), "UnifiedReviewPage");
const Registry = page(() => import("./pages/RegistryPage"), "RegistryPage");
const Review = page(() => import("./pages/ReviewPage"), "ReviewPage");
const Conflicts = page(() => import("./pages/ConflictsPage"), "ConflictsPage");
const Decisions = page(() => import("./pages/DecisionsPage"), "DecisionsPage");
const Reports = page(() => import("./pages/ReportsPage"), "ReportsPage");
const Syllabi = page(() => import("@/features/syllabus/SyllabusPage"), "SyllabusPage");
const LessonPlans = page(() => import("@/features/lesson-plans/LessonPlanPage"), "LessonPlanPage");
const Analysis = page(() => import("./pages/AnalysisPage"), "AnalysisPage");

const wrap = (node: ReactNode) => <Suspense fallback={<FullPageSpinner label="กำลังโหลด…" />}>{node}</Suspense>;

/** หน้าที่อยู่ในเมนู (ส่งให้ buildPortalRoutes) */
export const curriculumMenuPages = {
  curriculum: wrap(<Dashboard />),
  "curriculum/structure": wrap(<Structure />),
  "curriculum/indicators": wrap(<Indicators />),
  "curriculum/imports": wrap(<Imports />),
  "curriculum/workbench": wrap(<Unified />),
  "curriculum/registry": wrap(<Registry />),
};

/** หน้าย่อยที่เปิดจากแถบเมนูหลักสูตร */
export const curriculumSubRoutes: RouteObject[] = [
  { path: "curriculum/versions", element: wrap(<Versions />) },
  { path: "curriculum/programs", element: wrap(<Programs />) },
  { path: "curriculum/subjects", element: wrap(<Subjects />) },
  { path: "curriculum/review", element: wrap(<Review />) },
  { path: "curriculum/conflicts", element: wrap(<Conflicts />) },
  { path: "curriculum/decisions", element: wrap(<Decisions />) },
  { path: "curriculum/reports", element: wrap(<Reports />) },
  { path: "curriculum/analysis", element: wrap(<Analysis />) },
  { path: "curriculum/syllabi", element: wrap(<Syllabi />) },
  { path: "curriculum/lesson-plans", element: wrap(<LessonPlans />) },
];
