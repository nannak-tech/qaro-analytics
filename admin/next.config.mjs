/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // small Docker image
  experimental: { optimizePackageImports: ['recharts'] },
};
export default nextConfig;
