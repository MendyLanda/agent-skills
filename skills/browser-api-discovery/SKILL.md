---
name: browser-api-discovery
description: Reverse engineer website APIs, discover browser automation steps, or inspect saved browser traces with CloakBrowser and agent-browser. Use when extending a partial API integration or capturing an interactive workflow for offline analysis.
---

# Browser API discovery

Use CloakBrowser to own one live Playwright context and agent-browser to control its pages through local CDP. Record the evidence before navigating. Work from saved files once they answer the question.

This skill runs on its own. It needs no project account loader, trace service, database, or cloud storage. Connect directly unless the user supplies a proxy.

## 1. Find the missing operation

Read the existing API client and any saved evidence. Identify the operation the user needs, the target website and account, and which part of the contract remains unknown. Preserve working authentication and endpoint code.

Use the user's existing authorization for live actions. If discovery reaches a state change outside that scope, inspect through the review step and ask before the final submit. A request to inspect a flow does not authorize every action the website offers.

Finish when you can name the missing operation and the evidence needed to implement it. If saved evidence already supplies that contract, go to step 4.

## 2. Start one recorded browser

Read [references/live-browser.md](references/live-browser.md) before live access. It covers the standalone launcher, dependency setup, agent-browser attachment, credentials, and clean shutdown. If a proxy was supplied, also read [references/proxy.md](references/proxy.md) and verify its route before opening the target.

Keep the launch process alive across commands. Attach agent-browser to its CDP port and select the existing recorded page. Reuse saved storage state when available. Check whether it still authenticates before starting another login.

Finish when agent-browser controls the launcher's page, capture is running, and the session record gives the owner PID, CDP port, CLI session, and evidence directory.

## 3. Observe one action at a time

Take an interactive snapshot, act on current refs, then inspect the visible result and the related request and response. Refresh refs after page changes. Save a `mark` before and after each meaningful action, with a label that says what happened. Use `checkpoint` after each completed stage so there is a closed trace archive even if a later stage crashes.

Keep the page's input, review, submit, and result stages separate. A changed dropdown value, HTTP 200, or successful CLI command does not prove the requested result. Inspect response bodies for application errors and wait for the final state.

Capture the website's own requests first. Inspect form actions, links, inline handlers, and loaded scripts when the UI does not explain a call. Record any direct URL or handcrafted API request as a separate experiment, since it does not prove the skipped UI path.

Use the launcher's Playwright REPL for precise locators or event waits the CLI cannot express. Arm response or navigation waits before the triggering action. Only one controller should act at a time. During a human demonstration, record without issuing competing actions.

If a command stalls, inspect the current URL, screenshot, and network log before retrying. Do not repeat a submit just because its command timed out.

Finish when each relevant action has its inputs, request, response, visible result, and failure details saved, or the evidence identifies a blocker.

## 4. Derive and verify the contract

Read [references/offline-analysis.md](references/offline-analysis.md). Match the missing operation to saved request IDs and trace stages. Distinguish observed facts from guesses about required fields or server behavior.

When an implementation is requested, extend the existing client or add a Playwright flow using the observed contract. Use stable locators in code, never agent-browser's temporary refs. Validate parsers and observed failures with redacted captured fixtures. Check selected-account or selected-item state before making session-bound calls concurrent.

Replay only within the authorized scope. Use the same browser context for API validation so cookies and any proxy remain consistent. Do not repeat writes merely to learn which headers can be removed. If the user only asked for investigation, deliver the contract and evidence without adding code.

Finish when the requested operation maps to evidence and relevant checks pass, or name the exact unknown that prevents completion.

## 5. Save and hand off

Finalize capture before closing the browser. Verify the trace archive opens and the relevant response bodies exist. Inspect any capture errors. Browser-window closure or a force kill may prevent trace and HAR finalization.

Report the evidence directory, endpoint findings, changes made, checks run, and untested steps. If the user wants the browser left open, checkpoint first and report the owner process and reconnect command. Otherwise stop only this investigation's processes.

Keep raw captures and authentication state private and outside version control. They can contain cookies, tokens, passwords, and account data. Share redacted excerpts or fixtures, with enough structure left to explain the contract.

Finish when another agent can resume from the saved evidence without repeating discovery, and every browser or helper process is closed or accounted for.
