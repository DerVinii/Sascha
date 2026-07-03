/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
  },
  // web-push ist ein CommonJS-Node-Paket — nicht mitbundeln, im Node-Runtime laden.
  serverExternalPackages: ["web-push"],
};

export default nextConfig;
