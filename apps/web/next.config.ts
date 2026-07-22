import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pkos/contracts"],
};

export default nextConfig;
