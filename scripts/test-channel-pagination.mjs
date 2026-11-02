// End-to-end test for circle channel feed pagination ("Load older posts").
// Boots the built bundle in jsdom, navigates to a circle's feed channel,
// and verifies: page 1 renders, the cursor request carries before/before_id,
// page 2 appends older posts, and the end marker appears.
// Run after `npm run build`: node scripts/test-channel-pagination.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const REACT_UMD = readFileSync('node_modules/react/umd/react.production.min.js', 'utf8');
const REACT_DOM_UMD = readFileSync('node_modules/react-dom/umd/react-dom.production.min.js', 'utf8');

const FAKE_USER = {
  id: 1, handle: 'tester', name: 'Tester', photo_url: null,
  background_url: null, background_blur: 10, background_mode: 'cover',
};

// 25 posts, newest first. Page 1 = posts 25..6, page 2 (before cursor) = posts 5..1.
const ALL_POSTS = Array.from({ length: 25 }, (_, i) => {
  const n = 25 - i; // 25 (newest) .. 1 (oldest)
  return {
    id: n, user_id: 99, user_name: 'Author', user_handle: 'author', user_photo: null,
    text: `post ${n}`, timestamp_iso: new Date(Date.now() - n * 60000).toISOString(),
    plus_one_count: 0, liked_by_me: false, comments_count: 0,
  };
});

const jsonRes = (obj, ok = true) => ({
  ok, status: ok ? 200 : 401,
  headers: { get: () => 'application/json' },
  json: async () => obj,
  text: async () => JSON.stringify(obj),
});

const requestedUrls = [];
let page2Served = false;

function stubFetch(url) {
  requestedUrls.push(url);
  if (url.includes('/api/me')) return jsonRes(FAKE_USER);
  if (url.includes('/api/users/me/unread')) return jsonRes({ circles: {} });
  if (url.includes('/api/dm/conversations')) return jsonRes([]);
  if (url.includes('/api/notifications')) return jsonRes([]);
  if (url.includes('/api/circles/cir1/layout')) return jsonRes({
    channels: [{ id: 'ch1', name: 'posts', channel_type: 'feed', owner_only_posts: false, description: '' }],
    folders: [],
  });
  if (url.includes('/api/circles/cir1/unread')) return jsonRes({ unread: {} });
  if (url.includes('/api/circles/cir1')) return jsonRes({ id: 'cir1', name: 'Test Circle', is_owner: true, description: '', banner_url: null, muted: false, is_pinned: false, invite_code: 'x' });
  if (url.endsWith('/api/circles/')) return jsonRes([{ id: 'cir1', name: 'Test Circle', icon_url: null, is_pinned: false, muted: false }]);
  if (url.includes('/api/posts/feed') && url.includes('channel_id=ch1')) {
    if (url.includes('before=')) {
      page2Served = true;
      return jsonRes({ posts: ALL_POSTS.slice(20) }); // older 5 => short page => end
    }
    return jsonRes({ posts: ALL_POSTS.slice(0, 20) }); // newest 20 => full page
  }
  if (url.includes('/api/posts/feed')) return jsonRes({ posts: [], has_more: false });
  return jsonRes({});
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'https://mylo.test/mylo/',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});
const w = dom.window;
w.eval(REACT_UMD);
w.eval(REACT_DOM_UMD);
if (!w.matchMedia) w.matchMedia = (q) => ({ matches: false, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } });
if (!w.IntersectionObserver) w.IntersectionObserver = class { constructor() { } observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } };
if (!w.ResizeObserver) w.ResizeObserver = class { constructor() { } observe() { } unobserve() { } disconnect() { } };

const errors = [];
const origErr = w.console.error;
w.console.error = (...a) => { errors.push(String(a[0] && a[0].message || a[0]).slice(0, 200)); };

w.fetch = async (input) => {
  const url = String(input);
  await new Promise((r) => setTimeout(r, 1));
  return stubFetch(url);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (fn()) return; } catch { /* not ready yet */ }
    await sleep(15);
  }
  assert.ok(false, `timed out waiting for: ${label}`);
}

w.eval(readFileSync('app.js', 'utf8'));

// 1. App boots authed with the circle in the sidebar
await waitFor(() => w.document.body.innerHTML.includes('Test Circle'), 'circle appears in sidebar');
console.log('sidebar shows the circle ✓');

// 2. Open the circle -> feed channel renders page 1 (newest 20)
const circleItem = [...w.document.querySelectorAll('.nav-item')].find((el) => el.textContent.includes('Test Circle'));
circleItem.click();
await waitFor(() => w.document.body.innerHTML.includes('>post 6<'), 'channel feed renders newest page');
assert.ok(!w.document.body.innerHTML.includes('>post 1<'), 'oldest post must not be on page 1');
console.log('channel feed shows newest 20 posts only ✓');

// 3. "Load older posts" button is present; click it
const olderBtn = [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Load older posts'));
assert.ok(olderBtn, 'load-older button visible after a full page');
olderBtn.click();
await waitFor(() => w.document.body.innerHTML.includes('>post 1<'), 'older posts appended');
console.log('older posts appended after click ✓');

// 4. The page-2 request used the cursor params
assert.ok(page2Served, 'a cursor (before=) request was made');
const cursorReq = requestedUrls.find((u) => u.includes('channel_id=ch1') && u.includes('before='));
assert.ok(cursorReq && cursorReq.includes('before_id='), 'page-2 request carried before + before_id');
console.log(`cursor request: ${cursorReq.replace('https://cinemint.online', '')} ✓`);

// 5. End marker replaces the button once the beginning is reached
await waitFor(() => w.document.body.innerHTML.includes('You\'ve reached the beginning of this channel.'), 'end marker');
assert.ok(![...w.document.querySelectorAll('button')].some((b) => b.textContent.includes('Load older posts')), 'button removed at the end');
console.log('end marker shown, button removed ✓');

const refs = errors.filter((e) => /ReferenceError|is not defined/.test(e));
assert.deepStrictEqual(refs, [], `reference errors:\n${refs.join('\n')}`);

console.log('\nCHANNEL PAGINATION TEST PASSED');
process.exit(0);
