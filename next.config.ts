import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Import shader files as raw strings
    rules: {
      "*.{glsl,vert,frag}": {
        type: "raw",
      },
    },
  },
};

export default nextConfig;
