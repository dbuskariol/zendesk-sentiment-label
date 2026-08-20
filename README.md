# Zendesk Sentiment Label

A small Chrome Manifest V3 extension for Zendesk Support ticket pages.

On enabled `/agent/tickets/*` pages, it keeps Zendesk's sentiment dropdown
behavior intact, hides only the adjacent face icon, and consistently displays
the trigger label as **Sentiment**. It targets the stable Zendesk selector
`button[data-test-id="sentiment-menu-dropdown-button"]` and does not modify
other ticket-header controls.

The content script uses a scoped `MutationObserver` plus SPA-navigation hooks
to reapply the presentation after Zendesk rerenders the ticket header.

## Install unpacked in Chrome

1. Clone or download this repository and keep the folder in a permanent
   location.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the repository folder containing
   `manifest.json`.
5. Open **Details** for the extension, then select **Extension options** to
   manage Zendesk instances.

When updating the extension files, use the reload button in
`chrome://extensions`, then refresh the Zendesk tab.

## Options

All Zendesk instances are enabled by default through the
`https://*.zendesk.com/*` content-script match.

- To exclude one tenant while the default is active, enter its subdomain (for
  example, `acme.zendesk.com`), select **Remove**, and save.
- To use an allowlist instead, turn off **Enable on all Zendesk instances** and
  add each tenant with **Enable**.
- Adding a tenant to one list removes it from the opposing list.

Settings are stored with `chrome.storage.sync`.

## Permissions and privacy

The extension requests only:

- `storage` to save the enabled-instance configuration
- access to `https://*.zendesk.com/*` so its content script can run on enabled
  Zendesk ticket pages

It makes no network requests and does not read or store ticket content.

## Validation

This extension has no build step or dependencies. Validate its source with:

```sh
node --check content/sentiment-label.js
node --check options/options.js
python3 -c "import json; json.load(open('manifest.json'))"
```

## License

[MIT](LICENSE)
