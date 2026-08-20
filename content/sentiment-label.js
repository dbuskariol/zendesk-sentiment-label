(() => {
  "use strict";

  const SENTIMENT_BUTTON_SELECTOR =
    'button[data-test-id="sentiment-menu-dropdown-button"]';
  const SENTIMENT_LABEL = "Sentiment";
  const DEFAULT_SETTINGS = Object.freeze({
    allZendeskInstances: true,
    disabledHosts: [],
    enabledHosts: [],
  });

  let settings = { ...DEFAULT_SETTINGS };
  let observer;
  let pendingFrame = 0;
  const modifiedButtons = new Map();

  function uniqueHosts(hosts) {
    return Array.from(
      new Set(
        (Array.isArray(hosts) ? hosts : []).map((host) =>
          String(host).toLowerCase()
        )
      )
    );
  }

  function normalizeSettings(value) {
    return {
      allZendeskInstances: value?.allZendeskInstances !== false,
      disabledHosts: uniqueHosts(value?.disabledHosts),
      enabledHosts: uniqueHosts(value?.enabledHosts),
    };
  }

  function isTicketPage() {
    return window.location.pathname.startsWith("/agent/tickets/");
  }

  function isEnabledForCurrentHost() {
    const host = window.location.hostname.toLowerCase();
    return settings.allZendeskInstances
      ? !settings.disabledHosts.includes(host)
      : settings.enabledHosts.includes(host);
  }

  function findLabelTextNode(button) {
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (
        node.nodeValue.trim() &&
        parent &&
        !parent.closest("svg, [aria-hidden='true']")
      ) {
        return node;
      }
    }

    return null;
  }

  function hideAdjacentIcon(button) {
    const iconContainer = button.previousElementSibling;
    if (
      !iconContainer ||
      !(iconContainer.matches("svg") || iconContainer.querySelector("svg"))
    ) {
      return null;
    }

    return {
      element: iconContainer,
      hidden: iconContainer.hidden,
      ariaHidden: iconContainer.getAttribute("aria-hidden"),
    };
  }

  function applyToButton(button) {
    let modified = modifiedButtons.get(button);

    if (!modified) {
      modified = {
        labelNode: null,
        originalLabel: null,
        originalAriaLabel: button.getAttribute("aria-label"),
        icon: hideAdjacentIcon(button),
      };
      modifiedButtons.set(button, modified);
    }

    if (!modified.labelNode?.isConnected) {
      modified.labelNode = findLabelTextNode(button);
      modified.originalLabel = modified.labelNode?.nodeValue ?? null;
    }
    if (!modified.icon?.element.isConnected) {
      modified.icon = hideAdjacentIcon(button);
    }

    if (modified.labelNode) modified.labelNode.nodeValue = SENTIMENT_LABEL;
    button.setAttribute("aria-label", SENTIMENT_LABEL);

    if (modified.icon?.element.isConnected) {
      modified.icon.element.hidden = true;
      modified.icon.element.setAttribute("aria-hidden", "true");
    }
  }

  function restoreAll() {
    for (const [button, modified] of modifiedButtons) {
      if (modified.labelNode?.isConnected && modified.originalLabel !== null) {
        modified.labelNode.nodeValue = modified.originalLabel;
      }
      if (button.isConnected) {
        if (modified.originalAriaLabel === null) button.removeAttribute("aria-label");
        else button.setAttribute("aria-label", modified.originalAriaLabel);
      }
      if (modified.icon?.element.isConnected) {
        modified.icon.element.hidden = modified.icon.hidden;
        if (modified.icon.ariaHidden === null) {
          modified.icon.element.removeAttribute("aria-hidden");
        } else {
          modified.icon.element.setAttribute("aria-hidden", modified.icon.ariaHidden);
        }
      }
    }
    modifiedButtons.clear();
  }

  function apply() {
    if (!isTicketPage() || !isEnabledForCurrentHost()) {
      restoreAll();
      return;
    }

    const button = document.querySelector(SENTIMENT_BUTTON_SELECTOR);
    if (button) applyToButton(button);
  }

  function scheduleApply() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      apply();
    });
  }

  function mutationTouchesSentiment(mutation) {
    if (mutation.type === "characterData") {
      return mutation.target.parentElement?.closest(SENTIMENT_BUTTON_SELECTOR);
    }

    if (
      mutation.target instanceof Element &&
      mutation.target.closest(SENTIMENT_BUTTON_SELECTOR)
    ) {
      return true;
    }

    return Array.from(mutation.addedNodes).some(
      (node) =>
        node instanceof Element &&
        (node.matches(SENTIMENT_BUTTON_SELECTOR) ||
          node.querySelector(SENTIMENT_BUTTON_SELECTOR))
    );
  }

  function observeTicketHeader() {
    observer = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesSentiment)) scheduleApply();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function observeSpaNavigation() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        scheduleApply();
        return result;
      };
    }
    addEventListener("popstate", scheduleApply);
  }

  async function initialize() {
    settings = normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
    observeTicketHeader();
    observeSpaNavigation();
    scheduleApply();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === "sync" &&
        (changes.allZendeskInstances ||
          changes.disabledHosts ||
          changes.enabledHosts)
      ) {
        settings = normalizeSettings({
          allZendeskInstances:
            changes.allZendeskInstances?.newValue ?? settings.allZendeskInstances,
          disabledHosts: changes.disabledHosts?.newValue ?? settings.disabledHosts,
          enabledHosts: changes.enabledHosts?.newValue ?? settings.enabledHosts,
        });
        scheduleApply();
      }
    });
  }

  initialize();
})();
