import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@delego/ui", "@delego/sdk", "@delego/types", "@delego/utils"],
};

export default nextConfig;
