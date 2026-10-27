import { flushSync } from 'react-dom';

/** Progressive spatial continuity; the reader works identically without snapshots. */
export function changeScene(update: () => void, jacket?: HTMLElement | null) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const featured = document.querySelector<HTMLElement>('.featured-cover .cover-object');
  if (jacket && featured && jacket !== featured) featured.style.viewTransitionName = 'none';
  if (jacket) jacket.style.viewTransitionName = 'current-jacket';
  const transition = document.startViewTransition(() => flushSync(update));
  void transition.finished
    .catch(() => {})
    .finally(() => {
      jacket?.style.removeProperty('view-transition-name');
      featured?.style.removeProperty('view-transition-name');
    });
}
