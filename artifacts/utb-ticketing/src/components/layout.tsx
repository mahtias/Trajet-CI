import { Navbar } from "./navbar";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 flex flex-col relative z-0">
        {children}
      </main>
      <footer className="py-8 border-t border-border mt-auto bg-secondary text-secondary-foreground text-center">
        <div className="container mx-auto px-4 text-sm text-secondary-foreground/60">
          © {new Date().getFullYear()} UTB Billetterie Côte d'Ivoire.
        </div>
      </footer>
    </div>
  );
}
