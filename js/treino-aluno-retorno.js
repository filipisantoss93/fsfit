const params = new URLSearchParams(window.location.search);
const embedded = params.get('embed') === '1';
const backLink = document.querySelector('#back-link');

if (embedded && window.parent !== window && backLink) {
  backLink.href = '#';
  backLink.textContent = '← Voltar';
  backLink.addEventListener('click', event => {
    event.preventDefault();
    window.parent.postMessage({ type: 'fsfit-close-workout-modal' }, window.location.origin);
  });
}
