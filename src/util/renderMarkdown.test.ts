import renderMarkdown, { renderDeterministicMarkdownTable } from './renderMarkdown';

describe('renderMarkdown', () => {
  const text = [
    '[Open site](https://example.com)',
    'https://example.org',
    '[Receive](mtw://receive)',
  ].join('\n');

  it('keeps V1 links and actions interactive', () => {
    const result = renderMarkdown(text, { areLinksEnabled: true, profile: 'legacy' });

    expect(result.html).toContain('<a href="https://example.com"');
    expect(result.html).toContain('<a href="https://example.org"');
    expect(result.buttons).toEqual([{ label: 'Receive', url: 'mtw://receive' }]);
  });

  it('renders V2 links and actions as passive text', () => {
    const result = renderMarkdown(text, { areLinksEnabled: false, profile: 'legacy' });

    expect(result.html).not.toContain('<a ');
    expect(result.html).toContain('Open site (https://example.com)');
    expect(result.html).toContain('https://example.org');
    expect(result.html).toContain('Receive');
    expect(result.buttons).toEqual([]);
  });

  it('renders the restrained Agent V2 profile without widening V1 syntax', () => {
    const result = renderMarkdown([
      'Wallet **warning:** keep `GRAM` for fees.',
      '',
      '- First item',
      '- Second *item*',
      '',
      '1. Verify the address',
      '2. Review the fee',
      '',
      '```javascript',
      'const html = "<script>safe</script>";',
      '```',
    ].join('\n'), { areLinksEnabled: false, profile: 'agentV2' });

    expect(result.html).toContain('<strong>warning:</strong>');
    expect(result.html).toContain('<code>GRAM</code>');
    expect(result.html).toContain('<ul><li>First item</li><li>Second <em>item</em></li></ul>');
    expect(result.html).toContain('<ol><li>Verify the address</li><li>Review the fee</li></ol>');
    expect(result.html).toContain('<pre data-language="javascript"><code>');
    expect(result.html).toContain('&lt;script&gt;safe&lt;/script&gt;');
    expect(result.html).not.toContain('<script>');
  });

  it('renders blank-line-separated Agent V2 prose as semantic paragraph blocks', () => {
    const result = renderMarkdown(
      'The transfer is ready for review.\n\nConfirm the address before signing.',
      { areLinksEnabled: false, profile: 'agentV2' },
    );

    expect(result.html).toBe(
      '<p>The transfer is ready for review.</p><p>Confirm the address before signing.</p>',
    );
  });

  it('renders escaped signs from grounded Agent V2 values without leaking backslashes', () => {
    const result = renderMarkdown(
      String.raw`Daily changes: \+1\.62% and \-2\.01%.`,
      { areLinksEnabled: false, profile: 'agentV2' },
    );

    expect(result.html).toBe('<p>Daily changes: +1.62% and -2.01%.</p>');
  });

  it('keeps a single Agent V2 prose line break inside one paragraph', () => {
    const result = renderMarkdown(
      'The transfer is ready for review.\nConfirm the address before signing.',
      { areLinksEnabled: false, profile: 'agentV2' },
    );

    expect(result.html).toBe(
      '<p>The transfer is ready for review. Confirm the address before signing.</p>',
    );
  });

  it('keeps unsupported and incomplete Agent V2 Markdown readable and passive', () => {
    const result = renderMarkdown([
      '# Unsupported heading',
      '> Unsupported quote',
      '<img src=x onerror=alert(1)>',
      '**unfinished',
      'Literal %%AGENT_INLINE_CODE_42%% token',
      '[Source](https://example.com/path_with_value)',
      '[Receive](mtw://receive)',
    ].join('\n'), { areLinksEnabled: false, profile: 'agentV2' });

    expect(result.html).toContain('# Unsupported heading');
    expect(result.html).toContain('&gt; Unsupported quote');
    expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.html).not.toContain('<img ');
    expect(result.html).toContain('**unfinished');
    expect(result.html).toContain('%%AGENT_INLINE_CODE_42%%');
    expect(result.html).toContain('Source (https://example.com/path_with_value)');
    expect(result.html).toContain('Receive');
    expect(result.html).not.toContain('<a ');
    expect(result.buttons).toEqual([]);
  });

  it('renders deterministic and grounded Agent V2 Markdown tables safely', () => {
    const markdown = [
      '| Wallet | Balance | Status |',
      '| --- | --- | --- |',
      String.raw`| Main \| **literal** \<script\> | $10 | View only |`,
    ].join('\n');
    const deterministic = renderDeterministicMarkdownTable(markdown);
    const modelAuthored = renderMarkdown(markdown, { areLinksEnabled: false, profile: 'agentV2' });

    expect(deterministic.html).toContain('<table>');
    expect(deterministic.html).toContain('<td>Main | **literal** &lt;script&gt;</td>');
    expect(deterministic.html).not.toContain('<script>');
    expect(modelAuthored.html).toContain('<table>');
    expect(modelAuthored.html).toContain(
      '<td>Main | <strong>literal</strong> &lt;script&gt;</td>',
    );
    expect(modelAuthored.html).not.toContain('<script>');
  });

  it('keeps malformed Agent V2 table syntax as escaped prose', () => {
    const result = renderMarkdown([
      '| Wallet | Balance |',
      '| -- | --- |',
      '| <img src=x onerror=alert(1)> | 10 USD |',
    ].join('\n'), { areLinksEnabled: false, profile: 'agentV2' });

    expect(result.html).not.toContain('<table>');
    expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.html).not.toContain('<img ');
  });
});
