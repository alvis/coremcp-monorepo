import React from 'react';
import { createRoot } from 'react-dom/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import {
  faMagnifyingGlass,
  faMoonStars,
  faSunBright,
  faXmark,
} from '@fortawesome/pro-duotone-svg-icons';

const GITHUB_SELECTOR =
  '.navbar__item.navbar__link[href*="github.com"], .footer__link-item[href*="github.com"]';
const TOGGLE_SELECTOR =
  '.navbar button[class*="colorModeToggle"], .navbar button[title*="mode"]';
const SEARCH_SHELL_SELECTOR = '.vitestSearchShell';
const SEARCH_OVERLAY_ID = 'search-page-overlay';
const SEARCH_EMPTY_PANEL_CLASS = 'vitestSearchEmptyPanel';
const SEARCH_SUGGESTIONS = [
  {
    href: '/docs',
    eyebrow: 'Docs',
    label: 'Open docs overview',
    description: 'Start from the CoreMCP documentation hub.',
  },
  {
    href: '/docs/deploy/remote-http',
    eyebrow: 'Deploy',
    label: 'Review remote HTTP',
    description: 'See the deployment path for native remote MCP.',
  },
  {
    href: '/docs/package-reference',
    eyebrow: 'Reference',
    label: 'Browse package reference',
    description: 'Jump straight to the package map and APIs.',
  },
];

const roots = new WeakMap();

function ensureRoot(target, mountClassName) {
  let mount = target.querySelector(`.${mountClassName}`);

  if (!mount) {
    mount = document.createElement('span');
    mount.className = mountClassName;
    target.replaceChildren(mount);
  }

  let root = roots.get(mount);

  if (!root) {
    root = createRoot(mount);
    roots.set(mount, root);
  }

  return root;
}

function GithubIcon() {
  return (
    <span className="navbarGithubVisual" aria-hidden="true">
      <FontAwesomeIcon icon={faGithub} />
    </span>
  );
}

function ColorModeIcon() {
  const theme = document.documentElement.dataset.theme;
  const icon = theme === 'dark' ? faMoonStars : faSunBright;

  return (
    <span className="vitestModeGlyph" aria-hidden="true">
      <FontAwesomeIcon icon={icon} />
    </span>
  );
}

function closeSearchShell(shell) {
  const searchInput = shell.querySelector('input');

  if (searchInput instanceof HTMLInputElement) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.blur();
  }

  const overlay = document.getElementById(SEARCH_OVERLAY_ID);
  if (overlay instanceof HTMLElement) {
    overlay.focus({ preventScroll: true });
    window.setTimeout(() => overlay.blur(), 0);
  }
}

function syncSearchState(shell) {
  const input = shell.querySelector('input');
  const panel = shell.querySelector(`.${SEARCH_EMPTY_PANEL_CLASS}`);
  const isFocused = shell.matches(':focus-within');
  const value = input instanceof HTMLInputElement ? input.value.trim() : '';
  const showEmptyPanel = isFocused && value === '';

  shell.dataset.searchOpen = isFocused ? 'true' : 'false';
  shell.dataset.searchEmpty = showEmptyPanel ? 'true' : 'false';

  if (panel instanceof HTMLElement) {
    panel.setAttribute('aria-hidden', showEmptyPanel ? 'false' : 'true');
  }
}

function patchGithubLinks() {
  document.querySelectorAll(GITHUB_SELECTOR).forEach((link) => {
    if (!(link instanceof HTMLElement)) {
      return;
    }

    const isNavbarLink = link.classList.contains('navbar__link');
    const mountClassName = isNavbarLink ? 'navbarGithubMount' : 'footerGithubMount';
    const className = isNavbarLink ? 'navbar__github-button' : 'footerGithubLink';

    link.classList.add(className);
    link.setAttribute('aria-label', 'GitHub');
    link.setAttribute('title', 'GitHub');

    ensureRoot(link, mountClassName).render(<GithubIcon />);
  });
}

function patchColorModeToggle() {
  document.querySelectorAll(TOGGLE_SELECTOR).forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.classList.add('vitestModeToggle', 'vitestModeToggle--mounted');
    ensureRoot(button, 'vitestModeMount').render(<ColorModeIcon />);
  });
}

