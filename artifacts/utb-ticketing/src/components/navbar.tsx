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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import type { Language } from "@/lib/i18n/translations";

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "fr", label: "FR · Français" },
  { value: "en", label: "EN · English" },
  { value: "zh", label: "中文 · Chinese" },
];

function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();
  const short = language === "zh" ? "中文" : language.toUpperCase();

  return (
    <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
      <SelectTrigger className="h-8 w-auto gap-1 rounded-full text-xs font-bold bg-muted border-0 px-2.5 sm:px-3" aria-label={t("nav.language")}>
        <SelectValue>{short}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {LANGUAGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs font-bold">{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
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

    // Company admin: the admin screens of its own company only (the server filters the data);
    // users, cities/stations, agencies, exchange rates and commission stay with the super admin
    if (user.role === "company_admin") {
      return (
        <>
          <Link href="/admin" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> {t("nav.adminDashboard")}
          </Link>
          {user.companyName && <span className="text-xs font-bold px-2 py-1 bg-secondary/10 text-secondary rounded-md">{user.companyName}</span>}
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
          <Link href="/admin/revenue" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminRevenue")}
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> {t("nav.logout")}
          </Button>
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
          <Link href="/admin/users" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            {t("nav.adminUsers")}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1 outline-none">
              {t("nav.adminFinance")} <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setLocation("/admin/reports")}>{t("nav.adminReports")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/revenue")}>{t("nav.adminRevenue")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/refunds")}>{t("nav.adminRefunds")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/settings")}>{t("nav.adminCommission")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLocation("/admin/exchange-rates")}>{t("nav.adminExchangeRates")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <LayoutDashboard className="h-4 w-4" /> {t("nav.clerkTrips")}
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
      <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-2">
        {/* min-w-0 + truncate: on small phones the name shrinks instead of pushing the menu button off screen */}
        <Link href="/" className="flex items-center gap-1.5 sm:gap-2 font-bold text-base sm:text-xl text-secondary min-w-0">
          <div className="bg-primary text-primary-foreground p-1 sm:p-1.5 rounded-md shrink-0">
            <BusFront className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <span className="truncate">ChapVoyage</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <NavLinks withLogin={false} />
          <CurrencySelect />
          <LanguageToggle />
          {!user && loginLink}
        </nav>

        {/* Mobile Nav Toggle */}
        <div className="flex items-center gap-1.5 shrink-0 md:hidden">
          <CurrencySelect />
          <LanguageToggle />
          <button
            className="p-2 -mr-2 text-foreground shrink-0"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Menu"
            aria-expanded={isMobileMenuOpen}
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
