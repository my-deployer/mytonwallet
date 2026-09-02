import { SELF_PROTOCOL } from './deeplink/constants';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ActionButton {
  label: string;
  url: string;
}

export type MarkdownProfile = 'agentV2' | 'legacy';

interface ParseMarkdownActionsOptions {
  areLinksEnabled: boolean;
  shouldBufferIncompleteAction?: boolean;
}

export interface RenderMarkdownOptions extends ParseMarkdownActionsOptions {
  profile: MarkdownProfile;
}

interface ParsedMarkdownActions {
  buttons: ActionButton[];
  renderableText: string;
}

interface RenderedMarkdown extends ParsedMarkdownActions {
  html: string;
}

export function renderDeterministicMarkdownTable(text: string): RenderedMarkdown {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Invalid deterministic Markdown table');
  const rows = lines.map(parseDeterministicTableRow);
  const columnCount = rows[0].length;
  if (columnCount === 0
    || rows.some((row) => row.length !== columnCount)
    || rows[1].some((cell) => !/^:?-{3,}:?$/u.test(cell))) {
    throw new Error('Invalid deterministic Markdown table');
  }
  const header = rows[0].map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join('');
  const body = rows.slice(2).map((row) => (
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  )).join('');
  return {
    html: `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`,
    buttons: [],
    renderableText: text,
  };
}

