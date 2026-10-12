# Start and control the browser

## Set up outside the target project

Resolve `SKILL_DIR` to the directory containing this skill's `SKILL.md`. Copy the whole skill folder when moving it to another machine. Its helper has no absolute paths or project imports.

Use Node.js 22 or newer. Set up a separate runtime once, then refresh the copied helper when this skill changes:

```sh
SKILL_DIR="$HOME/.codex/skills/browser-api-discovery"
BROWSER_RUNTIME="$HOME/.local/share/browser-api-discovery/runtime"
mkdir -p "$BROWSER_RUNTIME"
cp "$SKILL_DIR/scripts/package.json" "$SKILL_DIR/scripts/launch.mjs" "$BROWSER_RUNTIME/"
npm install --prefix "$BROWSER_RUNTIME" --no-audit --no-fund
```

If agent-browser is missing, install it with `npm install -g agent-browser`. Read the installed CLI's instructions before using it:

```sh
agent-browser --version
agent-browser skills get core
```

CloakBrowser supplies Chromium, so attaching to it does not require `agent-browser install`. The first CloakBrowser launch may download its binary. Follow the installed package's instructions if it reports a missing system library or license requirement. Do not copy another project's license or credentials.

The helper pins its direct dependencies in `scripts/package.json`. Keep the runtime's generated lockfile when reproducible setup matters. Check the installed API and CLI help before changing versions. Upstream references are [CloakBrowser JavaScript](https://github.com/CloakHQ/CloakBrowser/blob/main/js/README.md), [agent-browser](https://github.com/vercel-labs/agent-browser), and [Playwright tracing](https://playwright.dev/docs/api/class-tracing).

## Launch and attach

Choose an unused loopback port and a new evidence directory for each run. The helper refuses to overwrite an existing directory. Create its parent first. Keep this command running in a persistent terminal session with stdin open, such as an execution tool's PTY mode:

```sh
mkdir -p "$HOME/.local/share/browser-api-discovery/captures"
export BROWSER_EVIDENCE_DIR="$HOME/.local/share/browser-api-discovery/captures/$(date +%Y%m%d-%H%M%S)"
export BROWSER_CDP_PORT=9222
export BROWSER_SESSION=api-discovery
node "$BROWSER_RUNTIME/launch.mjs"
```

The default is a visible browser. For a machine without a display, use `BROWSER_HEADLESS=1`. Leave `BROWSER_PROXY_*` unset for direct access. Optional inputs are `BROWSER_STORAGE_STATE`, `BROWSER_USER_AGENT`, `BROWSER_LOCALE`, and `BROWSER_TIMEZONE`. Storage state must be a local Playwright state JSON path.

Wait for `Ready`. The launcher starts recording on an empty page and writes `session.json`. Record the terminal session ID as well. Confirm the actual CDP listener binds only to loopback, for example with `lsof -nP -iTCP:9222 -sTCP:LISTEN` on macOS or `ss -ltnp` on Linux. Stop if it listens on a public interface.

In a separate command session:

```sh
agent-browser --session api-discovery connect 9222
agent-browser --session api-discovery tab list
agent-browser --session api-discovery get url
agent-browser --session api-discovery snapshot -i
```

Use the same named CLI session on every command. Confirm the selected tab matches a page in the recorded context. The REPL can inspect `context.pages().map(p => p.url())`. Do not start a second browser or load state through agent-browser after attaching. Navigate the existing page with `await page.goto(targetUrl)` in the REPL, then take a fresh CLI snapshot.

## Act and inspect

Use current snapshot refs, for example:

```sh
agent-browser --session api-discovery click @e2
agent-browser --session api-discovery get url
agent-browser --session api-discovery snapshot -i
agent-browser --session api-discovery network requests
```

Scope large snapshots with `snapshot -i -s '#observed-container'`. Use `eval --stdin` for DOM details that snapshots omit. Consult CLI help for request-body inspection commands available in that version. The recorder's `network.jsonl` and `bodies/` remain the saved evidence.

The launcher's REPL exposes `browser`, `context`, `page`, `evidence`, `mark`, `checkpoint`, `apiRequest`, and `checkEgress`. Use the original terminal session to send commands:

```js
await mark('before opening usage');
// Perform the action through agent-browser, then return here.
await mark('usage table visible');
await checkpoint('usage loaded');
```

`page` always names the initial page. For a popup or another tab, inspect `context.pages()` and pass the matching page to `mark(label, targetPage)`. Checkpoints save all open pages.

For a precise action and wait in the REPL:

```js
await Promise.all([
  page.waitForResponse(r => r.url().includes('/observed-endpoint') && r.request().method() === 'POST'),
  page.getByRole('button', { name: 'Observed button label', exact: true }).click(),
]);
await mark('observed response received');
```

Replace example selectors and paths with observed values. A response wait proves receipt, so inspect its body and the final UI too. Use a bounded wait for an expected state instead of `networkidle` on pages with polling or streams.

Load credentials in the local process from an existing secret store or protected environment file. Do not print them or place them in CLI arguments. For example, a REPL command can fill an observed password locator from `process.env.SITE_PASSWORD` without exposing its value. The raw trace may still contain entered credentials. Avoid printing full response objects or authentication state into the agent conversation.

## Capture limits and shutdown

The helper saves request metadata as it arrives and saves response bodies when requests finish. It records all resource types, including API responses and loaded scripts. Raw headers and bodies remain unredacted on disk with private permissions. Long sessions and media-heavy pages can consume substantial space. Narrow capture in a local helper copy if needed, but retain the relevant API calls and record omissions.

`mark` saves HTML, a screenshot, and a timestamped action label. `checkpoint` closes a numbered Playwright trace, saves storage state, and starts the next trace chunk. `trace.zip` holds the final chunk, so preserve all numbered archives too. The full HAR writes when the context closes. Storage state includes cookies, local storage, and IndexedDB, but does not restore session storage or every aspect of a browser profile.

agent-browser acts through CDP. Those actions and human clicks may lack Playwright action rows and before/after DOM snapshots in the trace. Use marks, screenshots, the network log, and HAR to reconstruct them. A Chrome performance trace from `agent-browser trace` is a different artifact and cannot replace the Playwright archive.

Browser request listeners do not capture `context.request` calls. Use `apiRequest(url, options)` for replay so the helper saves its request options and response body separately. Page fetches do reach the browser listeners. Failed or unfinished downloads may lack bodies. WebSocket frames and never-ending SSE streams need dedicated capture if the target operation uses them. Record any gaps instead of calling the capture complete.

To finish, enter `.exit` in the REPL and wait for `Saved evidence`. This saves final pages, storage state, `trace.zip`, and `network.har` before closing the browser. `SIGTERM` to the verified owner PID also attempts finalization. Do not use the browser window's close button, `agent-browser close`, or a force kill as the normal stop path.

If the CLI hangs, check the browser and local CDP endpoint before restarting anything. Identify and stop only the named session's stalled daemon, then reconnect to the same port. Never use `close --all` or a broad process kill. After normal shutdown, check for a remaining daemon for this session and stop only that process if needed.
