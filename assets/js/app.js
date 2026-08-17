/* ============================================================
   MINT ECLIPSE — Shared Application Logic
   localStorage-backed: users, letters, events, bucket, photos
   ============================================================ */

const SUPABASE_URL = 'https://qjjmzymludnoksquildz.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_245QfoxGXvXcGhN69DuJ2Q_6n0wacaP';
const supabase = supabasejs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- helpers ---------- */
function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function genUserId() {
  return 'ME-' + Math.floor(100000 + Math.random() * 900000);
}

function esc(s) {
  var amp = String.fromCharCode(38);
  return String(s ?? '').replace(/[&<>"']/g, function (c) {
    var code = { '&': 'amp;', '<': 'lt;', '>': 'gt;', '"': 'quot;', "'": '#39;' }[c];
    return amp + code;
  });
}

/* ---------- toasts ---------- */
function toast(message, isError) {
  const wrap = document.querySelector('.toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' toast--err' : '');
  el.innerHTML = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------- current user ---------- */
function getSession() { return readStore(STORE.user, null); }
function setSession(user) { localStorage.setItem(STORE.user, JSON.stringify(user)); }
function clearSession() { localStorage.removeItem(STORE.user); }

function allUsers() { return readStore(STORE.users, {}); }
function saveUser(user) {
  const users = allUsers();
  users[user.id] = user;
  writeStore(STORE.users, users);
}

function requireAuth() {
  if (!getSession()) { location.href = 'login.html'; return false; }
  return true;
}

/* ---------- auth ---------- */
window.handleLogin = async function (e) {
  e.preventDefault();
  const form = e.target;
  const email = form.userId.value.trim();
  const password = form.password.value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    toast('Sign in failed: ' + error.message, true);
    return;
  }

  toast('Welcome back! 🌙');
  window.setTimeout(() => { location.href = 'index.html'; }, 500);
};

window.handleRegister = async function (e) {
  e.preventDefault();
  const form = e.target;
  const name = form.rName.value.trim();
  const email = form.rEmail.value.trim().toLowerCase();
  const password = form.rPassword.value;

  if (name.length < 2) { toast('Please enter your name.', true); return; }
  if (password.length < 6) { toast('Password must be at least 6 characters.', true); return; }

  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: { data: { display_name: name } }
  });

  if (error) {
    toast(error.message, true);
    return;
  }

  toast('Account created! Welcome to Mint Eclipse 🌙');
  window.setTimeout(() => { location.href = 'profile.html'; }, 600);
};

window.logout = async function () {
  await supabase.auth.signOut();
  toast('Signed out. See you soon!');
  window.setTimeout(() => { location.href = 'index.html'; }, 300);
};

/* ---------- UI state (nav avatar / login button) ---------- */
function applyUIState() {
  const user = getSession();

  document.querySelectorAll('[data-auth-required]').forEach(el => {
    el.style.display = user ? '' : 'none';
  });
  document.querySelectorAll('[data-guest-only]').forEach(el => {
    el.style.display = user ? 'none' : '';
  });

  const initials = document.querySelectorAll('.js-initials');
  initials.forEach(el => {
    const name = user ? user.name : '';
    el.textContent = name ? name.trim().charAt(0).toUpperCase() : 'G';
  });
  const dName = document.querySelector('.js-d-name');
  const dId = document.querySelector('.js-d-id');
  if (dName) dName.textContent = user ? user.name : 'Guest';
  if (dId) dId.textContent = user ? user.userId : 'Not signed in';

  document.title = 'Mint Eclipse';
}

/* ---------- nav/sidebar ---------- */
window.toggleSidebar = function () {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('show');
  document.querySelector('.burger').classList.toggle('active');
};
window.closeSidebar = function () {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
  document.querySelector('.burger').classList.remove('active');
};
window.toggleDropdown = function () {
  document.querySelector('.dropdown').classList.toggle('show');
};

