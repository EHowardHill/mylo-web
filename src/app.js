// src/app.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
import { AuthScreen } from './auth.js';
import { CircleView } from './circles.js';
import { AuthContext, ToastContext, UIContext } from './contexts.js';
import { handlePushDeepLink, openPostModal } from './deeplink.js';
import { DiscoverPage } from './discover.js';
import { DMChatView, DMsView } from './dms.js';
import { Feed } from './feed.js';
import { I } from './icons.js';
import { Notifications, openNotificationNav } from './notifications.js';
import { PublicPostView } from './posts.js';
import { Directory, ProfileView } from './profile.js';
import { disablePush, ensureServiceWorker, pushSupported, refreshPushOnLogin } from './push.js';
import { SettingsView } from './settings.js';
import { ComposeHost, LightboxHost, ModalHost, Sidebar, ToastHost, TopBar } from './shell.js';
import { Spinner } from './ui.js';
import { getDominantColor } from './util.js';
const { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } = React;
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    const App = () => {
      const [user, setUser] = useState(null);
      const [booting, setBooting] = useState(true);
      const [page, setPage] = useState('home');
      const [profileHandle, setProfileHandle] = useState(null);
      const [activeCircle, setActiveCircle] = useState(null);
      const [pendingChannel, setPendingChannel] = useState(null);
      const [activeDM, setActiveDM] = useState(null);
      const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('mylo_dark');
        return saved !== null ? saved === 'true' : true;
      });
      const [sidebarOpen, setSidebarOpen] = useState(false);
      const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = Number(localStorage.getItem('mylo_sidebar_w'));
        return saved >= 220 && saved <= 480 ? saved : 256;
      });

      useEffect(() => {
        localStorage.setItem('mylo_sidebar_w', String(sidebarWidth));
      }, [sidebarWidth]);

      const startSidebarResize = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = sidebarWidth;
        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const w = Math.max(220, Math.min(480, startWidth + dx));
          setSidebarWidth(w);
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      };

      const [toasts, setToasts] = useState([]);
      const [modals, setModals] = useState([]);
      const [lightbox, setLightbox] = useState(null);
      const [compose, setCompose] = useState(null);

      const [myCircles, setMyCircles] = useState([]);
      const [badges, setBadges] = useState({ circles: 0, dm: 0, notifications: 0 });
      const [unreadCircles, setUnreadCircles] = useState({});
      const [resetToken, setResetToken] = useState(null);
      const [publicPostId, setPublicPostId] = useState(null);
      // Set when a signed-in visitor opens a public permalink — the post is
      // then opened in a modal inside the full app instead of the bare
      // logged-out permalink view.
      const [pendingOpenPost, setPendingOpenPost] = useState(null);
      // Bumped when a compose started from the FAB succeeds — Feed and
      // ProfileView listen to it and refetch (they own their post lists).
      const [composeRefresh, setComposeRefresh] = useState(0);

      const toast = useMemo(() => {
        const push = (message, type) => {
          const id = Date.now() + Math.random();
          setToasts(t => [...t, { id, message, type }]);
          setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
        };
        return { show: (m) => push(m, 'info'), error: (m) => push(m, 'error') };
      }, []);

      const applyBackground = useCallback((u) => {
        document.body.style.backgroundImage = '';
        document.documentElement.style.setProperty('--bg-blur', `${(u && u.background_blur != null) ? u.background_blur : 10}px`);
        if (u && u.background_url) {
          document.documentElement.style.setProperty('--body-bg-image', `url(${u.background_url})`);
          if (u.background_mode === 'tile') {
            document.body.classList.add('bg-tile');
          } else {
            document.body.classList.remove('bg-tile');
          }
          getDominantColor(u.background_url, (color) => document.documentElement.style.setProperty('--gplus-red', color));
        } else {
          const DEFAULT_BG = darkMode
            ? 'https://cinemint.online/mylo/background.webp'
            : 'https://cinemint.online/mylo/background-lite.webp';
          document.documentElement.style.setProperty('--body-bg-image', `url(${DEFAULT_BG})`);
          document.body.classList.remove('bg-tile');
          document.documentElement.style.setProperty('--gplus-red', '#1BA1E2');
        }
      }, [darkMode]);

      const onAuthed = useCallback((u) => {
        setUser(u);
        applyBackground(u);
        setPage('home');
      }, [applyBackground]);

      const logout = useCallback(async () => {
        try { await disablePush(); } catch (e) { /* ignore */ }
        try { await api.logout(); } catch (e) { /* ignore */ }
        setUser(null);
        setPage('home');
        setActiveCircle(null); setActiveDM(null); setProfileHandle(null);
        applyBackground(null);
      }, [applyBackground]);

      const refreshUser = useCallback(async () => {
        try { const u = await api.me(); setUser(u); return u; } catch (e) { return null; }
      }, []);

      const loadMyCircles = useCallback(async () => {
        if (!user) return;
        try { setMyCircles(await api.listCircles() || []); }
        catch (e) { /* ignore */ }
      }, [user]);

      const loadBadges = useCallback(async () => {
        if (!user) return;
        try {
          const [unread, convos, notifs] = await Promise.allSettled([api.getUserUnread(), api.getConversations(), api.getNotifications()]);
          const circlesUnreadMap = (unread.status === 'fulfilled' && unread.value && unread.value.circles) ? unread.value.circles : {};
          setUnreadCircles(circlesUnreadMap);
          const circlesUnread = Object.keys(circlesUnreadMap).filter(
            (k) => circlesUnreadMap[k].has_unread
          ).length;
          const dmCount = convos.status === 'fulfilled' && Array.isArray(convos.value) ? convos.value.filter(c => c.has_unread).length : 0;
          const notifUnread = notifs.status === 'fulfilled' && Array.isArray(notifs.value) ? notifs.value.filter(n => !n.is_read).length : 0;
          setBadges({ circles: circlesUnread, dm: dmCount, notifications: notifUnread });
        } catch (e) { /* ignore */ }
      }, [user]);

      useEffect(() => {
        if (user) {
          loadMyCircles();
        }
      }, [user, loadMyCircles]);

      useEffect(() => {
        if (!user) return;
        loadBadges();
        const iv = setInterval(loadBadges, 60000);
        return () => clearInterval(iv);
      }, [user, loadBadges]);

      useEffect(() => {
        if (!user) return;
        ensureServiceWorker();
        refreshPushOnLogin();
        if (pushSupported() && Notification.permission === 'default' && !localStorage.getItem('mylo_push_hint')) {
          localStorage.setItem('mylo_push_hint', '1');
          toast.show('Turn on push notifications from Settings.');
        }
      }, [user, toast]);

      const ui = useMemo(() => ({
        openModal: ({ title, render, wide }) => {
          const id = Date.now() + Math.random();
          setModals(m => [...m, { id, title, render, wide }]);
          return id;
        },
        closeModal: (id) => setModals(m => m.filter(x => x.id !== id)),
        openCompose: (opts) => setCompose(opts || {}),
        openLightbox: (src) => setLightbox(src),
        goProfile: (handle) => { setProfileHandle(handle || null); setPage('profile'); setSidebarOpen(false); },
        goDM: (circleId) => { setActiveDM(circleId); setPage('dm-chat'); setSidebarOpen(false); },
        goCircle: (circleId, channelId) => {
          setActiveCircle(circleId);
          setPendingChannel(channelId || null);
          setPage('circle');
          setSidebarOpen(false);
        },
        refreshBadges: () => loadBadges(),
      }), [loadBadges]);

      const goProfileClick = useCallback((h) => ui.goProfile(h), [ui]);

      useEffect(() => {
        const onSwMessage = (event) => {
          const msg = event.data || {};
          if (msg.type === 'PUSH_CLICK' && msg.payload) {
            openNotificationNav(msg.payload, ui, toast, goProfileClick);
          }
        };
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', onSwMessage);
        }
        return () => {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.removeEventListener('message', onSwMessage);
          }
        };
      }, [ui, toast, goProfileClick]);

      const didPushDeepLink = useRef(false);
      useEffect(() => {
        if (!user || didPushDeepLink.current) return;
        didPushDeepLink.current = true;
        handlePushDeepLink(ui, toast, goProfileClick);
      }, [user, ui, toast, goProfileClick]);

      // Open a public-permalink post in a modal for signed-in visitors
      // (detected on boot in the mount effect above).
      useEffect(() => {
        if (!user || !pendingOpenPost) return;
        const pid = pendingOpenPost;
        setPendingOpenPost(null);
        openPostModal(pid, ui, toast, goProfileClick);
      }, [user, pendingOpenPost, ui, toast, goProfileClick]);

      useEffect(() => {
        const savedDark = localStorage.getItem('mylo_dark');
        // Dark is the intended default for first-time visitors (matching the
        // initial state) — a missing key must NOT fall back to light.
        const isDark = savedDark === null ? true : savedDark === 'true';
        setDarkMode(isDark);
        document.body.classList.toggle('dark-mode', isDark);

        const path = window.location.pathname;
        const publicMatch = path.match(/\/mylo\/(?:posts\/public|p|post)\/([\w]+)/);
        if (publicMatch) {
          const pid = publicMatch[1];
          (async () => {
            // Signed-in visitors get the full app with the post opened in a
            // modal; only logged-out visitors see the bare public permalink.
            const u = await refreshUser();
            if (u) {
              applyBackground(u);
              setPendingOpenPost(pid);
            } else {
              setPublicPostId(pid);
            }
            setBooting(false);
          })();
          return;
        }

        try {
          const params = new URLSearchParams(window.location.search);
          const t = params.get('reset_token') || params.get('token');
          if (t) setResetToken(t);
        } catch (e) { /* ignore */ }

        (async () => {
          const u = await refreshUser();
          if (u) applyBackground(u);
          setBooting(false);
        })();
      }, []);

      const toggleDarkMode = () => {
        setDarkMode(d => {
          const nd = !d;
          document.body.classList.toggle('dark-mode', nd);
          localStorage.setItem('mylo_dark', nd);
          return nd;
        });
      };

      const navigate = (p) => {
        setPage(p);
        if (p === 'profile') setProfileHandle(null);
      };

      if (booting) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>;

      if (publicPostId) {
        const safeAuth = { user: null, setUser: () => { }, refreshUser: () => { }, logout: () => { } };
        const safeUI = {
          openModal: () => { }, closeModal: () => { }, openCompose: () => { },
          openLightbox: (src) => window.open(src, '_blank'),
          goProfile: () => { }, goDM: () => { }, goCircle: () => { }, refreshBadges: () => { },
        };
        return (
          <AuthContext.Provider value={safeAuth}>
            <UIContext.Provider value={safeUI}>
              <ToastContext.Provider value={toast}>
                <PublicPostView postId={publicPostId} />
                <ToastHost toasts={toasts} />
              </ToastContext.Provider>
            </UIContext.Provider>
          </AuthContext.Provider>
        );
      }

      if (!user) {
        return (
          <ToastContext.Provider value={toast}>
             <AuthScreen initialResetToken={resetToken} onAuthed={onAuthed} />
            <ToastHost toasts={toasts} />
          </ToastContext.Provider>
        );
      }

      return (
        <AuthContext.Provider value={{ user, setUser, refreshUser, logout }}>
          <ToastContext.Provider value={toast}>
            <UIContext.Provider value={ui}>
              <div className="app-container" style={{ '--sidebar-width': sidebarWidth + 'px' }}>
                <Sidebar
                  page={page}
                  activeCircle={activeCircle}
                  onNavigate={navigate}
                  isOpen={sidebarOpen}
                  close={() => setSidebarOpen(false)}
                  badges={badges}
                  onLogout={logout}
                  myCircles={myCircles}
                  unreadCircles={unreadCircles}
                  onOpenCircle={(id) => ui.goCircle(id)}
                  loadMyCircles={loadMyCircles}
                  onResizeStart={startSidebarResize}
                />
                {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

                <div className="main-content">
                  <TopBar onMenu={() => setSidebarOpen(o => !o)} />

                  {/* Wrap page content in a keyed container for dynamic page transition animations */}
                  <div className="page-transition" key={page + (activeCircle || '') + (activeDM || '') + (profileHandle || '')}>
                    {page === 'home' && <Feed onProfileClick={goProfileClick} refreshSignal={composeRefresh} />}
                    {page === 'profile' && <ProfileView handle={profileHandle} onProfileClick={goProfileClick} refreshSignal={composeRefresh} />}
                    {page === 'discover' && <DiscoverPage onOpenCircle={(id) => ui.goCircle(id)} loadMine={loadMyCircles} />}
                    {page === 'circle' && activeCircle && (
                      <CircleView circleId={activeCircle} initialChannelId={pendingChannel} onBack={() => { setActiveCircle(null); setPendingChannel(null); setPage('home'); }}
                        onProfileClick={goProfileClick}
                        onChanged={() => { loadBadges(); loadMyCircles(); }}
                        onDeleted={() => { setActiveCircle(null); setPendingChannel(null); setPage('home'); loadBadges(); loadMyCircles(); }} />
                    )}
                    {page === 'dm' && <DMsView onProfileClick={goProfileClick} />}
                    {page === 'dm-chat' && activeDM && (
                      <DMChatView circleId={activeDM} onBack={() => { setActiveDM(null); setPage('dm'); }} onProfileClick={goProfileClick} />
                    )}
                    {page === 'notifications' && <Notifications onProfileClick={goProfileClick} />}
                    {page === 'members' && <Directory onProfileClick={goProfileClick} />}
                    {page === 'settings' && <SettingsView darkMode={darkMode} toggleDarkMode={toggleDarkMode} onLogout={logout} />}
                  </div>
                </div>

                {(page === 'home' || page === 'profile') && (
                  <button className="fab" onClick={() => ui.openCompose({ onCreated: () => setComposeRefresh(n => n + 1) })}>
                    <I.Edit />
                  </button>
                )}
              </div>

              <ComposeHost compose={compose} onClose={() => setCompose(null)} />
                <ModalHost modals={modals} onClose={ui.closeModal} />
              <LightboxHost src={lightbox} onClose={() => setLightbox(null)} />
              <ToastHost toasts={toasts} />
            </UIContext.Provider>
          </ToastContext.Provider>
        </AuthContext.Provider>
      );
    };

    ReactDOM.render(<App />, document.getElementById('root'));

