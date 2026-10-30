import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import {
  BusFront, LayoutDashboard, Building2, MapPin, Truck, Route as RouteIcon, CalendarClock, Users,
  FileBarChart, Wallet, Undo2, Percent, ArrowLeftRight, Star, Store, Hotel, Landmark, Car,
  ClipboardList, Menu, ChevronsLeft, ChevronsRight, LogOut, Globe, ChevronDown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { CurrencySelect } from "@/components/currency-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Language } from "@/lib/i18n/translations";

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };
type NavSection = { title?: string; items: NavItem[] };

const COLLAPSED_KEY = "admin_sidebar_collapsed";

/** Sidebar menu, by role. The server still filters every request: this only decides what is shown. */
function useNavSections(role: string | undefined): NavSection[] {
  const { t } = useLanguage();

  if (role === "company_admin") {
    return [
      { items: [{ href: "/admin", label: t("nav.adminDashboard"), icon: LayoutDashboard }] },
      {
        title: "Exploitation",
        items: [
          { href: "/admin/fleet", label: t("nav.adminFleet"), icon: Truck },
          { href: "/admin/routes", label: t("nav.adminRoutes"), icon: RouteIcon },
          { href: "/admin/trips", label: t("nav.adminTrips"), icon: CalendarClock },
        ],
      },
      {
        title: t("nav.adminFinance"),
        items: [
          { href: "/admin/reports", label: t("nav.adminReports"), icon: FileBarChart },
          { href: "/admin/revenue", label: t("nav.adminRevenue"), icon: Wallet },
          { href: "/admin/ratings", label: t("nav.adminRatings"), icon: Star },
        ],
      },
    ];
  }

  return [
    { items: [{ href: "/admin", label: t("nav.adminDashboard"), icon: LayoutDashboard }] },
    {
      title: "Réseau",
      items: [
        { href: "/admin/companies", label: t("nav.adminCompanies"), icon: Building2 },
        { href: "/admin/stations", label: t("nav.adminStations"), icon: MapPin },
        { href: "/admin/fleet", label: t("nav.adminFleet"), icon: Truck },
        { href: "/admin/routes", label: t("nav.adminRoutes"), icon: RouteIcon },
        { href: "/admin/trips", label: t("nav.adminTrips"), icon: CalendarClock },
        { href: "/admin/users", label: t("nav.adminUsers"), icon: Users },
      ],
    },
    {
      title: t("nav.adminFinance"),
      items: [
        { href: "/admin/reports", label: t("nav.adminReports"), icon: FileBarChart },
        { href: "/admin/revenue", label: t("nav.adminRevenue"), icon: Wallet },
        { href: "/admin/refunds", label: t("nav.adminRefunds"), icon: Undo2 },
        { href: "/admin/settings", label: t("nav.adminCommission"), icon: Percent },
        { href: "/admin/exchange-rates", label: t("nav.adminExchangeRates"), icon: ArrowLeftRight },
        { href: "/admin/ratings", label: t("nav.adminQuality"), icon: Star },
      ],
    },
    {
      title: t("nav.adminCatalog"),
      items: [
        { href: "/admin/agencies", label: t("nav.adminAgencies"), icon: Store },
        { href: "/admin/hotels", label: t("nav.adminHotels"), icon: Hotel },
        { href: "/admin/tourism-spots", label: t("nav.adminTourismSpots"), icon: Landmark },
        { href: "/admin/vehicles", label: t("nav.adminVehicles"), icon: Car },
        { href: "/clerk/agency", label: t("nav.adminAgencyBookings"), icon: ClipboardList },
      ],
    },
  ];
}

/** "/admin" only matches itself; other entries also match their sub-pages. */
function isActive(location: string, href: string) {
  if (href === "/admin") return location === "/admin" || location === "/admin/";
  return location === href || location.startsWith(href + "/");
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "fr", label: "FR · Français" },
  { value: "en", label: "EN · English" },
  { value: "zh", label: "中文 · Chinese" },
];

