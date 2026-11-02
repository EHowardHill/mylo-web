// src/posts.js — extracted verbatim from the original single-file app. Body is unchanged.
import { PUBLIC_BASE, api } from './api.js';
import { useAuth, useToast, useUI } from './contexts.js';
import { tmpId, useIsMounted, useOutsideClose, useSeq } from './hooks.js';
import { I } from './icons.js';
import { Avatar, ConfirmDialog, EmojiPicker, GifPicker, MentionInput, Modal, RichText, Spinner, UserRow } from './ui.js';
import { timeAgo } from './util.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const PollView = ({ post, onUpdate }) => {
      const toast = useToast();
      const ui = useUI();
      const auth = useAuth();
      const isMounted = useIsMounted();
      const nextPollSeq = useSeq();
      const poll = post.poll;
      const voted = poll.my_vote !== null && poll.my_vote !== undefined;
      const isAuthor = post.user_id === (auth && auth.user && auth.user.id);

      // Pure local re-derivation of poll counts/pcts for optimistic updates.
      const withVote = (p, myVote) => {
        const had = p.my_vote !== null && p.my_vote !== undefined;
        const total = Math.max(0, (p.total_votes || 0) + (myVote !== null && myVote !== undefined ? (had ? 0 : 1) : (had ? -1 : 0)));
        const options = p.options.map(o => {
          let c = o.count || 0;
          if (had && o.id === p.my_vote) c = Math.max(0, c - 1);
          if (myVote !== null && myVote !== undefined && o.id === myVote) c += 1;
          return { ...o, count: c, pct: total ? Math.round(c / total * 100) : 0 };
        });
        return { ...p, options, total_votes: total, my_vote: myVote };
      };

      const vote = async (id) => {
        const seq = nextPollSeq(post.id);
        const snap = poll;
        // Optimistic: mark my vote instantly with locally recomputed bars.
        onUpdate({ ...post, poll: withVote(poll, id) });
        try {
          const res = await api.votePoll(post.id, id);
          if (!seq.isCurrent() || !isMounted.current) return;
          onUpdate({ ...post, poll: res.poll });
        } catch (e) {
          if (!seq.isCurrent() || !isMounted.current) return;
          onUpdate({ ...post, poll: snap });
          toast.error(e.message);
        }
      };
      const unvote = async () => {
        const seq = nextPollSeq(post.id);
        const snap = poll;
        onUpdate({ ...post, poll: withVote(poll, null) });
        try {
          const res = await api.unvotePoll(post.id);
          if (!seq.isCurrent() || !isMounted.current) return;
          onUpdate({ ...post, poll: res.poll || { ...poll, my_vote: null } });
        } catch (e) {
          if (!seq.isCurrent() || !isMounted.current) return;
          onUpdate({ ...post, poll: snap });
          toast.error(e.message);
        }
      };
      const close = async () => {
        const seq = nextPollSeq('close-' + post.id);
        const snap = poll;
        // Optimistic: close the poll instantly.
        onUpdate({ ...post, poll: { ...poll, closed: true } });
        toast.show('Poll closed.');
        try {
          await api.closePoll(post.id);
        } catch (e) {
          if (!seq.isCurrent() || !isMounted.current) return;
          onUpdate({ ...post, poll: snap });
          toast.error(e.message);
        }
      };
      const showVoters = async (opt) => {
        try {
          const voters = await api.getPollVoters(post.id, opt.id);
          ui.openModal({
            title: `Voted "${opt.text}"`, render: (close) => (
              <div className="metro-stagger">
                {(voters || []).map((v, i) => <UserRow key={i} user={v} onProfileClick={(h) => { close(); ui.goProfile(h); }} />)}
                {(!voters || voters.length === 0) && <div className="empty-state">No voters yet.</div>}
              </div>
            )
          });
        } catch (e) { toast.error(e.message); }
      };

      return (
        <div style={{ padding: '0 16px 16px' }}>
          {poll.options.map(opt => (
            <div key={opt.id} className="poll-option" onClick={() => (!voted && !poll.closed) ? vote(opt.id) : showVoters(opt)}>
              {(voted || poll.closed) && <div className="poll-bar" style={{ width: `${opt.pct}%` }} />}
              <div className="poll-content">
                <span>{opt.text}{poll.my_vote === opt.id ? ' ✓' : ''}</span>
                {(voted || poll.closed) && <span>{opt.pct}% · {opt.count}</span>}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--gplus-text-secondary)', marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{poll.total_votes} votes{poll.closed ? ' · Closed' : ''}</span>
            {voted && !poll.closed && <button className="link-btn" onClick={unvote}>Remove vote</button>}
            {isAuthor && !poll.closed && <button className="link-btn" onClick={close}>Close poll</button>}
          </div>
        </div>
      );
    };

    /* NOTE: threaded replies, comment editing, media attachments, pinning and
       reporting are intentionally NOT implemented for comments — the current API
       only supports add / delete / +1. UI refresh only; no API changes. */
    const COMMENT_TRIM = 10;
    const COMMENT_CHAR_LIMIT = 500;

    const CommentForm = ({ onSubmit, autoFocus }) => {
      const auth = useAuth();
      const [text, setText] = useState('');
      const [emojiOpen, setEmojiOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const over = text.length > COMMENT_CHAR_LIMIT;

      const submit = async () => {
        if (!text.trim() || busy || over) return;
        const snapshot = text;
        setBusy(true);
        setText(''); // optimistic clear, restored on failure
        try { await onSubmit(snapshot.trim()); }
        catch (e) { setText(snapshot); }
        finally { setBusy(false); }
      };

      return (
        <div className="comment-form">
          <Avatar user={auth.user} size={32} />
          <div className="comment-form-main">
            <MentionInput multiline autoGrow autoFocus={autoFocus} className="compose-input"
              placeholder="Add a comment…" value={text} onChange={setText} onSubmit={submit} rows={1} />
            {emojiOpen && <EmojiPicker onPick={(e) => setText(t => (t ? t + ' ' : '') + e)} />}
            <div className="comment-form-actions">
              <span className={`comment-char-count ${over ? 'over' : ''}`}>
                {text.length > COMMENT_CHAR_LIMIT - 120 ? `${text.length}/${COMMENT_CHAR_LIMIT}` : ''}
              </span>
              <button className="icon-btn" title="Emoji" aria-label="Insert emoji" aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen(o => !o)}><I.Emoji /></button>
              <button className="btn btn-outline" disabled={busy || !text.trim() || over} onClick={submit}>
                {busy ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      );
    };

    const CommentItem = ({ c, isOwn, onProfileClick, onPlus, onDelete }) => {
      const ui = useUI();
      const confirmDelete = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Delete comment?" message="This permanently removes your comment." confirmLabel="Delete" danger
            onConfirm={() => onDelete(c._id)} onClose={close} />
        )
      });
      return (
        <div id={`comment-${c._id}`} className={`comment ${isOwn ? 'comment-own' : ''} ${c._pending ? 'comment-pending' : ''}`}>
          <Avatar user={{ name: c.user_name, photo_url: c.user_photo, handle: c.user_handle }} size={32}
            onClick={() => onProfileClick(c.user_handle)} />
          <div className="comment-content">
            <div className="comment-meta">
              <span className="comment-name" onClick={() => onProfileClick(c.user_handle)}>{c.user_name}</span>
              <span className="comment-handle" onClick={() => onProfileClick(c.user_handle)}>+{c.user_handle}</span>
              <span className="comment-time" title={c.timestamp}>{timeAgo(c.timestamp)}</span>
            </div>
            <div className="comment-box">
              <RichText text={c.text} onMention={onProfileClick} />
            </div>
            <div className="comment-actions">
              <button className={`comment-action-btn ${c._liked ? 'active' : ''}`} aria-pressed={!!c._liked}
                title="+1 this comment" onClick={() => onPlus(c._id)}>
                <I.PlusOne />{(c._likeCount || 0) > 0 ? ` ${c._likeCount}` : ''}
              </button>
              {isOwn && !c._pending && (
                <button className="comment-action-btn comment-action-danger" onClick={confirmDelete}>
                  <I.Trash /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      );
    };

    const CommentSection = ({ id, comments, count, onProfileClick, onAdd, onPlus, onDelete, currentUserId, onClose }) => {
      const auth = useAuth();
      const me = currentUserId || (auth.user && auth.user.id);
      const [showAll, setShowAll] = useState(false);
      const anchorRef = useRef(null);
      const trimmed = !showAll && comments.length > COMMENT_TRIM;
      const visible = trimmed ? comments.slice(comments.length - COMMENT_TRIM) : comments;
      const hidden = comments.length - visible.length;

      const showAllComments = () => {
        if (visible[0]) anchorRef.current = `comment-${visible[0]._id}`;
        setShowAll(true);
      };
      useEffect(() => {
        if (anchorRef.current) {
          const el = document.getElementById(anchorRef.current);
          if (el) el.scrollIntoView({ block: 'start' });
          anchorRef.current = null;
        }
      }, [showAll]);

      // deep-link support: scroll to #comment-<id> when present in the URL
      useEffect(() => {
        const m = (window.location.hash || '').match(/^#comment-(.+)$/);
        if (!m) return;
        const el = document.getElementById('comment-' + m[1]);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.classList.add('comment-highlight');
        }
      }, []);

      return (
        <div className="comment-section metro-stagger" id={id} role="region" aria-label="comments">
          <div className="comment-section-header">
            <span className="comment-count" aria-live="polite">{count} {count === 1 ? 'comment' : 'comments'}</span>
            {onClose && <button className="icon-btn" aria-label="Close comments" onClick={onClose}><I.Close /></button>}
          </div>
          <CommentForm onSubmit={onAdd} autoFocus={!window.matchMedia('(max-width: 600px)').matches} />
          <div className="comment-list">
            {hidden > 0 && (
              <button className="link-btn comment-expand" onClick={showAllComments}>
                show previous {hidden} comments
              </button>
            )}
            {visible.map(c => (
              <CommentItem key={c._id} c={c} isOwn={c.user_id === me}
                onProfileClick={onProfileClick} onPlus={onPlus} onDelete={onDelete} />
            ))}
            {comments.length === 0 && (
              <div className="comment-empty">no comments yet — start the conversation</div>
            )}
          </div>
        </div>
      );
    };

    const Post = React.memo(({ post: initial, onProfileClick, onUpdate, onDeleted, onRestored, hideActions }) => {
      const auth = useAuth();
      const ui = useUI();
      const toast = useToast();
      const [post, setPost] = useState(initial);
      useEffect(() => setPost(initial), [initial]);

      const [showComments, setShowComments] = useState(false);
      const myId = auth.user && auth.user.id;
      // Derive the comment +1 state from the server payload (plus_oners) so
      // likes made elsewhere actually render; reconciled responses keep theirs.
      const normalizeComments = useCallback((list) => (list || []).map(c => {
        const likers = Array.isArray(c.plus_oners) ? c.plus_oners : [];
        const liked = myId != null && likers.some(u => u && ((u.id || u.user_id) === myId));
        return { ...c, _liked: !!c._liked || liked, _likeCount: c._likeCount || likers.length };
      }), [myId]);
      const [comments, setComments] = useState(() => normalizeComments(initial && initial.comments));
      const [plusActive, setPlusActive] = useState(() => !!(initial && initial.liked_by_me));
      const [plusCount, setPlusCount] = useState((initial && initial.plus_one_count) || 0);
      const [menuOpen, setMenuOpen] = useState(false);
      const [plusBusy, setPlusBusy] = useState(false);
      const plusInFlightRef = useRef(0);
      const isMounted = useIsMounted();
      const nextPlusSeq = useSeq();
      const menuWrapRef = useOutsideClose(menuOpen, () => setMenuOpen(false));

      if (!post) return null;

      const update = (p) => { setPost(p); onUpdate && onUpdate(p); };
      const isAuthor = post.user_id === (auth.user && auth.user.id);

      const plusOne = async () => {
        const seq = nextPlusSeq(post.id);
        const prevActive = plusActive, prevCount = plusCount;
        const nextActive = !plusActive;
        // Optimistic: highlight as if completed instantly (Instagram-style).
        // Rapid taps are NOT dropped — every tap fires a request and only the
        // latest response reconciles (last-write-wins via the seq guard).
        setPlusActive(nextActive);
        setPlusCount(Math.max(0, prevCount + (nextActive ? 1 : -1)));
        plusInFlightRef.current++;
        setPlusBusy(true);
        try {
          const res = await api.plusOnePost(post.id);
          if (!seq.isCurrent() || !isMounted.current) return;
          setPlusActive(res.active); setPlusCount(res.count);
        } catch (e) {
          if (!seq.isCurrent()) return;
          // Roll the visual action back only if the task failed.
          setPlusActive(prevActive); setPlusCount(prevCount);
          toast.error(e.message);
        } finally {
          plusInFlightRef.current--;
          if (plusInFlightRef.current <= 0 && isMounted.current) setPlusBusy(false);
        }
      };
      const addComment = async (text) => {
        const temp = {
          _id: tmpId(), _pending: true,
          user_id: auth.user.id, user_name: auth.user.name, user_handle: auth.user.handle,
          user_photo: auth.user.photo_url, text, timestamp: new Date().toISOString(), plus_oners: [],
          _liked: false, _likeCount: 0
        };
        setComments(prev => [...prev, temp]);
        try {
          const res = await api.addComment(post.id, text);
          setComments(prev => prev.map(c => c._id === temp._id
            ? {
              ...c, _id: res.comment_id, _pending: false, text: res.text, timestamp: res.timestamp,
              user_name: res.user_name, user_handle: res.user_handle, user_photo: res.user_photo
            }
            : c));
        } catch (e) {
          setComments(prev => prev.filter(c => c._id !== temp._id));
          toast.error(e.message);
          throw e;
        }
      };
      const removeComment = async (cid) => {
        const idx = comments.findIndex(c => c._id === cid);
        if (idx < 0) { await api.deleteComment(post.id, cid); return; }
        const removed = comments[idx];
        // Optimistic: drop it from the list immediately.
        setComments(prev => prev.filter(c => c._id !== cid));
        toast.show('Comment deleted.');
        try {
          await api.deleteComment(post.id, cid);
        } catch (e) {
          if (!isMounted.current) return;
          // Re-insert at the original index if the delete failed.
          setComments(prev => { const next = [...prev]; next.splice(Math.min(idx, next.length), 0, removed); return next; });
          toast.error(e.message);
          throw e;
        }
      };
      const plusComment = async (cid) => {
        const target = comments.find(c => c._id === cid);
        if (!target) return;
        const seq = nextPlusSeq('comment-' + cid);
        const prevLiked = target._liked, prevCount = target._likeCount;
        const nextLiked = !prevLiked;
        // Optimistic: flip the +1 state and count right away.
        setComments(prev => prev.map(c => c._id === cid
          ? { ...c, _liked: nextLiked, _likeCount: Math.max(0, (prevCount || 0) + (nextLiked ? 1 : -1)) }
          : c));
        try {
          const res = await api.plusOneComment(post.id, cid);
          if (!seq.isCurrent() || !isMounted.current) return;
          setComments(prev => prev.map(c => c._id === cid ? { ...c, _liked: res.active, _likeCount: res.count } : c));
          if (!res.active) toast.show('+1 removed');
        } catch (e) {
          if (!seq.isCurrent() || !isMounted.current) return;
          setComments(prev => prev.map(c => c._id === cid ? { ...c, _liked: prevLiked, _likeCount: prevCount } : c));
          toast.error(e.message);
        }
      };
      const showLikes = async () => {
        try {
          const likes = await api.getPostLikes(post.id);
          ui.openModal({
            title: '+1s', render: (close) => (
              <div className="metro-stagger">
                {(likes || []).map((u, i) => <UserRow key={i} user={u} onProfileClick={(h) => { close(); onProfileClick(h); }} />)}
                {(!likes || likes.length === 0) && <div className="empty-state">No +1s yet.</div>}
              </div>
            )
          });
        } catch (e) { toast.error(e.message); }
      };
      const doDelete = () => ui.openModal({
        render: (close) => (
          <ConfirmDialog title="Delete post?" message="This permanently removes the post and its media." confirmLabel="Delete" danger
            onConfirm={async () => {
              // Optimistic: remove from the feed right after confirming.
              onDeleted && onDeleted(post.id);
              toast.show('Post deleted.');
              try { await api.deletePost(post.id); }
              catch (e) {
                // Re-show the post if the delete failed.
                onRestored && onRestored(post);
                toast.error(e.message);
                throw e;
              }
            }} onClose={close} />
        )
      });
      const doReport = async () => {
        // Optimistic: hide it immediately.
        onDeleted && onDeleted(post.id);
        toast.show('Post hidden from your feeds.');
        try { await api.reportPost(post.id); }
        catch (e) {
          if (!isMounted.current) return;
          onRestored && onRestored(post);
          toast.error(e.message);
        }
      };
      const doPin = async () => {
        const seq = nextPlusSeq('pin-' + post.id);
        const prevPinned = post.pinned;
        // Optimistic: flip the pin state right away.
        update({ ...post, pinned: !prevPinned });
        try {
          const res = await api.pinPost(post.id);
          if (!seq.isCurrent() || !isMounted.current) return;
          update({ ...post, pinned: res.pinned });
          toast.show(res.pinned ? 'Pinned.' : 'Unpinned.');
        } catch (e) {
          if (!seq.isCurrent() || !isMounted.current) return;
          update({ ...post, pinned: prevPinned });
          toast.error(e.message);
        }
      };
      const permalink = () => ui.openModal({
        title: 'Post link',
        render: (close) => <PostLinkModal postId={post.id} onClose={close} />
      });
      const reshare = () => ui.openCompose({ reshare: post });
      const rs = post.reshared_post;
      const openReshared = async () => {
        if (!rs || !rs.id) return;
        try {
          const res = await api.getPublicPost(rs.id);
          ui.openModal({
            title: 'post',
            wide: true,
            render: (close) => (
              <Post post={res.post} onProfileClick={(h) => { close(); onProfileClick(h); }} />
            ),
          });
        } catch (e) { toast.error(e.message || 'Could not open post'); }
      };

      const commentCount = comments.length || post.comments_count || 0;
      const openComments = () => {
        // on phones the comment section opens as a bottom sheet (modal)
        if (window.matchMedia('(max-width: 600px)').matches) {
          ui.openModal({
            title: 'comments',
            render: (close) => (
              <CommentSection comments={comments} count={commentCount}
                onProfileClick={onProfileClick} onAdd={addComment} onPlus={plusComment}
                onDelete={removeComment} currentUserId={auth.user && auth.user.id} onClose={close} />
            )
          });
          return;
        }
        setShowComments(s => !s);
      };

      return (
        <div className="card">
          <div className="card-header">
            <Avatar user={{ name: post.user_name, photo_url: post.user_photo, handle: post.user_handle }} onClick={() => onProfileClick(post.user_handle)} />
            <div className="user-info">
              <div className="user-name" onClick={() => onProfileClick(post.user_handle)}>{post.user_name}</div>
              <div className="user-handle">+{post.user_handle} · {post.timestamp}{post.pinned ? ' · 📌 pinned' : ''}</div>
              {post.source_channel && <div style={{ fontSize: 11, color: 'var(--gplus-text-secondary)' }}>in {post.source_channel.circle_name} · #{post.source_channel.channel_name}</div>}
            </div>
            <div ref={menuWrapRef} style={{ position: 'relative' }}>
              <button className="icon-btn" onClick={() => setMenuOpen(o => !o)}><I.More /></button>
              {menuOpen && (
                <div className="card dropdown-menu metro-anim" style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, minWidth: 160, margin: 0 }} onMouseLeave={() => setMenuOpen(false)}>
                  <div className="nav-item" onClick={() => { permalink(); setMenuOpen(false); }}>Copy link</div>
                  {post.source_channel && post.source_channel.is_owner && (
                    <div className="nav-item" onClick={() => { doPin(); setMenuOpen(false); }}>{post.pinned ? 'Unpin' : 'Pin to circle'}</div>
                  )}
                  {isAuthor && <div className="nav-item" onClick={() => { showLikes(); setMenuOpen(false); }}>See who +1'd</div>}
                  {!isAuthor && <div className="nav-item" onClick={() => { doReport(); setMenuOpen(false); }}>Report / hide</div>}
                  {isAuthor && <div className="nav-item" style={{ color: '#b00020' }} onClick={() => { doDelete(); setMenuOpen(false); }}>Delete</div>}
                </div>
              )}
            </div>
          </div>

          {post.text && <div className="post-content"><RichText text={post.text} onMention={onProfileClick} /></div>}

          {post.images && post.images.length > 0 && (
            <div className={`post-images ${post.images.length === 1 ? 'single' : ''}`}>
              {post.images.map((src, i) => <img key={i} src={src} alt="Post media" onClick={() => ui && ui.openLightbox(src)} />)}
            </div>
          )}
          {post.videos && post.videos.length > 0 && (
            <div className="post-images single">
              {post.videos.map((src, i) => <video key={i} src={src} controls poster={(post.video_thumbnails || [])[i]} style={{ width: '100%', objectFit: 'cover' }} />)}
            </div>
          )}

          {post.audio_urls && post.audio_urls.length > 0 && (
            <div className="post-audio" style={{ marginTop: (post.images && post.images.length) || (post.videos && post.videos.length) ? 8 : 0 }}>
              {post.audio_urls.map((src, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  {(post.audio_titles || [])[i] && (
                    <div style={{ fontSize: 12, color: 'var(--gplus-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <I.Music /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(post.audio_titles || [])[i]}</span>
                    </div>
                  )}
                  <audio src={src} controls preload="metadata" style={{ width: '100%' }} />
                </div>
              ))}
            </div>
          )}

          {rs && (
            <div className="reshare-box" style={{ cursor: 'pointer' }} onClick={openReshared}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Avatar user={{ name: rs.user_name, photo_url: rs.user_photo, handle: rs.user_handle }} size={28} onClick={(e) => { e.stopPropagation(); onProfileClick(rs.user_handle); }} />
                <div className="user-name" style={{ fontSize: 14 }} onClick={(e) => { e.stopPropagation(); onProfileClick(rs.user_handle); }}>{rs.user_name}</div>
                <span className="user-handle">+{rs.user_handle}</span>
              </div>
              {rs.text && <div style={{ lineHeight: 1.4 }}><RichText text={rs.text} onMention={onProfileClick} /></div>}
              {rs.images && rs.images.length > 0 && (
                <div className={`post-images ${rs.images.length === 1 ? 'single' : ''}`} style={{ marginTop: 8 }}>
                  {rs.images.map((s, i) => <img key={i} src={s} onClick={(e) => { e.stopPropagation(); ui && ui.openLightbox(s); }} alt="" />)}
                </div>
              )}
              {rs.audio_urls && rs.audio_urls.length > 0 && (
                <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  {rs.audio_urls.map((src, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      {(rs.audio_titles || [])[i] && (
                        <div style={{ fontSize: 12, color: 'var(--gplus-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <I.Music /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(rs.audio_titles || [])[i]}</span>
                        </div>
                      )}
                      <audio src={src} controls preload="metadata" style={{ width: '100%' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {post.poll && <PollView post={post} onUpdate={update} />}

          {!hideActions && (
            <div className="card-actions">
              <button className={`action-btn ${plusActive ? 'active' : ''} ${plusBusy ? 'opt-pending' : ''}`} onClick={plusOne} onContextMenu={(e) => { e.preventDefault(); showLikes(); }} title="Right-click to see who +1'd">
                <I.PlusOne /> {plusCount > 0 && plusCount}
              </button>
              <button className="action-btn" aria-expanded={showComments} aria-controls={`comments-${post.id}`} onClick={openComments}>
                <I.Comment /> {commentCount > 0 && commentCount}
              </button>
              <button className="action-btn" onClick={reshare}><I.Share /> Reshare</button>
            </div>
          )}

          {showComments && (
            <CommentSection id={`comments-${post.id}`} comments={comments} count={commentCount}
              onProfileClick={onProfileClick} onAdd={addComment} onPlus={plusComment}
              onDelete={removeComment} currentUserId={auth.user && auth.user.id}
              onClose={() => setShowComments(false)} />
          )}
        </div>
      );
    });

    const PostLinkModal = ({ postId, onClose }) => {
      const [copied, setCopied] = useState(false);
      const url = `${PUBLIC_BASE}${postId}`;
      const copy = () => {
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => { });
      };
      return (
        <div>
          <p style={{ marginBottom: 12, color: 'var(--gplus-text-secondary)' }}>Share this link to let anyone view the post (no login required).</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" readOnly value={url} onFocus={e => e.target.select()} style={{ flex: 1 }} />
            <button className="btn" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
            <a className="btn btn-outline" href={`https://cinemint.online/mylo/post/${postId}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <I.ExternalLink /> Open
            </a>
          </div>
        </div>
      );
    };

    const PublicPostView = ({ postId }) => {
      const [post, setPost] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');

      useEffect(() => {
        (async () => {
          try {
            const res = await api.getPublicPost(postId);
            setPost(res.post);
          } catch (e) { setError(e.message); }
          setLoading(false);
        })();
      }, [postId]);

      if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>;
      if (error) return (
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-title"><h2>Post not found</h2></div>
            <p style={{ textAlign: 'center', color: 'var(--gplus-text-secondary)' }}>{error}</p>
            <div className="auth-links"><a className="btn" href="/" style={{ textDecoration: 'none' }}>Go to Mylo</a></div>
          </div>
        </div>
      );
      if (!post) return null;

      return (
        <div className="auth-container" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
          <div className="auth-card page-transition" style={{ maxWidth: 600, width: '100%' }}>
            <div className="auth-title">
              <div className="logo" style={{ justifyContent: 'center', marginBottom: 16 }}>
                <img src="https://cinemint.online/mylo/mylogo.png" alt="Mylo" />
              </div>
            </div>
            {/* hideActions also hides the comment section on public permalinks —
               comments require an authenticated session, so this is intentional */}
            <Post post={post} hideActions onProfileClick={() => { }} />
            <div className="auth-links">
              <a className="btn" href="/" style={{ textDecoration: 'none' }}>Sign in to interact</a>
            </div>
          </div>
        </div>
      );
    };

    const ComposeModal = ({ reshare, defaultChannelId, onClose, onCreated }) => {
      const auth = useAuth();
      const toast = useToast();
      const [text, setText] = useState('');
      const [files, setFiles] = useState([]);
      const [pollOpts, setPollOpts] = useState(null);
      const [channelId, setChannelId] = useState(defaultChannelId || '');
      const [channels, setChannels] = useState([]);
      const [loading, setLoading] = useState(false);
      const [gifOpen, setGifOpen] = useState(false);
      const [dragOver, setDragOver] = useState(false);
      const fileRef = useRef(null);

      // Preview object URLs are created once per file set (not per render) and
      // revoked when that set changes or the modal unmounts.
      const previews = useMemo(() => files.map(f => ({
        isVideo: !!(f.type && f.type.startsWith('video')),
        isAudio: !!(f.type && f.type.startsWith('audio')),
        url: (f.type && (f.type.startsWith('video') || f.type.startsWith('image'))) ? URL.createObjectURL(f) : null,
      })), [files]);
      useEffect(() => () => previews.forEach(p => p.url && URL.revokeObjectURL(p.url)), [previews]);

      useEffect(() => {
        if (!defaultChannelId) return;
        api.getMyFeedChannels().then(setChannels).catch(() => { });
      }, [defaultChannelId]);

      const addFiles = (list) => {
        const arr = Array.from(list).slice(0, 4 - files.length);
        setFiles(prev => [...prev, ...arr].slice(0, 4));
      };

      const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) setDragOver(true);
      };
      const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) setDragOver(false);
      };
      const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          const media = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/'));
          if (media.length === 0) { toast.error('Only image, video, or audio files are supported.'); return; }
          addFiles(media);
          toast.show(`Added ${media.length} file${media.length > 1 ? 's' : ''}.`);
        }
      };

      const submit = async () => {
        if (!text.trim() && files.length === 0 && !reshare && !pollOpts) { toast.error('Write something first.'); return; }
        if (pollOpts && pollOpts.filter(o => o.trim()).length < 2) { toast.error('Add at least two poll options.'); return; }
        setLoading(true);
        try {
          const fd = new FormData();
          fd.append('text', text);
          files.forEach(f => fd.append('file', f));
          if (channelId) fd.append('channel_id', channelId);
          if (reshare) fd.append('reshare_id', reshare.id);
          if (pollOpts) pollOpts.filter(o => o.trim()).forEach(o => fd.append('poll_option', o));
          const res = await api.createPost(fd);
          toast.show('Posted.');
          onCreated && onCreated(res.post_id);
          onClose();
        } catch (e) { toast.error(e.message); setLoading(false); }
      };

      return (
        <Modal title={reshare ? 'Reshare post' : 'Create post'} onClose={onClose} wide>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
          <div style={{ display: 'flex', gap: 12 }}>
            <Avatar user={auth.user} />
            <MentionInput multiline className="compose-input" autoFocus
              placeholder={reshare ? 'Add your thoughts…' : "Share what's new…"}
              value={text} onChange={setText} style={{ minHeight: 80 }} />
          </div>

          {dragOver && (
            <div className="dropzone">
              <span className="dropzone-icon"><I.Image /></span>
              <span>Drop photos, videos, or audio here to attach</span>
              <span className="dropzone-sub">Releasing anywhere in this dialog attaches them</span>
            </div>
          )}

          {reshare && (
            <div className="reshare-box" style={{ marginLeft: 0, marginRight: 0 }}>
              <div className="user-handle"><strong>{reshare.user_name}</strong> +{reshare.user_handle}</div>
              <div style={{ marginTop: 4 }}>{reshare.text}</div>
            </div>
          )}

          {pollOpts && (
            <div className="metro-stagger" style={{ marginTop: 12 }}>
              {pollOpts.map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="form-input" placeholder={`Option ${i + 1}`} value={o}
                    onChange={e => setPollOpts(p => p.map((x, j) => j === i ? e.target.value : x))} />
                  {pollOpts.length > 2 && <button className="icon-btn" onClick={() => setPollOpts(p => p.filter((_, j) => j !== i))}><I.Close /></button>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                {pollOpts.length < 6 && <button className="btn btn-outline btn-sm" onClick={() => setPollOpts(p => [...p, ''])}>Add option</button>}
                <button className="btn btn-outline btn-sm" onClick={() => setPollOpts(null)}>Remove poll</button>
              </div>
            </div>
          )}

          {previews.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {previews.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: 70, height: 70 }}>
                  {p.isVideo ? <video src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                    : p.isAudio ? (
                      <div style={{ width: '100%', height: '100%', borderRadius: 4, background: 'var(--gplus-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gplus-text-secondary)' }} title={files[i] && files[i].name}>
                        <I.Music />
                      </div>
                    )
                    : <img src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <input type="file" ref={fileRef} style={{ display: 'none' }} multiple accept="image/*,video/*,audio/*" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <button className="icon-btn" title="Add media" onClick={() => fileRef.current.click()}><I.Image /></button>
            <button className="icon-btn" title="Add GIF" onClick={() => setGifOpen(true)}><I.Gif /></button>
            {!reshare && <button className="icon-btn" title="Add poll" onClick={() => setPollOpts(pollOpts || ['', ''])}><I.Poll /></button>}
            {defaultChannelId ? (
              <span className="chip" style={{ flex: 1, minWidth: 140 }}>
                {(() => {
                  const ch = channels.find(c => c.id === defaultChannelId);
                  return ch ? `${ch.circle_name} · #${ch.name}` : 'Feed channel';
                })()}
              </span>
            ) : (
              <span className="chip" style={{ flex: 1, minWidth: 140 }}>Global feed</span>
            )}
            <button className="btn" onClick={submit} disabled={loading}>{loading ? 'Posting…' : 'Post'}</button>
          </div>

          {gifOpen && <GifPicker onClose={() => setGifOpen(false)} onPick={(url) => setText(t => (t ? t + ' ' : '') + url)} />}
          </div>
        </Modal>
      );
    };

    const InlineCompose = ({ onOpen }) => {
      const auth = useAuth();
      return (
        <div className="card">
          <div className="compose-box">
            <Avatar user={auth.user} />
            <div className="compose-input" style={{ display: 'flex', alignItems: 'center', cursor: 'text', color: 'var(--gplus-text-secondary)' }} onClick={() => onOpen()}>
              Share what's new…
            </div>
            <button className="btn" onClick={() => onOpen()}>Post</button>
          </div>
        </div>
      );
    };

export { PollView, CommentForm, CommentItem, CommentSection, Post, PostLinkModal, PublicPostView, ComposeModal, InlineCompose };
