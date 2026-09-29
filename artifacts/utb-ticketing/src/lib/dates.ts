import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns/locale";

function isChinese(locale: Locale) {
  return locale.code?.startsWith("zh") ?? false;
}

/** "lundi 5 octobre 2026" / "Monday 5 October 2026" / "2026年10月5日 星期一". Accepts "YYYY-MM-DD" or a Date. */
export function formatLongDate(date: string | Date, locale: Locale): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, isChinese(locale) ? "yyyy年M月d日 EEEE" : "EEEE d MMMM yyyy", { locale });
}

/** "5 oct. 2026" / "5 Oct 2026" / "2026年10月5日". */
export function formatShortDate(date: string | Date, locale: Locale): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, isChinese(locale) ? "yyyy年M月d日" : "d MMM yyyy", { locale });
}
