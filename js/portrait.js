const portrait = document.querySelector('.portrait-flip');

function showIllustration(show) {
  portrait.setAttribute('aria-pressed', String(show));
}

portrait.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') showIllustration(true);
});
portrait.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse') showIllustration(false);
});
portrait.addEventListener('click', event => {
  if (event.pointerType === 'mouse' && event.detail > 0) return;
  showIllustration(portrait.getAttribute('aria-pressed') !== 'true');
});
