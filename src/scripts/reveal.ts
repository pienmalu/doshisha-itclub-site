/*
  セクションの出現。IntersectionObserver で一度だけ .is-in を付ける。
  .reveal はふわっと、.reveal-line は行ごとに下から立ち上がる。
  data-reveal は、CSS 側で独自に .is-in を読む要素に付ける。
*/

export function initReveal() {
  const targets = document.querySelectorAll<HTMLElement>('.reveal, .reveal-line, [data-reveal]');
  if (targets.length === 0) return;

  if (
    !('IntersectionObserver' in window) ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  );

  targets.forEach((el) => observer.observe(el));
}

/**
 * data-spy の中で、いま画面の中央にある data-spy-item を .is-active にし、
 * その番号を --active として親に書く。
 */
export function initSpy() {
  document.querySelectorAll<HTMLElement>('[data-spy]').forEach((root) => {
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-spy-item]'));
    if (items.length === 0) return;
    const set = (index: number) => {
      root.style.setProperty('--active', String(index));
      items.forEach((item, i) => item.classList.toggle('is-active', i === index));
    };
    set(0);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) set(items.indexOf(entry.target as HTMLElement));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    items.forEach((item) => io.observe(item));
  });
}
