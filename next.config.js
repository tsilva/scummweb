const gamesOrigin = (process.env.SCUMMVM_GAMES_ORIGIN || "https://scummvm-games.tsilva.eu").replace(
  /\/$/,
  ""
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/_games/:path*",
        destination: `${gamesOrigin}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
