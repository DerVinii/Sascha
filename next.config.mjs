/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
  },
  // CommonJS-/Node-Pakete mit dynamischen Requires nicht mitbundeln, sondern
  // im Node-Runtime laden (web-push + der IMAP/SMTP-Stack fürs Postfach).
  serverExternalPackages: ["web-push", "imapflow", "nodemailer", "mailparser"],
};

export default nextConfig;
