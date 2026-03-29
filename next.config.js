const scummvmShellCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=0, must-revalidate",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/scummvm.html",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/scummvm.js",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/scummvm.wasm",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/scummvm.ini",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/scummvm_fs.js",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/games.json",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/game.json",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/source-info.json",
        headers: scummvmShellCacheHeaders,
      },
      {
        source: "/data/:path*",
        headers: scummvmShellCacheHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