function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
      <SelectTrigger className="h-8 w-auto gap-1 rounded-md text-xs font-semibold border-0 bg-transparent hover:bg-slate-100 px-2" aria-label={t("nav.language")}>
        <Globe className="h-4 w-4 text-slate-500" />
        <SelectValue>{language === "zh" ? "中文" : language.toUpperCase()}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {LANGUAGE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs font-semibold">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Back-office shell in the style of the CoreUI admin template:
 * dark sidebar with titled sections (collapsible on desktop, off-canvas on mobile),
 * white header with breadcrumb, light grey content area and footer.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const { t } = useLanguage();
  const sections = useNavSections(user?.role);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); }, [collapsed]);
  // Close the mobile menu after navigating
  useEffect(() => { setMobileOpen(false); }, [location]);

  const current = sections.flatMap((s) => s.items).find((i) => isActive(location, i.href));
  const currentSection = sections.find((s) => s.title && s.items.some((i) => i === current));

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: async () => {
        // Same clean-up as the public navbar: go home first, then forget the user and every cached query
        setLocation("/");
        await queryClient.cancelQueries();
        queryClient.setQueryData(getGetMeQueryKey(), null);
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== getGetMeQueryKey()[0] });
      },
    });
  };

  const displayName = user?.name || user?.phone || "";
  const initials = displayName
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";
  const roleLabel = user?.role === "company_admin" ? "Admin compagnie" : "Super admin";

  const sidebar = (isMobile: boolean) => {
    const narrow = collapsed && !isMobile;
    return (
      <aside
        className={cn(
          "flex flex-col h-full bg-[#212631] text-white/80 transition-[width] duration-200",
          narrow ? "w-16" : "w-64",
        )}
      >
        {/* Brand */}
        <Link
          href="/admin"
          className="h-16 shrink-0 flex items-center gap-2.5 px-4 border-b border-white/10 font-bold text-white"
        >
          <span className="bg-primary text-primary-foreground p-1.5 rounded-md shrink-0">
            <BusFront className="h-5 w-5" />
          </span>
          {!narrow && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-lg">ChapVoyage</span>
              {user?.role === "company_admin" && user.companyName && (
                <span className="block truncate text-[11px] font-medium text-white/50">{user.companyName}</span>
              )}
            </span>
          )}
        </Link>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 admin-sidebar-scroll">
          {sections.map((section, si) => (
            <div key={si} className="mb-1">
              {section.title && (
                narrow
                  ? <div className="mx-4 my-3 border-t border-white/10" />
                  : <div className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-white/40">{section.title}</div>
              )}
              {section.items.map((item) => {
                const active = isActive(location, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={narrow ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-md text-sm transition-colors",
                      narrow && "justify-center px-0",
                      active
                        ? "bg-white/10 text-white font-semibold"
                        : "text-white/65 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-white/50")} />
                    {!narrow && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggler (desktop only), like CoreUI's sidebar footer */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-12 shrink-0 flex items-center justify-end px-5 border-t border-white/10 text-white/50 hover:text-white hover:bg-white/5"
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        )}
      </aside>
    );
  };

  return (
    <div className="admin-shell min-h-[100dvh] flex bg-[#f3f4f7] font-sans">
      {/* Desktop sidebar */}
      <div className="hidden lg:block sticky top-0 h-[100dvh] shrink-0 z-40">{sidebar(false)}</div>

      {/* Mobile sidebar (off-canvas) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="h-full shadow-xl">{sidebar(true)}</div>
          <button
            type="button"
            className="flex-1 bg-black/50"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="h-16 px-4 md:px-6 flex items-center gap-3">
            <button
              type="button"
              className="p-2 -ml-2 rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="p-2 -ml-2 rounded-md text-slate-500 hover:bg-slate-100 hidden lg:inline-flex"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav className="hidden md:flex items-center gap-5 text-sm text-slate-500">
              <Link href="/admin" className="hover:text-slate-900">{t("nav.adminDashboard")}</Link>
              <Link href="/" className="hover:text-slate-900">Voir le site</Link>
            </nav>

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <CurrencySelect />
              <LanguagePicker />
              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="relative h-9 w-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-sm font-bold">
                    {initials}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 hidden sm:block" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="font-semibold truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel}{user?.companyName ? ` · ${user.companyName}` : ""}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setLocation("/")}>Voir le site</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Breadcrumb bar */}
          <div className="h-11 px-4 md:px-6 flex items-center border-t border-slate-100 text-sm">
            <ol className="flex items-center gap-2 text-slate-500 min-w-0">
              <li><Link href="/admin" className="hover:text-primary">Administration</Link></li>
              {currentSection?.title && (<><li className="text-slate-300">/</li><li className="truncate">{currentSection.title}</li></>)}
              {current && current.href !== "/admin" && (<><li className="text-slate-300">/</li><li className="text-slate-900 font-medium truncate">{current.label}</li></>)}
              {current?.href === "/admin" && (<><li className="text-slate-300">/</li><li className="text-slate-900 font-medium">{current.label}</li></>)}
            </ol>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>

        <footer className="h-12 px-4 md:px-6 flex items-center justify-between bg-white border-t border-slate-200 text-sm text-slate-500">
          <span><span className="font-semibold text-slate-700">ChapVoyage</span> © {new Date().getFullYear()}</span>
          <span className="hidden sm:inline">Espace d'administration</span>
        </footer>
      </div>
    </div>
  );
}