function patchSearchShell() {
  let overlay = document.getElementById(SEARCH_OVERLAY_ID);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = SEARCH_OVERLAY_ID;
    overlay.className = 'searchPageOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.tabIndex = -1;
    document.body.append(overlay);
  }

  document.querySelectorAll(SEARCH_SHELL_SELECTOR).forEach((shell) => {
    if (!(shell instanceof HTMLElement) || shell.dataset.searchBound === 'true') {
      return;
    }

    shell.dataset.searchBound = 'true';
    shell.setAttribute('role', 'search');

    const syncOverlayState = () => {
      const root = document.documentElement;
      const pageOverlay = document.getElementById(SEARCH_OVERLAY_ID);
      if (shell.matches(':focus-within')) {
        root.classList.add('search-overlay-active');
        pageOverlay?.classList.add('searchPageOverlay--active');
      } else {
        root.classList.remove('search-overlay-active');
        pageOverlay?.classList.remove('searchPageOverlay--active');
      }

      syncSearchState(shell);
    };

    shell.addEventListener('focusin', () => {
      syncOverlayState();
    });

    shell.addEventListener('focusout', () => {
      window.setTimeout(syncOverlayState, 0);
    });

    shell.addEventListener('mousedown', (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('input, button, a, [role="option"]')) {
        return;
      }

      const input = shell.querySelector('input');
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    });

    const input = shell.querySelector('input');
    if (input instanceof HTMLInputElement) {
      if (!input.placeholder) {
        input.placeholder = 'Search';
      }

      input.addEventListener('input', () => {
        syncSearchState(shell);
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSearchShell(shell);
        }
      });
    }

    if (!shell.querySelector('.vitestSearchPrompt')) {
      const prompt = document.createElement('span');
      prompt.className = 'vitestSearchPrompt';
      prompt.setAttribute('aria-hidden', 'true');

      const root = createRoot(prompt);
      root.render(<FontAwesomeIcon icon={faMagnifyingGlass} />);
      roots.set(prompt, root);
      shell.append(prompt);
    }

    if (!shell.querySelector('.vitestSearchDismiss')) {
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'vitestSearchDismiss';
      dismiss.setAttribute('aria-label', 'Close search');

      dismiss.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });

      dismiss.addEventListener('click', () => {
        closeSearchShell(shell);
      });

      const root = createRoot(dismiss);
      root.render(<FontAwesomeIcon icon={faXmark} />);
      roots.set(dismiss, root);
      shell.append(dismiss);
    }

    if (!shell.querySelector(`.${SEARCH_EMPTY_PANEL_CLASS}`)) {
      const panel = document.createElement('div');
      panel.className = SEARCH_EMPTY_PANEL_CLASS;
      panel.setAttribute('aria-hidden', 'true');

      const intro = document.createElement('div');
      intro.className = 'vitestSearchEmptyIntro';
      intro.textContent = 'Start typing to search docs, or jump straight into a common destination.';
      panel.append(intro);

      const list = document.createElement('div');
      list.className = 'vitestSearchEmptyList';

      SEARCH_SUGGESTIONS.forEach((item) => {
        const link = document.createElement('a');
        link.className = 'vitestSearchEmptyItem';
        link.href = item.href;

        const eyebrow = document.createElement('span');
        eyebrow.className = 'vitestSearchEmptyEyebrow';
        eyebrow.textContent = item.eyebrow;

        const label = document.createElement('span');
        label.className = 'vitestSearchEmptyLabel';
        label.textContent = item.label;

        const description = document.createElement('span');
        description.className = 'vitestSearchEmptyDescription';
        description.textContent = item.description;

        link.append(eyebrow, label, description);
        list.append(link);
      });

      panel.append(list);
      shell.append(panel);
    }

    overlay.addEventListener('click', () => {
      closeSearchShell(shell);
    });

    syncSearchState(shell);
  });
}

function patchNavbarChrome() {
  patchGithubLinks();
  patchColorModeToggle();
  patchSearchShell();
}

function installNavbarChrome() {
  patchNavbarChrome();

  const domObserver = new MutationObserver(() => {
    patchNavbarChrome();
  });

  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const themeObserver = new MutationObserver(() => {
    patchColorModeToggle();
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installNavbarChrome, {
      once: true,
    });
  } else {
    installNavbarChrome();
  }
}
