import type { NextConfig } from "next";

/**
 * Content Security Policy: only our own scripts, styles and fonts; images from our domain and Unsplash
 * (demo portraits). Inline scripts and styles stay allowed because Next.js and the static landing page use them.
 */
const CSP = [
  "default-src 'self'",
  // Development builds evaluate code for hot reloading; production never needs eval.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "font-src 'self' data:",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  // Video uploads go straight from the browser to Vercel Blob.
  "connect-src 'self' https://blob.vercel-storage.com https://*.blob.vercel-storage.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** Other domains that point at this project and send everyone to lyncei.com, keeping the path. */
const REDIRECT_HOSTS = ["lincei.com", "www.lincei.com", "lincei.app", "www.lincei.app"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return REDIRECT_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://lyncei.com/:path*",
      permanent: true,
    }));
  },
  async rewrites() {
    return [
      { source: "/welcome", destination: "/welcome.html" },
      { source: "/.well-known/apple-app-site-association", destination: "/api/aasa" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
