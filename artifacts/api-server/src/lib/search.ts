import { sql, type SQL } from "drizzle-orm";

const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ";
const PLAIN = "aaaaaaceeeeiiiinooooouuuuyyoa";

/** Lowercase and strip accents in SQL, so "bouake" finds "Bouaké" (no unaccent extension needed). */
export function foldSql(expr: SQL): SQL {
  return sql`translate(lower(${expr}), ${ACCENTED}, ${PLAIN})`;
}

/** Same folding in JS, for the search term. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "o").replace(/æ/g, "a");
}

/** LIKE pattern matching the term anywhere; %, _ and \ typed by the user are matched literally. */
export function searchPattern(search: string): string {
  return `%${fold(search.trim()).replace(/[\\%_]/g, "\\$&")}%`;
}

/** "text contains the search term", ignoring case and accents. */
export function matchesSearch(expr: SQL, search: string): SQL {
  return sql`${foldSql(expr)} LIKE ${searchPattern(search)}`;
}

/** Route ids whose company, departure or arrival station/city contains the term. */
export function routeIdsMatching(search: string): SQL {
  const text = sql.raw("concat_ws(' ', c.name, os.name, oc.name, ds.name, dc.name)");
  return sql`(SELECT r.id FROM routes r
    JOIN companies c ON c.id = r.company_id
    JOIN stations os ON os.id = r.origin_station_id
    JOIN cities oc ON oc.id = os.city_id
    JOIN stations ds ON ds.id = r.destination_station_id
    JOIN cities dc ON dc.id = ds.city_id
    WHERE ${matchesSearch(text, search)})`;
}
