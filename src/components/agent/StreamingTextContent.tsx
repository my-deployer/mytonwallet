import React, {
  type ElementRef, memo, useMemo,
} from '../../lib/teact/teact';

import type { TextRevealPhase } from '../../util/agent/TextRevealController';
import type { MarkdownProfile } from '../../util/renderMarkdown';

import { segmentStreamingMarkdown } from '../../util/agent/streamingMarkdown';
import renderMarkdown from '../../util/renderMarkdown';

import styles from './StreamingText.module.scss';

interface OwnProps {
  contentRef: ElementRef<HTMLDivElement>;
  text: string;
  phase: TextRevealPhase;
  shouldCommitMarkdownTail: boolean;
  areLinksEnabled: boolean;
  markdownProfile: MarkdownProfile;
}

function StreamingTextContent({
  contentRef,
  text,
  phase,
  shouldCommitMarkdownTail,
  areLinksEnabled,
  markdownProfile,
}: OwnProps) {
  const markdownSegments = useMemo(
    () => segmentStreamingMarkdown(text, phase === 'complete' && shouldCommitMarkdownTail),
    [phase, shouldCommitMarkdownTail, text],
  );

  return (
    <div
      ref={contentRef}
      className={styles.text}
      data-agent-streaming-text
      dir="auto"
      aria-busy={phase !== 'complete'}
    >
      {markdownSegments.blocks.map((block) => (
        <MemoizedMarkdownSegment
          key={block.offset}
          offset={block.offset}
          text={block.text}
          areLinksEnabled={areLinksEnabled}
          markdownProfile={markdownProfile}
        />
      ))}
      {markdownSegments.tail && (
        <MarkdownSegment
          text={markdownSegments.tail}
          areLinksEnabled={areLinksEnabled}
          markdownProfile={markdownProfile}
        />
      )}
    </div>
  );
}

function MarkdownSegment({
  offset,
  text,
  areLinksEnabled,
  markdownProfile,
}: {
  offset?: number;
  text: string;
  areLinksEnabled: boolean;
  markdownProfile: MarkdownProfile;
}) {
  const html = useMemo(
    () => renderMarkdown(text, { areLinksEnabled, profile: markdownProfile }).html,
    [areLinksEnabled, markdownProfile, text],
  );

  return (
    <div
      className={styles.markdownSegment}
      data-agent-markdown-offset={offset}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const MemoizedMarkdownSegment = memo(MarkdownSegment);

export default memo(StreamingTextContent);
