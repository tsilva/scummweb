/** @type {import('next').NextConfig} */
const gamesOrigin = process.env.SCUMMVM_GAMES_ORIGIN || "https://scummvm-games.tsilva.eu";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!gamesOrigin) {
      return [];
    }

    return {
      beforeFiles: [
        {
          source: "/games/:path*",
          destination: `${gamesOrigin}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
