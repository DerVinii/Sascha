import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/server/active-org";
import { Sidebar } from "@/components/app/sidebar";
import { Header } from "@/components/app/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const org = await getActiveOrg();
  if (!org) {
    redirect("/onboarding");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar userEmail={user.email ?? ""} orgName={org.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
