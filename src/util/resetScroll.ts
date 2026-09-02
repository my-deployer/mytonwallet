import { IS_IOS } from './windowEnvironment';

const resetScroll = (
  container: HTMLDivElement,
  scrollTop?: number,
  shouldDisableSmoothBehavior = false,
) => {
  if (IS_IOS) {
    container.style.overflow = 'hidden';
  }

  if (scrollTop !== undefined) {
    const previousScrollBehavior = shouldDisableSmoothBehavior ? container.style.scrollBehavior : undefined;
    if (shouldDisableSmoothBehavior) container.style.scrollBehavior = 'auto';
    container.scrollTop = scrollTop;
    if (previousScrollBehavior !== undefined) container.style.scrollBehavior = previousScrollBehavior;
  }

  if (IS_IOS) {
    container.style.overflow = '';
  }
};

export default resetScroll;
