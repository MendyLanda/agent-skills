# Optional proxy

Use the proxy supplied for this task. Set these variables through the existing secret store or a private environment file before launching:

```text
BROWSER_PROXY_SERVER=http://proxy-host:3128
BROWSER_PROXY_USERNAME=provided-user
BROWSER_PROXY_PASSWORD=provided-secret
```

Only `BROWSER_PROXY_SERVER` is required for a proxy without authentication. Keep credentials out of the server URL. The helper applies the proxy at browser launch and on the recorded context. Use that context's page or `apiRequest` helper for target APIs. A host `fetch` or `curl` call does not inherit these settings.

Before loading the target, check browser and API egress through an IP endpoint that returns JSON with an `ip` field. Use a user-supplied check URL when available. Otherwise `https://api.ipify.org?format=json` is an option. In the REPL:

```js
await checkEgress('https://api.ipify.org?format=json', process.env.BROWSER_EXPECTED_IP);
```

For a fixed or allowlisted route, set `BROWSER_EXPECTED_IP` to the required IP and require both values to match. If the user supplied only a proxy without an expected IP, record the observed values. They prove that the requests completed but do not prove the intended exit IP. Compare with a direct host check when useful. With a rotating proxy, different page and API IPs may be expected. Use a sticky session if the site binds authentication to one IP.

On a failed route check, stop before target access. Do not silently fall back to direct traffic. Changing agent-browser's proxy flag after attachment does not change the recorded browser's context.

HTTP and SOCKS proxy support and authentication vary with the installed CloakBrowser and Playwright versions. Verify the provided protocol using the installed package docs and the egress check. Do not translate a SOCKS proxy to HTTP or add a local relay without evidence that it is needed. If the target needs a timezone or locale tied to the proxy, set `BROWSER_TIMEZONE` and `BROWSER_LOCALE` from known account settings.
