import { Link, useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { BusFront, User, LogOut, Ticket, Menu, X, LayoutDashboard, QrCode } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { data: user } = useGetMe({ query: { retry: false } });
  const logout = useLogout();
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/");
      }
    });
  };

  const NavLinks = () => {
    if (!user) {
      return (
        <>
          <Link href="/login" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            Se connecter
          </Link>
          <Button asChild className="rounded-full">
            <Link href="/login">Acheter un billet</Link>
          </Button>
        </>
      );
    }

    if (user.role === "admin") {
      return (
        <>
          <Link href="/admin" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/admin/companies" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            Compagnies
          </Link>
          <Link href="/admin/routes" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            Lignes
          </Link>
          <Link href="/admin/trips" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            Voyages
          </Link>
          <Link href="/admin/reports" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            Rapports
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Déconnexion
          </Button>
        </>
      );
    }

    if (user.role === "clerk") {
      return (
        <>
          <Link href="/clerk" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" /> Ventes Guichet
          </Link>
          <Link href="/clerk/validate" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
            <QrCode className="h-4 w-4" /> Validation
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Déconnexion
          </Button>
        </>
      );
    }

    return (
      <>
        <Link href="/tickets" className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
          <Ticket className="h-4 w-4" /> Mes billets
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
          UTB Billetterie
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <NavLinks />
        </nav>

        {/* Mobile Nav Toggle */}
        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
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
