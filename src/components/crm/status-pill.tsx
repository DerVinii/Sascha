import type { ContactStatus } from "@/app/(app)/crm/actions";

export const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  qualified: "Qualifiziert",
  in_conversation: "Im Gespräch",
  meeting_booked: "Termin gebucht",
  won: "Closed Won",
  lost: "Closed Lost",
};

const STATUS_STYLES: Record<ContactStatus, { bg: string; fg: string }> = {
  lead: { bg: "#fef3c7", fg: "#92400e" },
  qualified: { bg: "#dbeafe", fg: "#1d4ed8" },
  in_conversation: { bg: "#e0e7ff", fg: "#3730a3" },
  meeting_booked: { bg: "#fed7aa", fg: "#9a3412" },
  won: { bg: "#d1fae5", fg: "#047857" },
  lost: { bg: "#fee2e2", fg: "#b91c1c" },
};

export function StatusPill({ status }: { status: ContactStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className="pill"
      style={{ background: style.bg, color: style.fg }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
