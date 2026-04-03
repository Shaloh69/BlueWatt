/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // ESLint runs separately in CI; skip during next build so missing
    // devDependencies on Render (NODE_ENV=production) don't fail the build.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type errors are caught in local dev; skip during Render build.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
