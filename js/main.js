// ── Tab navigation ──────────────────────────────────────────────────
const navLinks = document.querySelectorAll('.nav-link[data-tab]');
const panels   = document.querySelectorAll('.tab-panel');

const validTabs = [...navLinks].map(l => l.dataset.tab);

function activateTab(tabId, updateHash = true) {
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.tab === tabId));
  panels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Close mobile nav
  document.getElementById('mainNav').classList.remove('open');
  if (updateHash) history.replaceState(null, '', '#' + tabId);
}

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    activateTab(link.dataset.tab);
  });
});

// Load correct tab from URL hash on page load
const initialHash = window.location.hash.slice(1);
activateTab(validTabs.includes(initialHash) ? initialHash : 'home', false);

// Browser back/forward navigation
window.addEventListener('hashchange', () => {
  const tab = window.location.hash.slice(1);
  if (validTabs.includes(tab)) activateTab(tab, false);
});

// ── Hamburger ────────────────────────────────────────────────────────
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mainNav').classList.toggle('open');
});

// ── Publication filter ───────────────────────────────────────────────
const filterBtns = document.querySelectorAll('.filter-btn');
const pubCards   = document.querySelectorAll('.pub-card');
const pubGroups  = document.querySelectorAll('.pub-year-group');

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    pubCards.forEach(card => {
      card.style.display = (f === 'all' || card.dataset.type === f) ? '' : 'none';
    });
    pubGroups.forEach(group => {
      const hasVisible = [...group.querySelectorAll('.pub-card')].some(c => c.style.display !== 'none');
      group.style.display = hasVisible ? '' : 'none';
    });
  });
});

// ── Contact form (mailto fallback) ───────────────────────────────────
function handleContactForm(e) {
  e.preventDefault();
  const name    = document.getElementById('fname').value;
  const email   = document.getElementById('femail').value;
  const subject = document.getElementById('fsubject').value;
  const message = document.getElementById('fmessage').value;

  const mailto = `mailto:bzhou11@utk.edu?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('From: ' + name + ' <' + email + '>\n\n' + message)}`;
  window.location.href = mailto;

  const status = document.getElementById('form-status');
  status.textContent = 'Opening your email client...';
  setTimeout(() => { status.textContent = ''; }, 4000);
}

// ── Intersection Observer: fade-in cards ────────────────────────────
const observer = new IntersectionObserver(
  entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  }),
  { threshold: 0.08 }
);

document.querySelectorAll('.card, .pub-card, .timeline-item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(16px)';
  el.style.transition = 'opacity 0.4s ease, transform 0.4s ease, box-shadow 0.25s ease';
  observer.observe(el);
});
