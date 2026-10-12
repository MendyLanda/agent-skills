import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import repl from 'node:repl';
import { launch } from 'cloakbrowser';

process.umask(0o077);
const evidence = resolve(process.env.BROWSER_EVIDENCE_DIR || `browser-evidence-${Date.now()}`);
mkdirSync(evidence, { recursive: false });
mkdirSync(join(evidence, 'bodies'));
const write = (name, data) => writeFileSync(join(evidence, name), data);
const log = (name, data) => appendFileSync(join(evidence, name), JSON.stringify({ time: new Date().toISOString(), ...data }) + '\n');
const port = Number(process.env.BROWSER_CDP_PORT || 9222);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a CDP port between 1024 and 65535.');
await new Promise((ok, fail) => {
  const probe = createServer();
  probe.once('error', fail);
  probe.listen(port, '127.0.0.1', () => probe.close(ok));
});
const proxy = process.env.BROWSER_PROXY_SERVER ? {
  server: process.env.BROWSER_PROXY_SERVER,
  ...(process.env.BROWSER_PROXY_USERNAME ? { username: process.env.BROWSER_PROXY_USERNAME } : {}),
  ...(process.env.BROWSER_PROXY_PASSWORD ? { password: process.env.BROWSER_PROXY_PASSWORD } : {}),
} : undefined;
if (proxy) {
  const url = new URL(proxy.server);
  if (url.username || url.password) throw new Error('Use separate proxy credential environment variables.');
}

