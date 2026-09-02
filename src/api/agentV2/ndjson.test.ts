import { buildAgentMarketAnalysisV6Fixture } from './protocol/agentMarketAnalysisTestFixture';
import { AgentV2StreamTransportError, parseAgentV2Ndjson } from './ndjson';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_RUN_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';

describe('parseAgentV2Ndjson', () => {
  it('handles split UTF-8 boundaries and preserves stream binding', async () => {
    const payload = [
      event({ type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1 }),
      event({ type: 'text_delta', sequence: 2, messageId: MESSAGE_ID, delta: 'Привет 👋' }),
    ].map((item) => JSON.stringify(item)).join('\n').concat('\n');
    const bytes = new TextEncoder().encode(payload);
    const emojiOffset = payload.indexOf('👋');
    const split = new TextEncoder().encode(payload.slice(0, emojiOffset)).byteLength + 2;
    const binding: import('./ndjson').AgentV2StreamBinding = {
      clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>(),
    };

    const events = await collect(parseAgentV2Ndjson(stream([bytes.slice(0, split), bytes.slice(split)]), binding));

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: 'text_delta', delta: 'Привет 👋' });
    expect(binding).toMatchObject({ runId: RUN_ID, lastSequence: 2 });
  });

  it('ignores only byte-equivalent replay and rejects gaps or conflicting duplicates', async () => {
    const runStart = JSON.stringify(event({
      type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1,
    }));
    const binding: import('./ndjson').AgentV2StreamBinding = {
      clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>(),
    };
    await collect(parseAgentV2Ndjson(stream([new TextEncoder().encode(`${runStart}\n`)]), binding));

    expect(await collect(parseAgentV2Ndjson(stream([new TextEncoder().encode(`${runStart}\n`)]), binding))).toEqual([]);
    await expect(collect(parseAgentV2Ndjson(stream([new TextEncoder().encode(`${JSON.stringify(event({
      type: 'text_delta', sequence: 3, messageId: MESSAGE_ID, delta: 'gap',
    }))}\n`)]), binding))).rejects.toThrow('sequence gap');
    await expect(collect(parseAgentV2Ndjson(stream([new TextEncoder().encode(`${JSON.stringify({
      ...JSON.parse(runStart), createdAt: '2026-07-16T00:00:00.000Z',
    })}\n`)]), binding))).rejects.toThrow('conflicting duplicate');
  });

  it('commits ignored events while preserving sequence and replay validation', async () => {
    const runStart = event({
      type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1,
    });
    const ignored = event({ type: 'future_optional', sequence: 2, payload: { display: true } });
    const delta = event({ type: 'text_delta', sequence: 3, messageId: MESSAGE_ID, delta: 'after extension' });
    const binding = { clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>() };
    const payload = [runStart, ignored, delta].map((item) => JSON.stringify(item)).join('\n').concat('\n');

    await expect(collect(parseAgentV2Ndjson(
      stream([new TextEncoder().encode(payload)]),
      binding,
    ))).resolves.toEqual([runStart, delta]);
    expect(binding.lastSequence).toBe(3);

    const ignoredLine = JSON.stringify(ignored).concat('\n');
    await expect(collect(parseAgentV2Ndjson(
      stream([new TextEncoder().encode(ignoredLine)]),
      binding,
    ))).resolves.toEqual([]);
    await expect(collect(parseAgentV2Ndjson(
      stream([new TextEncoder().encode(JSON.stringify({ ...ignored, payload: { display: false } }).concat('\n'))]),
      binding,
    ))).rejects.toThrow('conflicting duplicate');
    await expect(collect(parseAgentV2Ndjson(
      stream([new TextEncoder().encode(JSON.stringify({ ...ignored, sequence: 5 }).concat('\n'))]),
      binding,
    ))).rejects.toThrow('sequence gap');
  });

  it('does not allow an ignored event to replace run_start', async () => {
    const binding = { clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>() };

    await expect(collect(parseAgentV2Ndjson(stream([new TextEncoder().encode(JSON.stringify(event({
      type: 'future_optional', sequence: 1,
    })).concat('\n'))]), binding))).rejects.toThrow('did not start with run_start');
    expect(binding.lastSequence).toBe(0);
  });

  it('advances the reconnect cursor only after its consumer accepts an event', async () => {
    const runStart = event({
      type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1,
    });
    const delta = event({ type: 'text_delta', sequence: 2, messageId: MESSAGE_ID, delta: 'retry me' });
    const payload = [runStart, delta].map((item) => JSON.stringify(item)).join('\n').concat('\n');
    const binding = { clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>() };
    const iterator = parseAgentV2Ndjson(stream([new TextEncoder().encode(payload)]), binding);

    await expect(iterator.next()).resolves.toMatchObject({ value: runStart, done: false });
    expect(binding.lastSequence).toBe(0);

    await expect(iterator.next()).resolves.toMatchObject({ value: delta, done: false });
    expect(binding.lastSequence).toBe(1);

    await iterator.return(undefined);
    expect(binding.lastSequence).toBe(1);
    await expect(collect(parseAgentV2Ndjson(
      stream([new TextEncoder().encode(JSON.stringify({ ...delta, delta: 'changed' }).concat('\n'))]),
      binding,
    ))).rejects.toThrow('conflicting duplicate');
    await expect(collect(parseAgentV2Ndjson(
      stream([new TextEncoder().encode(JSON.stringify(delta).concat('\n'))]),
      binding,
    ))).resolves.toEqual([delta]);
  });

  it('retains at most 256 replay lines', async () => {
    const events = [
      event({ type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1 }),
      ...Array.from({ length: 256 }, (_, index) => event({
        type: 'text_delta', sequence: index + 2, messageId: MESSAGE_ID, delta: String(index),
      })),
    ];
    const binding = { clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>() };

    await collect(parseAgentV2Ndjson(stream([
      new TextEncoder().encode(events.map((item) => JSON.stringify(item)).join('\n').concat('\n')),
    ]), binding));

    expect(binding.rawBySequence.size).toBe(256);
    expect(binding.rawBySequence.has(1)).toBe(false);
    expect(binding.rawBySequence.has(257)).toBe(true);
  });

  it('retains at most one MiB of replay lines', async () => {
    const events = [
      event({ type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1 }),
      ...Array.from({ length: 220 }, (_, index) => event({
        type: 'text_delta', sequence: index + 2, messageId: MESSAGE_ID, delta: 'x'.repeat(5000),
      })),
    ];
    const binding: import('./ndjson').AgentV2StreamBinding = {
      clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>(),
    };

    await collect(parseAgentV2Ndjson(stream([
      new TextEncoder().encode(events.map((item) => JSON.stringify(item)).join('\n').concat('\n')),
    ]), binding));

    expect(binding.rawBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(binding.rawBySequence.size).toBeLessThan(220);
  });

  it('accepts semantic events within the 96 KiB content budget', async () => {
    const content = buildAgentMarketAnalysisV6Fixture();
    for (const horizon of ['3d', '7d', '30d'] as const) {
      const levelMap = content.evidence.levelMaps[horizon];
      if (levelMap.status !== 'available') throw new Error('Expected available fixture level map');
      const zones = [...levelMap.supports, ...levelMap.resistances];
      if (levelMap.equilibrium) zones.push(levelMap.equilibrium);
      for (const zone of zones) {
        const source = zone.sources[0];
        if (!source) throw new Error('Expected fixture zone source');
        zone.sources = Array.from({ length: 72 }, () => ({ ...source }));
      }
    }
    const events = [
      event({ type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1 }),
      event({ type: 'semantic_content', sequence: 2, messageId: MESSAGE_ID, content }),
    ];
    const lines = events.map((item) => JSON.stringify(item));
    const encoder = new TextEncoder();

    expect(encoder.encode(JSON.stringify(content)).byteLength).toBeLessThanOrEqual(96 * 1024);
    expect(encoder.encode(lines[1]).byteLength).toBeGreaterThan(64 * 1024);
    await expect(collect(parseAgentV2Ndjson(
      stream([encoder.encode(lines.join('\n').concat('\n'))]),
      { clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>() },
    ))).resolves.toEqual(events);
  });

  it('classifies reader failures as retryable transport failures', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new TypeError('network disconnected'));
      },
    });
    const binding = { clientRunId: CLIENT_RUN_ID, lastSequence: 0, rawBySequence: new Map<number, string>() };

    await expect(collect(parseAgentV2Ndjson(body, binding))).rejects.toBeInstanceOf(AgentV2StreamTransportError);
  });
});

function event(extra: Record<string, unknown>) {
  return { protocolVersion: 2, runId: RUN_ID, ...extra };
}

function stream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

async function collect<T>(events: AsyncGenerator<T>) {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}
