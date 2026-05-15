const path = require("path");

const nextConfig = {
  // Pin the project root because /home/neo also has a package-lock.json. Without
  // this, Next may infer the wrong workspace root and warn during builds.
  turbopack: {
    root: path.resolve(__dirname)
  },
  // Kept for future remote image support. v0.1.0 proposal data currently uses
  // backend-local image paths so PDF generation is reliable offline.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*"
      },
      {
        source: "/static/:path*",
        destination: "http://127.0.0.1:8000/static/:path*"
      }
    ];
  }
};

module.exports = nextConfig;
