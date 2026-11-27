/**
 * NeverStop: instant-feeling navigation for the existing static HTML site.
 * No full document reload for internal page changes; native links are fallback.
 */
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('site-navigation');
  const mobile = window.matchMedia('(max-width: 1040px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const script = document.querySelector('script[src*="app.js"]');
  const siteBase = new URL('.', script ? script.src : window.location.href);
  const parser = new DOMParser();
  const cache = new Map();
  const savedScroll = new Map();
  let currentPage = window.location.href;
  let requestId = 0;

  // Keep an immutable snapshot so returning to the first page is instant.
  cache.set(window.location.pathname, Promise.resolve(
    parser.parseFromString('<!doctype html>' + document.documentElement.outerHTML, 'text/html')
  ));

  function setMenu(open, focusButton = false) {
    if (!menu || !nav) return;
    const expanded = Boolean(open && mobile.matches);
    body.classList.toggle('menu-open', expanded);
    menu.setAttribute('aria-expanded', String(expanded));
    menu.setAttribute('aria-label', expanded ? 'メニューを閉じる' : 'メニューを開く');
    if (!expanded && focusButton) menu.focus();
  }

  if (menu && nav) {
    menu.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) setMenu(false, true);
    });
    mobile.addEventListener('change', () => setMenu(false));
    nav.addEventListener('click', e => {
      if (e.target.closest?.('a')) setMenu(false);
    });
    document.addEventListener('click', e => {
      if (body.classList.contains('menu-open') && !e.target.closest?.('.site-header')) setMenu(false);
    });
  }

  function isLocalPage(url) {
    if (url.origin !== siteBase.origin || url.search) return false;
    if (url.pathname === siteBase.pathname) return true;
    if (!url.pathname.startsWith(siteBase.pathname)) return false;
    return /^[\w-]+\.html$/.test(url.pathname.slice(siteBase.pathname.length));
  }

  function linkPage(anchor) {
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return null;
    const url = new URL(anchor.href, document.baseURI);
    return isLocalPage(url) ? url : null;
  }

  function rememberScroll() {
    savedScroll.set(currentPage, { x: window.scrollX, y: window.scrollY });
  }

  function loadPage(url) {
    const key = url.pathname;
    if (cache.has(key)) return cache.get(key);
    const pending = fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then(response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
          throw new Error('Unable to load page (' + response.status + ')');
        }
        return response.text();
      })
      .then(html => {
        const parsed = parser.parseFromString(html, 'text/html');
        if (!parsed.getElementById('page-content') || !parsed.querySelector('title')) {
          throw new Error('Page content unavailable');
        }
        return parsed;
      });
    cache.set(key, pending);
    pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    return pending;
  }

  function refreshNavigation(targetDoc) {
    if (!nav) return;
    const activeHref = targetDoc.querySelector('.primary-nav a.active')?.getAttribute('href');
    nav.querySelectorAll('a').forEach(link => {
      const active = link.getAttribute('href') === activeHref;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function revealSections(root = document) {
    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
    body.classList.add('js-motion');
    const targets = root.querySelectorAll(
      '.section-head,.intro-copy,.value-row,.roster-card,.division-card,.contact-card,.numbered-item,.content-block,.profile-card,.partner-band'
    );
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: .10, rootMargin: '0px 0px -35px 0px' });
    targets.forEach((node, index) => {
      if (node.getBoundingClientRect().top < window.innerHeight - 35) return;
      node.classList.add('will-reveal');
      node.style.transitionDelay = (index % 3) * 65 + 'ms';
      observer.observe(node);
    });
  }

  // Avoid animated scrolling while changing pages.
  function positionPage(url, position) {
    const html = document.documentElement;
    const original = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    if (position) window.scrollTo(position.x, position.y);
    else if (url.hash) {
      let target = null;
      try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); }
      catch (_) { target = null; }
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    } else window.scrollTo(0, 0);
    requestAnimationFrame(() => { html.style.scrollBehavior = original; });
  }

  // The next page is loaded before the exit begins, so slow connections
  // never leave an empty viewport. Subtle motion keeps the existing fast feel.
  async function showPage(url, mode = 'push') {
    const id = ++requestId;
    setMenu(false);
    const current = document.getElementById('page-content');
    current?.classList.remove('page-exit', 'page-enter');
    body.classList.remove('nav-transitioning');
    if (!reducedMotion.matches) {
      // Re-trigger the slim red header trace for each navigation.
      void body.offsetWidth;
      body.classList.add('nav-transitioning');
    }

    try {
      const targetDoc = await loadPage(url);
      if (id !== requestId) return;
      const previous = document.getElementById('page-content');
      const target = targetDoc.getElementById('page-content');
      if (!previous || !target) throw new Error('Missing page shell');

      if (!reducedMotion.matches) {
        previous.classList.remove('page-enter');
        previous.classList.add('page-exit');
        await new Promise(resolve => window.setTimeout(resolve, 115));
        if (id !== requestId) return;
      }

      if (mode === 'push') {
        rememberScroll();
        history.pushState({ neverstop: true }, '', url.href);
      }
      const next = document.importNode(target, true);
      if (!reducedMotion.matches) next.classList.add('page-enter');
      previous.replaceWith(next);

      document.title = targetDoc.title;
      document.documentElement.lang = targetDoc.documentElement.lang || 'ja';
      const description = document.querySelector('meta[name="description"]');
      const newDescription = targetDoc.querySelector('meta[name="description"]');
      if (description && newDescription) description.content = newDescription.content;
      refreshNavigation(targetDoc);
      currentPage = url.href;
      positionPage(url, mode === 'pop' ? savedScroll.get(url.href) : null);
      if (mode === 'push') next.querySelector('#main-content')?.focus({ preventScroll: true });
      requestAnimationFrame(() => revealSections(next));
    } catch (err) {
      if (id !== requestId) return;
      document.getElementById('page-content')?.classList.remove('page-exit');
      console.warn('Soft navigation fallback:', err);
      if (mode === 'pop') window.location.reload();
      else window.location.assign(url.href);
    } finally {
      if (id === requestId) {
        window.setTimeout(() => {
          if (id === requestId) body.classList.remove('nav-transitioning');
        }, 450);
      }
    }
  }

  // Fetch on hover/focus/touch to start loading before the actual click.
  function prefetch(event) {
    const anchor = event.target.closest?.('a[href]');
    const url = linkPage(anchor);
    if (url && url.pathname !== window.location.pathname) loadPage(url).catch(() => {});
  }
  document.addEventListener('pointerover', prefetch, { passive: true });
  document.addEventListener('focusin', prefetch);
  document.addEventListener('pointerdown', prefetch, { passive: true });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    const url = linkPage(anchor);
    if (!url) return;
    if (url.pathname === window.location.pathname && url.hash) return; // Native in-page anchor
    event.preventDefault();
    if (url.pathname === window.location.pathname && !url.hash) {
      setMenu(false);
      positionPage(url);
      return;
    }
    showPage(url);
  });

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('popstate', () => {
    rememberScroll();
    const url = new URL(location.href);
    if (!isLocalPage(url)) { location.reload(); return; }
    if (url.pathname === new URL(currentPage).pathname) {
      currentPage = url.href;
      positionPage(url, savedScroll.get(url.href));
      return;
    }
    showPage(url, 'pop');
  });

  // Static HTML files are small; idle prefetch makes common menu changes immediate.
  function prefetchMenu() {
    if (!nav || navigator.connection?.saveData) return;
    nav.querySelectorAll('a[href]').forEach(anchor => {
      const url = linkPage(anchor);
      if (url && url.pathname !== location.pathname) loadPage(url).catch(() => {});
    });
  }
  if ('requestIdleCallback' in window) requestIdleCallback(prefetchMenu, { timeout: 1800 });
  else window.setTimeout(prefetchMenu, 650);

  revealSections();
});
