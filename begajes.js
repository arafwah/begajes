/* ============================================================
   BEGEJES TOOL v2.1 - Threads Autopost Bookmarklet (ENGINE)
   Perbaikan v2.1 dibanding engine sebelumnya (v3/NEXUS clone):
   1. NAMESPACE 100% TERISOLASI - tidak bisa bentrok dengan NEXUS
      lagi: root id 'begajes-root', flag window.__BEGEJES_ACTIVE__,
      class CSS 'bg-', semua elemen 'bg-*', storage 'begajes_*_v21'.
      (NEXUS memakai 'nexus-threads-root', class 'nx-', storage
      'begejes_v3' - dua dunia yang tidak pernah saling sentuh.)
   2. BUG DRAG DIPERBAIKI. Penyebab lama: CSS '.nx-panel' memakai
      position:relative!important sehingga inline position:fixed pada
      drag kalah, lalu clamp dihitung untuk koordinat absolut padahal
      pergeseran terjadi relatif -> panel terdorong keluar layar dan
      terlihat 'hilang/close'. Sekarang: pointer capture pada header,
      posisi absolut diset di HOST (bukan panel), clamp penuh ke
      viewport, posisi disimpan, tidak ada handler klik luar.
   3. PANEL LEBAR (default 560px, bisa diatur remote 340-860).
   4. INPUT PRESISI: font 13px sans, padding lega, focus ring jelas,
      auto-grow, counter 0/500 tetap ada, preview media tetap ada.
   5. REMOTE CONFIG OPSIONAL (kill switch + feature toggle + notice).
      Aktif bila dipakai lewat LOADER (begajes.js di-hosting) atau bila
      CFG_URL_DEFAULT diisi. Kosong = 100% lokal, tanpa server.
   Inti API Threads dipertahankan (terbukti jalan): rupload_igphoto /
   rupload_igvideo, configure_text_post_app_feed / sidecar, graphql
   pin post, edit profile, bio link, hovercard, post id dari URL.
   ============================================================ */
