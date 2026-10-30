import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Navbar } from "./navbar";
import { AdminLayout } from "./admin/admin-layout";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });

  // Back-office pages get the admin shell (sidebar + header). The super admin also reaches
  // the clerk screens from its menu (agency bookings…), so those stay inside the shell too.
  const isAdminArea =
    location.startsWith("/admin") ||
    (user?.role === "admin" && location.startsWith("/clerk"));

  if (isAdminArea) {
    return <AdminLayout>{children}</AdminLayout>;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 flex flex-col relative z-0">
        {children}
      </main>
      <footer className="py-8 border-t border-border mt-auto bg-secondary text-secondary-foreground text-center">
        <div className="container mx-auto px-4 text-sm text-secondary-foreground/60">
          © {new Date().getFullYear()} ChapVoyage.
        </div>
      </footer>
    </div>
  );
}
