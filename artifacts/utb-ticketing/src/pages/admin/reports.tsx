import { useState } from "react";
import { useGetSalesReport } from "@workspace/api-client-react";
import { format, subDays } from "date-fns";
import { Download, FileSpreadsheet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminReports() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: report, isLoading } = useGetSalesReport({ from: dateFrom, to: dateTo });

  const exportCSV = () => {
    if (!report) return;

    const headers = ["Date", "Compagnie", "Origine", "Destination", "Billets", "Revenus (FCFA)"];
    const rows = report.rows.map(r => [
      r.date, 
      r.companyName, 
      r.origin, 
      r.destination, 
      r.ticketCount.toString(), 
      r.revenue.toString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rapport_ventes_${dateFrom}_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-foreground">Rapports de Vente</h1>
        
        <div className="flex gap-4 items-end bg-card p-4 rounded-xl border border-border shadow-sm">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Du</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Au</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={exportCSV} disabled={!report || report.rows.length === 0} className="gap-2">
            <Download className="w-4 h-4" /> CSV
          </Button>
        </div>
      </div>

      {!isLoading && report && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-secondary text-secondary-foreground border-none">
            <CardContent className="p-6">
              <p className="text-sm font-medium opacity-80 uppercase mb-2">Total Billets Vendus</p>
              <h3 className="text-4xl font-bold font-mono">{report.totalTickets}</h3>
            </CardContent>
          </Card>
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="p-6">
              <p className="text-sm font-medium opacity-80 uppercase mb-2">Chiffre d'Affaires</p>
              <h3 className="text-4xl font-bold font-mono">{report.totalRevenue.toLocaleString("fr-CI")} FCFA</h3>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Compagnie</TableHead>
                <TableHead>Ligne</TableHead>
                <TableHead className="text-right">Billets</TableHead>
                <TableHead className="text-right">Revenus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Chargement...</TableCell>
                </TableRow>
              ) : report?.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune donnée pour cette période.</TableCell>
                </TableRow>
              ) : (
                report?.rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-bold">{row.companyName}</TableCell>
                    <TableCell>{row.origin} - {row.destination}</TableCell>
                    <TableCell className="text-right font-mono">{row.ticketCount}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-accent">{row.revenue.toLocaleString("fr-CI")} F</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
