// src/feed.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { useAuth, useToast, useUI } from './contexts.js';
import { InlineCompose, Post } from './posts.js';
import { Modal, Spinner } from './ui.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const Feed = ({ onProfileClick, refreshSignal = 0 }) => {
      const ui = useUI();
      const [posts, setPosts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [offset, setOffset] = useState(0);
      const [hasMore, setHasMore] = useState(true);
      const [sort, setSort] = useState('newest');
      const [mediaType, setMediaType] = useState('all');
      const [following, setFollowing] = useState(false);
      const [aggregate, setAggregate] = useState(true);
      const sentinelRef = useRef(null);
      const loadingRef = useRef(false);
      const reqIdRef = useRef(0);
      // Bumped after every completed fetch so the IntersectionObserver is
      // re-created and re-delivers its initial entry — a sentinel that stayed
      // visible during a fetch would otherwise never fire again.
      const [obsEpoch, setObsEpoch] = useState(0);
      // Bumped when a reset fetch lands so Post cards remount and re-read
      // fresh like/comment state from the server payload.
      const [resetEpoch, setResetEpoch] = useState(0);
      const lastSignalRef = useRef(refreshSignal);
      // Refs mirror state so fetchFeed can stay stable (no posts/offset deps)
      // — keeps the IntersectionObserver from re-creating on every page load.
      const postsRef = useRef([]);
      const offsetRef = useRef(0);
      useEffect(() => { postsRef.current = posts; }, [posts]);
      useEffect(() => { offsetRef.current = offset; }, [offset]);

      const fetchFeed = useCallback(async (reset) => {
        // Single in-flight guard covering every fetch entry point (observer,
        // initial mount, filter changes, compose-onCreated). loadingRef is set
        // synchronously so the IntersectionObserver's initial intersection entry
        // never double-fires fetchFeed. A reset always wins (it supersedes any
        // in-flight non-reset fetch via the request-id check below).
        if (loadingRef.current && !reset) return;
        const reqId = ++reqIdRef.current;
        loadingRef.current = true;
        setLoading(true);
        try {
          const params = {
            limit: 20, sort, media_type: mediaType,
            following: following ? 'true' : undefined, aggregate: aggregate ? 'true' : undefined,
          };
          if (reset) {
            params.offset = 0;
          } else if (sort === 'popular' || sort === 'oldest') {
            // Re-ordered listings (popular by votes, oldest ascending) can't
            // use the "older-than" cursor — keep offset pagination for them.
            params.offset = offsetRef.current;
          } else {
            // Cursor: "posts older than the last one I have". Stable under
            // new arrivals above the cursor (no offset-shift shuffle).
            const last = postsRef.current[postsRef.current.length - 1];
            if (last && last.timestamp_iso) {
              params.before = last.timestamp_iso;
              params.before_id = last.id;
            } else {
              // Fallback when the cursor can't be built (empty list, or the
              // last post has no created_at): advance by offset so the backend
              // returns the NEXT page instead of re-serving page 1.
              params.offset = offsetRef.current;
            }
          }
          const res = await api.getFeed(params);
          if (reqId !== reqIdRef.current) return;   // a newer fetch superseded this one
          const np = res.posts || [];
          setPosts(prev => {
            if (reset) return np;
            // De-duplicate by id in case the backend re-serves a post we
            // already have (prevents the list growing without bound).
            const seen = new Set(prev.map(p => p.id));
            return [...prev, ...np.filter(p => !seen.has(p.id))];
          });
          // Track count loaded locally (backend's next_offset is meaningless in
          // cursor mode: request offset is always 0 there).
          setOffset(prev => reset ? np.length : prev + np.length);
          // Self-sufficient "more available" signal: a full page means there
          // may be more; a short page means we've reached the end.
          setHasMore(np.length >= 20);
          if (reset) setResetEpoch(e => e + 1);
        } catch (e) { if (reqId === reqIdRef.current) console.error(e); }
        if (reqId === reqIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
          setObsEpoch(e => e + 1);
        }
      }, [sort, mediaType, following, aggregate]);

      useEffect(() => { fetchFeed(true); }, [sort, mediaType, following, aggregate]);

      // External refresh requests (e.g. after composing via the FAB) trigger
      // a reset fetch. The ref guard skips the mount run and repeat signals.
      useEffect(() => {
        if (refreshSignal === lastSignalRef.current) return;
        lastSignalRef.current = refreshSignal;
        fetchFeed(true);
      }, [refreshSignal]);

      // Infinite scroll: when the sentinel enters the viewport, load the next page.
      // NOTE: `loading` is intentionally NOT a dependency — loadingRef guards
      // concurrency without re-creating the observer mid-flight. `obsEpoch` is
      // bumped after every completed fetch so the observer is re-created and
      // re-delivers its initial entry; a sentinel that stayed visible during a
      // fetch would otherwise never fire again (pagination would stall).
      useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting && hasMore && !loadingRef.current) {
              fetchFeed(false);
            }
          }
        }, { rootMargin: '600px' });
        io.observe(el);
        return () => io.disconnect();
      }, [hasMore, fetchFeed, obsEpoch]);

      const onUpd = useCallback((p) => setPosts(prev => prev.map(x => x.id === p.id ? p : x)), []);
      const onDel = useCallback((id) => setPosts(prev => prev.filter(x => x.id !== id)), []);
      // Re-show a post at the end of the feed when an optimistic delete/report failed.
      const onRestore = useCallback((p) => setPosts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p]), []);

      return (
        <div className="feed-container metro-stagger">
          <InlineCompose onOpen={() => ui.openCompose({ onCreated: () => fetchFeed(true) })} />

          <div className="card" style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="form-input" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="popular">Popular</option>
            </select>
            <select className="form-input" style={{ width: 'auto' }} value={mediaType} onChange={e => setMediaType(e.target.value)}>
              <option value="all">All posts</option><option value="text">Text</option><option value="photos">Photos</option><option value="videos">Videos</option><option value="audio">Audio</option>
            </select>
            <button className={`btn btn-sm ${following ? '' : 'btn-outline'}`} style={{ marginLeft: 'auto' }} onClick={() => setFollowing(f => !f)}>Following</button>
            <button className={`btn btn-sm ${aggregate ? '' : 'btn-outline'}`} onClick={() => setAggregate(a => !a)}>All circles</button>
          </div>

          <div className="feed-stream metro-stagger">
            {posts.map(p => <Post key={`${resetEpoch}-${p.id}`} post={p} onProfileClick={onProfileClick} onUpdate={onUpd} onDeleted={onDel} onRestored={onRestore} />)}
            {loading && posts.length === 0 && <Spinner />}
            {!loading && posts.length === 0 && <div className="card empty-state">Nothing here yet. Be the first to post.</div>}
          </div>
          <div ref={sentinelRef} style={{ height: 1 }} />
          {loading && posts.length > 0 && <Spinner />}
        </div>
      );
    };

    const StatusEditor = ({ onClose, onSaved }) => {
      const auth = useAuth();
      const toast = useToast();
      const [textVal, setTextVal] = useState(auth.user.status_text || '');
      const [emoji, setEmoji] = useState(auth.user.status_emoji || '');
      const save = async () => {
        const prevText = auth.user.status_text, prevEmoji = auth.user.status_emoji;
        // Optimistic: status is low-stakes text — apply instantly, revert on failure.
        auth.setUser({ ...auth.user, status_text: textVal, status_emoji: emoji });
        toast.show('Status updated.'); onSaved && onSaved(); onClose();
        try {
          await api.setStatus(textVal, emoji);
        } catch (e) {
          auth.setUser({ ...auth.user, status_text: prevText, status_emoji: prevEmoji });
          toast.error(e.message);
        }
      };
      return (
        <Modal title="Set status" onClose={onClose}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="form-input" style={{ width: 64, textAlign: 'center' }} value={emoji} maxLength={4} placeholder="🙂" onChange={e => setEmoji(e.target.value)} />
            <input className="form-input" maxLength={100} placeholder="What's happening?" value={textVal} onChange={e => setTextVal(e.target.value)} />
          </div>
          <div className="emoji-bar" style={{ marginBottom: 16 }}>{['💼', '🏖️', '🎮', '📚', '☕', '😴', '🎧', '🚀'].map(e => <button key={e} onClick={() => setEmoji(e)}>{e}</button>)}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={() => { setTextVal(''); setEmoji(''); }}>Clear</button>
            <button className="btn" onClick={save}>Save</button>
          </div>
        </Modal>
      );
    };

export { Feed, StatusEditor };
