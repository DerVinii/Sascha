/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
    serverActions: {
      // Standard sind 1 MB — damit scheitert schon ein normaler PDF-Anhang im
      // Postfach. 4,5 MB ist die Obergrenze, die Vercel pro Request annimmt.
      bodySizeLimit: "4.5mb",
    },
  },
  // CommonJS-/Node-Pakete mit dynamischen Requires nicht mitbundeln, sondern
  // im Node-Runtime laden (web-push + der IMAP/SMTP-Stack fürs Postfach).
  serverExternalPackages: [
    "web-push",
    "imapflow",
    "nodemailer",
    "mailparser",
    "qrcode",
  ],
};

export default nextConfig;
