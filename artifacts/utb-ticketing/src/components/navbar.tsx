import { Link, useLocation } from "wouter";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BusFront, User, LogOut, Ticket, Menu, X, LayoutDashboard, QrCode, Hotel, Landmark, Car, ChevronDown, ClipboardList } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { CurrencySelect } from "@/components/currency-select";
import { cn } from "@/lib/utils";
import type { Language } from "@/lib/i18n/translations";

function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const option = (lang: Language, label: string) => (
    <button
      type="button"
      onClick={() => setLanguage(lang)}
      className={cn(
        "px-2 py-1 text-xs font-bold rounded-full transition-colors",
        language === lang
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1 bg-muted rounded-full p-0.5">
      {option("fr", "FR")}
      {option("en", "EN")}
    </div>
  );
}

export function Navbar() {
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: async () => {
        // The UI reads the user only from the /auth/me query: without this the cached user
        // stays on screen until a reload. Stop in-flight fetches, mark "me" as logged out
        // right away, and drop every other cached query (tickets, bookings, admin data…)
        // so nothing from the previous session can be shown to the next person.
        // Navigate first so a RequireRole page doesn't bounce to /login when "me" becomes null.
        setIsMobileMenuOpen(false);
        setLocation("/");
        await queryClient.cancelQueries();
        queryClient.setQueryData(getGetMeQueryKey(), null);
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== getGetMeQueryKey()[0] });
      }
    });
  };

  const loginLink = (
    <Link href="/login" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
      {t("nav.login")}
    </Link>
  );

  const NavLinks = ({ withLogin = true }: { withLogin?: boolean }) => {
    if (!user) {
      return (
        <>
          <Link href="/hotels" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <Hotel className="h-4 w-4" /> {t("nav.hotels")}
          </Link>
          <Link href="/tourism" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <Landmark className="h-4 w-4" /> {t("nav.tourism")}
          </Link>
          <Link href="/vehicles" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <Car className="h-4 w-4" /> {t("nav.vehicles")}
          </Link>
          <Button asChild className="rounded-full">
            <Link href="/login">{t("nav.buyTicket")}</Link>
          </Button>
          {/* On desktop "Se connecter" is rendered last, after the currency and language pickers */}
          {withLogin && loginLink}
        </>
      );
    }

    if (user.role === "admin") {
      return (
        <>
          <Link href="/admin" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> {t("nav.adminDashboard")}
          </Link>
          <Link href="/admin/companies" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminCompanies")}
          </Link>
          <Link href="/admin/stations" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminStations")}
          </Link>
          <Link href="/admin/fleet" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminFleet")}
          </Link>
          <Link href="/admin/routes" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminRoutes")}
          </Link>
          <Link href="/admin/trips" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminTrips")}
          </Link>
          <Link href="/admin/reports" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminReports")}
          </Link>
          <Link href="/admin/users" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminUsers")}
          </Link>
          <Link href="/admin/exchange-rates" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminExchangeRates")}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1 outline-none">
              {t("nav.adminCatalog")} <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setLocation("/admin/agencies")}>{t("nav.adminAgencies")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/hotels")}>{t("nav.adminHotels")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/tourism-spots")}>{t("nav.adminTourismSpots")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/vehicles")}>{t("nav.adminVehicles")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/clerk/agency")}>{t("nav.adminAgencyBookings")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> {t("nav.logout")}
          </Button>
        </>
      );
    }

    if (user.role === "clerk" && user.agencyId) {
      return (
        <>
          <Link href="/clerk/agency" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> {t("nav.clerkAgencyBookings")}
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> {t("nav.logout")}
          </Button>
        </>
      );
    }

    if (user.role === "clerk") {
      return (
        <>
          <Link href="/clerk" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> {t("nav.clerkSales")}
          </Link>
          <Link href="/clerk/validate" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <QrCode className="h-4 w-4" /> {t("nav.clerkValidate")}
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> {t("nav.logout")}
          </Button>
        </>
      );
    }

    return (
      <>
        <Link href="/tickets" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
          <Ticket className="h-4 w-4" /> {t("nav.myTickets")}
        </Link>
        <Link href="/hotels" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
          <Hotel className="h-4 w-4" /> {t("nav.hotels")}
        </Link>
        <Link href="/tourism" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
          <Landmark className="h-4 w-4" /> {t("nav.tourism")}
        </Link>
        <Link href="/vehicles" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
          <Car className="h-4 w-4" /> {t("nav.vehicles")}
        </Link>
        <Link href="/hotel-bookings" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
          {t("nav.myBookings")}
        </Link>
        <Link href="/my-bookings" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
          {t("nav.myAgencyBookings")}
        </Link>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <User className="h-4 w-4" /> {user.name || user.phone}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4" />
        </Button>
      </>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-secondary">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <BusFront className="h-5 w-5" />
          </div>
         ChapVoyage
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <NavLinks withLogin={false} />
          <CurrencySelect />
          <LanguageToggle />
          {!user && loginLink}
        </nav>

        {/* Mobile Nav Toggle */}
        <div className="flex items-center gap-3 md:hidden">
          <CurrencySelect />
          <LanguageToggle />
          <button
            className="p-2 text-foreground"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-b border-border p-4 bg-background flex flex-col gap-4">
          <NavLinks />
        </div>
      )}
    </header>
  );
}
