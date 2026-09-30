import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConsoleShell } from "@/components/console/Shell";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireRole roles={["admin", "superadmin"]}>
      <ConsoleShell area="admin">{children}</ConsoleShell>
    </RequireRole>
  );
}
