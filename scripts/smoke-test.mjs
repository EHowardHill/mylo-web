// Smoke test: loads the built bundle (app.js) in jsdom with real React 17,
// stubs fetch, and renders the app logged-out and logged-in.
// Catches ReferenceErrors from missing cross-module imports and boot crashes.
// Run after `npm run build`: node scripts/smoke-test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// The same UMD builds the real page loads from unpkg:
const REACT_UMD = readFileSync('node_modules/react/umd/react.production.min.js', 'utf8');
const REACT_DOM_UMD = readFileSync('node_modules/react-dom/umd/react-dom.production.min.js', 'utf8');

const FAKE_USER = {
  id: 1, handle: 'tester', name: 'Tester', photo_url: null,
  background_url: null, background_blur: 10, background_mode: 'cover',
};

async function renderApp(mode) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://mylo.test/mylo/',
    pretendToBeVisual: true,
    runScripts: 'dangerously', // window.React etc. must be visible as realm globals to the bundle
  });
  const w = dom.window;
  w.eval(REACT_UMD);    // defines global React inside the jsdom realm
  w.eval(REACT_DOM_UMD); // defines global ReactDOM
  if (!w.matchMedia) {
    w.matchMedia = (q) => ({ matches: false, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } });
  }
  // jsdom lacks these browser APIs; the real browsers have them.
  if (!w.IntersectionObserver) {
    w.IntersectionObserver = class { constructor() { } observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } };
  }
  if (!w.ResizeObserver) {
    w.ResizeObserver = class { constructor() { } observe() { } unobserve() { } disconnect() { } };
  }

  const jsonRes = (obj, ok = true) => ({
    ok, status: ok ? 200 : 401,
    headers: { get: () => 'application/json' },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  });

  w.fetch = async (input) => {
    const url = String(input);
    await new Promise((r) => setTimeout(r, 1));
    if (url.includes('/api/me')) return mode === 'anon' ? jsonRes({ error: 'no session' }, false) : jsonRes(FAKE_USER);
    if (url.includes('/api/circles/')) return jsonRes([]);
    if (url.includes('/api/users/me/unread')) return jsonRes({ circles: {} });
    if (url.includes('/api/dm/conversations')) return jsonRes([]);
    if (url.includes('/api/notifications')) return jsonRes([]);
    if (url.includes('/api/posts/feed')) return jsonRes({ posts: [], has_more: false });
    return jsonRes({});
  };

  const reactErrors = [];
  const origErr = w.console.error;
  w.console.error = (...a) => {
    const msg = a.map((x) => {
      const s = (x && x.stack) ? `${x.message}\n${String(x.stack).split('\n').slice(0, 3).join('\n')}` : String(x);
      return s.length > 300 ? s.slice(0, 300) + '…' : s;
    }).join(' | ');
    reactErrors.push(msg);
  };
  w.addEventListener('error', (e) => reactErrors.push(String(e.error || e.message)));

  w.eval(readFileSync('app.js', 'utf8'));
  await new Promise((r) => setTimeout(r, 80));

  const html = w.document.getElementById('root').innerHTML;
  return { html, reactErrors };
}

// --- phase 1: logged out -> AuthScreen ---
const anon = await renderApp('anon');
assert.ok(anon.html.includes('auth-container'), 'logged-out: AuthScreen did not render');
assert.ok(anon.html.length > 200, 'logged-out: root is empty');
const anonRefs = anon.reactErrors.filter((e) => /ReferenceError|is not defined/.test(e));
assert.deepStrictEqual(anonRefs, [], `logged-out: undefined references:\n${anonRefs.join('\n')}`);
console.log(`logged-out: AuthScreen rendered (${anon.html.length} bytes of HTML, no reference errors) ✓`);

// --- phase 2: logged in -> full app shell + feed ---
const authed = await renderApp('authed');
assert.ok(authed.html.includes('app-container'), 'logged-in: app shell did not render');
assert.ok(!authed.html.includes('auth-container'), 'logged-in: still showing auth screen');
const authedRefs = authed.reactErrors.filter((e) => /ReferenceError|is not defined/.test(e));
assert.deepStrictEqual(authedRefs, [], `logged-in: undefined references:\n${authedRefs.join('\n')}`);
console.log(`logged-in: app shell + feed rendered (${authed.html.length} bytes of HTML, no reference errors) ✓`);

// Report any non-fatal React warnings for eyeballing
const warnings = [...anon.reactErrors, ...authed.reactErrors].filter((e) => !/ReferenceError|is not defined/.test(e));
if (warnings.length) console.log(`\n(non-fatal console.error output during render: ${warnings.length})\n${[...new Set(warnings)].slice(0, 10).join('\n---\n')}`);
console.log('\nSMOKE TEST PASSED');
process.exit(0); // the app's badge-refresh interval keeps the event loop alive
