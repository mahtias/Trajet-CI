import { useGetAdminStats } from "@workspace/api-client-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Ticket, DollarSign, TrendingUp, Calendar as CalendarIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading || !stats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Tableau de bord</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl"></div>)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-xl"></div>
      </div>
    );
  }

  const COLORS = ['hsl(12 76% 61%)', 'hsl(153 60% 15%)', 'hsl(38 92% 50%)', 'hsl(160 60% 45%)'];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">Tableau de bord</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Ticket className="w-6 h-6" />
              </div>
              <Badge>Aujourd'hui</Badge>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Billets Vendus</p>
            <h3 className="text-3xl font-bold text-foreground mt-1">{stats.totalTicketsSoldToday}</h3>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <Badge>Aujourd'hui</Badge>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Revenus (FCFA)</p>
            <h3 className="text-3xl font-bold text-foreground mt-1 font-mono">{stats.totalRevenuToday.toLocaleString()}</h3>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center text-secondary">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <Badge variant="outline">Ce Mois</Badge>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Billets Vendus</p>
            <h3 className="text-3xl font-bold text-foreground mt-1">{stats.totalTicketsSoldMonth}</h3>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center text-accent-foreground">
                <TrendingUp className="w-6 h-6" />
              </div>
              <Badge variant="outline">Ce Mois</Badge>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Revenus (FCFA)</p>
            <h3 className="text-3xl font-bold text-foreground mt-1 font-mono">{stats.totalRevenueMonth.toLocaleString()}</h3>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle>Ventes des 14 derniers jours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.salesByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={(val) => val.split("-").slice(1).join("/")} tick={{fill: 'hsl(var(--muted-foreground))'}} />
                  <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--primary))" />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--secondary))" />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Bar yAxisId="left" dataKey="ticketCount" name="Billets" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-border">
          <CardHeader>
            <CardTitle>Ventes par Compagnie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.ticketsByCompany}
                    dataKey="ticketCount"
                    nameKey="companyName"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {stats.ticketsByCompany.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Temporary internal Badge component
function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode, variant?: string, className?: string }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    outline: "text-foreground border border-border"
  };
  return <div className={`${base} ${variants[variant]} ${className}`}>{children}</div>;
}