/* ---------- bucket list ---------- */
window.addBucketItem = async function () {
  const input = document.getElementById('bucketInput');
  const val = input.value.trim();
  if (!val) { toast('Type a goal first.', true); return; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { toast('Please sign in first.', true); return; }

  const { error } = await supabase.from('bucket_items').insert([{
    user_id: user.id,
    text: val,
    done: false
  }]);

  if (error) {
    toast('Error adding item: ' + error.message, true);
    return;
  }

  input.value = '';
  renderBucket();
  toast('Added to your cloud bucket list! ✨');
};

window.toggleBucket = async function (id, currentStatus) {
  await supabase.from('bucket_items').update({ done: !currentStatus }).eq('id', id);
  renderBucket();
};

window.removeBucket = async function (id) {
  await supabase.from('bucket_items').delete().eq('id', id);
  renderBucket();
  toast('Removed from bucket list.');
};

async function renderBucket() {
  const list = document.getElementById('bucketList');
  if (!list) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    list.innerHTML = `<div class="bucket-empty">Sign in to view your goals.</div>`;
    return;
  }

  const { data: bucket, error } = await supabase
    .from('bucket_items')
    .select('*')
    .eq('user_id', user.id);

  const items = bucket || [];
  const doneCount = items.filter(i => i.done).length;
  const counter = document.getElementById('bucketCounter');
  const fill = document.getElementById('bucketFill');

  if (counter) counter.textContent = doneCount + ' / ' + items.length + ' done';
  if (fill) fill.style.width = (items.length ? Math.round((doneCount / items.length) * 100) : 0) + '%';

  list.innerHTML = items.length
    ? items.map(item => `
        <div class="bucket-item${item.done ? ' done' : ''}">
          <button class="bucket-check" onclick="toggleBucket('${item.id}', ${item.done})">✓</button>
          <span class="bucket-text">${esc(item.text)}</span>
          <button class="bucket-del" onclick="removeBucket('${item.id}')">✕</button>
        </div>`).join('')
    : '<div class="bucket-empty">No bucket goals yet!</div>';
}

/* ---------- letters ---------- */
window.sealLetter = async function (e) {
  e.preventDefault();
  const form = e.target;
  const recipient = form.recipient.value.trim().toUpperCase();
  const title = form.title.value.trim();
  const body = form.body.value.trim();
  const openAt = new Date(form.openAt.value).toISOString();

  if (!recipient || !title || !body || isNaN(new Date(openAt).getTime())) {
    toast('Please fill out all fields correctly.', true);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('letters').insert([{
    from_name: user?.user_metadata?.display_name || 'Anonymous',
    from_user_id: user?.id || '—',
    to_user_id: recipient,
    title: title,
    body: body,
    opened_at: openAt,
    opened: false
  }]);

  if (error) {
    toast('Failed to seal letter: ' + error.message, true);
    return;
  }

  form.reset();
  renderLetters();
  toast('Letter sealed in the cloud! 📜');
};

async function renderLetters() {
  const list = document.getElementById('letterList');
  if (!list) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    list.innerHTML = `<div class="letter-empty">Sign in to view your letters.</div>`;
    return;
  }

  const { data: letters, error } = await supabase
    .from('letters')
    .select('*')
    .or(`to_user_id.eq.${user.id},from_user_id.eq.${user.id}`);

  if (error || !letters || letters.length === 0) {
    list.innerHTML = `
      <div class="letter-empty">
        <div style="font-size:2.4rem; margin-bottom:0.6rem;">🔒</div>
        <strong>No letters in your vault yet.</strong>
      </div>`;
    return;
  }

  const now = Date.now();
  list.innerHTML = letters.map(l => {
    const openTime = new Date(l.opened_at).getTime();
    const isReady = now >= openTime;
    return `
      <div class="letter-card${isReady ? ' ready' : ''}">
        <div class="letter-top">
          <div>
            <div class="letter-title">${esc(l.title)}</div>
            <div class="letter-meta">From <b>${esc(l.from_name)}</b> · to <b>${esc(l.to_user_id)}</b></div>
          </div>
          ${isReady ? '<span class="chip chip--open">📖 Open</span>' : '<span class="chip chip--sealed">📜 Sealed</span>'}
        </div>
        <div class="letter-body ${isReady ? '' : 'blurred'}">${esc(l.body)}</div>
      </div>`;
  }).join('');
}

  const now = Date.now();
  letters.sort((a, b) => a.openedAt - b.openedAt);
  list.innerHTML = letters.map(l => {
    const isReady = now >= l.openedAt;
    const opened = l.opened;
    const diff = l.openedAt - now;
    const cd = diff > 0
      ? formatCountdown(diff, l.openedAt)
      : null;

    let chip = `<span class="chip chip--open">📖 Open</span>`;
    if (cd) chip = diff < 1000 * 60 * 60 * 24
      ? `<span class="chip chip--sealed">🗓 Opens soon</span>`
      : `<span class="chip chip--sealed">📜 Sealed</span>`;

    return `
      <div class="letter-card${cd ? '' : ' ready'}">
        <div class="letter-top">
          <div>
            <div class="letter-title">${esc(l.title)}</div>
            <div class="letter-meta">From <b class="mint">${esc(l.from)}</b> · to <b>${esc(l.toUserId)}</b> · opens ${new Date(l.openedAt).toLocaleString()}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.4rem;">
            ${cd ? `<span class="countdown${diff < 1000 * 60 * 60 * 24 ? ' soon' : ''}">⏳ ${cd}</span>` : ''}
            ${chip}
          </div>
        </div>
        <div class="letter-body ${cd && !opened ? 'blurred' : ''}">${esc(l.body)}</div>
      </div>`;
  }).join('');


