import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConsoleShell } from "@/components/console/Shell";

export const metadata: Metadata = { title: "Manager", robots: { index: false, follow: false } };

export default function ManagerLayout({ children }: LayoutProps<"/manager">) {
  return (
    <RequireRole roles={["manager"]}>
      <ConsoleShell area="manager">{children}</ConsoleShell>
    </RequireRole>
  );
}
