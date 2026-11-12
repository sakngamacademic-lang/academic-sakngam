import { useAcademicYears, useTerms } from "@/features/master-data/api";

/**
 * ปีการศึกษา / ภาคเรียนปัจจุบัน — ข้อมูลจริงจาก Supabase (RLS: เห็นเฉพาะโรงเรียนของผู้ใช้)
 * ใช้ query เดียวกับหน้า Master Data จึงใช้ cache ร่วมกัน
 */
export function useCurrentPeriod() {
  const years = useAcademicYears();
  const terms = useTerms();
  const year = years.data?.find((y) => y.is_current) ?? null;
  const term = terms.data?.find((t) => t.is_current) ?? null;
  const termYear = term ? (years.data?.find((y) => y.id === term.academic_year_id) ?? null) : null;
  const label = term && termYear ? `ภาคเรียนที่ ${term.term_no}/${termYear.year_be}` : year ? `ปีการศึกษา ${year.year_be}` : null;
  return {
    year,
    term,
    label,
    isLoading: years.isLoading || terms.isLoading,
    isError: years.isError || terms.isError,
  };
}
