const { vercelPreset } = require("@remix-run/vercel");

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  ...vercelPreset(), // Ensures proper configuration for Vercel
  serverBuildPath: "build/index.js",
  serverModuleFormat: "cjs",
  serverDependenciesToBundle: "all",
  future: {
    unstable_dev: true,
  },
};