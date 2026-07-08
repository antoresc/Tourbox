import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack doesn't pick up an
  // unrelated lockfile elsewhere on the machine when launched from another cwd.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
