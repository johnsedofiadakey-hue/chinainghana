import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConsoleShell } from "@/components/console/Shell";

export const metadata: Metadata = { title: "Developer", robots: { index: false, follow: false } };

export default function SuperLayout({ children }: LayoutProps<"/super">) {
  return (
    <RequireRole roles={["superadmin"]}>
      <ConsoleShell area="admin">{children}</ConsoleShell>
    </RequireRole>
  );
}
