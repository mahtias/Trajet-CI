import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';

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
        <Route path="/clerk" component={ClerkDashboard} />
        <Route path="/clerk/validate" component={ClerkValidate} />
        <Route path="/clerk/trips/:id" component={ClerkTripDetail} />
        <Route path="/clerk/trips/:id/sell" component={ClerkSell} />

        {/* Admin */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/companies" component={AdminCompanies} />
        <Route path="/admin/routes" component={AdminRoutes} />
        <Route path="/admin/trips" component={AdminTrips} />
        <Route path="/admin/reports" component={AdminReports} />

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
