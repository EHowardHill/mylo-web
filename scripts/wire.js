// One-time wiring tool: injects import/export statements into the src/ modules
// that were extracted verbatim from the original single-file app.
// Bodies are left byte-identical; only a header (imports + React destructure)
// and a trailing export statement are added.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;

// module -> { exports: [...names visible to other modules], internal: [...declared but private] }
const MANIFEST = {
  'api.js': { exports: ['API_BASE', 'STATIC_BASE', 'PUBLIC_BASE', 'request', 'qs', 'api'] },
  'hooks.js': { exports: ['tmpId', 'useIsMounted', 'useSeq', 'useOutsideClose'] },
  'push.js': { exports: ['pushSupported', 'tellSw', 'ensureServiceWorker', 'subscribePush', 'enablePush', 'disablePush', 'refreshPushOnLogin'], internal: ['swRegistration', 'urlBase64ToUint8Array'] },
  'deeplink.js': { exports: ['openPostModal', 'handlePushDeepLink'] },
  'icons.js': { exports: ['MatIcon', 'I'] },
  'contexts.js': { exports: ['AuthContext', 'useAuth', 'ToastContext', 'useToast', 'UIContext', 'useUI'] },
  'util.js': { exports: ['escapeHtml', 'formatText', 'timeAgo', 'clockTime', 'getDominantColor', 'fallbackAvatar'] },
  'ui.js': { exports: ['EMOJIS', 'Avatar', 'Spinner', 'Modal', 'ConfirmDialog', 'EmojiPicker', 'GifPicker', 'UserRow', 'RichText', 'MentionInput'] },
  'posts.js': { exports: ['PollView', 'CommentForm', 'CommentItem', 'CommentSection', 'Post', 'PostLinkModal', 'PublicPostView', 'ComposeModal', 'InlineCompose'], internal: ['COMMENT_TRIM', 'COMMENT_CHAR_LIMIT'] },
  'feed.js': { exports: ['Feed', 'StatusEditor'] },
  'profile.js': { exports: ['ProfileView', 'Directory'] },
  'notifications.js': { exports: ['openNotificationNav', 'Notifications'] },
  'chat.js': { exports: ['Message', 'ChatView', 'ChannelFeed'] },
  'circles.js': { exports: ['CircleSettings', 'CircleView'] },
  'dms.js': { exports: ['PeoplePicker', 'DMsView', 'DMChatView'] },
  'discover.js': { exports: ['CircleListCard', 'CreateCircleModal', 'DiscoverPage'] },
  'settings.js': { exports: ['SettingsView'] },
  'auth.js': { exports: ['AuthScreen'] },
  'shell.js': { exports: ['Sidebar', 'TopBar', 'ToastHost', 'LightboxHost', 'ModalHost', 'ComposeHost'] },
  'app.js': { exports: null }, // entry, not imported by anything
};

const HOOK_NAMES = ['useState', 'useEffect', 'useCallback', 'useRef', 'createContext', 'useContext', 'useMemo'];

const exportIndex = []; // [name, module]
for (const [mod, info] of Object.entries(MANIFEST)) {
  for (const name of info.exports || []) exportIndex.push([name, mod]);
}

const HEADER_MARK = '// ===== injected by scripts/wire.js — do not edit below this line in the header =====';

for (const [mod, info] of Object.entries(MANIFEST)) {
  const path = ROOT + mod;
  let body = readFileSync(path, 'utf8');
  // strip a previous header if re-run
  const markIdx = body.indexOf(HEADER_MARK);
  if (markIdx >= 0) body = body.slice(markIdx + HEADER_MARK.length).replace(/^\n+/, '');

  const selfNames = new Set([...(info.exports || []), ...(info.internal || [])]);

  // --- imports: scan for foreign exported identifiers ---
  const needed = new Map(); // module -> Set<name>
  for (const [name, srcMod] of exportIndex) {
    if (srcMod === mod || selfNames.has(name)) continue;
    // `I` is only ever used as `I.Component` — avoid matching the English word "I".
    const re = name === 'I' ? /\bI\.[A-Z]/ : new RegExp(`\\b${name}\\b`);
    if (re.test(body)) {
      if (!needed.has(srcMod)) needed.set(srcMod, new Set());
      needed.get(srcMod).add(name);
    }
  }
  const importLines = [...needed.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([srcMod, names]) => `import { ${[...names].sort().join(', ')} } from './${srcMod}';`);

  // --- React hook destructure (React is the UMD global) ---
  const usesHooks = HOOK_NAMES.some(h => new RegExp(`\\b${h}\\b`).test(body));
  const destructure = usesHooks
    ? `const { ${HOOK_NAMES.join(', ')} } = React;`
    : '';

  // --- export statement ---
  const exportLine = info.exports && info.exports.length
    ? `\nexport { ${info.exports.join(', ')} };\n`
    : '\n';

  const header = [
    `// src/${basename(mod)} — extracted verbatim from the original single-file app. Body is unchanged.`,
    importLines.join('\n'),
    destructure,
    HEADER_MARK,
  ].filter(Boolean).join('\n');

  writeFileSync(path, header + '\n' + body + exportLine);
  const imports = importLines.length ? importLines.join(' | ') : '(none)';
  console.log(`${mod.padEnd(18)} imports: ${imports}`);
}
console.log('\nDone.');
