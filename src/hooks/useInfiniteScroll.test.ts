import { LoadMoreDirection } from '../global/types';

import {
  getPreservedViewportSlice,
  getViewportSlice,
  getViewportSliceAfterListChange,
} from './useInfiniteScroll';

describe('useInfiniteScroll list changes', () => {
  it('reports the remote top boundary only after the local forwards window is exhausted', () => {
    const ids = sequence(1, 60);

    expect(getViewportSlice(ids, LoadMoreDirection.Forwards, 30, 31).areAllLocal).toBe(true);
    expect(getViewportSlice(ids, LoadMoreDirection.Forwards, 30, 1).areAllLocal).toBe(false);
  });

  it('keeps the old rendered top anchor when a page is prepended', () => {
    const previousIds = sequence(1, 30);
    const prependedIds = sequence(-9, 0);
    const nextIds = [...prependedIds, ...previousIds];

    const result = getViewportSliceAfterListChange(
      nextIds,
      previousIds,
      previousIds,
      true,
      30,
      false,
    );

    expect(result.newViewportIds).toEqual(nextIds);
    expect(result.newViewportIds.indexOf(previousIds[0])).toBe(prependedIds.length);
    expect(result.newIsOnTop).toBe(true);
  });

  it('centers a large prepend around the old rendered anchor without dropping visible items', () => {
    const previousIds = sequence(1, 30);
    const prependedIds = sequence(-39, 0);
    const nextIds = [...prependedIds, ...previousIds];

    const result = getViewportSliceAfterListChange(
      nextIds,
      previousIds,
      previousIds,
      true,
      30,
      false,
    );

    expect(result.newViewportIds).toEqual([...sequence(-28, 0), ...previousIds]);
    expect(result.newViewportIds.indexOf(previousIds[0])).toBe(29);
    expect(result.newIsOnTop).toBe(false);
  });

  it('anchors a large same-day prepend to moved content instead of the stable date separator', () => {
    const dateId = 'date:2026-08-11';
    const previousMessageIds = sequence(1, 30).map(String);
    const prependedMessageIds = sequence(-39, 0).map(String);
    const previousIds = [dateId, ...previousMessageIds];
    const nextIds = [dateId, ...prependedMessageIds, ...previousMessageIds];

    const result = getViewportSliceAfterListChange(
      nextIds,
      previousIds,
      previousIds,
      true,
      30,
      false,
    );

    expect(result.newViewportIds).toContain(previousMessageIds[0]);
    expect(result.newViewportIds.indexOf(previousMessageIds[0])).toBe(29);
    expect(result.newViewportIds).toEqual([
      ...prependedMessageIds.slice(-29),
      ...previousMessageIds,
    ]);
  });

  it('falls back to the new first item when the old anchor was removed', () => {
    const previousIds = sequence(1, 30);
    const nextIds = sequence(31, 60);

    const result = getViewportSliceAfterListChange(
      nextIds,
      previousIds,
      previousIds,
      true,
      30,
      false,
    );

    expect(result.newViewportIds).toEqual(nextIds);
    expect(result.newIsOnTop).toBe(true);
  });

  it('preserves overlapping items without growing beyond the viewport bound', () => {
    const ids = sequence(1, 120);
    const renderedIds = sequence(61, 120);

    expect(getPreservedViewportSlice(ids, renderedIds, sequence(31, 90), 60)).toEqual(sequence(31, 90));
    expect(getPreservedViewportSlice(ids, renderedIds, sequence(91, 120), 60)).toEqual(renderedIds);
  });

  it('keeps the original unbounded behavior unless a viewport bound is requested', () => {
    const ids = sequence(1, 120);
    const renderedIds = sequence(61, 120);

    expect(getPreservedViewportSlice(ids, renderedIds, sequence(31, 90))).toEqual(sequence(31, 120));
  });

  it('keeps sequential history loads bounded', () => {
    const ids = sequence(1, 180);
    let renderedIds = sequence(121, 180);

    for (const firstId of [91, 61, 31, 1]) {
      renderedIds = getPreservedViewportSlice(
        ids,
        renderedIds,
        sequence(firstId, firstId + 59),
        60,
      );
      expect(renderedIds).toHaveLength(60);
    }

    expect(renderedIds).toEqual(sequence(1, 60));
  });
});

function sequence(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
