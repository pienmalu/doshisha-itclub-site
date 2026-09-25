/*
  ヘッダー。
  デザインシステムは「ナビに面（境界線・ぼかし）を持たせない」と決めているので、
  下方向のスクロールでは隠し、上方向で純黒の背景ごと戻す。純黒はキャンバスと
  同色なので、面として見えないまま本文だけが消える。
*/

export function initNav() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;

  const toggle = header.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]');
  const sections = Array.from(links)
    .map((link) => document.querySelector<HTMLElement>(link.hash))
    .filter((el): el is HTMLElement => Boolean(el));

  let lastY = window.scrollY;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    header!.classList.toggle('is-scrolled', y > 24);
    // ヒーローの CTA が画面から外れてから、ヘッダーの CTA を出す
    header!.classList.toggle('is-past-hero', y > window.innerHeight * 0.55);

    const goingDown = y > lastY && y > 200;
    if (!menu?.classList.contains('is-open')) {
      header!.classList.toggle('is-hidden', goingDown);
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onScroll);
    },
    { passive: true },
  );
  onScroll();

  // --- 現在位置のハイライト -------------------------------------------------
  if (sections.length > 0) {
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = `#${entry.target.id}`;
          links.forEach((link) => {
            link.classList.toggle('is-current', link.hash === id);
            if (link.hash === id) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
          });
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((section) => spy.observe(section));
  }

  // --- 狭い画面のメニュー ---------------------------------------------------
  if (!toggle || !menu) return;

  const label = toggle.querySelector<HTMLElement>('[data-menu-label]');
  // メニューを開いているあいだ、背後の内容はタブ移動の対象から外す
  const behind = [document.querySelector('main'), document.querySelector('footer')].filter(
    (el): el is HTMLElement => Boolean(el),
  );

  function setOpen(open: boolean) {
    menu!.classList.toggle('is-open', open);
    toggle!.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'メニューを閉じる' : 'メニューを開く';
    document.documentElement.style.overflow = open ? 'hidden' : '';
    behind.forEach((el) => {
      el.inert = open;
    });
    header!.classList.remove('is-hidden');
    if (open) {
      menu!.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
    }
  }

  toggle.addEventListener('click', () => {
    setOpen(!menu.classList.contains('is-open'));
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  const wide = window.matchMedia('(min-width: 860px)');
  wide.addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}
