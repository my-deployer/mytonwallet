import { useRef } from '../lib/teact/teact';

import { LoadMoreDirection } from '../global/types';

import { areSortedArraysEqual } from '../util/iteratees';
import useForceUpdate from './useForceUpdate';
import useLastCallback from './useLastCallback';
import usePrevious from './usePrevious';
import usePrevious2 from './usePrevious2';
import useSyncEffect from './useSyncEffect';

type GetMore<ListId = string | number> = (args: {
  direction: LoadMoreDirection;
  /**
   * Optional anchor for the new viewport. When set, the next viewport slice is centered around
   * this id instead of using the current viewport edge — used for fast-jump scenarios when the
   * scroll position has moved far outside the rendered window.
   */
  offsetId?: ListId;
}) => void;
type ResetScroll = () => void;
type LoadMore = (args: { offsetId?: string | number }) => void;

const DEFAULT_LIST_SLICE = 30;

const useInfiniteScroll = <ListId extends string | number>({
  loadMoreBackwards,
  loadMoreForwards,
  listIds,
  isDisabled = false,
  listSlice = DEFAULT_LIST_SLICE,
  slug,
  isActive,
  withResetOnInactive = false,
  startFromEnd = false,
  shouldKeepViewportAtEnd = false,
  shouldPreserveViewport = false,
  maxPreservedViewportSize,
}: {
  loadMoreBackwards?: LoadMore;
  loadMoreForwards?: LoadMore;
  listIds?: ListId[];
  isDisabled?: boolean;
  listSlice?: number;
  slug?: string;
  isActive?: boolean;
  withResetOnInactive?: boolean;
  startFromEnd?: boolean;
  shouldKeepViewportAtEnd?: boolean;
  /** Keeps already rendered items when moving the viewport; `resetScroll` still collapses it. */
  shouldPreserveViewport?: boolean;
  maxPreservedViewportSize?: number;
}): [ListId[]?, GetMore<ListId>?, ResetScroll?] => {
  const currentStateRef = useRef<{ viewportIds: ListId[]; isOnTop: boolean } | undefined>();
  let didInitializeCurrentState = false;
  if (!currentStateRef.current && listIds && !isDisabled) {
    const direction = startFromEnd ? LoadMoreDirection.Backwards : LoadMoreDirection.Forwards;
    const offsetId = startFromEnd ? listIds[listIds.length - 1] : listIds[0];
    const {
      newViewportIds,
      newIsOnTop,
    } = getViewportSlice(listIds, direction, listSlice, offsetId);
    currentStateRef.current = { viewportIds: newViewportIds, isOnTop: newIsOnTop };
    didInitializeCurrentState = true;
  }

  const forceUpdate = useForceUpdate();

  const prevSlug = usePrevious2(slug);

  const resetScroll: ResetScroll = useLastCallback(() => {
    if (!listIds?.length) return;

    const direction = startFromEnd ? LoadMoreDirection.Backwards : LoadMoreDirection.Forwards;
    const offsetId = startFromEnd ? listIds[listIds.length - 1] : listIds[0];
    const {
      newViewportIds,
      newIsOnTop,
    } = getViewportSlice(listIds, direction, listSlice, offsetId);

    currentStateRef.current = { viewportIds: newViewportIds, isOnTop: newIsOnTop };
  });

  useSyncEffect(() => {
    if (slug !== prevSlug || (withResetOnInactive && !isActive)) {
      resetScroll();
    }
  }, [isActive, prevSlug, slug, withResetOnInactive]);

  const prevListIds = usePrevious(listIds);
  const prevIsDisabled = usePrevious(isDisabled);
  if (
    listIds && !didInitializeCurrentState && !isDisabled
    && (listIds !== prevListIds || isDisabled !== prevIsDisabled)
  ) {
    const { viewportIds: oldViewportIds, isOnTop: oldIsOnTop } = currentStateRef.current ?? {};
    const nextViewport = getViewportSliceAfterListChange(
      listIds,
      prevListIds,
      oldViewportIds,
      oldIsOnTop,
      listSlice,
      shouldKeepViewportAtEnd,
    );
    const newViewportIds = shouldPreserveViewport && !shouldKeepViewportAtEnd
      ? getPreservedViewportSlice(
        listIds,
        oldViewportIds,
        nextViewport.newViewportIds,
        maxPreservedViewportSize,
      )
      : nextViewport.newViewportIds;
    const newIsOnTop = newViewportIds[0] === listIds[0];

    if (!oldViewportIds || !areSortedArraysEqual(oldViewportIds, newViewportIds)) {
      currentStateRef.current = { viewportIds: newViewportIds, isOnTop: newIsOnTop };
    }
  } else if (!listIds) {
    currentStateRef.current = undefined;
  }

  const getMore: GetMore<ListId> = useLastCallback(({
    direction,
    offsetId: explicitOffsetId,
  }) => {
    if (!isActive) return;

    const { viewportIds } = currentStateRef.current || {};

    const offsetId = explicitOffsetId !== undefined
      ? explicitOffsetId
      : viewportIds
        ? direction === LoadMoreDirection.Backwards ? viewportIds[viewportIds.length - 1] : viewportIds[0]
        : undefined;

    if (!listIds) {
      const loadMore = direction === LoadMoreDirection.Forwards ? loadMoreForwards : loadMoreBackwards;
      loadMore?.({ offsetId });

      return;
    }

    const nextViewport = getViewportSlice(listIds, direction, listSlice, offsetId);
    const newViewportIds = shouldPreserveViewport
      ? getPreservedViewportSlice(
        listIds,
        viewportIds,
        nextViewport.newViewportIds,
        maxPreservedViewportSize,
      )
      : nextViewport.newViewportIds;
    const newIsOnTop = newViewportIds[0] === listIds[0];
    const { areSomeLocal, areAllLocal } = nextViewport;

    if (areSomeLocal && !(viewportIds && areSortedArraysEqual(viewportIds, newViewportIds))) {
      currentStateRef.current = { viewportIds: newViewportIds, isOnTop: newIsOnTop };
      forceUpdate();
    }

    if (!areAllLocal) {
      const loadMore = direction === LoadMoreDirection.Forwards ? loadMoreForwards : loadMoreBackwards;
      loadMore?.({ offsetId });
    }
  });

  return isDisabled ? [listIds] : [currentStateRef.current?.viewportIds, getMore, resetScroll];
};

