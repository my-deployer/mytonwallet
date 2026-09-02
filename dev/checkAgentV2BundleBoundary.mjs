import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_ASYNC_CHUNK_GROUPS = ['agent-v2-ui', 'agent-v2-host'];
const AGENT_V2_RUNTIME_PATTERNS = [
  '/src/api/agentV2/',
  '/src/components/agentV2/',
  '/src/components/agent/hooks/agentV2',
  '/src/components/agent/hooks/useAgentV2Messages.ts',
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkAgentV2BundleBoundary();
}

export function getAgentV2BundleBoundaryFailures(compilationStatistics, projectRoot = PROJECT_ROOT) {
  const failures = [];
  const modules = readCompilationModules(compilationStatistics, projectRoot);
  const mainChunkIds = getChunkGroupIds(compilationStatistics, 'main', failures);
  const initialAgentV2Modules = findModules(modules, AGENT_V2_RUNTIME_PATTERNS).filter(({ chunkIds }) => (
    intersects(chunkIds, mainChunkIds)
  ));

  if (initialAgentV2Modules.length) {
    failures.push(`Agent V2 runtime is present in the initial main graph:\n${formatModules(initialAgentV2Modules)}`);
  }

  for (const chunkGroupName of REQUIRED_ASYNC_CHUNK_GROUPS) {
    checkChunkGroupIsAsync(compilationStatistics, chunkGroupName, failures);
  }

  return failures;
}

function checkAgentV2BundleBoundary() {
  const statisticsPath = readOption('--stats');
  if (!statisticsPath) throw new Error('Pass --stats <stats.json>');

  const compilationStatistics = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, statisticsPath), 'utf8'));
  const failures = getAgentV2BundleBoundaryFailures(compilationStatistics);
  if (failures.length) {
    throw new Error(`Agent V2 bundle boundary check failed:\n- ${failures.join('\n- ')}`);
  }

  console.log('Agent V2 bundle boundary check passed');
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readCompilationModules(compilationStatistics, projectRoot) {
  const normalizedCompilations = compilationStatistics.__statoscope?.normalization?.data?.compilations;
  if (!Array.isArray(normalizedCompilations)) {
    return flattenModules(compilationStatistics.modules ?? [], projectRoot);
  }

  const normalizedCompilation = normalizedCompilations.find(({ data }) => (
    data.modules?.length === compilationStatistics.modules?.length
  ));
  if (!normalizedCompilation) throw new Error('Cannot resolve normalized Statoscope modules');

  const moduleByIdentifier = new Map(normalizedCompilation.data.modules);
  const rootModules = compilationStatistics.modules
    .map((moduleIdentifier) => moduleByIdentifier.get(moduleIdentifier))
    .filter(Boolean);
  return flattenModules(rootModules, projectRoot);
}

function flattenModules(rootModules, projectRoot) {
  const modules = [];
  const seenModules = new Set();

  for (const rootModule of rootModules) visitModule(rootModule, []);
  return modules;

  function visitModule(module, inheritedChunkIds) {
    if (!module || typeof module !== 'object') return;

    const chunkIds = module.chunks?.length ? module.chunks : inheritedChunkIds;
    const name = normalizeModuleName(
      module.nameForCondition || module.name || module.identifier || '',
      projectRoot,
    );
    const moduleKey = `${name}|${chunkIds.join(',')}`;
    if (name && !seenModules.has(moduleKey)) {
      seenModules.add(moduleKey);
      modules.push({ name, chunkIds });
    }
    for (const childModule of module.modules ?? []) visitModule(childModule, chunkIds);
  }
}

function normalizeModuleName(name, projectRoot) {
  return name.replaceAll('\\', '/').replace(projectRoot.replaceAll('\\', '/'), '');
}

function findModules(modules, patterns) {
  return modules.filter(({ name }) => patterns.some((pattern) => name.includes(pattern)));
}

function getChunkGroupIds(compilationStatistics, name, failures) {
  const group = compilationStatistics.namedChunkGroups?.[name];
  if (!group) {
    failures.push(`Missing named chunk group ${name}`);
    return new Set();
  }
  return new Set(group.chunks ?? []);
}

function checkChunkGroupIsAsync(compilationStatistics, name, failures) {
  const chunkIds = getChunkGroupIds(compilationStatistics, name, failures);
  if (!chunkIds.size) return;

  const chunks = (compilationStatistics.chunks ?? []).filter((chunk) => chunkIds.has(chunk.id));
  const areAllChunksAsync = chunks.length === chunkIds.size && chunks.every((chunk) => !chunk.initial);
  if (!areAllChunksAsync) failures.push(`${name} must be fully async`);
}

function intersects(left, right) {
  return left.some((value) => right.has(value));
}

function formatModules(modules) {
  return modules.map(({ name, chunkIds }) => `  ${name} [${chunkIds.join(', ')}]`).join('\n');
}
