// src/util.js — extracted verbatim from the original single-file app. Body is unchanged.
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    function escapeHtml(s) {
      // Quotes are escaped too: formatText interpolates captured URLs into
      // href/src attributes, and a raw " would allow attribute injection (XSS).
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatText(text) {
      if (!text) return '';
      let html = escapeHtml(text);
      html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
      html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
      html = html.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.add(\'revealed\')">$1</span>');
      html = html.replace(/(^|\s)\+(\w+)/g, '$1<span class="mention" data-handle="$2">+$2</span>');
      html = html.replace(/(^|\s)#([\w-]+)/g, '$1<span class="channel-link">#$2</span>');
      html = html.replace(/(?:^|\s)(https?:\/\/)?(m\.|www\.)?(youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]+)(\S*)/g, (match, proto, host, path, videoId) => {
        return ` <div class="yt-embed"><iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe></div>`;
      });
      html = html.replace(/(?:^|\s)(https?:\/\/)?(m\.|www\.)?soundcloud\.com\/((?:[\w-]+\/)+[\w-]+)(\S*)/g, (match, proto, host, path) => {
        const isSet = /\/sets\//.test(path);
        const widgetUrl = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent('https://soundcloud.com/' + path) + '&amp;color=%231BA1E2&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_reposts=false&amp;visual=false';
        return ` <div class="sc-embed${isSet ? ' sc-set' : ''}"><iframe src="${widgetUrl}" scrolling="no" allow="autoplay"></iframe></div>`;
      });
      html = html.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+\.(?:mp4|webm|mov|mkv|avi))(\?[^\s<]*)?/gi, (match, pre, url) => `${pre}<br><video src="${url}" controls preload="metadata" style="width:100%;max-height:320px"></video>`);
      html = html.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|flac|aac|m4a))(\?[^\s<]*)?/gi, (match, pre, url) => `${pre}<br><audio src="${url}" controls preload="metadata" style="width:100%"></audio>`);
      html = html.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+\.(?:jpg|jpeg|png|gif|webp))(\?[^\s<]*)?/gi, (match, pre, url) => `${pre}<br><img src="${url}" class="msg-embed" alt="Image embed" loading="lazy" />`);
      html = html.replace(/(^|[^"=\/])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      return html;
    }

    function timeAgo(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return iso;
      const s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm';
      if (s < 86400) return Math.floor(s / 3600) + 'h';
      if (s < 604800) return Math.floor(s / 86400) + 'd';
      return d.toLocaleDateString();
    }

    function clockTime(iso) {
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getDominantColor(imageSrc, callback) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = function () {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 5; canvas.height = 5;
          ctx.drawImage(img, 0, 0, 5, 5);
          const data = ctx.getImageData(0, 0, 5, 5).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
          r = Math.floor(r / 25); g = Math.floor(g / 25); b = Math.floor(b / 25);
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max - min < 50) r = Math.min(255, r + 50);
          callback(`rgb(${r}, ${g}, ${b})`);
        } catch (e) { callback('#db4437'); }
      };
      img.onerror = () => callback('#db4437');
      img.src = imageSrc;
    }

    function fallbackAvatar(u) {
      const name = (u && (u.name || u.handle)) || 'User';
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    }

export { escapeHtml, formatText, timeAgo, clockTime, getDominantColor, fallbackAvatar };
