import React, { memo, useMemo } from '../../lib/teact/teact';

import type { MarkdownProfile } from '../../util/renderMarkdown';

import renderMarkdown from '../../util/renderMarkdown';

import styles from './StreamingText.module.scss';

interface OwnProps {
  text: string;
  areLinksEnabled: boolean;
  markdownProfile?: MarkdownProfile;
}

function StaticText({
  text,
  areLinksEnabled,
  markdownProfile = 'legacy',
}: OwnProps) {
  const html = useMemo(
    () => renderMarkdown(text, { areLinksEnabled, profile: markdownProfile }).html,
    [areLinksEnabled, markdownProfile, text],
  );

  return (
    <div
      className={styles.text}
      data-agent-static-text
      dir="auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default memo(StaticText);
