require('@babel/register')({
  extensions: ['.ts'],
  ignore: [/node_modules/],
  presets: [
    ['@babel/preset-env', { modules: 'commonjs', targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
});

require('../../src/api/agentV2/testing/localSdkSmoke.ts').run().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Agent V2 SDK local smoke failed: ${message}\n`);
  process.exitCode = 1;
});
