// src/deeplink.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { Post } from './posts.js';
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    // Shared "open one post in a modal" flow (push deep links, notification
    // clicks, public permalinks for signed-in visitors).
    async function openPostModal(postId, ui, toast, onProfileClick) {
      try {
        const res = await api.getPublicPost(postId);
        ui.openModal({
          title: 'post', wide: true, render: (close) => (
            <Post post={res.post}
              onProfileClick={(h) => { close(); onProfileClick(h); }}
              onUpdate={() => { }} onDeleted={() => { }} />
          ),
        });
        return true;
      } catch (e) {
        toast.show('This post is no longer available.');
        return false;
      }
    }

    async function handlePushDeepLink(ui, toast, onProfileClick) {
      const params = new URLSearchParams(window.location.search);
      const tt = params.get('ntt');
      const tid = params.get('ntid');
      const cid = params.get('ncid');
      const sh = params.get('nsh');
      if (!tt && !sh) return;
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) { }
      if (tt === 'post' && tid) { await openPostModal(tid, ui, toast, onProfileClick); return; }
      if (tt === 'channel' && cid && tid) { ui.goCircle(cid, tid); return; }
      if (sh) { ui.goProfile(sh); return; }
    }

export { openPostModal, handlePushDeepLink };
