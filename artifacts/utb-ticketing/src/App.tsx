import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { CurrencyProvider } from '@/lib/currency';
import { RequireRole } from '@/components/require-role';

// Pages
import Home from '@/pages/home';
import Login from '@/pages/login';
import Trips from '@/pages/passenger/trips';
import TripDetail from '@/pages/passenger/trip-detail';
import Checkout from '@/pages/passenger/checkout';
import Tickets from '@/pages/passenger/tickets';
import TicketDetail from '@/pages/passenger/ticket-detail';
import Hotels from '@/pages/passenger/hotels';
import HotelDetail from '@/pages/passenger/hotel-detail';
import HotelCheckout from '@/pages/passenger/hotel-checkout';
import HotelBookings from '@/pages/passenger/hotel-bookings';
import HotelBookingDetail from '@/pages/passenger/hotel-booking-detail';
import Tourism from '@/pages/passenger/tourism';
import TourismDetail from '@/pages/passenger/tourism-detail';
import Vehicles from '@/pages/passenger/vehicles';
import VehicleDetail from '@/pages/passenger/vehicle-detail';
import MyBookings from '@/pages/passenger/my-bookings';
import TrackTrip from '@/pages/passenger/track-trip';
import PaymentReturn from '@/pages/passenger/payment-return';

import ClerkDashboard from '@/pages/clerk/dashboard';
import ClerkTripDetail from '@/pages/clerk/trip-detail';
import ClerkValidate from '@/pages/clerk/validate';
import ClerkAgencyBookings from '@/pages/clerk/agency-bookings';
import ClerkShareLocation from '@/pages/clerk/share-location';

import AdminDashboard from '@/pages/admin/dashboard';
import AdminCompanies from '@/pages/admin/companies';
import AdminRoutes from '@/pages/admin/routes';
import AdminTrips from '@/pages/admin/trips';
import AdminReports from '@/pages/admin/reports';
import AdminUsers from '@/pages/admin/users';
import AdminHotels from '@/pages/admin/hotels';
import AdminStations from '@/pages/admin/stations';
import AdminFleet from '@/pages/admin/fleet';
import AdminAgencies from '@/pages/admin/agencies';
import AdminTourismSpots from '@/pages/admin/tourism-spots';
import AdminVehicles from '@/pages/admin/vehicles';
import AdminExchangeRates from '@/pages/admin/exchange-rates';
import AdminRevenue from '@/pages/admin/revenue';
import AdminRefunds from '@/pages/admin/refunds';
import AdminCommission from '@/pages/admin/commission';
import AdminRatings from '@/pages/admin/ratings';

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
        <Route path="/payment/return" component={PaymentReturn} />
        <Route path="/tickets" component={Tickets} />
        <Route path="/tickets/:id" component={TicketDetail} />
        <Route path="/tickets/:id/track" component={TrackTrip} />
        <Route path="/hotels" component={Hotels} />
        <Route path="/hotels/:id" component={HotelDetail} />
        <Route path="/hotels/:id/checkout" component={HotelCheckout} />
        <Route path="/hotel-bookings" component={HotelBookings} />
        <Route path="/hotel-bookings/:id" component={HotelBookingDetail} />
        <Route path="/tourism" component={Tourism} />
        <Route path="/tourism/:id" component={TourismDetail} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/vehicles/:id" component={VehicleDetail} />
        <Route path="/my-bookings" component={MyBookings} />

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

        {/* Admin */}
        <Route path="/admin">
          <RequireRole roles={['admin', 'company_admin']}><AdminDashboard /></RequireRole>
        </Route>
        <Route path="/admin/companies">
          <RequireRole roles={['admin']}><AdminCompanies /></RequireRole>
        </Route>
        <Route path="/admin/routes">
          <RequireRole roles={['admin', 'company_admin']}><AdminRoutes /></RequireRole>
        </Route>
        <Route path="/admin/trips">
          <RequireRole roles={['admin', 'company_admin']}><AdminTrips /></RequireRole>
        </Route>
        <Route path="/admin/reports">
          <RequireRole roles={['admin', 'company_admin']}><AdminReports /></RequireRole>
        </Route>
        <Route path="/admin/users">
          <RequireRole roles={['admin']}><AdminUsers /></RequireRole>
        </Route>
        <Route path="/admin/stations">
          <RequireRole roles={['admin']}><AdminStations /></RequireRole>
        </Route>
        <Route path="/admin/fleet">
          <RequireRole roles={['admin', 'company_admin']}><AdminFleet /></RequireRole>
        </Route>
        <Route path="/admin/hotels">
          <RequireRole roles={['admin']}><AdminHotels /></RequireRole>
        </Route>
        <Route path="/admin/refunds">
          <RequireRole roles={['admin']}><AdminRefunds /></RequireRole>
        </Route>
        <Route path="/admin/revenue">
          <RequireRole roles={['admin', 'company_admin']}><AdminRevenue /></RequireRole>
        </Route>
        <Route path="/admin/settings">
          <RequireRole roles={['admin']}><AdminCommission /></RequireRole>
        </Route>
        <Route path="/admin/ratings">
          <RequireRole roles={['admin', 'company_admin']}><AdminRatings /></RequireRole>
        </Route>
        <Route path="/admin/exchange-rates">
          <RequireRole roles={['admin']}><AdminExchangeRates /></RequireRole>
        </Route>
        <Route path="/admin/agencies">
          <RequireRole roles={['admin']}><AdminAgencies /></RequireRole>
        </Route>
        <Route path="/admin/tourism-spots">
          <RequireRole roles={['admin']}><AdminTourismSpots /></RequireRole>
        </Route>
        <Route path="/admin/vehicles">
          <RequireRole roles={['admin']}><AdminVehicles /></RequireRole>
        </Route>
        <Route path="/clerk/trips/:id/share">
          <RequireRole roles={['clerk', 'admin']}><ClerkShareLocation /></RequireRole>
        </Route>
        <Route path="/clerk/agency">
          <RequireRole roles={['clerk', 'admin']}><ClerkAgencyBookings /></RequireRole>
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
        <CurrencyProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