function parseDeterministicTableRow(row: string) {
  if (!row.startsWith('|') || !row.endsWith('|')) {
    throw new Error('Invalid deterministic Markdown table');
  }
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of row.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

const ACTION_LINK_PATTERN = new RegExp(`\\[([^\\]]+)\\]\\((${SELF_PROTOCOL}[^)]+)\\)`, 'g');

export function parseMarkdownActions(
  text: string,
  { areLinksEnabled, shouldBufferIncompleteAction = false }: ParseMarkdownActionsOptions,
): ParsedMarkdownActions {
  const buttons: ActionButton[] = [];

  let renderableText = text.replace(
    ACTION_LINK_PATTERN,
    (_match, label: string, url: string) => {
      if (!areLinksEnabled) return label;
      buttons.push({ label, url });
      return '';
    },
  );
  if (shouldBufferIncompleteAction) {
    renderableText = removeIncompleteAction(renderableText);
  }

  return { buttons, renderableText };
}

export default function renderMarkdown(
  text: string,
  options: RenderMarkdownOptions,
): RenderedMarkdown {
  const { areLinksEnabled, profile } = options;
  if (profile === 'agentV2') {
    return {
      ...renderAgentV2Markdown(text),
      renderableText: text,
    };
  }

  const { buttons, renderableText } = parseMarkdownActions(text, options);

  // Convert [label](https://...) to placeholder before escaping
  const links: { label: string; url: string }[] = [];
  const processed = renderableText.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_match, label: string, url: string) => {
      if (!areLinksEnabled) return `${label} (${url})`;
      links.push({ label, url });
      return `%%LINK_${links.length - 1}%%`;
    },
  );

  // Escape HTML to prevent XSS
  let html = escapeHtml(processed);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${code.trimEnd()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings → bold
  html = html.replace(/^#{1,6} (.+)$/gm, '<strong>$1</strong>');

  // Unordered lists — convert items, collapse blank lines between them, then wrap
  html = html.replace(/^- (.+)$/gm, '<ul-li>$1</ul-li>');
  html = html.replace(/((?:<ul-li>.*<\/ul-li>\n?)(?:\n*<ul-li>.*<\/ul-li>\n?)*)/g, (block) => {
    const items = block.match(/<ul-li>.*<\/ul-li>/g)!;
    return `<ul>${items.map((item) => item.replace(/<\/?ul-li>/g, (tag) => tag.replace('ul-li', 'li'))).join('')}</ul>`;
  });

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<ol-li>$1</ol-li>');
  html = html.replace(/((?:<ol-li>.*<\/ol-li>\n?)(?:\n*<ol-li>.*<\/ol-li>\n?)*)/g, (block) => {
    const items = block.match(/<ol-li>.*<\/ol-li>/g)!;
    return `<ol>${items.map((item) => item.replace(/<\/?ol-li>/g, (tag) => tag.replace('ol-li', 'li'))).join('')}</ol>`;
  });

  // Tables
  html = html.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n');
      const headerRow = rows[0];
      const isSeparator = (row: string) => /^\|[\s:|-]+\|$/.test(row);
      const hasSeparator = rows.length > 1 && isSeparator(rows[1]);
      const dataRows = hasSeparator ? rows.slice(2) : rows.slice(1);

      const parseCells = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());

      let result = '<table>';
      if (hasSeparator) {
        result += `<thead><tr>${parseCells(headerRow).map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
      } else {
        dataRows.unshift(headerRow);
      }
      result += '<tbody>';
      for (const row of dataRows) {
        result += `<tr>${parseCells(row).map((c) => `<td>${c}</td>`).join('')}</tr>`;
      }
      result += '</tbody></table>';
      return result;
    },
  );

  // Restore placeholders inside code blocks to original escaped text (not clickable links)
  html = html.replace(/<code>([\s\S]*?)<\/code>/g, (codeBlock) => {
    return codeBlock.replace(/%%LINK_(\d+)%%/g, (_m, index: string) => {
      const link = links[Number(index)];
      return link ? `[${escapeHtml(link.label)}](${escapeHtml(link.url)})` : '';
    });
  });

  // Restore markdown links (after all structural transforms to prevent XSS via list/table injection)
  html = html.replace(/%%LINK_(\d+)%%/g, (_match, index: string) => {
    const link = links[Number(index)];
    return link
      ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
      : '';
  });
  // Safety-net: remove any surviving placeholders
  html = html.replace(/%%LINK_\d+%%/g, '');

  // Auto-link bare URLs (skip those already inside <a> tags)
  if (areLinksEnabled) {
    html = html.replace(
      /(?:<a\b[^>]*>.*?<\/a>)|(?:href="[^"]*")|(https:\/\/[^\s<]+)/g,
      (match, url?: string) => {
        if (!url) return match;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      },
    );
  }

  // Wrap remaining text lines into paragraphs
  html = html
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^<(pre|ul|ol|table)/.test(trimmed)) return trimmed;
      if (/<\/(pre|ul|ol|table)>$/.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join('');

  return { html, buttons, renderableText };
}

function renderAgentV2Markdown(text: string): { html: string; buttons: ActionButton[] } {
  const trailingInlineWhitespace = text.match(/[^\S\r\n]+$/u)?.[0] ?? '';
  const codeBlocks: string[] = [];
  const withCodePlaceholders = text.replace(
    /^```([A-Za-z0-9_+-]+)\s*\n([\s\S]*?)^```\s*$/gmu,
    (_match, language: string, code: string) => {
      const index = codeBlocks.length;
      codeBlocks.push(
        `<pre data-language="${escapeHtml(language)}"><code>${escapeHtml(code.trimEnd())}</code></pre>`,
      );
      return `\n%%AGENT_CODE_BLOCK_${index}%%\n`;
    },
  );
  const lines = withCodePlaceholders.replace(/\r\n/gu, '\n').split('\n');
  const html: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    html.push(`<p>${renderAgentV2Inline(paragraphLines.join(' '))}</p>`);
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const codeBlock = /^%%AGENT_CODE_BLOCK_(\d+)%%$/u.exec(trimmed);
    if (codeBlock) {
      flushParagraph();
      html.push(codeBlocks[Number(codeBlock[1])] ?? `<p>${escapeHtml(trimmed)}</p>`);
      index += 1;
      continue;
    }

    const table = parseAgentV2Table(lines, index);
    if (table) {
      flushParagraph();
      html.push(renderAgentV2Table(table));
      index = table.endIndex;
      continue;
    }

    const unordered = /^[-+*]\s+(\S[\s\S]*)$/u.exec(line);
    const ordered = /^(\d+)[.)]\s+(\S[\s\S]*)$/u.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const tag = unordered ? 'ul' : 'ol';
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index];
        const match = tag === 'ul'
          ? /^[-+*]\s+(\S[\s\S]*)$/u.exec(candidate)
          : /^(\d+)[.)]\s+(\S[\s\S]*)$/u.exec(candidate);
        if (!match) break;
        const content = tag === 'ul' ? match[1] : match[2];
        items.push(`<li>${renderAgentV2Inline(content)}</li>`);
        index += 1;
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    paragraphLines.push(trimmed);
    index += 1;
  }
  flushParagraph();

  return { html: html.join('') + escapeHtml(trailingInlineWhitespace), buttons: [] };
}

interface AgentV2Table {
  header: string[];
  rows: string[][];
  endIndex: number;
}

function parseAgentV2Table(lines: string[], startIndex: number): AgentV2Table | undefined {
  const header = parseAgentV2TableRow(lines[startIndex]);
  const separator = parseAgentV2TableRow(lines[startIndex + 1]);
  if (!header || !separator || header.length !== separator.length
    || !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
    return undefined;
  }

  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const row = parseAgentV2TableRow(lines[index]);
    if (!row || row.length !== header.length) break;
    rows.push(row);
    index += 1;
  }
  if (rows.length === 0) return undefined;

  return { header, rows, endIndex: index };
}

function parseAgentV2TableRow(line: string | undefined): string[] | undefined {
  const row = line?.trim();
  if (!row?.startsWith('|') || !row.endsWith('|')) return undefined;

  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of row.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      cell += character;
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function renderAgentV2Table(table: AgentV2Table): string {
  const header = table.header
    .map((cell) => `<th scope="col">${renderAgentV2Inline(cell)}</th>`)
    .join('');
  const body = table.rows.map((row) => (
    `<tr>${row.map((cell) => `<td>${renderAgentV2Inline(cell)}</td>`).join('')}</tr>`
  )).join('');
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderAgentV2Inline(text: string): string {
  const escapedCharacters: string[] = [];
  const inlineCode: string[] = [];
  let processed = text
    .replace(/\\([\\|`*_{}[\]()<>#+.!~-])/gu, (_match, character: string) => {
      const index = escapedCharacters.length;
      escapedCharacters.push(escapeHtml(character));
      return `%%AGENT_ESCAPED_CHARACTER_${index}%%`;
    })
    .replace(/`([^`\n]+)`/gu, (_match, code: string) => {
      const index = inlineCode.length;
      inlineCode.push(`<code>${escapeHtml(code)}</code>`);
      return `%%AGENT_INLINE_CODE_${index}%%`;
    });

  processed = processed
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gu,
      (_match, label: string, url: string) => `${label} (${url})`,
    )
    .replace(
      /\[([^\]]+)\]\((mtw:\/\/[^)]+)\)/gu,
      (_match, label: string) => label,
    );

  processed = escapeHtml(processed)
    .replace(/\*\*(\S(?:[^*\n]|\*(?!\*))*?)\*\*/gu, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(\S(?:[^*\n]|\*(?!\*))*?)\*(?!\*)/gu, '$1<em>$2</em>')
    .replace(/%%AGENT_INLINE_CODE_(\d+)%%/gu, (match, index: string) => (
      inlineCode[Number(index)] ?? match
    ))
    .replace(/%%AGENT_ESCAPED_CHARACTER_(\d+)%%/gu, (match, index: string) => (
      escapedCharacters[Number(index)] ?? match
    ));

  return processed;
}

function removeIncompleteAction(text: string) {
  const actionStartIndex = text.lastIndexOf('[');
  if (actionStartIndex === -1) return text;

  const possibleAction = text.slice(actionStartIndex);
  if (!isIncompleteAction(possibleAction)) return text;

  return text.slice(0, actionStartIndex);
}

function isIncompleteAction(text: string) {
  const labelEndIndex = text.indexOf(']');
  if (labelEndIndex === -1) return true;
  if (labelEndIndex === 1) return false;

  const link = text.slice(labelEndIndex + 1);
  if (!link) return true;
  if (!link.startsWith('(')) return false;

  const url = link.slice(1);
  if (url.includes(')')) return false;

  return SELF_PROTOCOL.startsWith(url) || url.startsWith(SELF_PROTOCOL);
}