export function getViewportSlice<ListId extends string | number>(
  sourceIds: ListId[],
  direction: LoadMoreDirection,
  listSlice: number,
  offsetId?: ListId,
) {
  const { length } = sourceIds;
  const index = (offsetId !== undefined) ? sourceIds.indexOf(offsetId) : 0;
  const isForwards = direction === LoadMoreDirection.Forwards;
  const indexForDirection = isForwards ? index : (index + 1) || length;
  const from = indexForDirection - listSlice;
  const to = indexForDirection + listSlice - 1;
  const newViewportIds = sourceIds.slice(Math.max(0, from), to + 1);

  let areSomeLocal;
  let areAllLocal;
  switch (direction) {
    case LoadMoreDirection.Forwards:
      areSomeLocal = indexForDirection >= 0;
      areAllLocal = from >= 0;
      break;
    case LoadMoreDirection.Backwards:
      areSomeLocal = indexForDirection < length;
      areAllLocal = to <= length - 1;
      break;
  }

  return {
    newViewportIds,
    areSomeLocal,
    areAllLocal,
    newIsOnTop: newViewportIds[0] === sourceIds[0],
  };
}

export function getPreservedViewportSlice<ListId extends string | number>(
  sourceIds: ListId[],
  currentViewportIds: ListId[] | undefined,
  nextViewportIds: ListId[],
  maxViewportSize?: number,
) {
  if (maxViewportSize !== undefined && maxViewportSize <= 0) return [];
  if (!currentViewportIds?.length) {
    return maxViewportSize === undefined ? nextViewportIds : nextViewportIds.slice(0, maxViewportSize);
  }
  if (maxViewportSize !== undefined && !nextViewportIds.length) {
    return currentViewportIds.slice(0, maxViewportSize);
  }

  const preservedIds = new Set([...currentViewportIds, ...nextViewportIds]);
  const firstIndex = sourceIds.findIndex((id) => preservedIds.has(id));
  let lastIndex = sourceIds.length - 1;
  while (lastIndex >= firstIndex && !preservedIds.has(sourceIds[lastIndex])) lastIndex--;

  if (maxViewportSize === undefined) {
    return firstIndex >= 0 ? sourceIds.slice(firstIndex, lastIndex + 1) : nextViewportIds;
  }
  if (firstIndex < 0) return nextViewportIds.slice(0, maxViewportSize);
  if (lastIndex - firstIndex + 1 <= maxViewportSize) {
    return sourceIds.slice(firstIndex, lastIndex + 1);
  }

  const nextFirstIndex = sourceIds.indexOf(nextViewportIds[0]);
  const nextLastIndex = sourceIds.indexOf(nextViewportIds[nextViewportIds.length - 1]);
  if (nextFirstIndex < 0 || nextLastIndex < nextFirstIndex) {
    return nextViewportIds.slice(0, maxViewportSize);
  }

  const nextSize = nextLastIndex - nextFirstIndex + 1;
  if (nextSize >= maxViewportSize) {
    return sourceIds.slice(nextFirstIndex, nextFirstIndex + maxViewportSize);
  }
  const leadingCapacity = Math.floor((maxViewportSize - nextSize) / 2);
  const boundedFirstIndex = Math.max(firstIndex, nextFirstIndex - leadingCapacity);
  const boundedLastIndex = Math.min(lastIndex + 1, boundedFirstIndex + maxViewportSize);
  const adjustedFirstIndex = Math.max(firstIndex, boundedLastIndex - maxViewportSize);

  return sourceIds.slice(adjustedFirstIndex, boundedLastIndex);
}

