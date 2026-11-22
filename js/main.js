const nav = document.getElementById('mainNav');
const menuButton = document.getElementById('hamburger');
const navLinks = [...nav.querySelectorAll('[data-tab]')];
const panels = document.querySelectorAll('.tab-panel');
const main = document.getElementById('main-content');

function setMenu(open) {
  nav.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
}

function showTab(moveFocus = false) {
  const hash = location.hash.slice(1);
  if (hash === 'main-content') return;
  if (hash === 'mystery') {
    location.replace(new URL('aag-2026-giser.html', document.querySelector('.lab-return').href).href);
    return;
  }
  const tab = navLinks.find(link => link.dataset.tab === hash) || navLinks[0];
  for (const link of navLinks) {
    if (link === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const panel of panels) panel.classList.toggle('active', panel.id === 'tab-' + tab.dataset.tab);
  setMenu(false);
  if (moveFocus) {
    main.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  }
}

showTab();
window.addEventListener('hashchange', () => showTab(true));
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', () => setMenu(false));
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.site-header')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuButton.focus();
  }
});
matchMedia('(min-width: 1181px)').addEventListener('change', event => {
  if (event.matches) setMenu(false);
});
