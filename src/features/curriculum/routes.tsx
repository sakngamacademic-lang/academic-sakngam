import { lazy, Suspense, type ReactElement, type ReactNode } from "react";
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
const Readiness = page(() => import("./pages/ReadinessPage"), "ReadinessPage");
const Mapping = page(() => import("@/features/mapping/MappingPage"), "MappingPage");
const Viewer = page(() => import("./pages/CurriculumStructureViewer"), "CurriculumStructureViewer");
const Coverage = page(() => import("@/features/mapping/CoveragePage"), "CoveragePage");
const Present = page(() => import("./presentation/PresentationPage"), "PresentationPage");
const InternalReview = page(() => import("./presentation/InternalReviewPage"), "InternalReviewPage");
const WorkbookCompare = page(() => import("./pages/WorkbookComparePage"), "WorkbookComparePage");
const StructureReview = page(() => import("./pages/StructureReviewPage"), "StructureReviewPage");
const Analysis = page(() => import("./pages/AnalysisPage"), "AnalysisPage");

const wrap = (node: ReactNode) => <Suspense fallback={<FullPageSpinner label="กำลังโหลด…" />}>{node}</Suspense>;

/** ทุกหน้าของระบบหลักสูตร (path ภายใน /office) — หน้าที่อยู่ในเมนูหลักให้ buildPortalRoutes สร้าง ที่เหลือเป็น route ย่อย */
/** ใช้ในพอร์ทัลครู: ดูโครงสร้างหลักสูตรอย่างเดียว */
export const curriculumViewerPage = wrap(<Viewer />);

export const curriculumPages: Record<string, ReactElement> = {
  curriculum: wrap(<Viewer />),
  "curriculum/overview": wrap(<Dashboard />),
  "curriculum/structure": wrap(<Structure />),
  "curriculum/indicators": wrap(<Indicators />),
  "curriculum/imports": wrap(<Imports />),
  "curriculum/workbench": wrap(<Unified />),
  "curriculum/registry": wrap(<Registry />),
  "curriculum/versions": wrap(<Versions />),
  "curriculum/programs": wrap(<Programs />),
  "curriculum/subjects": wrap(<Subjects />),
  "curriculum/review": wrap(<Review />),
  "curriculum/conflicts": wrap(<Conflicts />),
  "curriculum/decisions": wrap(<Decisions />),
  "curriculum/reports": wrap(<Reports />),
  "curriculum/analysis": wrap(<Analysis />),
  "curriculum/syllabi": wrap(<Syllabi />),
  "curriculum/lesson-plans": wrap(<LessonPlans />),
  "curriculum/readiness": wrap(<Readiness />),
  "curriculum/mapping": wrap(<Mapping />),
  "curriculum/present": wrap(<Present />),
  "curriculum/coverage": wrap(<Coverage />),
  "curriculum/internal-review": wrap(<InternalReview />),
  "curriculum/workbook-compare": wrap(<WorkbookCompare />),
  "curriculum/structure-review": wrap(<StructureReview />),
};

/** แยกหน้าที่อยู่ในเมนู (ส่งให้ buildPortalRoutes) กับหน้าย่อย (route ปกติ) — ไม่สร้าง route ซ้ำ */
export function splitCurriculumPages(menuPaths: ReadonlySet<string>) {
  const menu: Record<string, ReactElement> = {};
  const sub: RouteObject[] = [];
  for (const [path, element] of Object.entries(curriculumPages)) {
    if (menuPaths.has(path)) menu[path] = element;
    else sub.push({ path, element });
  }
  return { menu, sub };
}
