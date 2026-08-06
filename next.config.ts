import type {NextConfig} from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', 
      },
    ],
  },
  transpilePackages: ['motion', 'framer-motion', 'lucide-react'],
  // Empty turbopack config silences the "webpack config but no turbopack config" warning.
  // Next.js 16 uses Turbopack by default; most apps work fine without custom webpack config.
  turbopack: {},
};
export default nextConfig;
