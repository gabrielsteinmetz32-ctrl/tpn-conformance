import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompts and the spec are read from disk at request time. They are not
  // imported anywhere, so file tracing cannot discover them — without this
  // the routes throw ENOENT once deployed.
  outputFileTracingIncludes: {
    "/api/extract": ["./prompts/**/*"],
    "/api/conform": ["./prompts/**/*", "./spec/**/*"],
    "/api/grade": ["./prompts/**/*", "./spec/**/*"],
  },
};

export default nextConfig;
