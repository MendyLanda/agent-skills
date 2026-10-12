# Inspect saved evidence

Start with `session.json` and `actions.jsonl`. Match the user's action to the numbered marks and trace chunks. Inspect `errors.jsonl` for capture failures as well as website errors.

Open the traces locally using the runtime's Playwright CLI:

```sh
"$BROWSER_RUNTIME/node_modules/.bin/playwright" show-trace /absolute/path/to/trace.zip
```

Open numbered `trace-*.zip` archives for earlier stages. If no display is available, inspect ZIP entries locally and use the separate HTML, screenshots, and network files. Do not upload raw evidence to a hosted viewer. Keep the [Playwright trace viewer documentation](https://playwright.dev/docs/trace-viewer) handy if the archive format or viewer options differ.

Each browser request has a numeric ID shared by its `request`, `response`, and `finished` or `failed` rows in `network.jsonl`. The request row points to its submitted body. The finished row points to its response body and includes full request headers. Redirects link to their predecessor. `api-*` IDs identify direct replay calls from the REPL helper.

Filter metadata first to avoid dumping account data into context. For example, this prints only IDs, methods, and matching URLs:

```sh
jq -c 'select(.event == "request" and (.url | contains("/observed-path"))) | {id, method, url}' /absolute/path/to/network.jsonl
```

URLs may contain secrets too. Inspect or redact query values before sharing them. Read the matching body file using the saved content type. `.bin` is just the file extension and may hold JSON, HTML, XML, or binary data. Check error bodies even for HTTP 200. The HAR also includes full request/response exchanges after a clean shutdown.

For each needed endpoint, record:

- The UI action, evidence request IDs, method, origin, and path.
- Query fields and body encoding, including JSON, form data, multipart boundaries, or GraphQL operation names and variables.
- Authentication and CSRF sources, token refresh behavior, and any prior selection or initialization request.
- Response fields, types, nulls, units, pagination, and application error forms.
- The observed effect, whether replay is safe, and any idempotency key or asynchronous completion check.
- Which claims the capture proves and which still need a test.

Do not assume every browser header is required. Preserve the observed working request first, then simplify it through safe tests. Never hardcode captured cookies, CSRF tokens, multipart boundaries, or account IDs into reusable code. Resolve them through the existing client's session and inputs.

For a partly implemented API, compare the new exchange with the nearest working method. Reuse its authentication and error handling when the evidence supports that match. Test sequential requests for two items if a prior call may change selected-item state. Do not infer that a GET is read-only solely from its method.

Keep a concise `findings.md` beside the evidence with the endpoint contract, replay or implementation result, and remaining unknowns. If code changed, point to it and record relevant checks. Produce redacted fixtures for parser tests without changing field types or the structure that caused the failure.
