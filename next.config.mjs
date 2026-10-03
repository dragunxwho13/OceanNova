/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // TensorFlow.js must stay external: it is a pure-JS runtime that must not be
  // bundled (and its WASM/CPU backend detection relies on require at runtime).
  serverExternalPackages: ["@tensorflow/tfjs"],
  // The engine reads trained weights from the filesystem at request time —
  // make sure they ship inside the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./ml/weights/**"],
  },
};

export default nextConfig;
