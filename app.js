document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const menu = document.querySelector('[data-menu]');
  const nav = document.querySelector('#site-navigation');
  const mobile = window.matchMedia('(max-width: 1040px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function setMenu(open, restoreFocus = false) {
    if (!menu || !nav) return;
    const shouldOpen = Boolean(open && mobile.matches);
    body.classList.toggle('menu-open', shouldOpen);
    menu.setAttribute('aria-expanded', String(shouldOpen));
    menu.setAttribute('aria-label', shouldOpen ? 'メニューを閉じる' : 'メニューを開く');
    if (restoreFocus && !shouldOpen) menu.focus();
  }

  if (menu && nav) {
    menu.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) setMenu(false, true);
    });
    mobile.addEventListener('change', () => setMenu(false));
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', e => {
      if (body.classList.contains('menu-open') && !e.target.closest('.site-header')) setMenu(false);
    });
  }

  // Animate only elements that start below the fold; never hide content without JS.
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    body.classList.add('js-motion');
    const nodes = document.querySelectorAll('.section-head,.intro-copy,.value-row,.roster-card,.division-card,.contact-card,.numbered-item,.content-block,.profile-card,.partner-band');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.10, rootMargin: '0px 0px -35px 0px' });
    nodes.forEach((node, index) => {
      if (node.getBoundingClientRect().top < window.innerHeight - 35) return;
      node.classList.add('will-reveal');
      node.style.transitionDelay = (index % 3) * 65 + 'ms';
      observer.observe(node);
    });
  }

  // Same-site page transitions. Preserve native new-tab and modified-click behavior.
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || !/^[^#?:]+\.html(?:#.*)?$/.test(href) || link.hasAttribute('download') || link.target) return;
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setMenu(false);
      if (reducedMotion.matches) {
        window.location.assign(href);
        return;
      }
      body.classList.add('page-leave');
      window.setTimeout(() => window.location.assign(href), 160);
    });
  });
  window.addEventListener('pageshow', () => body.classList.remove('page-leave'));
});