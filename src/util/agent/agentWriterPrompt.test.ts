const ENABLED_STORAGE_KEY = 'agentV2WriterPromptEnabled';
const VALUE_STORAGE_KEY = 'agentV2WriterPrompt';

beforeEach(() => {
  jest.resetModules();
  sessionStorage.clear();
  window.history.replaceState(undefined, '', '/');
});

describe('Agent V2 Writer prompt activation', () => {
  it('enables the staging editor for the query session and preserves unrelated URL state', () => {
    window.history.replaceState(undefined, '', '/wallet?agentWriterPrompt=1&r=team#agent');
    const writerPrompt = loadWriterPrompt({ appEnv: 'staging' });

    writerPrompt.initAgentWriterPrompt();
    const applied = writerPrompt.applyAgentV2CustomWriterInstruction('  Be concise.\r\nUse bullets.  ');

    expect(writerPrompt.isAgentWriterPromptEditorEnabled()).toBe(true);
    expect(applied).toBe('Be concise.\nUse bullets.');
    expect(writerPrompt.getAppliedAgentV2CustomWriterInstruction()).toBe(applied);
    expect(sessionStorage.getItem(ENABLED_STORAGE_KEY)).toBe('1');
    expect(sessionStorage.getItem(VALUE_STORAGE_KEY)).toBe(applied);
    expect(window.location.pathname).toBe('/wallet');
    expect(window.location.search).toBe('?r=team');
    expect(window.location.hash).toBe('#agent');
  });

  it('restores the applied instruction for another initialization in the same tab', () => {
    sessionStorage.setItem(ENABLED_STORAGE_KEY, '1');
    sessionStorage.setItem(VALUE_STORAGE_KEY, 'Use short paragraphs.');
    const writerPrompt = loadWriterPrompt({ appEnv: 'development' });

    writerPrompt.initAgentWriterPrompt();

    expect(writerPrompt.isAgentWriterPromptEditorEnabled()).toBe(true);
    expect(writerPrompt.getAppliedAgentV2CustomWriterInstruction()).toBe('Use short paragraphs.');
  });

  it('disables the tool and clears the applied instruction with query value zero', () => {
    sessionStorage.setItem(ENABLED_STORAGE_KEY, '1');
    sessionStorage.setItem(VALUE_STORAGE_KEY, 'Use short paragraphs.');
    window.history.replaceState(undefined, '', '/?agentWriterPrompt=0');
    const writerPrompt = loadWriterPrompt({ appEnv: 'staging' });

    writerPrompt.initAgentWriterPrompt();

    expect(writerPrompt.isAgentWriterPromptEditorEnabled()).toBe(false);
    expect(writerPrompt.getAppliedAgentV2CustomWriterInstruction()).toBeUndefined();
    expect(sessionStorage.getItem(VALUE_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('fails closed and clears stale session state in production', () => {
    sessionStorage.setItem(ENABLED_STORAGE_KEY, '1');
    sessionStorage.setItem(VALUE_STORAGE_KEY, 'Use short paragraphs.');
    window.history.replaceState(undefined, '', '/?agentWriterPrompt=1');
    const writerPrompt = loadWriterPrompt({ appEnv: 'production' });

    writerPrompt.initAgentWriterPrompt();

    expect(writerPrompt.isAgentWriterPromptEditorEnabled()).toBe(false);
    expect(sessionStorage.getItem(ENABLED_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(VALUE_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('does not consume the Web query outside the Web app', () => {
    window.history.replaceState(undefined, '', '/?agentWriterPrompt=1');
    const writerPrompt = loadWriterPrompt({ appEnv: 'staging', isWeb: false });

    writerPrompt.initAgentWriterPrompt();

    expect(writerPrompt.isAgentWriterPromptEditorEnabled()).toBe(false);
    expect(window.location.search).toBe('?agentWriterPrompt=1');
  });
});

function loadWriterPrompt({
  appEnv,
  isWeb = true,
}: {
  appEnv: string;
  isWeb?: boolean;
}) {
  jest.doMock('../../config', () => ({ APP_ENV: appEnv }));
  jest.doMock('../windowEnvironment', () => ({ IS_WEB: isWeb }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const writerPrompt = require('./agentWriterPrompt') as typeof import('./agentWriterPrompt');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const writerPromptState = require('./agentWriterPromptState') as typeof import('./agentWriterPromptState');
  return { ...writerPrompt, ...writerPromptState };
}
