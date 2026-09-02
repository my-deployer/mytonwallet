import assert from 'node:assert/strict';
import test from 'node:test';

import { getAgentV2BundleBoundaryFailures } from './checkAgentV2BundleBoundary.mjs';

const PROJECT_ROOT = '/workspace';

test('accepts Agent V2 runtime in asynchronous named chunks', () => {
  assert.deepEqual(getAgentV2BundleBoundaryFailures(createCompilationStatistics(), PROJECT_ROOT), []);
});

test('rejects Agent V2 runtime in main and initial Agent V2 chunks', () => {
  const compilationStatistics = createCompilationStatistics();
  compilationStatistics.modules.push({
    nameForCondition: `${PROJECT_ROOT}/src/api/agentV2/runtime.ts`,
    chunks: ['main'],
  });
  compilationStatistics.chunks.find(({ id }) => id === 'agent-v2-host').initial = true;

  assert.deepEqual(getAgentV2BundleBoundaryFailures(compilationStatistics, PROJECT_ROOT), [
    'Agent V2 runtime is present in the initial main graph:\n  /src/api/agentV2/runtime.ts [main]',
    'agent-v2-host must be fully async',
  ]);
});

test('rejects a missing Agent V2 chunk group', () => {
  const compilationStatistics = createCompilationStatistics();
  delete compilationStatistics.namedChunkGroups['agent-v2-ui'];

  assert.deepEqual(getAgentV2BundleBoundaryFailures(compilationStatistics, PROJECT_ROOT), [
    'Missing named chunk group agent-v2-ui',
  ]);
});

test('reads normalized Statoscope modules', () => {
  const compilationStatistics = createCompilationStatistics();
  const modules = compilationStatistics.modules;
  compilationStatistics.modules = modules.map((_, index) => index);
  compilationStatistics.__statoscope = {
    normalization: {
      data: {
        compilations: [{
          data: {
            modules: modules.map((module, index) => [index, module]),
          },
        }],
      },
    },
  };

  assert.deepEqual(getAgentV2BundleBoundaryFailures(compilationStatistics, PROJECT_ROOT), []);
});

function createCompilationStatistics() {
  return {
    namedChunkGroups: {
      main: { chunks: ['main'] },
      'agent-v2-ui': { chunks: ['agent-v2-ui'] },
      'agent-v2-host': { chunks: ['agent-v2-host'] },
    },
    chunks: [
      { id: 'main', initial: true },
      { id: 'agent-v2-ui', initial: false },
      { id: 'agent-v2-host', initial: false },
    ],
    modules: [{
      nameForCondition: `${PROJECT_ROOT}/src/components/agentV2/AgentV2Classic.tsx`,
      chunks: ['agent-v2-ui'],
    }, {
      nameForCondition: `${PROJECT_ROOT}/src/components/agentV2/AgentV2HostContextBridge.tsx`,
      chunks: ['agent-v2-host'],
    }],
  };
}
