import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist');
const FIXED_TIME = '2026-08-11T09:00:00.000Z';
const THREAD_ID = '44444444-4444-4444-8444-444444444444';
const WALLET_SESSION_ID = '77777777-7777-4777-8777-777777777777';
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
let state = createState();
const pendingResponses = new Set();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1:1235'}`);
    const body = await readJsonBody(request);

    if (url.pathname.startsWith('/__agent-v2-control/')) {
      handleControlRequest(request, response, url, body);
      return;
    }

    if (url.pathname.startsWith('/api/v2/')) {
      handleAgentRequest(request, response, url, body);
      return;
    }

    if (url.pathname === '/__agent-v2-seed') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body>Agent V2 E2E seed</body></html>');
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(1235, '127.0.0.1', () => {
  process.stdout.write('Agent V2 E2E server listening at http://127.0.0.1:1235\n');
});

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);

function createState(scenario = 'conversation') {
  return {
    scenario,
    requests: [],
    runBodies: [],
    cancelBodies: [],
    clearBodies: [],
    runCount: 0,
    quotaRequestCount: 0,
    wasQuotaDenied: false,
    revision: 1,
    messages: scenario === 'pagination' ? createLatestMessages() : [],
    olderMessages: scenario === 'pagination' ? createOlderMessages() : [],
  };
}

function handleControlRequest(request, response, url, body) {
  if (request.method === 'POST' && url.pathname === '/__agent-v2-control/reset') {
    releasePendingResponses();
    state = createState(typeof body?.scenario === 'string' ? body.scenario : 'conversation');
    writeJson(response, 200, publicState());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/__agent-v2-control/state') {
    writeJson(response, 200, publicState());
    return;
  }

  writeJson(response, 404, { error: 'Unknown Agent V2 E2E control endpoint.' });
}

