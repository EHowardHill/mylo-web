// src/profile.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useAuth, useToast, useUI } from './contexts.js';
import { StatusEditor } from './feed.js';
import { useIsMounted, useSeq } from './hooks.js';
import { Post } from './posts.js';
import { Avatar, Spinner, UserRow } from './ui.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const ProfileView = ({ handle, onProfileClick, refreshSignal = 0 }) => {
      const auth = useAuth();
      const ui = useUI();
      const toast = useToast();
      const [user, setUser] = useState(null);
      const [posts, setPosts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [editing, setEditing] = useState(false);
      const [editName, setEditName] = useState('');
      const [editAbout, setEditAbout] = useState('');
      const bannerRef = useRef(null);
      const avatarRef = useRef(null);

      const load = useCallback(async () => {
        setLoading(true);
        try {
          const target = handle || auth.user.handle;
          const u = await api.getUser(target);
          setUser(u); setEditName(u.name); setEditAbout(u.about || '');
          const res = await api.getFeed({ user_id: u.id, limit: 20 });
          setPosts(res.posts || []);
        } catch (e) { toast.error(e.message); }
        setLoading(false);
      }, [handle, auth.user.handle, toast]);

      useEffect(() => { load(); }, [load]);

      // External refresh requests (e.g. after composing via the FAB).
      const lastSignalRef = useRef(refreshSignal);
      useEffect(() => {
        if (refreshSignal === lastSignalRef.current) return;
        lastSignalRef.current = refreshSignal;
        load();
      }, [refreshSignal]);

      const isMounted = useIsMounted();
      const nextFollowSeq = useSeq();

      const follow = async () => {
        const seq = nextFollowSeq(user.id);
        const prevFollowing = user.is_following, prevCount = user.followers_count || 0;
        const nextFollowing = !prevFollowing;
        // Optimistic: flip the follow state + follower count instantly.
        setUser(u => ({ ...u, is_following: nextFollowing, followers_count: Math.max(0, prevCount + (nextFollowing ? 1 : -1)) }));
        try {
          const r = await api.followUser(user.id);
          if (!seq.isCurrent() || !isMounted.current) return;
          setUser(u => ({ ...u, is_following: r.following, followers_count: r.followers_count }));
        } catch (e) {
          if (!seq.isCurrent() || !isMounted.current) return;
          setUser(u => ({ ...u, is_following: prevFollowing, followers_count: prevCount }));
          toast.error(e.message);
        }
      };
      const saveProfile = async () => {
        const prevName = auth.user.name, prevAbout = auth.user.about;
        const prevUserName = user.name, prevUserAbout = user.about;
        // Optimistic: apply the edits everywhere immediately, no refetch.
        auth.setUser({ ...auth.user, name: editName, about: editAbout });
        setUser(u => ({ ...u, name: editName, about: editAbout }));
        setEditing(false);
        toast.show('Profile saved.');
        // Roll back only the field that actually failed — a successful name
        // change must not be visually reverted by a failed about change.
        try {
          await api.updateName(editName);
        } catch (e) {
          if (!isMounted.current) return;
          auth.setUser({ ...auth.user, name: prevName });
          setUser(u => ({ ...u, name: prevUserName }));
          setEditing(true);
          toast.error(e.message);
          return;
        }
        try {
          await api.updateAbout(editAbout);
        } catch (e) {
          if (!isMounted.current) return;
          auth.setUser({ ...auth.user, about: prevAbout });
          setUser(u => ({ ...u, about: prevUserAbout }));
          setEditing(true);
          toast.error(e.message);
        }
      };
      const upload = async (e, kind) => {
        const file = e.target.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        // Uploads keep a busy state (duration dominated by the transfer);
        // on success we swap the URL locally instead of a full refetch.
        try {
          let res;
          if (kind === 'banner') res = await api.uploadBanner(fd);
          else res = await api.uploadAvatar(fd);
          if (res && res.url) {
            if (kind === 'avatar') { auth.setUser({ ...auth.user, photo_url: res.url }); setUser(u => ({ ...u, photo_url: res.url })); }
            else setUser(u => ({ ...u, banner_url: res.url }));
          } else { load(); }
          toast.show('Updated.');
        } catch (err) { toast.error(err.message); }
        e.target.value = '';
      };
      const delImage = async (kind) => {
        const prevBanner = user.banner_url, prevPhoto = user.photo_url;
        // Optimistic: blank the image immediately.
        if (kind === 'avatar') auth.setUser({ ...auth.user, photo_url: null });
        setUser(u => kind === 'banner' ? { ...u, banner_url: null } : { ...u, photo_url: null });
        toast.show('Removed.');
        try {
          if (kind === 'banner') await api.deleteBanner(); else await api.deleteAvatar();
        } catch (e) {
          if (!isMounted.current) return;
          if (kind === 'avatar') auth.setUser({ ...auth.user, photo_url: prevPhoto });
          setUser(u => kind === 'banner' ? { ...u, banner_url: prevBanner } : { ...u, photo_url: prevPhoto });
          toast.error(e.message);
        }
      };
      const showList = async (type) => {
        try {
          const list = type === 'followers' ? await api.getFollowers(user.handle) : await api.getFollowing(user.handle);
          ui.openModal({
            title: type === 'followers' ? 'Followers' : 'Following', render: (close) => (
              <div className="metro-stagger">
                {(list || []).map((u, i) => <UserRow key={i} user={u} onProfileClick={(h) => { close(); onProfileClick(h); }} />)}
                {(!list || list.length === 0) && <div className="empty-state">Nobody yet.</div>}
              </div>
            )
          });
        } catch (e) { toast.error(e.message); }
      };
      const toggleBlock = async () => {
        const next = !user.is_blocked;
        // Optimistic: flip the flag instantly.
        setUser(u => ({ ...u, is_blocked: next }));
        toast.show(next ? 'Blocked.' : 'Unblocked.');
        try {
          next ? await api.blockUser(user.id) : await api.unblockUser(user.id);
        } catch (e) {
          if (!isMounted.current) return;
          setUser(u => ({ ...u, is_blocked: !next }));
          toast.error(e.message);
        }
      };
      const toggleMute = async () => {
        const next = !user.is_muted;
        setUser(u => ({ ...u, is_muted: next }));
        toast.show(next ? 'Muted.' : 'Unmuted.');
        try {
          next ? await api.muteUser(user.id) : await api.unmuteUser(user.id);
        } catch (e) {
          if (!isMounted.current) return;
          setUser(u => ({ ...u, is_muted: !next }));
          toast.error(e.message);
        }
      };
      const dm = async () => {
        try { const r = await api.startDM(user.id); ui.goDM(r.circle.id); }
        catch (e) { toast.error(e.message); }
      };

      if (loading) return <Spinner />;
      if (!user) return <div className="feed-container"><div className="card empty-state">User not found.</div></div>;
      const isMe = user.is_me;

      return (
        <div className="feed-container metro-stagger">
          <div className="profile-header">
            <div className="banner" style={{ backgroundImage: user.banner_url ? `url(${user.banner_url})` : 'none' }}>
              {isMe && (
                <div style={{ float: 'right', margin: 10, display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => bannerRef.current.click()}>Edit banner</button>
                  {user.banner_url && <button className="btn btn-sm btn-danger" onClick={() => delImage('banner')}>Remove</button>}
                </div>
              )}
              <input type="file" ref={bannerRef} accept="image/*" style={{ display: 'none' }} onChange={e => upload(e, 'banner')} />
            </div>
            <div className="profile-info">
              <div style={{ position: 'relative' }}>
                <Avatar user={user} size={100} className="profile-avatar" />
                {isMe && <>
                  <button className="icon-btn" style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--gplus-red)', color: '#fff', width: 28, height: 28 }} onClick={() => avatarRef.current.click()}>+</button>
                  <input type="file" ref={avatarRef} accept="image/*" style={{ display: 'none' }} onChange={e => upload(e, 'avatar')} />
                </>}
              </div>
              <div className="profile-details">
                {editing ? <input value={editName} onChange={e => setEditName(e.target.value)} className="form-input" style={{ fontSize: 20, marginBottom: 8 }} />
                  : <div className="profile-name">{user.name} {user.status_emoji}</div>}
                <div className="user-handle">+{user.handle} · {user.status === 'online' ? '🟢 online' : 'offline'}</div>
                <div className="profile-stats">
                  <span className="stat-link" onClick={() => showList('followers')}>{user.followers_count || 0} followers</span>
                  {' · '}
                  <span className="stat-link" onClick={() => showList('following')}>{user.following_count || 0} following</span>
                  {user.status_text && ` · ${user.status_text}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {isMe ? (editing
                  ? <><button className="btn" onClick={saveProfile}>Save</button><button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button></>
                  : <><button className="btn btn-outline" onClick={() => setEditing(true)}>Edit profile</button>
                    <button className="btn btn-outline" onClick={() => ui.openModal({ render: (c) => <StatusEditor onClose={c} onSaved={load} /> })}>Status</button></>)
                  : <>
                    <button className={`btn ${user.is_following ? 'btn-outline' : ''}`} onClick={follow}>{user.is_following ? 'Following' : 'Follow'}</button>
                    <button className="btn btn-outline" onClick={dm}>Message</button>
                    <button className="btn btn-outline btn-sm" onClick={toggleMute}>{user.is_muted ? 'Unmute' : 'Mute'}</button>
                    <button className="btn btn-outline btn-sm" onClick={toggleBlock}>{user.is_blocked ? 'Unblock' : 'Block'}</button>
                  </>}
              </div>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              {editing ? <textarea value={editAbout} onChange={e => setEditAbout(e.target.value)} className="form-input" placeholder="About me" />
                : (user.about && <p>{user.about}</p>)}
            </div>
          </div>
          <div className="feed-stream metro-stagger">
            {posts.map(p => <Post key={p.id} post={p} onProfileClick={onProfileClick} onUpdate={(np) => setPosts(prev => prev.map(x => x.id === np.id ? np : x))} onDeleted={(id) => setPosts(prev => prev.filter(x => x.id !== id))} onRestored={(p) => setPosts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])} />)}
            {posts.length === 0 && <div className="card empty-state">No posts yet.</div>}
          </div>
        </div>
      );
    };

    const Directory = ({ onProfileClick }) => {
      const toast = useToast();
      const [users, setUsers] = useState([]);
      const [loading, setLoading] = useState(true);
      const [q, setQ] = useState('');
      useEffect(() => { api.getAllUsers().then(setUsers).catch(e => toast.error(e.message)).finally(() => setLoading(false)); }, [toast]);
      const filtered = users.filter(u => !q || (u.name + u.handle).toLowerCase().includes(q.toLowerCase()));
      if (loading) return <Spinner />;
      return (
        <div className="feed-container">
          <input className="form-input" placeholder="Filter members" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 16 }} />
          <div className="card metro-stagger">{filtered.map(u => <UserRow key={u.id} user={u} onProfileClick={onProfileClick} />)}
            {filtered.length === 0 && <div className="empty-state">No members found.</div>}</div>
        </div>
      );
    };

export { ProfileView, Directory };
