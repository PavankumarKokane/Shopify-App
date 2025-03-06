const { createRequestHandler } = require("@remix-run/vercel");
const remixBuild = require("./build");

module.exports = createRequestHandler({ build: remixBuild });