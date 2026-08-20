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

  function captureIcon(element) {
    return {
      element,
      hidden: element.hidden,
      ariaHidden: element.getAttribute("aria-hidden"),
      display: element.style.getPropertyValue("display"),
      displayPriority: element.style.getPropertyPriority("display"),
    };
  }

  function findFaceIcons(button, labelNode) {
    const icons = new Set();
    const adjacent = button.previousElementSibling;
    const labelElement = labelNode?.parentElement;
    const divider = button.parentElement?.querySelector(
      '[data-test-id="sentiment-menu-divider"]'
    );
    const semanticIcon = divider?.nextElementSibling;

    if (
      semanticIcon &&
      semanticIcon.nextElementSibling === button &&
      (semanticIcon.matches("svg, [role='img'], img") ||
        semanticIcon.querySelector("svg, [role='img'], img"))
    ) {
      icons.add(semanticIcon);
    }

    if (
      adjacent &&
      !adjacent.textContent.trim() &&
      (adjacent.matches("svg, [role='img'], img") ||
        adjacent.querySelector("svg, [role='img'], img"))
    ) {
      icons.add(adjacent);
    }

    for (const icon of button.querySelectorAll("svg, [role='img'], img")) {
      if (
        !labelElement ||
        icon.compareDocumentPosition(labelElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        icons.add(icon);
      }
    }

    return [...icons];
  }

  function hideIcons(icons) {
    for (const icon of icons) {
      if (!icon.element.isConnected) continue;
      icon.element.hidden = true;
      icon.element.setAttribute("aria-hidden", "true");
      icon.element.style.setProperty("display", "none", "important");
    }
  }

  function applyToButton(button) {
    let modified = modifiedButtons.get(button);

    if (!modified) {
      modified = {
        labelNode: null,
        originalLabel: null,
        originalAriaLabel: button.getAttribute("aria-label"),
        icons: [],
      };
      modifiedButtons.set(button, modified);
    }

    if (!modified.labelNode?.isConnected) {
      modified.labelNode = findLabelTextNode(button);
      modified.originalLabel = modified.labelNode?.nodeValue ?? null;
    }
    for (const icon of findFaceIcons(button, modified.labelNode)) {
      if (!modified.icons.some((savedIcon) => savedIcon.element === icon)) {
        modified.icons.push(captureIcon(icon));
      }
    }

    if (modified.labelNode) modified.labelNode.nodeValue = SENTIMENT_LABEL;
    button.setAttribute("aria-label", SENTIMENT_LABEL);
    hideIcons(modified.icons);
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
      for (const icon of modified.icons) {
        if (!icon.element.isConnected) continue;
        icon.element.hidden = icon.hidden;
        if (icon.ariaHidden === null) {
          icon.element.removeAttribute("aria-hidden");
        } else {
          icon.element.setAttribute("aria-hidden", icon.ariaHidden);
        }
        if (icon.display) {
          icon.element.style.setProperty(
            "display",
            icon.display,
            icon.displayPriority
          );
        } else {
          icon.element.style.removeProperty("display");
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
