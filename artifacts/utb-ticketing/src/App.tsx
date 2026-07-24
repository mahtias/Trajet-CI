import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { RequireRole } from '@/components/require-role';

// Pages
import Home from '@/pages/home';
import Login from '@/pages/login';
import Trips from '@/pages/passenger/trips';
import TripDetail from '@/pages/passenger/trip-detail';
import Checkout from '@/pages/passenger/checkout';
import Tickets from '@/pages/passenger/tickets';
import TicketDetail from '@/pages/passenger/ticket-detail';

import ClerkDashboard from '@/pages/clerk/dashboard';
import ClerkTripDetail from '@/pages/clerk/trip-detail';
import ClerkSell from '@/pages/clerk/sell';
import ClerkValidate from '@/pages/clerk/validate';

import AdminDashboard from '@/pages/admin/dashboard';
import AdminCompanies from '@/pages/admin/companies';
import AdminRoutes from '@/pages/admin/routes';
import AdminTrips from '@/pages/admin/trips';
import AdminReports from '@/pages/admin/reports';
import AdminUsers from '@/pages/admin/users';

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        {/* Public / Passenger */}
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/trips" component={Trips} />
        <Route path="/trips/:id" component={TripDetail} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/tickets" component={Tickets} />
        <Route path="/tickets/:id" component={TicketDetail} />

        {/* Clerk */}
        <Route path="/clerk">
          <RequireRole roles={['clerk', 'admin']}><ClerkDashboard /></RequireRole>
        </Route>
        <Route path="/clerk/validate">
          <RequireRole roles={['clerk', 'admin']}><ClerkValidate /></RequireRole>
        </Route>
        <Route path="/clerk/trips/:id">
          <RequireRole roles={['clerk', 'admin']}><ClerkTripDetail /></RequireRole>
        </Route>
        <Route path="/clerk/trips/:id/sell">
          <RequireRole roles={['clerk', 'admin']}><ClerkSell /></RequireRole>
        </Route>

        {/* Admin */}
        <Route path="/admin">
          <RequireRole roles={['admin']}><AdminDashboard /></RequireRole>
        </Route>
        <Route path="/admin/companies">
          <RequireRole roles={['admin']}><AdminCompanies /></RequireRole>
        </Route>
        <Route path="/admin/routes">
          <RequireRole roles={['admin']}><AdminRoutes /></RequireRole>
        </Route>
        <Route path="/admin/trips">
          <RequireRole roles={['admin']}><AdminTrips /></RequireRole>
        </Route>
        <Route path="/admin/reports">
          <RequireRole roles={['admin']}><AdminReports /></RequireRole>
        </Route>
        <Route path="/admin/users">
          <RequireRole roles={['admin']}><AdminUsers /></RequireRole>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