(() => {
  'use strict';
  /* toggle: klik lagi = tutup. Hanya menyentuh panel milik BEGEJES sendiri,
     tidak pernah memegang elemen bookmarklet lain (NEXUS aman tetap buka). */
  var oldHost = document.getElementById('begajes-root');
  if (oldHost) {
    oldHost.parentNode.removeChild(oldHost);
    window.__BEGEJES_ACTIVE__ = false;
    return;
  }
  window.__BEGEJES_ACTIVE__ = true;

  var VER = '2.1.0';
  /* URL config remote (opsional). Kosong = 100% lokal tanpa server. */
  var CFG_URL_DEFAULT = '';

  var DEF_CFG = {
    version: '',
    kill: false,
    killMessage: 'BEGEJES dinonaktifkan sementara oleh admin. Coba lagi nanti.',
    minVersion: '',
    notice: '',
    status: '',
    features: { post: true, bulk: true, quote: true, profil: true, spoiler: true, pin: true, replyControl: true },
    ui: { width: 560 }
  };

  if (!/threads(\.net|\.com)/i.test(location.hostname) && !window.__BEGEJES_TEST__) {
    window.__BEGEJES_ACTIVE__ = false;
    alert('BEGEJES v2.1: buka bookmarklet ini di situs Threads (threads.net / threads.com) saat sudah login.');
    return;
  }

  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- CONFIG LAYER (kill switch + feature toggle) ---------- */
  function cfgUrl() {
    try {
      if (window.__BEGEJES_CFG_URL__) return String(window.__BEGEJES_CFG_URL__);
      if (window.__BEGEJES_SRC__) {
        var src = String(window.__BEGEJES_SRC__).split('?')[0].split('#')[0];
        var cut = src.lastIndexOf('/');
        if (cut > 6) return src.slice(0, cut) + '/begajes-config.json';
      }
    } catch (e) {}
    return CFG_URL_DEFAULT;
  }
  function readCfgCache() {
    try { return JSON.parse(localStorage.getItem('begajes_cfg_v21') || 'null'); } catch (e) { return null; }
  }
  function writeCfgCache(data) {
    try { localStorage.setItem('begajes_cfg_v21', JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  }
  function deepMerge(base, patch) {
    var out = {}, k;
    for (k in base) out[k] = base[k];
    if (!patch) return out;
    for (k in patch) {
      var pv = patch[k];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], pv);
      else if (pv !== undefined && pv !== null) out[k] = pv;
    }
    return out;
  }
  function cmpVer(a, b) {
    var pa = String(a || '').split('.'), pb = String(b || '').split('.');
    for (var i = 0; i < 3; i++) {
      var x = parseInt(pa[i] || '0', 10), y = parseInt(pb[i] || '0', 10);
      if (isNaN(x)) x = 0;
      if (isNaN(y)) y = 0;
      if (x !== y) return x - y;
    }
    return 0;
  }
  function fetchJSON(url, ms) {
    return new Promise((res, rej) => {
      var done = false, ctl = null;
      try { ctl = new AbortController(); } catch (e) {}
      var timer = setTimeout(() => { if (!done) { done = true; try { if (ctl) ctl.abort(); } catch (e) {} rej(new Error('timeout')); } }, ms || 3000);
      fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((j) => { if (!done) { done = true; clearTimeout(timer); res(j); } })
        .catch((e) => { if (!done) { done = true; clearTimeout(timer); rej(e); } });
    });
  }
  function killToast(msg) {
    try {
      var t0 = document.getElementById('begajes-kill-toast');
      if (t0) t0.parentNode.removeChild(t0);
      var t = document.createElement('div');
      t.id = 'begajes-kill-toast';
      t.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#170f04;border:1px solid rgba(251,191,36,.55);color:#fcd34d;padding:10px 16px;border-radius:12px;font:600 12.5px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.5);max-width:min(560px,92vw);text-align:center';
      t.textContent = 'BEGEJES v' + VER + ' - ' + (msg || 'dinonaktifkan');
      (document.body || document.documentElement).appendChild(t);
      setTimeout(() => { try { t.parentNode.removeChild(t); } catch (e) {} }, 7000);
    } catch (e) {}
    console.warn('[BEGEJES] config/kill:', msg);
  }

  /* ---------- LOG ---------- */
  var R = null;
  var logHistory = [];
  function log(msg, kind) {
    kind = kind || 'info';
    logHistory.unshift({ m: String(msg), k: kind });
    if (logHistory.length > 4) logHistory.pop();
    if (R && R.status) {
      R.status.textContent = String(msg);
      R.status.className = 'bg-status ' + kind;
      var html = '';
      for (var i = 0; i < logHistory.length; i++) {
        var h = logHistory[i];
        var tag = h.k === 'ok' ? '[OK] ' : h.k === 'fail' ? '[GAGAL] ' : h.k === 'warn' ? '[!] ' : '[i] ';
        html += '<div class="bg-logline ' + h.k + '">' + tag + String(h.m).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>';
      }
      R.hist.innerHTML = html;
    }
    console.log('[BEGEJES]', msg);
  }

  /* ---------- SESSION / AUTH (port dari engine terbukti) ---------- */
  let sessionCache = null;
  function readSession() {
    const s = {
      csrftoken: (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || null,
      lsd: null,
      appID: '238260118697367',
      versioningID: 'cf39c6377e026a1760665d37cfc1b31a93ae150e5d202da0aa6d36af9f0749fd',
      username: null,
      userID: null
    };
    const html = document.documentElement.innerHTML;
    if (!s.csrftoken) {
      s.csrftoken = (html.match(/"csrf_token":"([^"]+)"/) || html.match(/"csrftoken":"([^"]+)"/) || html.match(/csrf_token\\":\\"([^"\\]+)\\"/) || [])[1] || null;
    }
    s.lsd = (html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) || [])[1];
    s.appID = (html.match(/"appId":"([^"]+)"/) || [])[1] || s.appID;
    if (typeof require !== 'undefined') {
      try { s.lsd = s.lsd || require('LSD').token; } catch (e) {}
      try { s.appID = require('RelayAPIConfigDefaults').customHeaders['X-IG-App-ID'] || s.appID; } catch (e) {}
      try {
        const viewer = require('BarcelonaSharedData').viewer;
        if (viewer && viewer.username) { s.username = viewer.username; s.userID = viewer.id; }
      } catch (e) {}
      if (!s.username) {
        try {
          const cu = require('CurrentUser');
          if (cu && cu.getUsername) { s.username = cu.getUsername(); s.userID = cu.getID(); }
        } catch (e) {}
      }
    }
    if (!s.username && window._sharedData && window._sharedData.config && window._sharedData.config.viewer) {
      s.username = window._sharedData.config.viewer.username;
      s.userID = window._sharedData.config.viewer.id;
    }
    if (!s.username) {
      for (const a of document.querySelectorAll('a[href^="/@"]')) {
        const h = a.getAttribute('href') || '';
        if (h.split('/').length === 2 && a.querySelector('svg')) { s.username = h.replace('/@', ''); break; }
      }
    }
    if (!s.username) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.includes('user')) {
            const v = localStorage.getItem(k);
            if (v && v.includes('"username":"')) {
              const m = v.match(/"username":"([^"]+)"/);
              if (m) { s.username = m[1]; break; }
            }
          }
        }
      } catch (e) {}
    }
    return s;
  }
  async function getSession() {
    if (sessionCache && sessionCache.username) return sessionCache;
    let s = readSession();
    if (!s.username && s.csrftoken) {
      try {
        const res = await fetch(location.origin + '/graphql/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-csrftoken': s.csrftoken,
            'x-fb-lsd': s.lsd || '',
            'x-ig-app-id': s.appID,
            'x-instagram-ajax': '1',
            'x-asbd-id': '359341'
          },
          body: new URLSearchParams({
            fb_api_req_friendly_name: 'BarcelonaEditProfileLinksPageQuery',
            fb_api_caller_class: 'RelayModern',
            doc_id: '9653426861418870',
            variables: JSON.stringify({})
          }),
          credentials: 'include'
        });
        const txt = await res.text();
        const m = txt.match(/"username":"([^"]+)"/);
        if (m && m[1]) s.username = m[1];
      } catch (e) { console.log('[BEGEJES] Gagal fetch username:', e); }
    }
    sessionCache = s;
    return sessionCache;
  }
  async function apiHeaders(extra) {
    const s = await getSession();
    if (!s.csrftoken) throw new Error('CSRF token tidak ditemukan - pastikan sudah login di Threads');
    return Object.assign({
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-csrftoken': s.csrftoken,
      'x-ig-app-id': s.appID,
      'x-asbd-id': '359341',
      'x-bloks-version-id': s.versioningID,
      'x-instagram-ajax': '0',
      'x-requested-with': 'XMLHttpRequest'
    }, extra || {});
  }

  /* ---------- MEDIA: fetch URL -> File ---------- */
  async function fetchMediaFile(url, idx = 0) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        let blob = await res.blob();
        let ext = blob.type.split('/')[1] || 'jpg';
        let isVideo = blob.type.startsWith('video');
        if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) isVideo = true;
        if (!isVideo && blob.size > 20) {
          try {
            const buf = await blob.slice(0, 16).arrayBuffer();
            const dv = new DataView(buf);
            if (dv.getUint32(4) === 1718909296) isVideo = true;
          } catch (e) {}
        }
        if (isVideo) { ext = 'mp4'; blob = new Blob([blob], { type: 'video/mp4' }); }
        return new File([blob], 'begajes_media_' + Date.now() + '_' + idx + '.' + ext, { type: blob.type });
      }
    } catch (e) {}
    if (/\.(mp4|mov|webm)$/i.test(url)) {
      throw new Error('Video butuh akses CORS dan tidak bisa memakai fallback Canvas.');
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          cv.getContext('2d').drawImage(img, 0, 0);
          cv.toBlob((b) => {
            if (!b) return reject(new Error('Canvas toBlob gagal: ' + url));
            resolve(new File([b], 'begajes_media_' + Date.now() + '_' + idx + '.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.92);
        } catch (e) { reject(new Error('Canvas CORS gagal: ' + e.message)); }
      };
      img.onerror = () => reject(new Error('Gagal memuat media (CORS/404): ' + url));
      img.src = url;
    });
  }
  function getImageDims(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const u = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(u); resolve({ w: img.width, h: img.height }); };
      img.onerror = () => { URL.revokeObjectURL(u); resolve({ w: 1440, h: 1800 }); };
      img.src = u;
    });
  }
  function makeVideoThumb(file) {
    return new Promise((resolve, reject) => {
      const vid = document.createElement('video');
      vid.muted = true;
      const u = URL.createObjectURL(file);
      vid.src = u;
      vid.onloadeddata = () => { vid.currentTime = 0.1; };
      vid.onseeked = () => {
        try {
          const w = vid.videoWidth || 720, h = vid.videoHeight || 1280;
          const dur = Math.round((vid.duration || 5) * 1000);
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          cv.getContext('2d').drawImage(vid, 0, 0, w, h);
          cv.toBlob((b) => {
            URL.revokeObjectURL(u);
            if (!b) return reject(new Error('Gagal membuat thumbnail video'));
            resolve({ file: new File([b], 'thumbnail.jpg', { type: 'image/jpeg' }), meta: { w, h, duration_ms: dur } });
          }, 'image/jpeg', 0.92);
        } catch (e) { URL.revokeObjectURL(u); reject(e); }
      };
      vid.onerror = () => { URL.revokeObjectURL(u); resolve({ file: null, meta: { w: 720, h: 1280, duration_ms: 5000 } }); };
    });
  }

  /* ---------- UPLOAD ---------- */
  function genUploadId(seed) {
    return Date.now().toString() + (Math.floor(Math.random() * 9000) + 1000).toString() + (seed || '');
  }
  async function uploadImage(file, uploadId) {
    const s = await getSession();
    const { w, h } = await getImageDims(file);
    const name = 'fb_uploader_' + uploadId;
    const res = await fetch(location.origin + '/rupload_igphoto/' + name, {
      method: 'POST',
      headers: {
        'x-csrftoken': s.csrftoken,
        'x-entity-type': file.type || 'image/jpeg',
        'x-entity-name': name,
        'x-entity-length': file.size.toString(),
        'offset': '0',
        'x-ig-app-id': s.appID,
        'x-instagram-rupload-params': JSON.stringify({
          is_sidecar: '0', is_threads: '1', media_type: 1, upload_id: uploadId,
          upload_media_height: h, upload_media_width: w
        }),
        'Content-Type': file.type || 'image/jpeg',
        'Accept': '*/*'
      },
      body: file,
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Upload gambar gagal (' + res.status + '): ' + (await res.text().catch(() => '')).slice(0, 200));
    const j = await res.json().catch(() => ({}));
    if (j.status !== 'ok') throw new Error('Upload gambar ditolak: ' + JSON.stringify(j).slice(0, 200));
    return uploadId;
  }
  async function uploadVideo(file, uploadId, meta) {
    const s = await getSession();
    const name = 'fb_uploader_' + uploadId;
    const res = await fetch(location.origin + '/rupload_igvideo/' + name, {
      method: 'POST',
      headers: {
        'x-csrftoken': s.csrftoken,
        'x-entity-type': file.type || 'video/mp4',
        'x-entity-name': name,
        'x-entity-length': file.size.toString(),
        'offset': '0',
        'x-ig-app-id': s.appID,
        'x-instagram-rupload-params': JSON.stringify({
          is_sidecar: '0', is_threads: '1', media_type: 2, upload_id: uploadId,
          upload_media_duration_ms: meta.duration_ms, upload_media_width: meta.w, upload_media_height: meta.h
        }),
        'Content-Type': file.type || 'video/mp4',
        'Accept': '*/*'
      },
      body: file,
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Upload video gagal (' + res.status + '): ' + (await res.text().catch(() => '')).slice(0, 200));
    const j = await res.json().catch(() => ({}));
    if (j.status !== 'ok') throw new Error('Upload video ditolak: ' + JSON.stringify(j).slice(0, 200));
    return uploadId;
  }

  /* ---------- PUBLISH (text/image/sidecar + quote + spoiler) ---------- */
  async function publishPost(opts) {
    const { caption, mediaUrls = [], replyControl = 0, linkUrl = null, tagHeader = null, quotedPostId = null, spoiler = false } = opts;
    const s = await getSession();
    if (!s.csrftoken) throw new Error('Tidak login / CSRF token tidak ada');
    const uploadIds = [];
    for (let i = 0; i < mediaUrls.length; i++) {
      const u = (mediaUrls[i] || '').trim();
      if (!u) continue;
      log('Memproses media ke-' + (i + 1) + '...');
      const file = await fetchMediaFile(u, i);
      const uid = genUploadId(i);
      if (file.type.startsWith('video/')) {
        log('Mengekstrak metadata video...');
        const { file: cover, meta } = await makeVideoThumb(file);
        log('Mengunggah video...');
        await uploadVideo(file, uid, meta);
        if (cover) { log('Mengunggah cover video...'); await uploadImage(cover, uid); }
        uploadIds.push(uid);
      } else {
        log('Mengunggah gambar...');
        await uploadImage(file, uid);
        uploadIds.push(uid);
      }
    }
    if (uploadIds.length > 0) await sleep(2000);
    const info = {
      entry_point: 'floating_action_button',
      excluded_inline_media_ids: '[]',
      fediverse_composer_enabled: true,
      gif_media_id: null,
      link_attachment_url: linkUrl || null,
      reply_control: replyControl,
      special_effects_enabled_str: null,
      tag_header: tagHeader ? { display_text: tagHeader } : null,
      text_with_entities: { entities: [], text: caption }
    };
    if (quotedPostId) info.quoted_post_id = quotedPostId;
    if (spoiler) {
      if (uploadIds.length > 0) info.is_spoiler_media = true;
      else if (!linkUrl) {
        info.text_with_entities = {
          entities: [{
            entity: { display_text: caption, entity_type: 'spoiler', id: null, url: null },
            length: caption.length,
            offset: 0
          }],
          text: caption
        };
      }
    }
    const infoJson = JSON.stringify(info);
    const origin = location.origin;
    let endpoint, body, ctype;
    if (uploadIds.length === 0) {
      endpoint = origin + '/api/v1/media/configure_text_post_app_feed/';
      body = new URLSearchParams({
        audience: 'default',
        caption: caption,
        creator_geo_gating_info: JSON.stringify({ whitelist_country_codes: [] }),
        custom_accessibility_caption: '',
        gen_ai_detection_method: '',
        internal_features: '',
        is_meta_only_post: '',
        is_paid_partnership: '',
        is_threads: 'true',
        is_upload_type_override_allowed: '1',
        publish_mode: 'text_post',
        text_post_app_info: infoJson,
        upload_id: Date.now().toString(),
        jazoest: '22760'
      });
      ctype = 'application/x-www-form-urlencoded;charset=UTF-8';
    } else if (uploadIds.length === 1) {
      endpoint = origin + '/api/v1/media/configure_text_post_app_feed/';
      body = new URLSearchParams({
        audience: 'default',
        caption: caption,
        creator_geo_gating_info: JSON.stringify({ whitelist_country_codes: [] }),
        custom_accessibility_caption: '',
        gen_ai_detection_method: '',
        internal_features: '',
        is_meta_only_post: '',
        is_paid_partnership: '',
        is_threads: 'true',
        is_upload_type_override_allowed: '1',
        text_post_app_info: infoJson,
        upload_id: uploadIds[0],
        jazoest: '22760'
      });
      ctype = 'application/x-www-form-urlencoded;charset=UTF-8';
    } else {
      endpoint = origin + '/api/v1/media/configure_text_post_app_sidecar/';
      body = JSON.stringify({
        audience: 'default',
        caption: caption,
        children_metadata: uploadIds.map((id) => ({ upload_id: id })),
        client_sidecar_id: Date.now().toString(),
        creator_geo_gating_info: { whitelist_country_codes: [] },
        internal_features: '',
        is_threads: true,
        is_upload_type_override_allowed: '1',
        text_post_app_info: info
      });
      ctype = 'application/json;charset=UTF-8';
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await fetch(endpoint, { method: 'POST', headers: Object.assign(await apiHeaders(), { 'Content-Type': ctype }), body, credentials: 'include' });
      const raw = await res.text();
      if (!res.ok) {
        if (raw.includes('checkpoint_required') || raw.includes('checkpoint')) throw new Error('CHECKPOINT (akun kena batasan - buka aplikasi Threads)');
        if (raw.includes('Transcode not finished yet')) {
          log('Menunggu video dirender server... (10 detik)');
          await sleep(10000);
          continue;
        }
        throw new Error('Post gagal (' + res.status + '): ' + raw.slice(0, 300));
      }
      const j = JSON.parse(raw || '{}');
      const js = JSON.stringify(j);
      if (js.includes('checkpoint_required')) throw new Error('CHECKPOINT (akun kena batasan - buka aplikasi Threads)');
      if (j.status !== 'ok') {
        if (js.includes('Transcode not finished yet')) {
          log('Menunggu video dirender server... (10 detik)');
          await sleep(10000);
          continue;
        }
        throw new Error('Response ditolak: ' + js.slice(0, 300));
      }
      return ((j.media && (j.media.pk || j.media.id)) || '').toString().split('_')[0] || null;
    }
    throw new Error('Timeout menunggu render media (120 detik).');
  }

  /* ---------- POST ID dari URL + PIN ---------- */
  async function getPostIdFromUrl(url) {
    if (!/^https?:\/\/(www\.)?threads\.(net|com)\//i.test(url)) throw new Error('Bukan URL post Threads (harus threads.net / threads.com)');
    const res = await fetch(url);
    if (res.status === 404) throw new Error('Postingan sudah dihapus atau tidak ditemukan (404)');
    const txt = await res.text();
    let m = txt.match(/"post_id"\s*:\s*"(\d+)"/);
    if (m && m[1]) return m[1];
    m = txt.match(/threads:\/\/post\?id=(\d+)/);
    if (m && m[1]) return m[1];
    throw new Error('Tidak dapat menemukan ID postingan di URL tersebut.');
  }
  async function pinPost(postId) {
    const s = await getSession();
    const h = await apiHeaders();
    const res = await fetch(location.origin + '/graphql/query', {
      method: 'POST',
      headers: Object.assign(h, {
        'x-fb-lsd': s.lsd,
        'x-fb-friendly-name': 'useBarcelonaPinPostToProfileMutation',
        'x-root-field-name': 'xdt_api__v1__media__text_app_media_pin'
      }),
      body: new URLSearchParams({
        fb_api_req_friendly_name: 'useBarcelonaPinPostToProfileMutation',
        fb_api_caller_class: 'RelayModern',
        doc_id: '10062586430440963',
        variables: JSON.stringify({ post_id: postId })
      }),
      credentials: 'include'
    });
    const j = await res.json().catch(() => ({}));
    if ((j && (j.data || j.status === 'ok'))) return true;
    throw new Error('Penyematan (pin) gagal');
  }

  /* ---------- PROFILE ---------- */
  async function getMyProfileDetail() {
    const s = await getSession();
    if (!s.username) throw new Error('Username tidak terdeteksi');
    const h = await apiHeaders();
    const res = await fetch(location.origin + '/graphql/query', {
      method: 'POST',
      headers: Object.assign(h, {
        'x-fb-lsd': s.lsd,
        'x-fb-friendly-name': 'BarcelonaUsernameHovercardImplDirectQuery',
        'x-root-field-name': 'xdt_text_app_user_by_username'
      }),
      body: new URLSearchParams({
        fb_api_req_friendly_name: 'BarcelonaUsernameHovercardImplDirectQuery',
        fb_api_caller_class: 'RelayModern',
        doc_id: '9425696887539459',
        variables: JSON.stringify({
          username: s.username,
          __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
          __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
          __relay_internal__pv__BarcelonaHasSpoilerStylingInforelayprovider: false,
          __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider: true
        })
      }),
      credentials: 'include'
    });
    const j = await res.json();
    const u = (j && j.data && j.data.xdt_text_app_user_by_username) || {};
    return { name: u.full_name || '', bio: u.biography || '', photo: u.profile_pic_url || '' };
  }
  async function getMyBioLinkId() {
    const h = await apiHeaders();
    const s = await getSession();
    const res = await fetch(location.origin + '/graphql/query', {
      method: 'POST',
      headers: Object.assign(h, {
        'x-fb-lsd': s.lsd,
        'x-fb-friendly-name': 'BarcelonaEditProfileLinksPageQuery',
        'x-root-field-name': 'xdt_text_app_viewer'
      }),
      body: new URLSearchParams({
        fb_api_req_friendly_name: 'BarcelonaEditProfileLinksPageQuery',
        fb_api_caller_class: 'RelayModern',
        doc_id: '9653426861418870',
        variables: JSON.stringify({})
      }),
      credentials: 'include'
    });
    const j = await res.json();
    return (j && j.data && j.data.viewer && j.data.viewer.user && j.data.viewer.user.bio_links && j.data.viewer.user.bio_links[0] && j.data.viewer.user.bio_links[0].link_id) || null;
  }
  async function uploadProfilePhoto(url) {
    const s = await getSession();
    log('Mengunduh & merender foto profil (1440px)...');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise((ok, err) => {
      img.onload = ok;
      img.onerror = () => err(new Error('Gagal memuat gambar profil ke Canvas. Pastikan URL valid dan mendukung CORS.'));
    });
    const size = 1440;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.filter = 'blur(40px)';
    ctx.globalAlpha = 0.75;
    const scaleBg = Math.max(size / img.width, size / img.height);
    ctx.drawImage(img, (size - img.width * scaleBg) / 2, (size - img.height * scaleBg) / 2, img.width * scaleBg, img.height * scaleBg);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    const scale = Math.min(size / img.width, size / img.height);
    ctx.drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
    const uid = Date.now().toString();
    const name = 'fb_uploader_' + uid;
    const res = await fetch(location.origin + '/rupload_igphoto/' + name, {
      method: 'POST',
      headers: {
        'x-csrftoken': s.csrftoken,
        'x-entity-type': file.type,
        'x-entity-name': name,
        'x-entity-length': file.size.toString(),
        'offset': '0',
        'x-ig-app-id': s.appID,
        'x-instagram-rupload-params': JSON.stringify({
          is_sidecar: '0', is_threads: '1', media_type: 1, upload_id: uid,
          upload_media_height: size, upload_media_width: size
        }),
        'Content-Type': file.type,
        'Accept': '*/*'
      },
      body: file,
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Gagal mengupload foto profil ke server');
    return uid;
  }
  async function updateProfile({ bio, link, photoUrl }) {
    const s = await getSession();
    if (!s.username) throw new Error('Username tidak ditemukan');
    let bioText = bio, name = '';
    try {
      const d = await getMyProfileDetail();
      if (!bioText) bioText = d.bio;
      name = d.name;
    } catch (e) {}
    let picId = null;
    if (photoUrl) picId = await uploadProfilePhoto(photoUrl);
    const vars = {
      biography: bioText || '',
      external_url: '',
      username: s.username,
      name: name || '',
      is_private: false,
      profile_picture_upload_id: picId,
      remove_profile_picture: false,
      copy_ig_profile_picture_to_text_post_app: false,
      __relay_internal__pv__BarcelonaHasStylingInforelayprovider: false
    };
    const h = await apiHeaders();
    const res = await fetch(location.origin + '/graphql/query', {
      method: 'POST',
      headers: Object.assign(h, { 'x-fb-lsd': s.lsd }),
      body: new URLSearchParams({
        fb_api_req_friendly_name: 'useBarcelonaEditProfileMutation',
        fb_api_caller_class: 'RelayModern',
        doc_id: '9639149439534636',
        variables: JSON.stringify(vars)
      }),
      credentials: 'include'
    });
    if (!res.ok) throw new Error('GraphQL profile update gagal: ' + res.status);
    if (link) {
      log('Memproses tautan profil...');
      const linkId = await getMyBioLinkId();
      const varsLink = { link_id: linkId, title: '', url: link };
      const h2 = await apiHeaders();
      const res2 = await fetch(location.origin + '/graphql/query', {
        method: 'POST',
        headers: Object.assign(h2, {
          'x-fb-lsd': s.lsd,
          'x-fb-friendly-name': linkId ? 'useBarcelonaCreateOrUpdateBioLinkMutation' : 'useBarcelonaCreateBioLinkMutation',
          'x-root-field-name': linkId ? 'xdt_text_app_create_or_update_user_bio_link' : 'xdt_text_app_create_user_bio_link'
        }),
        body: new URLSearchParams({
          fb_api_req_friendly_name: linkId ? 'useBarcelonaCreateOrUpdateBioLinkMutation' : 'useBarcelonaCreateBioLinkMutation',
          fb_api_caller_class: 'RelayModern',
          doc_id: '9651752851573048',
          variables: JSON.stringify(varsLink)
        }),
        credentials: 'include'
      });
      if (!res2.ok) throw new Error('Gagal menyimpan tautan bio: ' + res2.status);
    }
    return true;
  }

  /* ---------- UTIL ---------- */
  function parseDelay(v) {
    let s = (v || '').replace(/[–—]/g, '-').trim();
    if (s.includes('-')) {
      const parts = s.split('-').map((x) => parseInt(x, 10));
      let lo = isNaN(parts[0]) ? 5 : parts[0], hi = isNaN(parts[1]) ? lo : parts[1];
      if (hi < lo) { const t = lo; lo = hi; hi = t; }
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    }
    const n = parseInt(s, 10);
    return isNaN(n) ? 5 : n;
  }
  function postUrl(pid) {
    const s = sessionCache;
    return s && s.username ? 'https://www.threads.net/@' + s.username + '/post/' + pid : 'post/' + pid;
  }
  /* ---------- UI (shadow DOM: CSS halaman tidak bisa menyentuh panel) ---------- */
  const CSS = `
.bg-panel{width:100%;display:flex;flex-direction:row;align-items:stretch;background:linear-gradient(165deg,#0e1326 0%,#141a33 55%,#101530 100%);border:1px solid rgba(34,211,238,.28);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04) inset;overflow:hidden;position:relative;color:#e8edfb;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;user-select:none;-webkit-user-select:none}
.bg-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#22d3ee,#8b5cf6,#ec4899);z-index:3}
.bg-side{display:flex;flex-direction:column;gap:6px;width:62px;flex:0 0 62px;padding:14px 6px 10px;background:rgba(8,12,26,.55);border-right:1px solid rgba(34,211,238,.18)}
.bg-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;font-size:8.5px;font-weight:800;letter-spacing:.8px;color:#7c86ab;background:transparent;border:0;border-radius:11px;padding:10px 2px;cursor:pointer;text-align:center;transition:all .18s;line-height:1;font-family:inherit}
.bg-tab i{font-style:normal;width:7px;height:7px;border-radius:50%;background:#3a4470;display:block;transition:all .18s}
.bg-tab:hover{color:#e2e8f0;background:rgba(34,211,238,.07)}
.bg-tab.on{color:#fff;background:linear-gradient(135deg,rgba(34,211,238,.9),rgba(139,92,246,.9));box-shadow:0 2px 10px rgba(34,211,238,.35)}
.bg-tab.on i{background:#fff}
.bg-main{display:flex;flex-direction:column;flex:1;min-width:0;max-height:calc(100vh - 28px)}
.bg-head{display:flex;align-items:center;gap:10px;cursor:move;touch-action:none;padding:12px 12px 11px 14px;border-bottom:1px solid rgba(34,211,238,.18);flex:0 0 auto;background:linear-gradient(90deg,rgba(34,211,238,.06),rgba(139,92,246,.06))}
.bg-logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:19px;color:#07101f;flex:0 0 auto;box-shadow:0 2px 10px rgba(34,211,238,.4)}
.bg-hwrap{display:flex;flex-direction:column;line-height:1.2;flex:1;min-width:0}
.bg-hwrap b{font-size:16px;font-weight:900;letter-spacing:1.6px;background:linear-gradient(90deg,#7dd3fc,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
.bg-hwrap span{font-size:9px;color:#67e8f9;font-weight:700;letter-spacing:.9px;text-transform:uppercase;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bg-badge{font-size:9.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(34,211,238,.12);color:#67e8f9;border:1px solid rgba(34,211,238,.35);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 0 auto}
.bg-badge.off{background:rgba(148,163,184,.1);color:#94a3b8;border-color:rgba(148,163,184,.3)}
.bg-hbtn{width:28px;height:28px;border-radius:9px;border:1px solid #303a5e;background:#171d33;color:#a5b0d6;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto;line-height:1;font-family:inherit}
.bg-hbtn:hover{background:#222a48;color:#fff}
.bg-hbtn.x{background:rgba(244,63,94,.12);border-color:rgba(244,63,94,.35);color:#fb7185}
.bg-hbtn.x:hover{background:rgba(244,63,94,.28)}
.bg-notice{display:none;align-items:flex-start;gap:8px;margin:8px 12px 0;padding:9px 12px;border-radius:10px;background:rgba(251,191,36,.09);border:1px solid rgba(251,191,36,.4);color:#fcd34d;font-size:11px;line-height:1.5;flex:0 0 auto}
.bg-notice.on{display:flex}
.bg-notice span{flex:1;min-width:0}
.bg-panes{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column}
.bg-panes::-webkit-scrollbar{width:8px}
.bg-panes::-webkit-scrollbar-thumb{background:#2a3358;border-radius:99px}
.bg-pane{display:none;flex-direction:column;gap:8px}
.bg-pane.on{display:flex}
.bg-hide{display:none!important}
.bg-lbl{font-size:9.5px;font-weight:800;letter-spacing:.9px;color:#8ca2c5;text-transform:uppercase;display:flex;align-items:center;gap:6px;margin:2px 0 -2px}
.bg-lbl i{font-style:normal;width:6px;height:6px;border-radius:50%;background:#22d3ee;display:inline-block;flex:0 0 auto}
.bg-f{width:100%;background:#171d33;border:1px solid #303a5e;border-radius:10px;color:#e8edfb;font-family:inherit;font-size:13px;line-height:1.5;padding:10px 12px;outline:none;margin:0;display:block;transition:border-color .15s,box-shadow .15s;box-sizing:border-box}
.bg-f.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.1px}
.bg-f::placeholder{color:#5e6a8f}
.bg-f:focus{border-color:#22d3ee;box-shadow:0 0 0 3px rgba(34,211,238,.18);background:#1a2138}
textarea.bg-f{resize:vertical;min-height:44px;overflow-y:auto}
select.bg-f{cursor:pointer}
select.bg-f option{background:#141a33;color:#e8edfb}
.bg-row{display:flex;gap:8px;align-items:stretch}
.bg-row>.bg-f{flex:1;min-width:0}
.bg-counter{position:relative}
.bg-counter i{position:absolute;right:9px;bottom:7px;font-size:9px;font-style:normal;color:#64748b;background:rgba(20,26,51,.92);padding:1px 6px;border-radius:6px;pointer-events:none}
.bg-counter i.bad{color:#fb7185}
.bg-switchrow{display:flex;align-items:center;gap:10px;background:#171d33;border:1px solid #303a5e;border-radius:10px;padding:9px 12px;cursor:pointer;flex:0 0 auto}
.bg-switchrow b{font-size:10.5px;letter-spacing:.8px;color:#a5b0d6}
.bg-switchrow.sp b{color:#fbbf24}
.bg-switch{position:relative;display:inline-block;width:28px;height:16px;flex:0 0 auto;cursor:pointer}
.bg-switch input{display:none}
.bg-slider{position:absolute;inset:0;background:#2c3563;border-radius:999px;transition:.2s}
.bg-slider::before{content:'';position:absolute;width:12px;height:12px;left:2px;top:2px;background:#8b96c4;border-radius:50%;transition:.2s}
.bg-switch input:checked+.bg-slider{background:linear-gradient(135deg,#22d3ee,#8b5cf6)}
.bg-switch.grn input:checked+.bg-slider{background:linear-gradient(135deg,#059669,#10b981)}
.bg-switch input:checked+.bg-slider::before{transform:translateX(12px);background:#fff}
.bg-btn{border:0;border-radius:10px;font-weight:800;font-size:12px;letter-spacing:.5px;color:#fff;cursor:pointer;padding:11px 12px;background:#2c3563;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1.2;font-family:inherit;min-height:42px}
.bg-btn:hover{filter:brightness(1.15)}
.bg-btn:active{transform:scale(.97)}
.bg-btn:disabled{opacity:.55;cursor:not-allowed}
.bg-btn.pri{background:linear-gradient(135deg,#22d3ee,#8b5cf6);box-shadow:0 3px 14px rgba(34,211,238,.3);color:#07101f}
.bg-btn.gry{background:#263050;color:#c7d0ea}
.bg-btn.dng{background:linear-gradient(135deg,#f43f5e,#b91c1c);color:#fff}
.bg-btn.gho{background:transparent;border:1px solid #303a5e;color:#94a3b8}
.bg-mini{border:1px solid #303a5e;background:#171d33;color:#9db1d1;border-radius:8px;height:28px;padding:0 10px;font-size:10px;font-weight:800;letter-spacing:.5px;cursor:pointer;flex:0 0 auto;font-family:inherit}
.bg-mini:hover{background:#222a48;color:#fff}
.bg-mini:disabled{opacity:.4;cursor:not-allowed}
.bg-prev{display:none;position:relative;border-radius:10px;border:1px solid #303a5e;overflow:hidden;max-height:96px;background:#0e1326}
.bg-prev img{display:block;max-width:100%;max-height:96px;margin:0 auto;object-fit:cover}
.bg-prev .bg-tag{position:absolute;left:6px;top:6px;font-size:8.5px;font-weight:800;background:rgba(14,19,38,.85);color:#a5b0d6;padding:2px 7px;border-radius:999px;border:1px solid #303a5e}
.bg-bar{display:none;height:6px;border-radius:999px;background:#1a2140;overflow:hidden}
.bg-bar i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#8b5cf6);border-radius:999px;transition:width .4s ease}
.bg-chips{display:flex;gap:5px}
.bg-chip{flex:1;text-align:center;font-size:9px;font-weight:800;padding:5px 0;border-radius:7px;background:#171d33;color:#64748b;border:1px solid #303a5e;letter-spacing:.5px}
.bg-chip.run{color:#22d3ee;border-color:rgba(34,211,238,.5);background:rgba(34,211,238,.1)}
.bg-chip.ok{color:#34d399;border-color:rgba(16,185,129,.5);background:rgba(16,185,129,.1)}
.bg-chip.bad{color:#fb7185;border-color:rgba(244,63,94,.5);background:rgba(244,63,94,.1)}
.bg-note{font-size:10px;color:#64748b;line-height:1.5}
.bg-div{height:1px;background:rgba(34,211,238,.2);margin:4px 0;flex:0 0 auto}
#bg-profil-sec{display:contents}
#bg-profil-sec.bg-hide{display:none}
.bg-avrow{display:flex;align-items:center;gap:8px}
.bg-av{width:42px;height:42px;border-radius:50%;border:1.5px dashed #3d4780;background:#171d33;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex:0 0 auto;color:#7c86ab;font-size:15px;font-weight:900}
.bg-av img{width:100%;height:100%;object-fit:cover;display:block}
.bg-namebox{display:flex;align-items:center;gap:6px;background:#171d33;border:1px solid #303a5e;border-radius:10px;padding:9px 11px;flex:1;min-width:0}
.bg-namebox span{font-size:12px;color:#e8edfb;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.bg-copy{cursor:pointer;color:#22d3ee;font-size:10px;font-weight:800;flex:0 0 auto;padding:0;border:0;background:none;letter-spacing:.5px;font-family:inherit}
.bg-copy:hover{color:#7dd3fc}
.bg-uidrow{display:flex;align-items:center;gap:8px}
.bg-uid{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;font-weight:700;padding:8px 10px;border-radius:8px;background:#12182c;border:1px dashed #303a5e;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bg-uid.has{color:#67e8f9;border-color:rgba(34,211,238,.55);background:rgba(34,211,238,.06)}
.bg-hist{display:flex;flex-direction:column;gap:2px;padding:0 14px 6px;flex:0 0 auto}
.bg-logline{font-size:9.5px;line-height:1.35;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bg-logline.info{color:#94a3b8}
.bg-logline.ok{color:#34d399}
.bg-logline.fail{color:#fb7185}
.bg-logline.warn{color:#fbbf24}
.bg-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;border-top:1px solid #222b47;background:rgba(8,12,26,.6);flex:0 0 auto}
.bg-status{font-size:11px;color:#9db1d1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.bg-status.ok{color:#34d399}
.bg-status.fail{color:#fb7185}
.bg-status.warn{color:#fbbf24}
.bg-wm{font-size:9.5px;font-weight:900;letter-spacing:.3em;color:#3f5880;flex:0 0 auto}
.bg-panel.min .bg-side,.bg-panel.min .bg-panes,.bg-panel.min .bg-hist,.bg-panel.min .bg-notice{display:none!important}
.bg-panel.min .bg-main{max-height:none}
@media (max-width:480px){ .bg-row{flex-wrap:wrap} }
`;
  const HTML = `
<div class='bg-panel' id='bg-panel'>
  <div class='bg-side'>
    <button class='bg-tab on' id='bg-tab-post' data-t='post' title='Post / Profil'><i></i><span>POST</span></button>
    <button class='bg-tab' id='bg-tab-bulk' data-t='bulk' title='Bulk 3 postingan'><i></i><span>BULK</span></button>
    <button class='bg-tab' id='bg-tab-quote' data-t='quote' title='Quote post'><i></i><span>QUOTE</span></button>
  </div>
  <div class='bg-main'>
    <div class='bg-head' id='bg-head'>
      <div class='bg-logo'>B</div>
      <div class='bg-hwrap'><b>BEGEJES</b><span>Autopost Threads - v2.1</span></div>
      <div class='bg-badge off' id='bg-user-badge'>Offline</div>
      <button class='bg-hbtn' id='bg-min' title='Minimize'>-</button>
      <button class='bg-hbtn x' id='bg-close' title='Tutup'>×</button>
    </div>
    <div class='bg-notice' id='bg-notice'><span id='bg-notice-txt'></span><button class='bg-mini' id='bg-notice-x'>OK</button></div>
    <div class='bg-panes'>
      <div class='bg-pane on' id='bg-pane-post'>
        <div class='bg-lbl'><i></i>Media (URL gambar/video - 1 baris 1 media)</div>
        <textarea class='bg-f mono' id='bg-post-media' rows='2' placeholder='https://...gambar/video... (opsional)'></textarea>
        <div class='bg-counter'><textarea class='bg-f' id='bg-post-cap' rows='5' placeholder='Tulis caption postingan...'></textarea><i id='bg-post-cap-c'>0/500</i></div>
        <div class='bg-row'>
          <input class='bg-f mono' id='bg-post-link' placeholder='Link tautan (opsional)'>
          <label class='bg-switchrow' id='bg-pin-wrap' title='Sematkan post link ke profil'><b>PIN</b><span class='bg-switch'><input type='checkbox' id='bg-post-pin'><span class='bg-slider'></span></span></label>
        </div>
        <div class='bg-row'>
          <input class='bg-f' id='bg-post-topic' placeholder='Topik (opsional - ketik manual)'>
          <select class='bg-f' id='bg-post-rc' title='Siapa yang bisa membalas' style='flex:0 0 104px'>
            <option value='0'>Publik</option><option value='1'>Follower</option><option value='2'>Mention</option>
          </select>
        </div>
        <label class='bg-switchrow sp' id='bg-spo-wrap' title='Tandai spoiler: media blur sampai diklik'><b>SPOILER</b><span class='bg-switch grn'><input type='checkbox' id='bg-post-spo'><span class='bg-slider'></span></span></label>
        <div class='bg-note'>SPOILER aktif - post blur di feed (media blur, atau teks disembunyikan kalau tanpa media), seperti tombol 'Tandai spoiler' di Threads.</div>
        <button class='bg-btn pri' id='bg-btn-post'>POST SEKARANG</button>
        <div class='bg-div'></div>
        <div id='bg-profil-sec'>
          <div class='bg-lbl'><i></i>Profil</div>
          <div class='bg-avrow'>
            <div class='bg-av' id='bg-av' title='Klik: upload foto dari komputer'>B</div>
            <input type='file' id='bg-av-file' accept='image/*' style='display:none'>
            <div class='bg-namebox'><span id='bg-profile-name'>Mendeteksi...</span><button class='bg-copy' id='bg-copy-name' title='Salin username'>COPY</button></div>
          </div>
          <textarea class='bg-f mono' id='bg-prof-photo' rows='2' placeholder='URL foto profil (atau klik avatar untuk file lokal)'></textarea>
          <div class='bg-prev' id='bg-prof-prev'><img id='bg-prof-img' alt=''><span class='bg-tag'>PREVIEW</span></div>
          <div class='bg-row'>
            <button class='bg-btn gry' id='bg-btn-getpp'>GET PP</button>
            <button class='bg-btn gho' id='bg-btn-clearpp'>HAPUS</button>
            <button class='bg-btn pri' id='bg-btn-update' style='flex:1'>UPDATE PROFIL</button>
          </div>
          <textarea class='bg-f' id='bg-prof-bio' rows='2' placeholder='Bio profil...'></textarea>
          <input class='bg-f mono' id='bg-prof-link' placeholder='Tautan situs web (opsional)'>
        </div>
      </div>
      <div class='bg-pane' id='bg-pane-bulk'>
        <div class='bg-lbl'><i></i>URL Gambar - dipakai sama untuk 3 postingan</div>
        <textarea class='bg-f mono' id='bg-bulk-img' rows='2' placeholder='https://... (kosongkan untuk post teks saja)'></textarea>
        <div class='bg-prev' id='bg-bulk-prev'><img id='bg-bulk-img-prev' alt=''><span class='bg-tag'>PREVIEW</span></div>
        <div class='bg-lbl'><i></i>3 Caption - 1 postingan per caption (foto sama, caption beda)</div>
        <div class='bg-counter'><textarea class='bg-f' id='bg-bulk-c1' rows='2' placeholder='Caption 1...'></textarea><i id='bg-bulk-c1-c'>0/500</i></div>
        <div class='bg-counter'><textarea class='bg-f' id='bg-bulk-c2' rows='2' placeholder='Caption 2...'></textarea><i id='bg-bulk-c2-c'>0/500</i></div>
        <div class='bg-counter'><textarea class='bg-f' id='bg-bulk-c3' rows='2' placeholder='Caption 3...'></textarea><i id='bg-bulk-c3-c'>0/500</i></div>
        <div class='bg-row'>
          <input class='bg-f mono' id='bg-bulk-delay' style='flex:0 0 70px;text-align:center' value='6-9' title='Delay (detik). Contoh: 6 atau 6-9 (acak)'>
          <input class='bg-f' id='bg-bulk-topic' style='flex:1.4' placeholder='Topik (opsional)'>
          <select class='bg-f' id='bg-bulk-rc' style='flex:1'>
            <option value='0'>Publik</option><option value='1'>Follower</option><option value='2'>Mention</option>
          </select>
        </div>
        <div class='bg-bar' id='bg-bulk-bar'><i></i></div>
        <div class='bg-chips'>
          <span class='bg-chip' id='bg-chip-1'>POST 1</span><span class='bg-chip' id='bg-chip-2'>POST 2</span><span class='bg-chip' id='bg-chip-3'>POST 3</span>
        </div>
        <button class='bg-btn pri' id='bg-btn-bulk'>BULK POST 3x</button>
        <div class='bg-note'>Gambar di-upload ulang tiap postingan (upload_id baru). Caption kosong = dilewati. Saat jalan, tombol berubah jadi STOP.</div>
      </div>
      <div class='bg-pane' id='bg-pane-quote'>
        <div class='bg-lbl'><i></i>URL Postingan yang Dikutip</div>
        <textarea class='bg-f mono' id='bg-quote-url' rows='1' placeholder='Tempel URL atau ID postingan... (kosong = halaman post ini)'></textarea>
        <div class='bg-uidrow'><span class='bg-uid' id='bg-quote-uid'>ID: -</span><button class='bg-mini' id='bg-copy-id' disabled>COPY</button></div>
        <div class='bg-lbl'><i></i>Media Komentar (opsional)</div>
        <textarea class='bg-f mono' id='bg-quote-media' rows='2' placeholder='URL gambar/video (opsional)'></textarea>
        <div class='bg-counter'><textarea class='bg-f' id='bg-quote-cap' rows='4' placeholder='Kutipan / komentar Anda...'></textarea><i id='bg-quote-cap-c'>0/500</i></div>
        <input class='bg-f' id='bg-quote-topic' placeholder='Topik (opsional - ketik manual)'>
        <button class='bg-btn pri' id='bg-btn-quote'>QUOTE POST</button>
        <div class='bg-note'>URL otomatis dikonversi ke ID postingan saat diketik - tanpa tombol GET POST.</div>
      </div>
    </div>
    <div class='bg-hist' id='bg-hist'></div>
    <div class='bg-foot'>
      <div class='bg-status' id='bg-status'>Siap.</div>
      <div class='bg-wm'>BEGEJES</div>
    </div>
  </div>
</div>
`;

  function buildPanel(cfg) {
    const host = document.createElement('div');
    host.id = 'begajes-root';
    const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML = '<style>' + CSS + '</style>' + HTML;
    (document.body || document.documentElement).appendChild(host);
    const $ = (id) => shadow.getElementById(id);

    R = {
      host, shadow, panel: $('bg-panel'), head: $('bg-head'),
      tabPost: $('bg-tab-post'), tabBulk: $('bg-tab-bulk'), tabQuote: $('bg-tab-quote'),
      panePost: $('bg-pane-post'), paneBulk: $('bg-pane-bulk'), paneQuote: $('bg-pane-quote'),
      minBtn: $('bg-min'), closeBtn: $('bg-close'),
      notice: $('bg-notice'), noticeTxt: $('bg-notice-txt'), noticeX: $('bg-notice-x'),
      status: $('bg-status'), hist: $('bg-hist'), badge: $('bg-user-badge'),
      postCap: $('bg-post-cap'), postMedia: $('bg-post-media'), postLink: $('bg-post-link'),
      postTopic: $('bg-post-topic'), rcPost: $('bg-post-rc'), postPin: $('bg-post-pin'), postSpo: $('bg-post-spo'),
      pinWrap: $('bg-pin-wrap'), spoWrap: $('bg-spo-wrap'), btnPost: $('bg-btn-post'),
      profilSec: $('bg-profil-sec'), av: $('bg-av'), avFile: $('bg-av-file'),
      profileName: $('bg-profile-name'), copyName: $('bg-copy-name'),
      profPhoto: $('bg-prof-photo'), profImg: $('bg-prof-img'),
      btnGetPp: $('bg-btn-getpp'), btnClearPp: $('bg-btn-clearpp'), btnUpdate: $('bg-btn-update'),
      profBio: $('bg-prof-bio'), profLink: $('bg-prof-link'),
      bulkImg: $('bg-bulk-img'), bulkC1: $('bg-bulk-c1'), bulkC2: $('bg-bulk-c2'), bulkC3: $('bg-bulk-c3'),
      bulkDelay: $('bg-bulk-delay'), bulkTopic: $('bg-bulk-topic'), rcBulk: $('bg-bulk-rc'),
      bulkBar: $('bg-bulk-bar'), chips: [$('bg-chip-1'), $('bg-chip-2'), $('bg-chip-3')], btnBulk: $('bg-btn-bulk'),
      quoteUrl: $('bg-quote-url'), quoteUid: $('bg-quote-uid'), copyIdBtn: $('bg-copy-id'),
      quoteMedia: $('bg-quote-media'), quoteCap: $('bg-quote-cap'), quoteTopic: $('bg-quote-topic'), btnQuote: $('bg-btn-quote')
    };

    /* lebar panel dari config (default 560px) */
    const w = parseInt(cfg.ui && cfg.ui.width, 10);
    if (!isNaN(w) && w > 0) host.style.width = Math.min(Math.max(w, 340), Math.max(340, (window.innerWidth || 1024) - 16)) + 'px';
    host.style.position = 'fixed';
    host.style.top = '14px';
    host.style.right = '14px';
    host.style.zIndex = '2147483647';
    host.style.maxWidth = 'calc(100vw - 16px)';
    if (!host.style.width) host.style.width = '560px';

    /* apply feature toggle dari remote config */
    function showIf(el, on) { if (el) el.classList.toggle('bg-hide', !on); }
    const on = (x) => x !== false;
    const f = cfg.features || {};
    showIf(R.tabPost, on(f.post));
    showIf(R.tabBulk, on(f.bulk));
    showIf(R.tabQuote, on(f.quote));
    showIf(R.pinWrap, on(f.pin));
    showIf(R.spoWrap, on(f.spoiler));
    showIf(R.rcPost, on(f.replyControl));
    showIf(R.rcBulk, on(f.replyControl));
    showIf(R.profilSec, on(f.profil));
    let curTab = 'post';
    const paneTab = { post: R.tabPost, bulk: R.tabBulk, quote: R.tabQuote };
    const paneVisible = (t) => paneTab[t] && !paneTab[t].classList.contains('bg-hide');
    const firstPane = () => paneVisible('post') ? 'post' : (paneVisible('bulk') ? 'bulk' : (paneVisible('quote') ? 'quote' : 'post'));
    if (!paneVisible(curTab)) curTab = firstPane();
    function activate(t) {
      curTab = t;
      [R.tabPost, R.tabBulk, R.tabQuote].forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === t));
      R.panePost.classList.toggle('on', t === 'post');
      R.paneBulk.classList.toggle('on', t === 'bulk');
      R.paneQuote.classList.toggle('on', t === 'quote');
    }
    activate(curTab);
    [R.tabPost, R.tabBulk, R.tabQuote].forEach((b) => b.addEventListener('click', () => {
      activate(b.getAttribute('data-t'));
      const s = sessionCache;
      if (s && s.username) log('Siap! Login sebagai @' + s.username, 'ok');
      else log('Login ke Threads dulu untuk mulai', 'warn');
    }));
    if (cfg.notice) {
      R.noticeTxt.textContent = String(cfg.notice).slice(0, 300);
      R.notice.classList.add('on');
    }
    R.noticeX.addEventListener('click', () => R.notice.classList.remove('on'));
    if (cfg.status) log(String(cfg.status));

    /* minimize + close (hanya menyentuh panel sendiri) */
    R.minBtn.addEventListener('click', () => {
      const m = R.panel.classList.toggle('min');
      R.minBtn.textContent = m ? '+' : '-';
    });
    R.closeBtn.addEventListener('click', () => {
      if (host.parentNode) host.parentNode.removeChild(host);
      window.__BEGEJES_ACTIVE__ = false;
    });

    /* isolasi event: halaman (Threads) tidak melihat klik/ketikan di dalam panel */
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchend', 'contextmenu'].forEach((ev) => {
      R.panel.addEventListener(ev, (e) => e.stopPropagation());
    });

    /* drag baru: posisi absolut di HOST + clamp viewport penuh.
       Penyebab bug lama: position:inline kalah !important CSS + clamp salah
       -> panel terdorong keluar layar. Sekarang dihitung koordinat viewport. */
    let drag = null;
    R.head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, textarea, select, label, a')) return;
      drag = { x: e.clientX, y: e.clientY, l: host.offsetLeft, t: host.offsetTop };
      host.style.left = host.offsetLeft + 'px';
      host.style.top = host.offsetTop + 'px';
      host.style.right = 'auto';
      e.preventDefault();
    });
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const nx = drag.l + (e.clientX - drag.x), ny = drag.t + (e.clientY - drag.y);
      const maxX = Math.max(4, window.innerWidth - host.offsetWidth - 4);
      const maxY = Math.max(4, window.innerHeight - host.offsetHeight - 4);
      host.style.left = Math.min(Math.max(nx, 4), maxX) + 'px';
      host.style.top = Math.min(Math.max(ny, 4), maxY) + 'px';
    }, true);
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      try { localStorage.setItem('begajes_pos_v21', JSON.stringify({ l: host.offsetLeft, t: host.offsetTop })); } catch (err) {}
    };
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('pointercancel', endDrag, true);
    function clampHost() {
      if (host.style.right !== 'auto') return;
      const l = parseFloat(host.style.left), t = parseFloat(host.style.top);
      if (isNaN(l) || isNaN(t)) return;
      host.style.left = Math.min(Math.max(l, 4), Math.max(4, window.innerWidth - host.offsetWidth - 4)) + 'px';
      host.style.top = Math.min(Math.max(t, 4), Math.max(4, window.innerHeight - host.offsetHeight - 4)) + 'px';
    }
    window.addEventListener('resize', clampHost);
    try {
      const pos = JSON.parse(localStorage.getItem('begajes_pos_v21') || 'null');
      if (pos && isFinite(pos.l) && isFinite(pos.t)) {
        host.style.left = pos.l + 'px';
        host.style.top = pos.t + 'px';
        host.style.right = 'auto';
        setTimeout(clampHost, 80);
      }
    } catch (err) {}

    /* helper UI */
    function bindCounter(taId, cId) {
      const ta = $(taId), c = $(cId);
      if (!ta || !c) return;
      const upd = () => {
        const n = ta.value.length;
        c.textContent = n + '/500';
        c.className = n > 500 ? 'bad' : '';
      };
      ta.addEventListener('input', upd);
      ta.addEventListener('keyup', upd);
    }
    function bindPreview(taId, wrapId, imgId) {
      const ta = $(taId), wrap = $(wrapId), img = $(imgId);
      if (!ta || !wrap || !img) return;
      const upd = () => {
        const u = ta.value.trim().split('\n')[0] || '';
        if (/^https?:\/\//i.test(u) && !/\.(mp4|mov|webm)(\?|$)/i.test(u)) {
          img.src = u;
          wrap.style.display = 'block';
          img.onerror = () => { wrap.style.display = 'none'; };
        } else wrap.style.display = 'none';
      };
      ta.addEventListener('input', upd);
    }
    function bindAutoGrow(taId, max) {
      const ta = $(taId);
      if (!ta) return;
      const upd = () => {
        const rows = parseInt(ta.getAttribute('rows') || '3', 10);
        const minH = rows * 19 + 18;
        ta.style.height = 'auto';
        const h = Math.min(Math.max(ta.scrollHeight, minH), max || 220);
        ta.style.height = h + 'px';
        ta.style.overflowY = ta.scrollHeight > (max || 220) ? 'auto' : 'hidden';
      };
      ta.addEventListener('input', upd);
      setTimeout(upd, 60);
    }
    const STATE_IDS = ['bg-bulk-img', 'bg-bulk-c1', 'bg-bulk-c2', 'bg-bulk-c3', 'bg-post-media', 'bg-post-topic', 'bg-quote-url', 'bg-prof-bio'];
    function saveState() {
      try {
        const st = {};
        STATE_IDS.forEach((id) => { const el = $(id); if (el) st[id] = el.value; });
        localStorage.setItem('begajes_state_v21', JSON.stringify(st));
      } catch (e) {}
    }
    function loadState() {
      try {
        const st = JSON.parse(localStorage.getItem('begajes_state_v21') || '{}');
        Object.keys(st).forEach((id) => { const el = $(id); if (el && !el.value) el.value = st[id]; });
      } catch (e) {}
    }
    [['bg-post-cap', 'bg-post-cap-c'], ['bg-quote-cap', 'bg-quote-cap-c'], ['bg-bulk-c1', 'bg-bulk-c1-c'], ['bg-bulk-c2', 'bg-bulk-c2-c'], ['bg-bulk-c3', 'bg-bulk-c3-c']].forEach((p) => bindCounter(p[0], p[1]));
    [['bg-bulk-img', 'bg-bulk-prev', 'bg-bulk-img-prev'], ['bg-prof-photo', 'bg-prof-prev', 'bg-prof-img']].forEach((p) => bindPreview(p[0], p[1], p[2]));
    [['bg-post-cap', 240], ['bg-post-media', 140], ['bg-bulk-img', 140], ['bg-bulk-c1', 140], ['bg-bulk-c2', 140], ['bg-bulk-c3', 140], ['bg-quote-media', 140], ['bg-quote-cap', 240], ['bg-prof-photo', 140], ['bg-prof-bio', 160], ['bg-quote-url', 80]].forEach((p) => bindAutoGrow(p[0], p[1]));
    STATE_IDS.forEach((id) => { const el = $(id); if (el) el.addEventListener('input', saveState); });

    /* quote: URL otomatis dikonversi ke ID saat diketik (tanpa GET POST) */
    let quotedId = '';
    let quoteTimer = null;
    function updateQuoteChip(pid) {
      quotedId = pid || '';
      R.quoteUid.textContent = 'ID: ' + (quotedId || '-');
      R.quoteUid.classList.toggle('has', !!quotedId);
      R.copyIdBtn.disabled = !quotedId;
    }
    async function resolveQuoteLive() {
      const v = R.quoteUrl.value.trim();
      if (!v) { updateQuoteChip(''); return; }
      if (/^\d{5,}$/.test(v)) { updateQuoteChip(v); log('ID postingan terbaca langsung: ' + v, 'ok'); return; }
      if (!/^https?:\/\//i.test(v)) return;
      log('Mengonversi URL ke ID postingan...');
      try {
        const pid = await getPostIdFromUrl(v);
        updateQuoteChip(pid);
        log('URL terkonversi ke ID: ' + pid, 'ok');
      } catch (e) {
        updateQuoteChip('');
        log('Belum bisa membaca ID: ' + e.message, 'warn');
      }
    }
    R.quoteUrl.addEventListener('input', () => {
      clearTimeout(quoteTimer);
      quoteTimer = setTimeout(resolveQuoteLive, 700);
    });
    R.copyIdBtn.addEventListener('click', () => {
      if (!quotedId) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(quotedId).then(() => log('ID terkopi: ' + quotedId, 'ok')).catch(() => log('Gagal menyalin.', 'fail'));
      } else log('Clipboard tidak tersedia di browser ini.', 'warn');
    });
    /* ---------- AKSI: POST (+ media/link/pin/spoiler/topik) ---------- */
    R.btnPost.addEventListener('click', async () => {
      const btn = R.btnPost;
      const cap = R.postCap.value.trim();
      const mediaRaw = R.postMedia.value.trim();
      const link = R.postLink.value.trim();
      const topic = R.postTopic.value.trim();
      const rc = parseInt(R.rcPost.value || '0', 10);
      const pin = R.postPin.checked;
      const spoiler = R.postSpo.checked;
      const media = mediaRaw ? mediaRaw.split('\n').map((x) => x.trim()).filter(Boolean) : [];
      if (!cap && !media.length && !link) { log('Caption, media, atau link tidak boleh kosong!', 'warn'); return; }
      btn.disabled = true;
      const oldTxt = btn.textContent;
      try {
        if (media.length && link) {
          log('Mengunggah & memposting media...');
          await publishPost({ caption: cap, mediaUrls: media, replyControl: rc, tagHeader: topic || null, spoiler });
          log('Post media terkirim', 'ok');
          log('Jeda 8 detik sebelum mengirim link...');
          btn.textContent = 'JEDA 8s...';
          await sleep(8000);
          log('Mengirim link...');
          const pid = await publishPost({ caption: '', mediaUrls: [], replyControl: rc, linkUrl: link });
          log('Link terkirim: ' + postUrl(pid), 'ok');
          if (pin && pid) {
            btn.textContent = 'MENYEMATKAN...';
            await sleep(3000);
            try { await pinPost(pid); log('Post link berhasil disematkan!', 'ok'); }
            catch (e) { log('Gagal pin: ' + e.message, 'warn'); }
          }
        } else if (media.length) {
          log('Mengirim postingan media...');
          const pid = await publishPost({ caption: cap, mediaUrls: media, replyControl: rc, tagHeader: topic || null, spoiler });
          log('Berhasil! ' + postUrl(pid), 'ok');
        } else if (link) {
          log('Mengirim link...');
          const pid = await publishPost({ caption: cap, mediaUrls: [], replyControl: rc, linkUrl: link, tagHeader: topic || null });
          log('Link terkirim: ' + postUrl(pid), 'ok');
          if (pin && pid) {
            btn.textContent = 'MENYEMATKAN...';
            await sleep(3000);
            try { await pinPost(pid); log('Post link berhasil disematkan!', 'ok'); }
            catch (e) { log('Gagal pin: ' + e.message, 'warn'); }
          }
        } else {
          log(spoiler ? 'Mengirim teks (spoiler)...' : 'Mengirim teks...');
          const pid = await publishPost({ caption: cap, mediaUrls: [], replyControl: rc, tagHeader: topic || null, spoiler });
          log('Berhasil! ' + postUrl(pid), 'ok');
        }
        R.postCap.value = '';
        R.postMedia.value = '';
        R.postLink.value = '';
        R.postCap.dispatchEvent(new Event('input'));
        saveState();
      } catch (e) {
        log('Gagal: ' + e.message, 'fail');
      } finally {
        btn.disabled = false;
        btn.textContent = oldTxt;
      }
    });

    /* ---------- AKSI: PROFIL (gabungan di tab POST) ---------- */
    R.av.addEventListener('click', () => R.avFile.click());
    R.avFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = (ev) => {
        R.profPhoto.value = ev.target.result;
        R.profPhoto.dispatchEvent(new Event('input'));
      };
      fr.readAsDataURL(file);
    });
    R.btnGetPp.addEventListener('click', () => {
      log('Mencari foto profil...');
      let found = null;
      for (const im of document.querySelectorAll('img')) {
        const alt = (im.alt || '').toLowerCase();
        if (alt.includes('profile picture') || alt.includes('foto profil')) { found = im.src; break; }
      }
      if (!found) {
        let area = 0;
        for (const im of document.querySelectorAll('img')) {
          if (!im.src || !im.src.startsWith('http')) continue;
          const r = im.getBoundingClientRect();
          if (r.width > 50 && Math.abs(r.width - r.height) < 10 && r.width * r.height > area) { area = r.width * r.height; found = im.src; }
        }
      }
      if (found) {
        R.profPhoto.value = found;
        R.profPhoto.dispatchEvent(new Event('input'));
        log('Foto profil ditemukan!', 'ok');
      } else log('Foto profil tidak ditemukan.', 'fail');
    });
    R.btnClearPp.addEventListener('click', () => {
      R.profPhoto.value = '';
      R.profPhoto.dispatchEvent(new Event('input'));
    });
    R.copyName.addEventListener('click', () => {
      const s = sessionCache;
      if (s && s.username && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('@' + s.username).then(() => log('Username disalin!')).catch(() => log('Gagal menyalin.', 'fail'));
      }
    });
    R.btnUpdate.addEventListener('click', async () => {
      const btn = R.btnUpdate;
      const photo = R.profPhoto.value.trim();
      const bio = R.profBio.value.trim();
      const link = R.profLink.value.trim();
      if (!photo && !bio && !link) { log('Tidak ada data profil untuk diupdate!', 'warn'); return; }
      btn.disabled = true;
      const oldTxt = btn.textContent;
      try {
        await updateProfile({ bio, link, photoUrl: photo });
        R.profPhoto.value = '';
        R.profBio.value = '';
        R.profLink.value = '';
        R.profPhoto.dispatchEvent(new Event('input'));
        log('Profil berhasil diperbarui!', 'ok');
      } catch (e) {
        log('Gagal update profil: ' + e.message, 'fail');
      } finally { btn.disabled = false; btn.textContent = oldTxt; }
    });

    /* ---------- AKSI: BULK (1 gambar + 3 caption, delay acak, STOP) ---------- */
    let bulkRunning = false;
    function setChip(i, cls, txt) {
      const c = R.chips[i - 1];
      if (c) { c.className = 'bg-chip' + (cls ? ' ' + cls : ''); c.textContent = txt || ('POST ' + i); }
    }
    R.btnBulk.addEventListener('click', async () => {
      const btn = R.btnBulk;
      const img = R.bulkImg.value.trim().split('\n')[0].trim();
      const caps = [R.bulkC1.value.trim(), R.bulkC2.value.trim(), R.bulkC3.value.trim()];
      const delayIn = R.bulkDelay.value;
      const topic = R.bulkTopic.value.trim();
      const rc = parseInt(R.rcBulk.value || '0', 10);
      if (!caps.some((c) => c)) { log('Isi minimal 1 caption!', 'warn'); return; }
      if (bulkRunning) {
        bulkRunning = false;
        log('Bulk dihentikan oleh pengguna.', 'warn');
        return;
      }
      bulkRunning = true;
      btn.textContent = 'STOP BULK';
      btn.classList.remove('pri');
      btn.classList.add('dng');
      R.bulkBar.style.display = 'block';
      const barFill = R.bulkBar.querySelector('i');
      const media = img ? [img] : [];
      let ok = 0, done = 0;
      const total = caps.filter((c) => c).length;
      setChip(1, '', 'POST 1');
      setChip(2, '', 'POST 2');
      setChip(3, '', 'POST 3');
      for (let i = 0; i < 3; i++) {
        if (!bulkRunning) break;
        const cap = caps[i];
        if (!cap) { setChip(i + 1, '', 'LEWAT'); done++; barFill.style.width = (done / 3) * 100 + '%'; continue; }
        setChip(i + 1, 'run', 'KIRIM...');
        log('Post ' + (i + 1) + '/3 -' + (media.length ? ' upload gambar & kirim...' : ' kirim teks...'));
        try {
          const pid = await publishPost({ caption: cap, mediaUrls: media, replyControl: rc, tagHeader: topic || null });
          ok++;
          setChip(i + 1, 'ok', 'OK');
          log('Post ' + (i + 1) + ' terkirim: ' + postUrl(pid), 'ok');
        } catch (e) {
          setChip(i + 1, 'bad', 'GAGAL');
          log('Post ' + (i + 1) + ' gagal: ' + e.message, 'fail');
        }
        done++;
        barFill.style.width = (done / 3) * 100 + '%';
        if (i < 2 && bulkRunning && done < 3) {
          const wait = parseDelay(delayIn);
          log('Jeda ' + wait + ' detik sebelum post berikutnya...');
          for (let t = wait; t > 0 && bulkRunning; t--) {
            btn.textContent = 'STOP (' + t + 's)';
            await sleep(1000);
          }
        }
      }
      bulkRunning = false;
      btn.textContent = 'BULK POST 3x';
      btn.classList.remove('dng');
      btn.classList.add('pri');
      log('Bulk selesai - ' + ok + '/' + total + ' sukses.', ok === total ? 'ok' : 'warn');
    });

    /* ---------- AKSI: QUOTE (URL otomatis jadi ID, tanpa GET POST) ---------- */
    R.btnQuote.addEventListener('click', async () => {
      const btn = R.btnQuote;
      const cap = R.quoteCap.value.trim();
      const mediaRaw = R.quoteMedia.value.trim();
      const topic = R.quoteTopic.value.trim();
      const media = mediaRaw ? mediaRaw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) : [];
      if (!cap && !media.length) { log('Kutipan / komentar tidak boleh kosong!', 'warn'); return; }
      btn.disabled = true;
      const oldTxt = btn.textContent;
      try {
        let qid = quotedId;
        if (!qid) {
          let url = R.quoteUrl.value.trim();
          if (!url) {
            if (/\/post\//.test(location.href)) { url = location.href; log('Memakai URL halaman ini...'); }
            else throw new Error('Isi URL postingan atau buka halaman post dulu!');
          }
          if (/^\d+$/.test(url)) qid = url;
          else qid = await getPostIdFromUrl(url);
        }
        log('Mengirim kutipan...');
        const pid = await publishPost({ caption: cap, mediaUrls: media, replyControl: 0, tagHeader: topic || null, quotedPostId: qid });
        log('Kutipan terkirim: ' + postUrl(pid), 'ok');
        R.quoteCap.value = '';
        R.quoteMedia.value = '';
        R.quoteUrl.value = '';
        updateQuoteChip('');
        R.quoteCap.dispatchEvent(new Event('input'));
        saveState();
      } catch (e) {
        log('Gagal: ' + e.message, 'fail');
      } finally { btn.disabled = false; btn.textContent = oldTxt; }
    });

    /* ---------- INIT PANEL ---------- */
    loadState();
    log('BEGEJES v2.1 siap - panel terisolasi, aman dipakai bareng NEXUS.');
    getSession().then((s) => {
      if (s && s.username) {
        R.badge.textContent = '@' + s.username;
        R.badge.classList.remove('off');
        R.profileName.textContent = '@' + s.username;
        log('Siap! Login sebagai @' + s.username, 'ok');
      } else {
        log('Login ke Threads dulu untuk mulai', 'warn');
      }
    }).catch(() => {});
  }

  /* ---------- BOOT: cek config remote (kill switch + toggle) lalu buka panel ---------- */
  (async function boot() {
    try {
      const cache = readCfgCache();
      let cfg = deepMerge(DEF_CFG, cache && cache.data);
      const url = cfgUrl();
      if (url) {
        try {
          const fresh = await fetchJSON(url, 3000);
          if (fresh && typeof fresh === 'object' && !Array.isArray(fresh)) {
            writeCfgCache(fresh);
            cfg = deepMerge(cfg, fresh);
          }
        } catch (e) {
          console.warn('[BEGEJES] config offline - pakai cache/defaults:', e && e.message);
          /* offline: kalau cache segar (kurang dari 24 jam) bilang kill, tetap mati */
          if (cache && cache.data && cache.data.kill && (Date.now() - (cache.t || 0)) < 864e5) {
            killToast(cache.data.killMessage);
            window.__BEGEJES_ACTIVE__ = false;
            return;
          }
        }
      }
      if (cfg.minVersion && cmpVer(VER, cfg.minVersion) < 0) {
        killToast('Versi ' + VER + ' terlalu lama - minimal ' + cfg.minVersion + '. Update bookmarklet BEGEJES.');
        window.__BEGEJES_ACTIVE__ = false;
        return;
      }
      if (cfg.kill) {
        killToast(cfg.killMessage);
        window.__BEGEJES_ACTIVE__ = false;
        return;
      }
      buildPanel(cfg);
      console.log('%cBEGEJES v2.1', 'color:#22d3ee;font-weight:bold', 'siap - namespace terisolasi dari bookmarklet lain');
    } catch (e) {
      try { const broken = document.getElementById('begajes-root'); if (broken && broken.parentNode) broken.parentNode.removeChild(broken); } catch (_e) {}
      try { buildPanel(DEF_CFG); } catch (e2) { console.error('[BEGEJES] fatal:', e2); window.__BEGEJES_ACTIVE__ = false; }
    }
  })();
})();
