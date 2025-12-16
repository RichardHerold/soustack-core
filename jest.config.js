const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  // Run tests that build in sequence to avoid file system conflicts
  maxWorkers: process.env.CI ? 2 : '50%',
  testSequencer: undefined, // Use default sequencer
};