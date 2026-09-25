/*
  セクションの出現。IntersectionObserver で一度だけ .is-in を付ける。
  data-reveal-group を持つ要素の子は、順番に遅延をずらす。
*/

export function initReveal() {
  const targets = document.querySelectorAll<HTMLElement>('.reveal');
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
