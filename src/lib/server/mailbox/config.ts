/**
 * Konfiguration des echten E-Mail-Postfachs (Webador, IMAP/SMTP).
 *
 * Zugangsdaten liegen ausschließlich in Env-Variablen (Vercel-verschlüsselt,
 * nie im Repo). Ist nichts gesetzt, gilt das Postfach als „nicht verbunden"
 * und die UI zeigt einen Empty-State statt zu crashen.
 */

export type MailboxConfig = {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

export function getMailboxConfig(): MailboxConfig | null {
  const email = process.env.POSTFACH_EMAIL?.trim();
  const password = process.env.POSTFACH_PASSWORD;
  if (!email || !password) return null;
  return {
    email,
    password,
    imapHost: process.env.POSTFACH_IMAP_HOST?.trim() || "mail.webador.com",
    imapPort: Number(process.env.POSTFACH_IMAP_PORT) || 143,
    smtpHost: process.env.POSTFACH_SMTP_HOST?.trim() || "mail.webador.com",
    smtpPort: Number(process.env.POSTFACH_SMTP_PORT) || 587,
  };
}

export function requireMailboxConfig(): MailboxConfig {
  const cfg = getMailboxConfig();
  if (!cfg)
    throw new Error(
      "Postfach ist nicht konfiguriert (POSTFACH_EMAIL / POSTFACH_PASSWORD fehlen).",
    );
  return cfg;
}