const browser = await launch({
  headless: process.env.BROWSER_HEADLESS === '1',
  ...(proxy ? { proxy } : {}),
  args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
});
let context;
try {
  context = await browser.newContext({
    ...(proxy ? { proxy } : {}),
    ...(process.env.BROWSER_STORAGE_STATE ? { storageState: process.env.BROWSER_STORAGE_STATE } : {}),
    ...(process.env.BROWSER_USER_AGENT ? { userAgent: process.env.BROWSER_USER_AGENT } : {}),
    ...(process.env.BROWSER_LOCALE ? { locale: process.env.BROWSER_LOCALE } : {}),
    ...(process.env.BROWSER_TIMEZONE ? { timezoneId: process.env.BROWSER_TIMEZONE } : {}),
    recordHar: { path: join(evidence, 'network.har'), content: 'embed', mode: 'full' },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
} catch (error) {
  await browser.close();
  throw error;
}

let requestNumber = 0;
let captureNumber = 0;
let traceNumber = 0;
let closing;
const ids = new WeakMap();
const pending = new Set();
const idFor = request => {
  if (!ids.has(request)) ids.set(request, ++requestNumber);
  return ids.get(request);
};
const track = task => {
  pending.add(task);
  task.catch(error => log('errors.jsonl', { error: String(error) })).finally(() => pending.delete(task));
};
context.on('request', request => {
  const id = idFor(request);
  const body = request.postDataBuffer();
  if (body) write(`bodies/${id}-request.bin`, body);
  log('network.jsonl', {
    event: 'request', id, method: request.method(), url: request.url(),
    resourceType: request.resourceType(),
    redirectedFrom: request.redirectedFrom() ? idFor(request.redirectedFrom()) : null,
    headers: request.headers(), bodyFile: body ? `bodies/${id}-request.bin` : null,
  });
});
context.on('response', response => track((async () => {
  log('network.jsonl', {
    event: 'response', id: idFor(response.request()), status: response.status(),
    url: response.url(), headers: await response.allHeaders(),
  });
})()));
context.on('requestfinished', request => track((async () => {
  const id = idFor(request);
  const response = await request.response();
  let bodyFile = null;
  let bodyError = null;
  if (response) {
    try {
      const body = await response.body();
      bodyFile = `bodies/${id}-response.bin`;
      write(bodyFile, body);
    } catch (error) { bodyError = String(error); }
  }
  log('network.jsonl', { event: 'finished', id, headers: await request.allHeaders(), bodyFile, bodyError });
})()));
context.on('requestfailed', request => log('network.jsonl', {
  event: 'failed', id: idFor(request), failure: request.failure(),
}));
context.on('page', page => {
  page.on('pageerror', error => log('errors.jsonl', { url: page.url(), error: String(error) }));
  page.on('console', message => {
    if (message.type() === 'error') log('errors.jsonl', { url: page.url(), console: message.text() });
  });
});
const page = await context.newPage();
context.setDefaultTimeout(15000);

async function mark(label, target = page) {
  const id = ++captureNumber;
  log('actions.jsonl', { id, label, url: target.url() });
  write(`${id}.html`, await target.content());
  await target.screenshot({ path: join(evidence, `${id}.png`), fullPage: true });
}

async function checkpoint(label = 'checkpoint') {
  for (const target of context.pages()) {
    if (!target.isClosed()) await mark(label, target);
  }
  await context.storageState({ path: join(evidence, 'storage-state.json'), indexedDB: true });
  const name = `trace-${++traceNumber}.zip`;
  await context.tracing.stopChunk({ path: join(evidence, name) });
  await context.tracing.startChunk();
  log('actions.jsonl', { event: 'checkpoint', trace: name, label });
}

async function finish() {
  if (closing) return closing;
  closing = (async () => {
    const attempt = async (step, action) => {
      try { await action(); } catch (error) { log('errors.jsonl', { step, error: String(error) }); }
    };
    await attempt('final-pages', async () => {
      for (const target of context.pages()) if (!target.isClosed()) await mark('final', target);
    });
    await attempt('storage-state', () => context.storageState({ path: join(evidence, 'storage-state.json'), indexedDB: true }));
    await attempt('trace', () => context.tracing.stop({ path: join(evidence, 'trace.zip') }));
    await attempt('context-close', () => context.close());
    await Promise.allSettled([...pending]);
    await attempt('browser-close', () => browser.close());
    log('actions.jsonl', { event: 'closed' });
    console.log(`Saved evidence: ${evidence}`);
  })();
  return closing;
}

// APIRequestContext calls do not reach the browser's request event listeners.
async function apiRequest(url, options = {}) {
  const id = `api-${++requestNumber}`;
  log('network.jsonl', { event: 'api-request', id, url, options });
  const response = await context.request.fetch(url, { timeout: 15000, ...options });
  const bodyFile = `bodies/${id}-response.bin`;
  write(bodyFile, await response.body());
  log('network.jsonl', { event: 'api-response', id, url: response.url(), status: response.status(), headers: response.headers(), bodyFile });
  return response;
}

async function checkEgress(url, expectedIp) {
  const checkPage = await context.newPage();
  try {
    await checkPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const pageIp = JSON.parse(await checkPage.locator('body').innerText()).ip;
    const response = await apiRequest(url);
    const apiIp = (await response.json()).ip;
    await response.dispose();
    log('actions.jsonl', { event: 'egress-check', pageIp, apiIp, expectedIp });
    if (!pageIp || !apiIp || (expectedIp && (pageIp !== expectedIp || apiIp !== expectedIp))) {
      throw new Error('Egress check failed. Inspect the local evidence before opening the target.');
    }
    return { pageIp, apiIp, expectedMatch: expectedIp ? true : null };
  } finally { await checkPage.close(); }
}

write('session.json', JSON.stringify({
  pid: process.pid, cdpPort: port, evidence,
  session: process.env.BROWSER_SESSION || 'api-discovery', proxyConfigured: Boolean(proxy),
  startedAt: new Date().toISOString(),
}, null, 2));
console.log(`Ready. PID ${process.pid}, CDP 127.0.0.1:${port}, evidence ${evidence}`);
console.log('REPL: browser, context, page, mark, checkpoint, apiRequest, checkEgress. Use .exit to save and close.');
const shell = repl.start({ prompt: 'browser> ', useGlobal: false });
Object.assign(shell.context, { browser, context, page, evidence, mark, checkpoint, apiRequest, checkEgress });
shell.once('exit', () => { void finish(); });
process.once('SIGTERM', () => { shell.close(); void finish(); });
process.once('SIGINT', () => { shell.close(); void finish(); });
browser.once('disconnected', () => {
  if (!closing) {
    log('errors.jsonl', { error: 'Browser disconnected before finalization. The final trace or HAR may be incomplete.' });
    shell.close();
  }
});
