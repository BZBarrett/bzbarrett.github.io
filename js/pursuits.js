(() => {
  const dialog = document.getElementById('pursuit-viewer');
  if (!dialog.showModal) return;
  const frames = [...document.querySelectorAll('.pursuit')];
  const image = document.getElementById('pursuit-image');
  const caption = document.getElementById('pursuit-caption');
  let index = 0;

  function show(position) {
    index = (position + frames.length) % frames.length;
    const frame = frames[index];
    image.src = frame.href;
    image.alt = frame.querySelector('img').alt;
    caption.textContent = frame.querySelector('span').textContent;
  }

  for (const [i, frame] of frames.entries()) {
    frame.setAttribute('aria-haspopup', 'dialog');
    frame.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(i);
      dialog.showModal();
    });
  }
  document.getElementById('pursuit-prev').addEventListener('click', () => show(index - 1));
  document.getElementById('pursuit-next').addEventListener('click', () => show(index + 1));
  dialog.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); });
})();