export function getViewportSliceAfterListChange<ListId extends string | number>(
  newListIds: ListId[],
  prevListIds: ListId[] | undefined,
  oldViewportIds: ListId[] | undefined,
  oldIsOnTop: boolean | undefined,
  sliceLength: number,
  shouldKeepViewportAtEnd: boolean,
) {
  const oldLastListId = prevListIds?.[prevListIds.length - 1];
  const oldLastViewportId = oldViewportIds?.[oldViewportIds.length - 1];
  const wasViewportAtEnd = oldLastListId !== undefined && oldLastViewportId === oldLastListId;

  if (shouldKeepViewportAtEnd && wasViewportAtEnd) {
    const wasAppendedToEnd = Boolean(
      prevListIds
      && prevListIds.length <= newListIds.length
      && prevListIds.every((id, index) => id === newListIds[index]),
    );

    if (wasAppendedToEnd) {
      // User is at the bottom and new items were appended - slide the viewport window to include them
      return getViewportSlice(
        newListIds,
        LoadMoreDirection.Backwards,
        sliceLength,
        newListIds[newListIds.length - 1],
      );
    }
  }

  if (oldIsOnTop) {
    // When the offsetId is on the top, the viewport slice must include at least as many items as it already has.
    // Otherwise, the ids, that the user is seeing, can disappear (that causes the list to scroll higher instantly).
    // Subtracting 1 prevents getViewportSlice from expanding the viewport slice 1 item with each newListIds change.
    sliceLength = Math.max(sliceLength, (oldViewportIds?.length ?? 0) - 1);
    const oldRenderedAnchor = oldViewportIds?.find((id) => {
      const previousIndex = prevListIds?.indexOf(id);
      const nextIndex = newListIds.indexOf(id);
      return nextIndex >= 0 && previousIndex !== nextIndex;
    }) ?? oldViewportIds?.[0];
    const offsetId = oldRenderedAnchor !== undefined && newListIds.includes(oldRenderedAnchor)
      ? oldRenderedAnchor
      : newListIds[0];
    return getViewportSlice(newListIds, LoadMoreDirection.Backwards, sliceLength, offsetId);
  }

  let offsetId = oldViewportIds?.[Math.round(oldViewportIds.length / 2)];
  if (offsetId !== undefined && !newListIds.includes(offsetId)) offsetId = newListIds[0];
  // The direction must be Forwards for getViewportSlice to keep the offsetId at the newViewportIds middle. Otherwise,
  // the viewport slice will "walk" 1 item backward with each newListIds change.
  return getViewportSlice(newListIds, LoadMoreDirection.Forwards, sliceLength, offsetId);
}

export default useInfiniteScroll;
