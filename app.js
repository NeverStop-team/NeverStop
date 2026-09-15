document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const menu = document.querySelector('[data-menu]');
  if (menu) {
    menu.addEventListener('click', () => {
      const open = body.classList.toggle('menu-open');
      menu.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('.primary-nav a').forEach(link => {
    link.addEventListener('click', () => body.classList.remove('menu-open'));
  });

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || link.target === '_blank' || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (/^https?:/.test(href)) return;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      body.classList.add('page-leave');
      window.setTimeout(() => { window.location.href = href; }, 150);
    });
  });
});
