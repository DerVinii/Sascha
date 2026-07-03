import { SettingsNav } from "./_components/settings-nav";

export default function EinstellungenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 max-w-5xl">
        <SettingsNav />
        <div className="flex-1 min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  );
}
