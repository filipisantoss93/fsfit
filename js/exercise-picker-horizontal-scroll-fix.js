(() => {
  const selector = '.saved-exercise-picker-categories, .saved-exercise-picker-chips';

  function enableHorizontalGesture(root = document) {
    const elements = [];

    if (root instanceof Element && root.matches(selector)) elements.push(root);
    if (root.querySelectorAll) elements.push(...root.querySelectorAll(selector));

    elements.forEach(element => {
      element.setAttribute('data-allow-horizontal-scroll', 'true');
      element.style.touchAction = 'pan-x pan-y';
      element.style.webkitOverflowScrolling = 'touch';
      element.style.overscrollBehaviorX = 'contain';
    });

    return elements.length > 0;
  }

  enableHorizontalGesture();

  const observer = new MutationObserver(records => {
    let found = false;

    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (enableHorizontalGesture(node)) found = true;
      });
    });

    if (found && document.querySelector('.saved-exercise-picker-categories')) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
