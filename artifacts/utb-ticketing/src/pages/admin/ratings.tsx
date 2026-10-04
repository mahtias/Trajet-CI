import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetCompanyRatings,
  useGetCompanyRatingsOverview,
  type CompanyRatingSummary,
} from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, MessageSquare } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/list-pagination";
import { Stars } from "@/components/trip-rating";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const formatAverage = (value: number) => value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Ratings received by one company: average in evidence, then the reviews, newest first. */
function CompanyReviews({ companyId }: { companyId?: number }) {
  const [page, setPage] = useState(1);
  const params = { ...(companyId ? { companyId } : {}), page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useGetCompanyRatings(params);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  if (isLoading || !data) return <div className="h-48 bg-muted animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Note moyenne — {data.companyName}</p>
            {data.averageRating !== null ? (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-5xl font-black text-foreground">{formatAverage(data.averageRating)}</span>
                <div>
                  <Stars value={data.averageRating} />
                  <p className="text-sm text-muted-foreground mt-1">sur 5 · {data.ratingsCount} avis</p>
                </div>
              </div>
            ) : (
              <p className="text-lg font-semibold mt-1">Aucun avis pour l'instant</p>
            )}
          </div>
        </CardContent>
      </Card>

      {data.items.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {data.items.map((r) => (
                <li key={r.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-muted-foreground">Avis du {format(parseISO(r.createdAt), "dd/MM/yyyy")}</span>
                  </div>
                  {r.comment ? (
                    <p className="mt-2 text-sm text-foreground whitespace-pre-line">« {r.comment} »</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground italic">Sans commentaire</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.authorName} · {r.origin} → {r.destination} · voyage du {r.departureDate ? format(parseISO(r.departureDate), "dd/MM/yyyy") : "—"} · billet n° {String(r.ticketId).padStart(6, "0")}
                  </p>
                </li>
              ))}
            </ul>
            <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type SortKey = "average" | "count";

/** Super admin: every company by average rating (sortable), click one to read its reviews. */
function RatingsOverview() {
  const { data, isLoading } = useGetCompanyRatingsOverview();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "average", desc: true });
  const [selected, setSelected] = useState<CompanyRatingSummary | null>(null);

  // Companies without any rating always stay at the bottom, whatever the direction
  const rows = useMemo(() => {
    const items = [...(data?.items ?? [])];
    const value = (c: CompanyRatingSummary) => (sort.key === "average" ? c.averageRating : c.ratingsCount);
    return items.sort((a, b) => {
      const [va, vb] = [value(a), value(b)];
      if (va === null || vb === null) return va === null ? (vb === null ? a.companyName.localeCompare(b.companyName) : 1) : -1;
      return (sort.desc ? vb - va : va - vb) || b.ratingsCount - a.ratingsCount || a.companyName.localeCompare(b.companyName);
    });
  }, [data, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  const SortIcon = ({ k }: { k: SortKey }) => (sort.key === k ? (sort.desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : null);

  return (
    <div className="space-y-8">
      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-48 bg-muted animate-pulse" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Compagnie</TableHead>
                  <TableHead>
                    <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => toggle("average")}>
                      Note moyenne <SortIcon k="average" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => toggle("count")}>
                      Avis <SortIcon k="count" />
                    </button>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c, i) => (
                  <TableRow key={c.companyId} className={cn(selected?.companyId === c.companyId && "bg-primary/5")}>
                    <TableCell className="text-muted-foreground">{c.averageRating !== null ? i + 1 : "—"}</TableCell>
                    <TableCell className="font-medium">{c.companyName}</TableCell>
                    <TableCell>
                      {c.averageRating !== null ? (
                        <span className="inline-flex items-center gap-2"><span className="font-bold w-8">{formatAverage(c.averageRating)}</span><Stars value={c.averageRating} /></span>
                      ) : (
                        <span className="text-muted-foreground">Pas encore noté</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.ratingsCount}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled={c.ratingsCount === 0} onClick={() => setSelected(c)}>
                        <MessageSquare className="w-4 h-4 mr-1" /> Lire
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div>
          <h2 className="text-xl font-bold mb-4">Avis reçus par {selected.companyName}</h2>
          <CompanyReviews key={selected.companyId} companyId={selected.companyId} />
        </div>
      )}
    </div>
  );
}

/** Company admin: reviews of its own company. Super admin: ranking of every company. */
export default function AdminRatings() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  if (!me) return null;
  const isSuperAdmin = me.role === "admin";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-foreground mb-2">{isSuperAdmin ? "Qualité : avis des passagers" : "Avis des passagers"}</h1>
      <p className="text-muted-foreground mb-8">
        {isSuperAdmin
          ? "Classement des compagnies selon les notes laissées par les passagers après leur voyage."
          : "Notes et commentaires laissés par vos passagers après leur voyage (billet payé, voyage effectué)."}
      </p>
      {isSuperAdmin ? <RatingsOverview /> : <CompanyReviews />}
    </div>
  );
}
