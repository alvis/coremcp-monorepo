const SEARCH_INPUT_SELECTOR = 'input.navbar__search-input';
const SEARCH_INPUT_ID = 'navbar-site-search';
const SEARCH_INPUT_NAME = 'search';

function patchSearchInput() {
  const input = document.querySelector(SEARCH_INPUT_SELECTOR);

  if (!input) {
    return;
  }

  if (!input.id) {
    input.id = SEARCH_INPUT_ID;
  }

  if (!input.getAttribute('name')) {
    input.setAttribute('name', SEARCH_INPUT_NAME);
  }
}

function installSearchInputPatch() {
  patchSearchInput();

  const observer = new MutationObserver(() => {
    patchSearchInput();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installSearchInputPatch, {
      once: true,
    });
  } else {
    installSearchInputPatch();
  }
}