function formatCountdown(ms, openedAt) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  return m + 'm ' + s + 's';
}

/* ---------- events ---------- */
function getEvents() { return readStore(STORE.events, []); }

function seedEvents() {
  const events = getEvents();
  if (events.length === 0) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 6);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    writeStore(STORE.events, [
      { id: uid('e'), name: 'Summer Roadtrip 2026', date: nextWeek.toISOString(), location: 'West Coast, USA', desc: 'Three cars, one playlist, zero wrong turns. 🤞', rsvp: ['Mint Explorer'] },
      { id: uid('e'), name: 'Eclipse Watch Party', date: nextMonth.toISOString(), location: 'Rooftop, Lagos', desc: 'Bring blankets and your best camera. We watch the sky do its thing.', rsvp: [] }
    ]);
  }
}

window.createEvent = function (e) {
  e.preventDefault();
  const form = e.target;
  const name = form.eventName.value.trim();
  const date = form.eventDate.value;
  const location = form.eventLocation.value.trim();
  const desc = form.eventDesc.value.trim();

  if (!name) { toast('Name the event.', true); return; }
  if (!date) { toast('Pick an event date.', true); return; }

  const events = getEvents();
  events.unshift({
    id: uid('e'),
    name,
    date: new Date(date).toISOString(),
    location: location || 'To be decided',
    desc: desc || 'No details yet.',
    rsvp: []
  });
  writeStore(STORE.events, events);
  form.reset();
  renderEvents();
  toast('Event created! 🎉');
};

window.rsvpEvent = function (id) {
  const user = getSession();
  if (!user) { toast('Sign in to RSVP.', true); return; }
  const events = getEvents().map(ev => {
    if (ev.id !== id) return ev;
    const rsvp = ev.rsvp || [];
    const idx = rsvp.indexOf(user.name);
    if (idx >= 0) rsvp.splice(idx, 1); else rsvp.push(user.name);
    return { ...ev, rsvp };
  });
  writeStore(STORE.events, events);
  renderEvents();
  toast(user.name + (events.find(ev => ev.id === id).rsvp.includes(user.name) ? ' is going! ✅' : ' canceled attendance.'));
};

window.removeEvent = function (id) {
  writeStore(STORE.events, getEvents().filter(ev => ev.id !== id));
  renderEvents();
  toast('Event removed.');
};

