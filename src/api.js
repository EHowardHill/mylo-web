// src/api.js — extracted verbatim from the original single-file app. Body is unchanged.
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const API_BASE = 'https://cinemint.online/mylo/api';
    const STATIC_BASE = 'https://cinemint.online/mylo/static/uploads/';
    const PUBLIC_BASE = 'https://cinemint.online/mylo/p/';

    /* ============================ API LAYER ============================ */
    async function request(path, options = {}) {
      const opts = { ...options, credentials: 'include', headers: { ...(options.headers || {}) } };
      const isForm = options.body instanceof FormData;
      if (options.body && !isForm && !opts.headers['Content-Type']) {
        opts.headers['Content-Type'] = 'application/json';
      }
      if (options.body && typeof options.body === 'object' && !isForm) {
        opts.body = JSON.stringify(options.body);
      }
      const res = await fetch(`${API_BASE}${path}`, opts);
      if (res.status === 204) return null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Something went wrong.');
        return data;
      }
      const text = await res.text();
      if (!res.ok) throw new Error(text || 'Something went wrong.');
      return text;
    }

    const qs = (params) => {
      const clean = {};
      Object.keys(params || {}).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') clean[k] = params[k];
      });
      const s = new URLSearchParams(clean).toString();
      return s ? `?${s}` : '';
    };

    const api = {
      login: (email, password) => request('/login', { method: 'POST', body: { email, password } }),
      register: (data) => request('/register', { method: 'POST', body: data }),
      logout: () => request('/logout', { method: 'POST' }),
      me: () => request('/me'),
      forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
      resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: { token, password } }),
      uploadAvatar: (fd) => request('/users/me/avatar', { method: 'POST', body: fd }),
      deleteAvatar: () => request('/users/me/avatar', { method: 'DELETE' }),
      updateAbout: (about_text) => request('/users/me/about', { method: 'POST', body: { about_text } }),
      updateName: (new_name) => request('/users/me/name', { method: 'POST', body: { new_name } }),
      uploadBanner: (fd) => request('/users/me/banner', { method: 'POST', body: fd }),
      deleteBanner: () => request('/users/me/banner', { method: 'DELETE' }),
      uploadBackground: (fd) => request('/users/me/background', { method: 'POST', body: fd }),
      deleteBackground: () => request('/users/me/background', { method: 'DELETE' }),
      setBackgroundMode: (mode) => request('/users/me/background/mode', { method: 'POST', body: { mode } }),
      setBackgroundBlur: (blur) => request('/users/me/background/blur', { method: 'POST', body: { blur } }),
      setStatus: (status_text, status_emoji) => request('/users/me/status', { method: 'POST', body: { status_text, status_emoji } }),
      getUser: (handle) => request(`/users/handle/${encodeURIComponent(handle)}`),
      getFollowers: (handle) => request(`/users/handle/${encodeURIComponent(handle)}/followers`),
      getFollowing: (handle) => request(`/users/handle/${encodeURIComponent(handle)}/following`),
      getAllUsers: () => request('/users/all'),
      getFollowSuggestions: () => request('/users/me/following/suggestions'),
      searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
      getUserUnread: () => request('/users/me/unread'),
      blockUser: (id) => request(`/users/block/${id}`, { method: 'POST' }),
      unblockUser: (id) => request(`/users/block/${id}`, { method: 'DELETE' }),
      muteUser: (id) => request(`/users/mute/${id}`, { method: 'POST' }),
      unmuteUser: (id) => request(`/users/mute/${id}`, { method: 'DELETE' }),
      deleteAccount: () => request('/users/me/delete', { method: 'POST' }),
      listCircles: () => request('/circles/'),
      createCircle: (body) => request('/circles/', { method: 'POST', body }),
      discoverCircles: () => request('/circles/discover'),
      getCircle: (id) => request(`/circles/${id}`),
      updateCircle: (id, body) => request(`/circles/${id}`, { method: 'PATCH', body }),
      deleteCircle: (id) => request(`/circles/${id}`, { method: 'DELETE' }),
      uploadCircleIcon: (id, fd) => request(`/circles/${id}/icon`, { method: 'POST', body: fd }),
      uploadCircleBanner: (id, fd) => request(`/circles/${id}/banner`, { method: 'POST', body: fd }),
      joinCircle: (invite_code) => request('/circles/join', { method: 'POST', body: { invite_code } }),
      leaveCircle: (id) => request(`/circles/${id}/leave`, { method: 'POST' }),
      resetInvite: (id) => request(`/circles/${id}/invite/reset`, { method: 'POST' }),
      previewInvite: (code) => request(`/circles/invite/${encodeURIComponent(code)}/preview`),
      getMembers: (id) => request(`/circles/${id}/members`),
      kickMember: (id, uid) => request(`/circles/${id}/members/${uid}/kick`, { method: 'POST' }),
      transferOwnership: (id, new_owner_id) => request(`/circles/${id}/transfer-ownership`, { method: 'POST', body: { new_owner_id } }),
      circleReadAll: (id) => request(`/circles/${id}/read-all`, { method: 'POST' }),
      muteCircle: (id) => request(`/circles/${id}/mute`, { method: 'POST' }),
      pinCircle: (id) => request(`/circles/${id}/pin`, { method: 'POST' }),
      getLayout: (id) => request(`/circles/${id}/layout`),
      getCircleUnread: (id) => request(`/circles/${id}/unread`),
      getChannels: (id) => request(`/circles/${id}/channels`),
      createChannel: (id, body) => request(`/circles/${id}/channels`, { method: 'POST', body }),
      updateChannel: (id, cid, body) => request(`/circles/${id}/channels/${cid}`, { method: 'PATCH', body }),
      deleteChannel: (id, cid) => request(`/circles/${id}/channels/${cid}`, { method: 'DELETE' }),
      reorderChannels: (id, channels) => request(`/circles/${id}/channels/reorder`, { method: 'POST', body: { channels } }),
      markChannelRead: (cid) => request(`/circles/channels/${cid}/read`, { method: 'POST' }),
      getMyFeedChannels: () => request('/circles/my-feed-channels'),
      getFolders: (id) => request(`/circles/${id}/folders`),
      createFolder: (id, name) => request(`/circles/${id}/folders`, { method: 'POST', body: { name } }),
      updateFolder: (id, fid, body) => request(`/circles/${id}/folders/${fid}`, { method: 'PATCH', body }),
      deleteFolder: (id, fid) => request(`/circles/${id}/folders/${fid}`, { method: 'DELETE' }),
      reorderFolders: (id, order) => request(`/circles/${id}/folders/reorder`, { method: 'POST', body: { order } }),
      getMessages: (cid, params) => request(`/channels/${cid}/messages${qs(params)}`),
      sendMessage: (cid, body, idempotencyKey) => request(`/channels/${cid}/messages`, { method: 'POST', body, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} }),
      editMessage: (mid, content) => request(`/messages/${mid}`, { method: 'PATCH', body: { content } }),
      deleteMessage: (mid) => request(`/messages/${mid}`, { method: 'DELETE' }),
      reactMessage: (mid, emoji) => request(`/messages/${mid}/react`, { method: 'POST', body: { emoji } }),
      pinMessage: (mid) => request(`/messages/${mid}/pin`, { method: 'POST' }),
      getChannelAlert: (cid) => request(`/channels/${cid}/alert`),
      toggleChannelAlert: (cid) => request(`/channels/${cid}/alert`, { method: 'POST' }),
      channelStreamUrl: (cid) => `${API_BASE}/channels/${cid}/stream`,
      sendTyping: (cid, state) => request(`/channels/${cid}/typing`, { method: 'POST', body: { state } }),
      getFeed: (params) => request(`/posts/feed${qs(params)}`),
      createPost: (fd) => request('/posts/create', { method: 'POST', body: fd }),
      getPublicPost: (id) => request(`/posts/public/${id}`),
      deletePost: (id) => request(`/posts/${id}/delete`, { method: 'POST' }),
      reportPost: (id) => request(`/posts/${id}/report`, { method: 'POST' }),
      pinPost: (id) => request(`/posts/${id}/pin`, { method: 'POST' }),
      getPostLikes: (id) => request(`/posts/${id}/likes`),
      plusOnePost: (id) => request(`/posts/plus_one/${id}`, { method: 'POST' }),
      followUser: (id) => request(`/posts/follow/${id}`, { method: 'POST' }),
      addComment: (postId, text) => {
        const fd = new FormData();
        fd.append('post_id', postId);
        fd.append('comment_text', text);
        return request('/posts/comment/post', { method: 'POST', body: fd });
      },
      deleteComment: (postId, commentId) => request(`/posts/comment/delete/${postId}/${commentId}`, { method: 'POST' }),
      plusOneComment: (postId, commentId) => request(`/posts/plus_one_comment/${postId}/${commentId}`, { method: 'POST' }),
      votePoll: (postId, optionId) => request(`/posts/${postId}/vote`, { method: 'POST', body: { option_id: optionId } }),
      unvotePoll: (postId) => request(`/posts/${postId}/unvote`, { method: 'POST' }),
      closePoll: (postId) => request(`/posts/${postId}/poll/close`, { method: 'POST' }),
      getPollVoters: (postId, optionId) => request(`/posts/${postId}/poll/voters/${optionId}`),
      getNotifications: () => request('/notifications'),
      markNotificationsRead: () => request('/notifications/read', { method: 'POST' }),
      getPushVapidKey: () => request('/push/vapid-key'),
      pushSubscribe: (body) => request('/push/subscribe', { method: 'POST', body }),
      pushUnsubscribe: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
      getPushStatus: () => request('/push/status'),
      sendTestPush: () => request('/push/test', { method: 'POST' }),
      saveFcmToken: (token, platform) => request('/push/fcm/token', { method: 'POST', body: { token, platform } }),
      removeFcmToken: (token) => request('/push/fcm/token/remove', { method: 'POST', body: { token } }),
      getConversations: () => request('/dm/conversations'),
      startDM: (uid) => request(`/dm/conversations/${uid}`, { method: 'POST' }),
      gifTrending: () => request('/gif/trending'),
      gifSearch: (q) => request(`/gif/search?q=${encodeURIComponent(q)}`),
    };

export { API_BASE, STATIC_BASE, PUBLIC_BASE, request, qs, api };
