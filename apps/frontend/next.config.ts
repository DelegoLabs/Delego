import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@delego/ui", "@delego/sdk", "@delego/types", "@delego/utils"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
      ".jsx": [".jsx", ".tsx"],
    };

    return config;
  },
};

export default nextConfig;