function renderEvents() {
  const list = document.getElementById('eventList');
  const empty = document.getElementById('eventsEmpty');
  if (!list) return;

  const events = getEvents();
  if (empty) empty.style.display = events.length ? 'none' : 'block';

  list.innerHTML = events.map(ev => {
    const d = new Date(ev.date);
    const day = d.getDate();
    const mon = d.toLocaleString('default', { month: 'short' });
    const rsvps = ev.rsvp || [];
    return `
      <div class="event-card">
        <div class="event-date-box">
          <div class="d">${day}</div>
          <div class="m">${mon}</div>
        </div>
        <div class="event-info" style="flex:1;">
          <h3>${esc(ev.name)}</h3>
          <p>${esc(ev.desc)}</p>
          <div class="event-meta">
            <span>📍 ${esc(ev.location)}</span>
            <span>🕒 ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>👥 ${rsvps.length} going</span>
          </div>
          <div class="event-actions">
            <button class="btn btn--sm btn--outline" onclick="rsvpEvent('${ev.id}')">${rsvps.includes(getSession()?.name) ? 'Going ✓' : 'RSVP'}</button>
            <button class="btn btn--sm btn--ghost" onclick="removeEvent('${ev.id}')">Delete</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ---------- photos ---------- */
function getPhotos() { return readStore(STORE.photos, []); }

function seedPhotos() {
  const photos = getPhotos();
  if (photos.length === 0) {
    writeStore(STORE.photos, [
      { id: uid('p'), name: 'Nights over the city', src: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600&q=80' },
      { id: uid('p'), name: 'Mountain trails', src: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&q=80' },
      { id: uid('p'), name: 'Golden coast', src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80' },
      { id: uid('p'), name: 'Starry desert', src: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=600&q=80' }
    ]);
  }
}

window.uploadPhoto = function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file.', true); return; }

  const reader = new FileReader();
  reader.onload = function () {
    const photos = getPhotos();
    photos.unshift({ id: uid('p'), name: file.name.replace(/\.[^.]+$/, '') || 'New photo', src: reader.result });
    writeStore(STORE.photos, photos);
    renderPhotos();
    toast('Photo added to your gallery! 📷');
    input.value = '';
  };
  reader.readAsDataURL(file);
};

window.removePhoto = function (id) {
  writeStore(STORE.photos, getPhotos().filter(p => p.id !== id));
  renderPhotos();
  toast('Photo removed.');
};

window.openLightbox = function (id) {
  const photo = getPhotos().find(p => p.id === id);
  if (!photo) return;
  const box = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = photo.src;
  document.getElementById('lightboxCap').textContent = photo.name;
  box.classList.add('show');
};
window.closeLightbox = function () {
  document.getElementById('lightbox').classList.remove('show');
};

function renderPhotos() {
  const grid = document.getElementById('photoGrid');
  const empty = document.getElementById('photosEmpty');
  if (!grid) return;

  const photos = getPhotos();
  if (empty) empty.style.display = photos.length ? 'none' : 'block';

  grid.innerHTML = photos.map(p => `
    <div class="photo-tile" onclick="openLightbox('${p.id}')">
      <img src="${p.src}" alt="${esc(p.name)}" loading="lazy">
      <div class="cap">
        <span>${esc(p.name)}</span>
        <button class="del" onclick="event.stopPropagation(); removePhoto('${p.id}')" aria-label="Delete">✕</button>
      </div>
    </div>`).join('');
}

/* ---------- profile ---------- */
window.saveProfile = function (e) {
  e.preventDefault();
  const user = getSession();
  if (!user) { toast('Sign in to edit your profile.', true); return; }
  const form = e.target;
  user.name = form.displayName.value.trim() || user.name;
  user.bio = form.bio.value.trim() || 'No bio yet.';
  saveUser(user);
  setSession(user);
  applyUIState();
  toast('Profile updated! ✅');
  renderProfile();
};

window.copyUserId = function () {
  const user = getSession();
  if (!user) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(user.userId).then(() => toast('User ID copied! 📋'));
  } else {
    toast('Your ID: ' + user.userId);
  }
};

/* ---------- profile stats / tabs ---------- */
window.switchProfileTab = function (tab) {
  document.querySelectorAll('.profile-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById('profileTab_' + tab);
  if (target) target.style.display = 'block';
  document.querySelectorAll('.profile-tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector('.profile-tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
};

function renderProfile() {
  const user = getSession();
  if (!user) { location.href = 'login.html'; return; }

  const nameEls = document.querySelectorAll('.js-p-name');
  nameEls.forEach(el => el.textContent = user.name);
  const idEls = document.querySelectorAll('.js-p-id');
  idEls.forEach(el => el.textContent = user.userId);
  const bioEls = document.querySelectorAll('.js-p-bio');
  bioEls.forEach(el => el.textContent = user.bio || 'No bio yet.');

  const form = document.getElementById('profileForm');
  if (form) {
    form.displayName.value = user.name;
    form.bio.value = user.bio || '';
  }

  const joined = new Date(user.joined || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const joinedEl = document.querySelector('.js-p-joined');
  if (joinedEl) joinedEl.textContent = joined;

  const letters = getLetters().filter(l => l.toUserId === user.userId || l.fromUserId === user.userId);
  const statLetters = document.getElementById('statLetters');
  if (statLetters) statLetters.textContent = letters.length;
  const statBucket = document.getElementById('statBucket');
  if (statBucket) statBucket.textContent = getBucket().filter(i => i.done).length + '/' + getBucket().length;
  const statEvents = document.getElementById('statEvents');
  if (statEvents) statEvents.textContent = getEvents().length;
  const statPhotos = document.getElementById('statPhotos');
  if (statPhotos) statPhotos.textContent = getPhotos().length;

  // "My letters" tab content
  const myLetters = document.getElementById('profileMyLetters');
  if (myLetters) myLetters.innerHTML = letters.length
    ? letters.map(l => {
        const opened = Date.now() >= l.openedAt || l.opened;
        return `<div class="letter-card${opened ? ' ready' : ''}">
          <div class="letter-top">
            <div><div class="letter-title">${esc(l.title)}</div>
            <div class="letter-meta">To <b>${esc(l.toUserId)}</b> · opens ${new Date(l.openedAt).toLocaleString()}</div></div>
            ${opened ? '<span class="chip chip--open">📖 Open</span>' : '<span class="chip chip--sealed">📜 Sealed</span>'}
          </div>
          <div class="letter-body ${opened ? '' : 'blurred'}">${esc(l.body)}</div>
        </div>`;
      }).join('')
    : '<div class="letter-empty">No letters yet. Create one from the Events page.</div>';
}

/* ---------- countdown ticker ---------- */
function tickCountdowns() {
  document.querySelectorAll('.countdown').forEach(el => {
    // countdowns are re-rendered by renderLetters; but the standalone page
    // re-renders each second only when letters are visible.
  });
}

/* ---------- auth tabs ---------- */
window.switchAuth = function (mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.auth-tab[data-mode="' + mode + '"]').classList.add('active');
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('authPanel_' + mode).classList.add('active');
};

/* ---------- page init ---------- */
function initPage() {
  // seeds (safe: guarded by empty checks)
  seedLetters();
  seedEvents();
  seedBucket();
  seedPhotos();

  applyUIState();

  // nav active link based on current file
  const page = location.pathname.split('/').pop() || 'index.html';
  const map = {
    'index.html': 'home', 'bucket.html': 'bucket', 'events.html': 'events',
    'photos.html': 'photos', 'login.html': 'login', 'profile.html': 'profile'
  };
  const key = map[page];
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === key);
  });
  document.querySelectorAll('.s-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === key);
  });

  // page-specific renders
  renderBucket();
  renderLetters();
  renderEvents();
  renderPhotos();
  if (page === 'profile.html') renderProfile();

  // letter countdown ticker
  if (page === 'events.html' || page === 'profile.html') {
    setInterval(() => { renderLetters(); if (page === 'profile.html') renderProfile(); }, 1000);
  }

  // close dropdown on outside click
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.avatar-wrap')) {
      document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
    }
  });

  // close sidebar on escape
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { closeSidebar(); document.getElementById('lightbox')?.classList.remove('show'); }
  });
}

document.addEventListener('DOMContentLoaded', initPage);
