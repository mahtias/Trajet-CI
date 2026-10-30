import { useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useGetAdminStats, useGetMe, getGetMeQueryKey, type DailyStat } from "@workspace/api-client-react";
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Ticket, Wallet, Building2, ShoppingCart } from "lucide-react";

import { CommissionNoticeBanner } from "@/components/commission-notice-banner";
import {
  AdminCard, ChartStatWidget, IconStatWidget, ProgressGroup, WIDGET_COLORS, trend, type WidgetColor,
} from "@/components/admin/widgets";
import { cn } from "@/lib/utils";

const DAYS = 14;
const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const PIE_COLORS: WidgetColor[] = ["primary", "info", "warning", "danger", "success"];

/** The server only returns days with sales: fill the gaps so every chart shows the same 14 days. */
function fillDays(rows: DailyStat[]): DailyStat[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const today = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const date = format(subDays(today, DAYS - 1 - i), "yyyy-MM-dd");
    return byDate.get(date) ?? { date, ticketCount: 0, revenue: 0 };
  });
}

const shortDate = (d: string) => format(parseISO(d), "d MMM", { locale: fr });

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [metric, setMetric] = useState<"tickets" | "revenue">("tickets");

  const days = useMemo(() => fillDays(stats?.salesByDay ?? []), [stats]);

  const header = (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-slate-900">Tableau de bord</h1>
      <p className="text-sm text-slate-500">
        {me?.role === "company_admin" ? `Activité de ${me.companyName ?? "votre compagnie"}` : "Activité de toutes les compagnies"}
        {" · "}billets payés, hors annulations
      </p>
    </div>
  );

  if (isLoading || !stats) {
    return (
      <div>
        {header}
        <CommissionNoticeBanner />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-[150px] bg-slate-200 animate-pulse rounded-md" />)}
        </div>
        <div className="h-96 bg-slate-200 animate-pulse rounded-md" />
      </div>
    );
  }

  const ticketSeries = days.map((d) => ({ label: shortDate(d.date), value: d.ticketCount }));
  const revenueSeries = days.map((d) => ({ label: shortDate(d.date), value: d.revenue }));
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];

  const total14Tickets = days.reduce((s, d) => s + d.ticketCount, 0);
  const total14Revenue = days.reduce((s, d) => s + d.revenue, 0);
  const firstHalf = days.slice(0, 7);
  const secondHalf = days.slice(7);
  const weekTickets = secondHalf.reduce((s, d) => s + d.ticketCount, 0);
  const prevWeekTickets = firstHalf.reduce((s, d) => s + d.ticketCount, 0);
  const weekRevenue = secondHalf.reduce((s, d) => s + d.revenue, 0);
  const prevWeekRevenue = firstHalf.reduce((s, d) => s + d.revenue, 0);
  const bestDay = days.reduce((best, d) => (d.ticketCount > best.ticketCount ? d : best), days[0]);
  const avgBasket = total14Tickets ? total14Revenue / total14Tickets : 0;

  const companies = stats.ticketsByCompany;
  const companyTickets = companies.reduce((s, c) => s + c.ticketCount, 0);
  const companyRevenue = companies.reduce((s, c) => s + c.revenue, 0);

  const isTickets = metric === "tickets";
  const mainColor = isTickets ? WIDGET_COLORS.primary.solid : WIDGET_COLORS.info.solid;

  return (
    <div>
      {header}
      {/* Company admins: announced commission change, until dismissed */}
      <CommissionNoticeBanner />

      {/* Coloured widgets with mini charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <ChartStatWidget
          color="primary"
          value={stats.totalTicketsSoldToday.toLocaleString("fr-FR")}
          title="Billets vendus aujourd'hui"
          change={trend(today.ticketCount, yesterday.ticketCount)}
          data={ticketSeries}
          chart="line"
        />
        <ChartStatWidget
          color="info"
          value={fcfa(stats.totalRevenuToday)}
          title="Revenus aujourd'hui"
          change={trend(today.revenue, yesterday.revenue)}
          data={revenueSeries}
          chart="line"
          format={fcfa}
        />
        <ChartStatWidget
          color="warning"
          value={stats.totalTicketsSoldMonth.toLocaleString("fr-FR")}
          title="Billets vendus ce mois"
          change={trend(weekTickets, prevWeekTickets)}
          data={ticketSeries}
          chart="area"
        />
        <ChartStatWidget
          color="danger"
          value={fcfa(stats.totalRevenueMonth)}
          title="Revenus ce mois"
          change={trend(weekRevenue, prevWeekRevenue)}
          data={revenueSeries}
          chart="bar"
          format={fcfa}
        />
      </div>

      {/* Main chart card */}
      <AdminCard
        className="mb-6"
        title="Ventes"
        subtitle={`${shortDate(days[0].date)} – ${shortDate(today.date)} ${format(new Date(), "yyyy")}`}
        actions={
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
            {(["tickets", "revenue"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  metric === m ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-100",
                )}
              >
                {m === "tickets" ? "Billets" : "Revenus"}
              </button>
            ))}
          </div>
        }
        footer={
          <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
            <ProgressGroup label="Billets (14 j)" value={total14Tickets.toLocaleString("fr-FR")} color="success" />
            <ProgressGroup label="Revenus (14 j)" value={fcfa(total14Revenue)} color="info" />
            <ProgressGroup
              label="7 derniers jours"
              value={weekTickets.toLocaleString("fr-FR")}
              percent={total14Tickets ? (weekTickets / total14Tickets) * 100 : 0}
              color="warning"
            />
            <ProgressGroup label="Panier moyen" value={fcfa(avgBasket)} color="danger" />
            <ProgressGroup
              label={`Meilleur jour (${shortDate(bestDay.date)})`}
              value={`${bestDay.ticketCount} billets`}
              percent={total14Tickets ? (bestDay.ticketCount / total14Tickets) * 100 : 0}
              color="primary"
            />
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={days} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mainFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={mainColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={mainColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={isTickets ? 40 : 70}
                tickFormatter={(v: number) => (isTickets ? String(v) : v.toLocaleString("fr-FR"))}
              />
              <RechartsTooltip
                labelFormatter={(d: string) => format(parseISO(d), "EEEE d MMMM", { locale: fr })}
                formatter={(v: number) => (isTickets ? [`${v} billets`, "Ventes"] : [fcfa(v), "Revenus"])}
                contentStyle={{ borderRadius: 6, borderColor: "#e2e8f0", fontSize: 13 }}
              />
              <Area
                type="monotone"
                dataKey={isTickets ? "ticketCount" : "revenue"}
                stroke={mainColor}
                strokeWidth={2}
                fill="url(#mainFill)"
                dot={{ r: 3, fill: "#fff", stroke: mainColor, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </AdminCard>

      {/* Small icon widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <IconStatWidget color="primary" icon={Ticket} value={total14Tickets.toLocaleString("fr-FR")} title="Billets · 14 jours" />
        <IconStatWidget color="info" icon={Wallet} value={fcfa(total14Revenue)} title="Revenus · 14 jours" />
        <IconStatWidget color="warning" icon={ShoppingCart} value={fcfa(avgBasket)} title="Panier moyen" />
        <IconStatWidget color="danger" icon={Building2} value={companies.length} title={companies.length > 1 ? "Compagnies actives" : "Compagnie active"} />
      </div>

      {/* Sales by company */}
      <AdminCard title="Ventes de Compagnie" subtitle="Depuis le début · billets payés">
        {companies.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Aucune vente pour le moment.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={companies}
                    dataKey="ticketCount"
                    nameKey="companyName"
                    innerRadius="62%"
                    outerRadius="90%"
                    paddingAngle={companies.length > 1 ? 2 : 0}
                    stroke="none"
                  >
                    {companies.map((_, i) => (
                      <Cell key={i} fill={WIDGET_COLORS[PIE_COLORS[i % PIE_COLORS.length]].solid} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v: number, name: string) => [`${v} billets`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-semibold font-mono text-slate-900">{companyTickets.toLocaleString("fr-FR")}</span>
                <span className="text-xs text-slate-500">billets</span>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              {companies.slice(0, 8).map((c, i) => {
                const color = PIE_COLORS[i % PIE_COLORS.length];
                const share = companyTickets ? (c.ticketCount / companyTickets) * 100 : 0;
                const revShare = companyRevenue ? (c.revenue / companyRevenue) * 100 : 0;
                return (
                  <div key={c.companyName} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: WIDGET_COLORS[color].solid }} />
                      <span className="font-medium text-slate-800 truncate">{c.companyName}</span>
                    </div>
                    <div className="text-sm text-right whitespace-nowrap">
                      <span className="font-semibold font-mono">{c.ticketCount.toLocaleString("fr-FR")}</span>
                      <span className="text-slate-500"> billets · {fcfa(c.revenue)}</span>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <div className="h-1.5 rounded-full bg-slate-100" title={`${share.toFixed(1)} % des billets`}>
                        <div className="h-1.5 rounded-full" style={{ width: `${share}%`, background: WIDGET_COLORS[color].solid }} />
                      </div>
                      <div className="h-1 rounded-full bg-slate-100" title={`${revShare.toFixed(1)} % des revenus`}>
                        <div className="h-1 rounded-full bg-slate-400" style={{ width: `${revShare}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {companies.length > 1 && (
                <p className="text-xs text-slate-500 pt-1">Barre de couleur : part des billets · barre grise : part des revenus.</p>
              )}
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
