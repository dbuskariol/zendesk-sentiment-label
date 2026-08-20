(() => {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    allZendeskInstances: true,
    disabledHosts: [],
    enabledHosts: [],
  });
  const ZENDESK_HOST_PATTERN =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)zendesk\.com$/i;

  const enableAll = document.getElementById("enable-all");
  const form = document.getElementById("instance-form");
  const hostInput = document.getElementById("instance-host");
  const actionInput = document.getElementById("instance-action");
  const message = document.getElementById("form-message");
  const enabledList = document.getElementById("enabled-hosts");
  const disabledList = document.getElementById("disabled-hosts");

  let settings = { ...DEFAULT_SETTINGS };

  function uniqueHosts(hosts) {
    return Array.from(
      new Set(
        (Array.isArray(hosts) ? hosts : []).map((host) =>
          String(host).toLowerCase()
        )
      )
    ).sort();
  }

  function normalizeSettings(value) {
    return {
      allZendeskInstances: value?.allZendeskInstances !== false,
      disabledHosts: uniqueHosts(value?.disabledHosts),
      enabledHosts: uniqueHosts(value?.enabledHosts),
    };
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function renderHostList(list, hosts, property, buttonText, emptyText) {
    list.replaceChildren();

    if (!hosts.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = emptyText;
      list.append(item);
      return;
    }

    for (const host of hosts) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const button = document.createElement("button");
      name.textContent = host;
      button.type = "button";
      button.textContent = buttonText;
      button.addEventListener("click", async () => {
        settings[property] = settings[property].filter((value) => value !== host);
        await saveSettings();
      });
      item.append(name, button);
      list.append(item);
    }
  }

  function render() {
    enableAll.checked = settings.allZendeskInstances;
    renderHostList(
      enabledList,
      settings.enabledHosts,
      "enabledHosts",
      "Remove",
      "No explicitly enabled instances."
    );
    renderHostList(
      disabledList,
      settings.disabledHosts,
      "disabledHosts",
      "Restore",
      "No excluded instances."
    );
  }

  async function saveSettings() {
    settings = normalizeSettings(settings);
    await chrome.storage.sync.set(settings);
    render();
  }

  enableAll.addEventListener("change", async () => {
    settings.allZendeskInstances = enableAll.checked;
    await saveSettings();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const host = hostInput.value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    if (!ZENDESK_HOST_PATTERN.test(host)) {
      showMessage("Enter a Zendesk subdomain such as acme.zendesk.com.", true);
      return;
    }

    if (actionInput.value === "enable") {
      settings.enabledHosts = uniqueHosts([...settings.enabledHosts, host]);
      settings.disabledHosts = settings.disabledHosts.filter((value) => value !== host);
    } else {
      settings.disabledHosts = uniqueHosts([...settings.disabledHosts, host]);
      settings.enabledHosts = settings.enabledHosts.filter((value) => value !== host);
    }

    await saveSettings();
    hostInput.value = "";
    showMessage(actionInput.value === "enable" ? `${host} enabled.` : `${host} removed.`);
  });

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
      render();
    }
  });

  async function initialize() {
    settings = normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
    render();
  }

  initialize();
})();