function handleAgentRequest(request, response, url, body) {
  state.requests.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    ...(body === undefined ? {} : { body }),
  });

  if (request.method === 'POST' && url.pathname === '/api/v2/device-token') {
    writeJson(response, 200, {
      protocolVersion: 2,
      deviceId: body.deviceId,
      deviceToken: `adt_v2.${'a'.repeat(43)}`,
      expiresAt: '2099-08-11T09:00:00.000Z',
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/v2/hints') {
    writeJson(response, 200, {
      protocolVersion: 2,
      catalogVersion: 'agent-starter-hints-v1',
      items: [],
      serverCapabilities: { webSearch: 'disabled' },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/v2/capabilities') {
    writeJson(response, 200, {
      protocolVersion: 2,
      portfolioPositions: 'disabled',
      walletQuery: 'disabled',
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/v2/availability') {
    writeJson(response, 200, state.scenario === 'capacity-error' && state.runCount > 0
      ? {
        protocolVersion: 2,
        state: 'capacity_exhausted',
        resetAt: '2099-08-12T09:00:00.000Z',
      }
      : { protocolVersion: 2, state: 'available' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/v2/quota') {
    state.quotaRequestCount += 1;
    writeJson(response, 200, { protocolVersion: 2, quota: getQuota() });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/v2/threads/default') {
    writeJson(response, 200, { protocolVersion: 2, thread: threadSummary(), created: false });
    return;
  }

  if (request.method === 'GET' && url.pathname === `/api/v2/threads/${THREAD_ID}`) {
    writeJson(response, 200, { protocolVersion: 2, thread: threadSummary() });
    return;
  }

  if (request.method === 'GET' && url.pathname === `/api/v2/threads/${THREAD_ID}/messages`) {
    const isOlderPage = url.searchParams.get('cursor') === 'older';
    const messages = isOlderPage ? state.olderMessages : state.messages;
    writeJson(response, 200, {
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages,
      ...(!isOlderPage && state.olderMessages.length ? { nextCursor: 'older' } : {}),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === `/api/v2/threads/${THREAD_ID}/clear`) {
    state.clearBodies.push(body);
    state.messages = [];
    state.olderMessages = [];
    state.revision += 1;
    writeJson(response, 200, { protocolVersion: 2, thread: threadSummary(), duplicate: false });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/v2/runs') {
    handleRun(response, body);
    return;
  }

  const cancelMatch = url.pathname.match(/^\/api\/v2\/runs\/([^/]+)\/cancel$/u);
  if (request.method === 'POST' && cancelMatch) {
    state.cancelBodies.push({ runId: cancelMatch[1], body });
    if (state.scenario === 'hanging-run') {
      holdResponse(response);
      return;
    }
    writeJson(response, 200, {
      protocolVersion: 2,
      runId: cancelMatch[1],
      state: 'cancelled',
      lastSequence: 3,
    });
    return;
  }

  writeJson(response, 404, {
    protocolVersion: 2,
    error: { code: 'invalid_request', retryable: false },
  });
}

function handleRun(response, body) {
  state.runCount += 1;
  state.runBodies.push(body);

  if (state.scenario === 'quota-retry' && state.runCount === 1) {
    state.wasQuotaDenied = true;
    writeJson(response, 429, {
      protocolVersion: 2,
      error: {
        code: 'user_quota_exhausted',
        retryable: true,
        resetAt: '2099-08-12T09:00:00.000Z',
        quota: exhaustedQuota(),
      },
    });
    return;
  }

  if (state.scenario === 'admission-retry' && state.runCount <= 3) {
    writeJson(response, 503, {
      protocolVersion: 2,
      error: {
        code: 'provider_unavailable',
        retryable: true,
      },
    });
    return;
  }

  if (state.scenario === 'terminal-action-error' && state.runCount > 1 && state.runCount <= 4) {
    writeJson(response, 503, {
      protocolVersion: 2,
      error: {
        code: 'provider_unavailable',
        retryable: true,
      },
    });
    return;
  }

  const runId = uuid(100 + state.runCount);
  const messageId = uuid(200 + state.runCount);
  const userMessage = body.input?.message;
  const answerDeltas = getAnswerDeltas(userMessage?.text);
  const answerText = answerDeltas.join('');
  const activityEvents = state.scenario === 'run-activity' ? [
    event(runId, { type: 'run_activity', sequence: 2, code: 'request.planning', status: 'active' }),
    event(runId, { type: 'run_activity', sequence: 3, code: 'request.planning', status: 'completed' }),
    event(runId, { type: 'run_activity', sequence: 4, code: 'web.searching', status: 'active' }),
    event(runId, { type: 'run_activity', sequence: 5, code: 'web.searching', status: 'completed' }),
    event(runId, { type: 'run_activity', sequence: 6, code: 'web.reading_sources', status: 'active' }),
    event(runId, {
      type: 'run_activity',
      sequence: 7,
      code: 'web.reading_sources',
      status: 'completed',
      detail: { kind: 'source_count', count: 4 },
    }),
    event(runId, { type: 'run_activity', sequence: 8, code: 'answer.writing', status: 'active' }),
  ] : [];
  const messageStartSequence = activityEvents.length + 2;
  const baseEvents = [
    event(runId, {
      type: 'run_start',
      sequence: 1,
      clientRunId: body.clientRunId,
      threadId: THREAD_ID,
      threadRevision: state.revision,
    }),
    ...activityEvents,
    event(runId, {
      type: 'message_start',
      sequence: messageStartSequence,
      messageId,
      role: 'assistant',
      contentKind: 'markdown',
    }),
    ...answerDeltas.map((delta, index) => event(runId, {
      type: 'text_delta',
      sequence: index + messageStartSequence + 1,
      messageId,
      delta,
    })),
  ];

  if (state.scenario === 'hanging-run') {
    writeNdjsonHeaders(response);
    baseEvents.forEach((item) => response.write(`${JSON.stringify(item)}\n`));
    holdResponse(response);
    return;
  }

  if (state.scenario === 'terminal-action-error') {
    persistFailedRun(userMessage, messageId, runId, answerText, {
      code: 'provider_error',
      retryable: true,
    });
    writeNdjson(response, [
      ...baseEvents,
      actionEvent(runId, messageId, 4, receiveAction(body)),
      event(runId, {
        type: 'error',
        sequence: 5,
        messageId,
        code: 'provider_error',
        retryable: true,
      }),
      actionEvent(runId, messageId, 6, openUrlAction()),
      event(runId, { type: 'thread', sequence: 7, thread: nextThreadSummary(2) }),
      event(runId, { type: 'message_end', sequence: 8, messageId, finishReason: 'complete' }),
    ]);
    return;
  }

  if (state.scenario === 'capacity-error') {
    const error = {
      code: 'agent_capacity_exhausted',
      retryable: true,
      resetAt: '2099-08-12T09:00:00.000Z',
    };
    persistFailedRun(userMessage, messageId, runId, answerText, error);
    writeNdjson(response, [
      ...baseEvents,
      event(runId, {
        type: 'error',
        sequence: answerDeltas.length + messageStartSequence + 1,
        messageId,
        ...error,
      }),
    ]);
    return;
  }

  const extraEvents = [];
  let sequence = answerDeltas.length + messageStartSequence + 1;
  if (state.scenario === 'continuation' && state.runCount === 1) {
    extraEvents.push(event(runId, {
      type: 'input_continuations',
      sequence: sequence++,
      messageId,
      items: [{
        id: 'continuation-amount',
        kind: 'collect_input',
        code: 'prepare_send_amount',
        scenario: 'prepare-send',
        field: 'amount',
      }],
      createdAt: FIXED_TIME,
    }));
  }
  if (state.scenario === 'receive-navigation') {
    extraEvents.push(actionEvent(runId, messageId, sequence++, receiveAction(body)));
    extraEvents.push(actionEvent(runId, messageId, sequence++, openUrlAction()));
  }

  state.revision += 1;
  const events = [
    ...baseEvents,
    ...extraEvents,
    event(runId, { type: 'thread', sequence: sequence++, thread: threadSummary(2) }),
    event(runId, { type: 'message_end', sequence, messageId, finishReason: 'complete' }),
  ];
  persistCompletedRun(userMessage, messageId, runId, answerText, extraEvents);
  writeNdjsonSlowly(response, events, state.scenario === 'run-activity' ? 650 : 150);
}

function persistCompletedRun(userMessage, messageId, runId, answerText, extraEvents) {
  if (userMessage?.id && userMessage.text) {
    state.messages.push({
      id: userMessage.id,
      threadId: THREAD_ID,
      role: 'user',
      status: 'complete',
      content: { kind: 'markdown', text: userMessage.text },
      createdAt: FIXED_TIME,
      runId,
    });
  }

  const actions = extraEvents
    .filter((item) => item.type === 'action')
    .map((item) => projectPersistedAction(item.action));
  const inputContinuations = extraEvents
    .filter((item) => item.type === 'input_continuations')
    .flatMap((item) => item.items);
  const followups = extraEvents
    .filter((item) => item.type === 'followups')
    .flatMap((item) => item.items);
  state.messages.push({
    id: messageId,
    threadId: THREAD_ID,
    role: 'assistant',
    status: 'complete',
    content: { kind: 'markdown', text: answerText },
    createdAt: FIXED_TIME,
    runId,
    ...(actions.length ? { actions } : {}),
    ...(inputContinuations.length ? { inputContinuations } : {}),
    ...(followups.length ? { followups } : {}),
  });
}

function persistFailedRun(userMessage, messageId, runId, answerText, error) {
  if (userMessage?.id && userMessage.text) {
    state.messages.push({
      id: userMessage.id,
      threadId: THREAD_ID,
      role: 'user',
      status: 'complete',
      content: { kind: 'markdown', text: userMessage.text },
      createdAt: FIXED_TIME,
      runId,
    });
  }

  state.messages.push({
    id: messageId,
    threadId: THREAD_ID,
    role: 'assistant',
    status: 'error',
    content: { kind: 'markdown', text: answerText },
    createdAt: FIXED_TIME,
    runId,
    error,
  });
}

function projectPersistedAction(action) {
  switch (action.kind) {
    case 'receive':
      return {
        id: action.id,
        kind: action.kind,
        labelCode: action.labelCode,
        effect: action.effect,
        localDraftRequired: action.localDraftRequired,
        requiresConfirmation: action.requiresConfirmation,
      };
    case 'openUrl':
      return { ...action, schemaVersion: 3 };
    default:
      throw new Error(`Unsupported Agent action: ${action.kind}`);
  }
}

function receiveAction(runBody) {
  const walletContext = runBody.walletContext;
  return {
    id: uuid(301),
    kind: 'receive',
    labelCode: 'open_receive',
    effect: 'open_receive',
    contextBinding: {
      sessionId: walletContext?.sessionId ?? WALLET_SESSION_ID,
      revision: walletContext?.revision ?? 1,
      activeAccountRef: walletContext?.activeAccount?.accountRef ?? 'current',
      activeNetwork: walletContext?.activeNetwork ?? 'ton',
    },
    localDraftRequired: false,
    requiresConfirmation: false,
  };
}

function openUrlAction() {
  return {
    id: uuid(302),
    kind: 'openUrl',
    labelCode: 'open_external_link',
    url: 'https://example.com/agent-v2-action',
    requiresConfirmation: true,
  };
}

function actionEvent(runId, messageId, sequence, action) {
  return event(runId, { type: 'action', sequence, messageId, action });
}

function event(runId, value) {
  return { protocolVersion: 2, runId, ...value };
}

function getAnswerDeltas(text) {
  return [getAnswerText(text)];
}

function getAnswerText(text) {
  if (state.scenario === 'continuation' && state.runCount === 1) return 'How much TON should I prepare?';
  if (state.scenario === 'continuation') return `Continuation accepted: ${text}`;
  if (state.scenario === 'quota-retry') return `Quota request completed: ${text}`;
  if (state.scenario === 'admission-retry') return `Recovered response: ${text}`;
  if (state.scenario === 'receive-navigation') return 'Choose a wallet action.';
  if (state.scenario === 'terminal-action-error') return 'This response will fail.';
  if (state.scenario === 'capacity-error') return 'A partial response was started.';
  if (state.scenario === 'hanging-run') return 'Partial response that must not cross accounts.';
  return `Deterministic response: ${text}`;
}

function getQuota() {
  if (state.wasQuotaDenied && state.quotaRequestCount === 1) return exhaustedQuota();
  return {
    limit: 20,
    used: Math.min(state.runCount, 20),
    remaining: Math.max(0, 20 - state.runCount),
    resetAt: '2099-08-12T09:00:00.000Z',
  };
}

function exhaustedQuota() {
  return {
    limit: 20,
    used: 20,
    remaining: 0,
    resetAt: '2026-08-12T09:00:00.000Z',
  };
}

function threadSummary(messageIncrement = 0) {
  return {
    id: THREAD_ID,
    revision: state.revision,
    metadataRevision: 1,
    titleSource: 'none',
    isPinned: false,
    isDefault: true,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    lastActivityAt: FIXED_TIME,
    messageCount: state.messages.length + messageIncrement,
  };
}

function nextThreadSummary(messageIncrement) {
  return { ...threadSummary(messageIncrement), revision: state.revision + 1 };
}

function createLatestMessages() {
  return [
    persistedMessage(21, 'user', 'Latest seeded question'),
    persistedMessage(22, 'assistant', 'Latest seeded answer'),
  ];
}

function createOlderMessages() {
  return [
    persistedMessage(11, 'user', 'Oldest seeded question'),
    persistedMessage(12, 'assistant', 'Oldest seeded answer'),
  ];
}

function persistedMessage(id, role, text) {
  return {
    id: uuid(id),
    threadId: THREAD_ID,
    role,
    status: 'complete',
    content: { kind: 'markdown', text },
    createdAt: FIXED_TIME,
  };
}

function uuid(value) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function publicState() {
  return {
    scenario: state.scenario,
    requests: state.requests,
    runBodies: state.runBodies,
    cancelBodies: state.cancelBodies,
    clearBodies: state.clearBodies,
    runCount: state.runCount,
    quotaRequestCount: state.quotaRequestCount,
    messageHydrations: state.messageHydrations,
    revision: state.revision,
    messages: state.messages,
    olderMessages: state.olderMessages,
    pendingResponseCount: pendingResponses.size,
  };
}

async function readJsonBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return undefined;

  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function writeNdjson(response, events) {
  writeNdjsonHeaders(response);
  response.end(`${events.map((item) => JSON.stringify(item)).join('\n')}\n`);
}

async function writeNdjsonSlowly(response, events, delayMs) {
  writeNdjsonHeaders(response);
  for (const item of events) {
    response.write(`${JSON.stringify(item)}\n`);
    await wait(delayMs);
  }
  response.end();
}

function writeNdjsonHeaders(response) {
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
  });
}

function holdResponse(response) {
  pendingResponses.add(response);
  response.once('close', () => pendingResponses.delete(response));
}

function releasePendingResponses() {
  pendingResponses.forEach((response) => response.destroy());
  pendingResponses.clear();
}

function serveStatic(response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = join(DIST_DIR, safePath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = join(DIST_DIR, 'index.html');

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function closeServer() {
  releasePendingResponses();
  server.close(() => process.exit(0));
}
