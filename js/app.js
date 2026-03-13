/* ============================================================
   FONTYS FOCUS HUB — Main Application v3 (Cloud Sync)
   ============================================================ */
(function () {
'use strict';

const RING_C = 2 * Math.PI * 106;
const QUOTES = [
  {t:"The secret of getting ahead is getting started.",a:"Mark Twain"},
  {t:"It always seems impossible until it's done.",a:"Nelson Mandela"},
  {t:"Focus on being productive instead of busy.",a:"Tim Ferriss"},
  {t:"Don't watch the clock; do what it does. Keep going.",a:"Sam Levenson"},
  {t:"Success is the sum of small efforts repeated day in and day out.",a:"Robert Collier"},
  {t:"The only way to do great work is to love what you do.",a:"Steve Jobs"},
  {t:"Believe you can and you're halfway there.",a:"Theodore Roosevelt"},
  {t:"Start where you are. Use what you have. Do what you can.",a:"Arthur Ashe"},
  {t:"Discipline is the bridge between goals and accomplishment.",a:"Jim Rohn"},
  {t:"Your future is created by what you do today, not tomorrow.",a:"Robert Kiyosaki"},
];
const t = I18N.t;

// ============================
// STATE
// ============================
const S = {
  todos: [],
  timer: { focusDur: 1500, breakDur: 300, secs: 1500, running: false, iid: null, isBreak: false, longCount: 0 },
  stats: { totalSessions: 0, totalMinutes: 0, tasksCompleted: 0, daily: {} },
  sessionLog: [],
  planner: [],
  profile: { name: '', dailyGoal: 4 },
  settings: { theme: 'dark', lang: 'en', sound: true, notif: false, autoStart: false },
  filter: 'all',
  calWeekOffset: 0,
  cloud: { syncing: false, lastSync: null },
};

// ============================
// LOCAL STORAGE
// ============================
function load() {
  try {
    const d = localStorage.getItem('ffh');
    if (d) {
      const p = JSON.parse(d);
      Object.assign(S, { ...S, ...p, timer: { ...S.timer, ...p.timer, running: false, iid: null } });
    }
  } catch (e) { console.warn('Load error:', e); }
  S.timer.secs = S.timer.isBreak ? S.timer.breakDur : S.timer.focusDur;
}

function save() {
  const c = { ...S }; c.timer = { ...c.timer, running: false, iid: null };
  localStorage.setItem('ffh', JSON.stringify(c));
  if (Cloud.isLoggedIn()) debouncedCloudSave();
}

// ============================
// CLOUD SYNC
// ============================
let _syncTimer = null;
function debouncedCloudSave() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(cloudSaveAll, 1500);
}

async function cloudSaveAll() {
  if (!Cloud.isLoggedIn() || S.cloud.syncing) return;
  S.cloud.syncing = true;
  updateSyncBadge('syncing');
  try {
    await Promise.all([
      Cloud.saveProfile(S.profile),
      Cloud.saveSettings({ ...S.settings, focusDur: S.timer.focusDur, breakDur: S.timer.breakDur }),
      Cloud.saveTodos(S.todos),
      Cloud.saveStats(S.stats),
    ]);
    S.cloud.lastSync = new Date().toISOString();
    updateSyncBadge('ok');
  } catch (e) {
    console.error('Cloud save error:', e);
    updateSyncBadge('error');
  } finally {
    S.cloud.syncing = false;
  }
}

async function cloudLoadAll() {
  if (!Cloud.isLoggedIn()) return;
  updateSyncBadge('syncing');
  try {
    const data = await Cloud.loadAll();
    if (!data) return;
    if (data.profile) {
      S.profile.name = data.profile.name || '';
      S.profile.dailyGoal = data.profile.daily_goal || 4;
    }
    if (data.settings) {
      S.settings.theme = data.settings.theme || 'dark';
      S.settings.lang = data.settings.lang || 'en';
      S.settings.sound = data.settings.sound ?? true;
      S.settings.notif = data.settings.notif ?? false;
      S.settings.autoStart = data.settings.auto_start ?? false;
      if (data.settings.focus_dur) S.timer.focusDur = data.settings.focus_dur;
      if (data.settings.break_dur) S.timer.breakDur = data.settings.break_dur;
      S.timer.secs = S.timer.focusDur;
    }
    if (data.todos) S.todos = data.todos;
    if (data.stats) S.stats = { ...S.stats, ...data.stats };
    if (data.sessionLog) S.sessionLog = data.sessionLog;
    if (data.planner) S.planner = data.planner;
    save();
    S.cloud.lastSync = new Date().toISOString();
    updateSyncBadge('ok');
  } catch (e) {
    console.error('Cloud load error:', e);
    updateSyncBadge('error');
  }
}

function updateSyncBadge(state) {
  const el = document.getElementById('sync-badge');
  if (!el) return;
  const states = {
    syncing: { icon: '↻', label: 'Syncing...', cls: 'sync-syncing' },
    ok:      { icon: '✓', label: 'Synced',     cls: 'sync-ok' },
    error:   { icon: '!', label: 'Sync error', cls: 'sync-error' },
    offline: { icon: '○', label: 'Local only', cls: 'sync-offline' },
  };
  const s = states[state] || states.offline;
  el.className = 'sync-badge ' + s.cls;
  el.innerHTML = `<span>${s.icon}</span><span>${s.label}</span>`;
  el.style.display = 'flex';
}

// ============================
// DOM REFS
// ============================
const $ = id => document.getElementById(id);
const landing = $('landing'), app = $('app'), sidebar = $('sidebar'), overlay = $('sidebar-overlay');

// ============================
// THEME
// ============================
function applyTheme(th) {
  let actual = th;
  if (th === 'system') actual = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', actual);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === th));
  S.settings.theme = th; save();
}

// ============================
// NAVIGATION
// ============================
function showApp() {
  landing.classList.add('hidden'); app.classList.remove('hidden');
  const fab = $('fab-quick-add'); if (fab) fab.classList.remove('hidden');
  refreshDashboard();
}
function showLanding() { app.classList.add('hidden'); landing.classList.remove('hidden'); }

function navigateTo(page) {
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  closeMobile();
  const fab = $('fab-quick-add'), qPanel = $('quick-add-panel');
  if (fab) { fab.classList.toggle('hidden', page !== 'dashboard'); fab.classList.remove('open'); }
  if (qPanel) qPanel.classList.add('hidden');
  if (page === 'dashboard') refreshDashboard();
  if (page === 'stats') refreshStats();
  if (page === 'calendar') renderCalendar();
}

function closeMobile() { sidebar.classList.remove('open'); overlay.classList.remove('vis'); }

// ============================
// AUTH MODAL
// ============================
function showAuthModal(mode) {
  mode = mode || 'login';
  const existing = $('auth-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'auth-modal-wrap';
  modal.innerHTML = [
    '<div class="auth-modal">',
    '<button class="auth-close" id="auth-close">\u2715</button>',
    '<div class="auth-logo">\uD83C\uDFAF Focus Hub</div>',
    '<div class="auth-tabs">',
    '<button class="auth-tab ' + (mode==='login'?'active':'') + '" data-tab="login">Sign In</button>',
    '<button class="auth-tab ' + (mode==='register'?'active':'') + '" data-tab="register">Create Account</button>',
    '</div>',
    '<div class="auth-panel ' + (mode==='login'?'active':'') + '" id="auth-login">',
    '<div class="auth-field"><label class="form-label">Email</label>',
    '<input type="email" class="form-input" id="auth-email" placeholder="you@example.com" autocomplete="email"></div>',
    '<div class="auth-field"><label class="form-label">Password</label>',
    '<input type="password" class="form-input" id="auth-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password"></div>',
    '<div class="auth-error hidden" id="auth-login-error"></div>',
    '<button class="btn btn-primary full-w" id="btn-auth-login">Sign In</button>',
    '<button class="btn btn-ghost btn-sm full-w mt" id="btn-forgot-pw">Forgot password?</button>',
    '</div>',
    '<div class="auth-panel ' + (mode==='register'?'active':'') + '" id="auth-register">',
    '<div class="auth-field"><label class="form-label">Your Name</label>',
    '<input type="text" class="form-input" id="reg-name" placeholder="Student" autocomplete="name"></div>',
    '<div class="auth-field"><label class="form-label">Email</label>',
    '<input type="email" class="form-input" id="reg-email" placeholder="you@example.com" autocomplete="email"></div>',
    '<div class="auth-field"><label class="form-label">Password</label>',
    '<input type="password" class="form-input" id="reg-password" placeholder="Min. 6 characters" autocomplete="new-password"></div>',
    '<div class="auth-error hidden" id="auth-reg-error"></div>',
    '<button class="btn btn-primary full-w" id="btn-auth-register">Create Account</button>',
    '</div>',
    '<p class="auth-note">Your data syncs across all devices when signed in.</p>',
    '</div>',
  ].join('');

  document.body.appendChild(modal);

  modal.querySelectorAll('.auth-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      modal.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
      modal.querySelectorAll('.auth-panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('auth-' + tab.dataset.tab).classList.add('active');
    });
  });

  $('auth-close').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  $('btn-auth-login').addEventListener('click', async function() {
    var email = $('auth-email').value.trim();
    var pw = $('auth-password').value;
    var errEl = $('auth-login-error');
    if (!email || !pw) { showAuthError(errEl, 'Please fill in all fields'); return; }
    var btn = $('btn-auth-login');
    btn.textContent = 'Signing in...'; btn.disabled = true;
    try {
      await Cloud.signIn(email, pw);
      modal.remove();
      toast('\u2601\uFE0F', 'Signed in! Loading your data...');
      await cloudLoadAll();
      renderAll();
      updateAccountUI();
    } catch(e) {
      showAuthError(errEl, e.message || 'Sign in failed');
      btn.textContent = 'Sign In'; btn.disabled = false;
    }
  });

  $('btn-auth-register').addEventListener('click', async function() {
    var name = $('reg-name').value.trim();
    var email = $('reg-email').value.trim();
    var pw = $('reg-password').value;
    var errEl = $('auth-reg-error');
    if (!email || !pw) { showAuthError(errEl, 'Please fill in all fields'); return; }
    if (pw.length < 6) { showAuthError(errEl, 'Password must be at least 6 characters'); return; }
    var btn = $('btn-auth-register');
    btn.textContent = 'Creating account...'; btn.disabled = true;
    try {
      await Cloud.signUp(email, pw, name);
      modal.remove();
      toast('\uD83C\uDF89', 'Account created! Check your email to confirm, then sign in.');
    } catch(e) {
      showAuthError(errEl, e.message || 'Registration failed');
      btn.textContent = 'Create Account'; btn.disabled = false;
    }
  });

  $('btn-forgot-pw').addEventListener('click', async function() {
    var email = $('auth-email').value.trim();
    if (!email) { showAuthError($('auth-login-error'), 'Enter your email first'); return; }
    try {
      await Cloud.resetPassword(email);
      toast('\uD83D\uDCE7', 'Password reset email sent!');
    } catch(e) {
      showAuthError($('auth-login-error'), e.message);
    }
  });

  [$('auth-password'), $('reg-password')].forEach(function(el) {
    if (!el) return;
    el.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      if ($('auth-login').classList.contains('active')) $('btn-auth-login').click();
      else $('btn-auth-register').click();
    });
  });
}

function showAuthError(el, msg) {
  el.textContent = msg; el.classList.remove('hidden');
}

function updateAccountUI() {
  var user = Cloud.getUser();
  var syncBadge = $('sync-badge');
  var accountBtn = $('btn-account');
  if (user) {
    if (syncBadge) syncBadge.style.display = 'flex';
    if (accountBtn) {
      accountBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + user.email.split('@')[0];
      accountBtn.title = 'Click to sign out';
      accountBtn.onclick = async function() {
        if (!confirm('Sign out?')) return;
        await Cloud.signOut();
        updateAccountUI();
        updateSyncBadge('offline');
        toast('\uD83D\uDC4B', 'Signed out');
      };
    }
  } else {
    if (syncBadge) syncBadge.style.display = 'none';
    if (accountBtn) {
      accountBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Sign In';
      accountBtn.title = 'Sign in for cloud sync';
      accountBtn.onclick = function() { showAuthModal('login'); };
    }
  }
}

// ============================
// GREETING & DATE
// ============================
function setGreeting() {
  var h = new Date().getHours();
  var k = h < 12 ? 'greeting.morning' : h < 17 ? 'greeting.afternoon' : h < 21 ? 'greeting.evening' : 'greeting.night';
  $('greeting').textContent = t(k);
}

function setDate() {
  $('header-date').textContent = new Date().toLocaleDateString(I18N.get(), { weekday: 'long', month: 'long', day: 'numeric' });
}

// ============================
// DASHBOARD
// ============================
function refreshDashboard() {
  setGreeting(); setDate();
  var today = dateKey(new Date());
  var todayData = S.stats.daily[today] || { sessions: 0, minutes: 0 };

  $('ds-tasks').textContent = S.stats.tasksCompleted;
  $('ds-sessions').textContent = S.stats.totalSessions;
  var hrs = S.stats.totalMinutes / 60;
  $('ds-hours').textContent = hrs >= 1 ? hrs.toFixed(1) + 'h' : S.stats.totalMinutes + 'm';
  var streak = calcStreak();
  $('ds-streak').textContent = streak + (streak > 0 ? ' \uD83D\uDD25' : '');

  var streakPct = Math.min((streak / 7) * 100, 100);
  var fillEl = $('streak-bar-fill');
  if (fillEl) fillEl.style.width = streakPct + '%';
  var daysRow = $('streak-days-row');
  if (daysRow) {
    daysRow.innerHTML = Array.from({length: 7}, function(_, i) {
      var d = new Date(); d.setDate(d.getDate() - (6 - i));
      var active = S.stats.daily[dateKey(d)] && S.stats.daily[dateKey(d)].sessions > 0;
      return '<div class="streak-day' + (active ? ' active' : '') + '" title="' + d.toLocaleDateString() + '"></div>';
    }).join('');
  }

  var goal = S.profile.dailyGoal || 4;
  var prog = Math.min((todayData.sessions / goal) * 100, 100);
  $('dash-goal-bar').style.width = prog + '%';
  $('goal-badge').textContent = todayData.sessions + ' / ' + goal;

  $('mini-timer').textContent = fmtTime(S.timer.secs);
  $('btn-mini-start').textContent = S.timer.running ? t('timer.focusing') : t('dash.startFocus');

  var recent = S.todos.slice(-5).reverse();
  var tl = $('dash-task-list'), te = $('dash-empty-tasks');
  if (recent.length === 0) { te.classList.remove('hidden'); tl.innerHTML = ''; }
  else {
    te.classList.add('hidden');
    tl.innerHTML = recent.map(function(tk) {
      return '<li><span class="task-dot ' + (tk.completed ? 'done' : '') + '"></span><span style="' + (tk.completed ? 'text-decoration:line-through;color:var(--text3)' : '') + '">' + esc(tk.text) + '</span></li>';
    }).join('');
  }

  refreshInsights();

  var q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('dash-quote').textContent = '"' + q.t + '"';
  $('dash-quote-author').textContent = '— ' + q.a;
}

function calcStreak() {
  var streak = 0, d = new Date();
  if (!(S.stats.daily[dateKey(d)] && S.stats.daily[dateKey(d)].sessions > 0)) d.setDate(d.getDate() - 1);
  while (true) {
    var k = dateKey(d);
    if (S.stats.daily[k] && S.stats.daily[k].sessions > 0) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

// ============================
// TODOS
// ============================
var dragId = null;

function renderTodos() {
  var list = S.todos;
  if (S.filter === 'active') list = list.filter(function(t) { return !t.completed; });
  else if (S.filter === 'completed') list = list.filter(function(t) { return t.completed; });

  var ul = $('todo-list'), emp = $('todos-empty');
  if (list.length === 0) { emp.classList.remove('hidden'); ul.innerHTML = ''; }
  else {
    emp.classList.add('hidden');
    ul.innerHTML = list.map(function(tk) {
      return '<li class="todo-item" draggable="true" data-id="' + tk.id + '">' +
        '<div class="todo-drag" title="Drag to reorder">\u22EE\u22EE</div>' +
        '<input type="checkbox" class="todo-checkbox" ' + (tk.completed ? 'checked' : '') + ' data-tid="' + tk.id + '">' +
        '<div class="todo-content">' +
        '<span class="todo-text ' + (tk.completed ? 'done' : '') + '">' + esc(tk.text) + '</span>' +
        '<div class="todo-meta">' +
        (tk.priority ? '<span class="prio-badge prio-' + tk.priority + '">' + (tk.priority === 'high' ? '\uD83D\uDD34' : tk.priority === 'medium' ? '\uD83D\uDFE1' : '\uD83D\uDFE2') + ' ' + tk.priority + '</span>' : '') +
        (tk.category ? '<span class="todo-cat">' + esc(tk.category) + '</span>' : '') +
        '</div>' +
        (tk.notes ? '<div class="todo-note">' + esc(tk.notes) + '</div>' : '') +
        '</div>' +
        '<button class="todo-delete" data-tid="' + tk.id + '" title="Delete">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button></li>';
    }).join('');
  }

  var active = S.todos.filter(function(t) { return !t.completed; }).length;
  $('todo-count').textContent = active + ' active / ' + S.todos.length + ' total';

  ul.querySelectorAll('.todo-item').forEach(function(li) {
    li.addEventListener('dragstart', function(e) { dragId = li.dataset.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', function() { li.classList.remove('dragging'); dragId = null; });
    li.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    li.addEventListener('drop', function(e) { e.preventDefault(); reorderTodo(dragId, li.dataset.id); });
  });
}

function addTodo(text, cat, notes, priority) {
  var todo = { id: Date.now().toString(), text: text, category: cat || '', notes: notes || '', priority: priority || '', completed: false, order: S.todos.length, createdAt: new Date().toISOString() };
  S.todos.push(todo);
  save();
  if (Cloud.isLoggedIn()) Cloud.upsertTodo(todo, S.todos.length - 1);
  renderTodos(); refreshDashboard(); toast('\u2705', t('todos.add') + ': ' + text);
}

function toggleTodo(id) {
  var tk = S.todos.find(function(t) { return t.id === id; }); if (!tk) return;
  tk.completed = !tk.completed;
  if (tk.completed) S.stats.tasksCompleted++; else S.stats.tasksCompleted = Math.max(0, S.stats.tasksCompleted - 1);
  save();
  if (Cloud.isLoggedIn()) { Cloud.upsertTodo(tk, S.todos.indexOf(tk)); Cloud.saveStats(S.stats); }
  renderTodos(); refreshDashboard();
}

function deleteTodo(id) {
  S.todos = S.todos.filter(function(t) { return t.id !== id; });
  save();
  if (Cloud.isLoggedIn()) Cloud.deleteTodoCloud(id);
  renderTodos(); refreshDashboard(); toast('\uD83D\uDDD1\uFE0F', 'Task deleted');
}

function reorderTodo(fromId, toId) {
  if (fromId === toId) return;
  var fi = S.todos.findIndex(function(t) { return t.id === fromId; });
  var ti = S.todos.findIndex(function(t) { return t.id === toId; });
  if (fi < 0 || ti < 0) return;
  var item = S.todos.splice(fi, 1)[0];
  S.todos.splice(ti, 0, item);
  save(); renderTodos();
}

function clearCompleted() {
  var completed = S.todos.filter(function(t) { return t.completed; });
  var c = completed.length; if (!c) return;
  S.todos = S.todos.filter(function(t) { return !t.completed; });
  save();
  if (Cloud.isLoggedIn()) Promise.all(completed.map(function(t) { return Cloud.deleteTodoCloud(t.id); }));
  renderTodos(); refreshDashboard(); toast('\uD83E\uDDF9', 'Cleared ' + c + ' tasks');
}

// ============================
// POMODORO TIMER
// ============================
function toggleTimer() { if (S.timer.running) pauseTimer(); else startTimer(); }

function startTimer() {
  S.timer.running = true; updateTimerUI();
  S.timer.iid = setInterval(function() {
    S.timer.secs--;
    if (S.timer.secs <= 0) {
      clearInterval(S.timer.iid); S.timer.running = false;
      if (!S.timer.isBreak) {
        var dur = S.timer.focusDur / 60;
        S.stats.totalSessions++; S.stats.totalMinutes += Math.round(dur);
        S.timer.longCount++;
        var dk = dateKey(new Date());
        if (!S.stats.daily[dk]) S.stats.daily[dk] = { sessions: 0, minutes: 0 };
        S.stats.daily[dk].sessions++; S.stats.daily[dk].minutes += Math.round(dur);
        var session = { ts: new Date().toISOString(), hour: new Date().getHours(), dur: Math.round(dur), completed: true };
        S.sessionLog.push(session);
        save();
        if (Cloud.isLoggedIn()) { Cloud.saveStats(S.stats); Cloud.appendSession(session); }
        playSound(); sendNotif(t('timer.sessionDone'));
        toast('\uD83C\uDF89', t('timer.sessionDone'));
        if (S.timer.longCount >= 4) { S.timer.secs = S.timer.breakDur * 3; S.timer.longCount = 0; }
        else S.timer.secs = S.timer.breakDur;
        S.timer.isBreak = true;
      } else {
        S.timer.secs = S.timer.focusDur; S.timer.isBreak = false;
        playSound(); sendNotif(t('timer.breakDone'));
        toast('\u23F0', t('timer.breakDone'));
        if (S.settings.autoStart) { setTimeout(function() { updateTimerUI(); startTimer(); }, 1200); }
      }
      updateTimerUI(); refreshDashboard(); refreshStats();
    }
    updateTimerDisplay(); updateRing();
    $('mini-timer').textContent = fmtTime(S.timer.secs);
    if (S.timer.secs % 60 === 0) {
      var mt = $('mini-timer');
      mt.classList.remove('pulse'); void mt.offsetWidth; mt.classList.add('pulse');
    }
    $('focus-timer').textContent = fmtTime(S.timer.secs);
  }, 1000);
}

function pauseTimer() { clearInterval(S.timer.iid); S.timer.running = false; updateTimerUI(); }

function resetTimer() {
  clearInterval(S.timer.iid); S.timer.running = false; S.timer.isBreak = false;
  S.timer.secs = S.timer.focusDur;
  updateTimerUI(); updateTimerDisplay(); updateRing();
  $('mini-timer').textContent = fmtTime(S.timer.secs);
  document.querySelectorAll('.mode-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === 'focus'); });
}

function skipTimer() {
  clearInterval(S.timer.iid); S.timer.running = false;
  if (S.timer.isBreak) { S.timer.secs = S.timer.focusDur; S.timer.isBreak = false; }
  else { S.timer.secs = S.timer.breakDur; S.timer.isBreak = true; }
  updateTimerUI(); updateTimerDisplay(); updateRing();
}

function updateTimerDisplay() { $('timer-display').textContent = fmtTime(S.timer.secs); $('focus-timer').textContent = fmtTime(S.timer.secs); }

function updateRing() {
  var total = S.timer.isBreak ? S.timer.breakDur : S.timer.focusDur;
  var p = S.timer.secs / (total || 1);
  $('timer-ring').style.strokeDasharray = RING_C;
  $('timer-ring').style.strokeDashoffset = RING_C * (1 - p);
}

function updateTimerUI() {
  $('ic-play').classList.toggle('hidden', S.timer.running);
  $('ic-pause').classList.toggle('hidden', !S.timer.running);
  var lbl = S.timer.running ? (S.timer.isBreak ? t('timer.onBreak') : t('timer.focusing')) : t('timer.ready');
  $('timer-label').textContent = lbl; $('focus-lbl').textContent = lbl;
  document.querySelectorAll('.mode-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === (S.timer.isBreak ? 'break' : 'focus')); });
  var dk = dateKey(new Date()), dd = S.stats.daily[dk] || { sessions: 0, minutes: 0 };
  $('t-session-count').textContent = dd.sessions;
  $('t-session-min').textContent = dd.minutes;
}

// ============================
// STATS
// ============================
function refreshStats() {
  $('st-sessions').textContent = S.stats.totalSessions;
  $('st-minutes').textContent = S.stats.totalMinutes;
  $('st-tasks').textContent = S.stats.tasksCompleted;
  $('st-streak').textContent = calcStreak();

  $('pg-sess').style.width = Math.min((S.stats.totalSessions / 20) * 100, 100) + '%'; $('pg-sess-txt').textContent = S.stats.totalSessions + '/20';
  $('pg-min').style.width = Math.min((S.stats.totalMinutes / 500) * 100, 100) + '%'; $('pg-min-txt').textContent = S.stats.totalMinutes + '/500';
  $('pg-task').style.width = Math.min((S.stats.tasksCompleted / 30) * 100, 100) + '%'; $('pg-task-txt').textContent = S.stats.tasksCompleted + '/30';

  var days = [], d = new Date();
  for (var i = 6; i >= 0; i--) { var dd2 = new Date(d); dd2.setDate(d.getDate() - i); days.push(dd2); }
  var vals = days.map(function(dd) { return (S.stats.daily[dateKey(dd)] || { minutes: 0 }).minutes; });
  var max = Math.max.apply(null, vals.concat([25]));
  var today = dateKey(new Date());
  $('stats-chart').innerHTML = days.map(function(dd, i) {
    var h = max > 0 ? (vals[i] / max) * 150 : 0;
    var isToday = dateKey(dd) === today;
    var dayName = dd.toLocaleDateString(I18N.get(), { weekday: 'short' });
    return '<div class="bar-item"><div class="bar-rect" style="height:' + Math.max(h,4) + 'px;' + (isToday ? '' : 'opacity:.5') + '" data-v="' + vals[i] + 'm"></div><span class="bar-lbl ' + (isToday ? 'today' : '') + '">' + dayName + '</span></div>';
  }).join('');
}

// ============================
// PLANNER
// ============================
function renderPlanner() {
  var now = new Date();
  var upcoming = S.planner.filter(function(p) { return new Date(p.date + 'T' + p.end) >= now; }).sort(function(a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
  var ul = $('planner-list'), emp = $('planner-empty');
  if (upcoming.length === 0) { emp.classList.remove('hidden'); ul.innerHTML = ''; }
  else {
    emp.classList.add('hidden');
    ul.innerHTML = upcoming.map(function(p) {
      return '<li><div class="planner-info"><span class="planner-subj">' + esc(p.subject) + '</span><span class="planner-time">' + p.date + ' \u00B7 ' + p.start + ' \u2013 ' + p.end + '</span></div><button class="btn btn-ghost btn-sm" onclick="window._delPlan(\'' + p.id + '\')">' + t('common.delete') + '</button></li>';
    }).join('');
  }
}

function addPlanSession(subject, date, start, end) {
  var session = { id: Date.now().toString(), subject: subject, date: date, start: start, end: end };
  S.planner.push(session);
  save();
  if (Cloud.isLoggedIn()) Cloud.addPlannerSession(session);
  renderPlanner(); refreshDashboard(); toast('\uD83D\uDCC5', 'Session added');
}

window._delPlan = function(id) {
  S.planner = S.planner.filter(function(p) { return p.id !== id; });
  save();
  if (Cloud.isLoggedIn()) Cloud.deletePlannerSession(id);
  renderPlanner(); renderCalendar(); refreshDashboard();
};

// ============================
// CALENDAR
// ============================
function renderCalendar() {
  var grid = $('cal-grid');
  var base = new Date(); base.setDate(base.getDate() + S.calWeekOffset * 7);
  var mon = new Date(base); mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  var today = dateKey(new Date());
  var sunDate = new Date(mon); sunDate.setDate(mon.getDate() + 6);
  $('cal-week-label').textContent = mon.toLocaleDateString(I18N.get(), { month: 'short', day: 'numeric' }) + ' \u2013 ' + sunDate.toLocaleDateString(I18N.get(), { month: 'short', day: 'numeric' });

  var html = '<div class="cal-hdr"></div>';
  for (var d = 0; d < 7; d++) {
    var dd = new Date(mon); dd.setDate(mon.getDate() + d);
    var isToday = dateKey(dd) === today;
    html += '<div class="cal-hdr ' + (isToday ? 'today-col' : '') + '">' + dd.toLocaleDateString(I18N.get(), { weekday: 'short', day: 'numeric' }) + '</div>';
  }
  for (var h = 8; h <= 21; h++) {
    html += '<div class="cal-time">' + String(h).padStart(2, '0') + ':00</div>';
    for (var d2 = 0; d2 < 7; d2++) {
      var dd2 = new Date(mon); dd2.setDate(mon.getDate() + d2);
      var dk = dateKey(dd2);
      var ev = S.planner.filter(function(p) { return p.date === dk && parseInt(p.start) <= h && parseInt(p.end.split(':')[0]) > h; });
      var evHtml = ev.map(function(e) { return '<div class="cal-event">' + esc(e.subject) + '</div>'; }).join('');
      html += '<div class="cal-cell">' + evHtml + '</div>';
    }
  }
  grid.innerHTML = html;
}

function exportICS() {
  var ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fontys Focus Hub//EN\r\nCALSCALE:GREGORIAN\r\n';
  S.planner.forEach(function(p) {
    var ds = p.date.replace(/-/g, '') + 'T' + p.start.replace(':', '') + '00';
    var de = p.date.replace(/-/g, '') + 'T' + p.end.replace(':', '') + '00';
    ics += 'BEGIN:VEVENT\r\nDTSTART:' + ds + '\r\nDTEND:' + de + '\r\nSUMMARY:' + p.subject + '\r\nDESCRIPTION:Study session - ' + p.subject + '\r\nEND:VEVENT\r\n';
  });
  ics += 'END:VCALENDAR';
  var blob = new Blob([ics], { type: 'text/calendar' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fontys-focus-hub.ics'; a.click();
  toast('\uD83D\uDCE5', 'Calendar exported as .ics');
}

// ============================
// AI STUDY HELPER
// ============================
function summarize(text) {
  var sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  if (sentences.length === 0) return { summary: '', ideas: [] };
  var words = text.toLowerCase().split(/\W+/).filter(function(w) { return w.length > 3; });
  var freq = {};
  words.forEach(function(w) { freq[w] = (freq[w] || 0) + 1; });
  var scored = sentences.map(function(s) {
    var sw = s.toLowerCase().split(/\W+/).filter(function(w) { return w.length > 3; });
    var score = sw.reduce(function(sum, w) { return sum + (freq[w] || 0); }, 0) / (sw.length || 1);
    return { s: s.trim(), score: score };
  });
  scored.sort(function(a, b) { return b.score - a.score; });
  var count = Math.max(1, Math.ceil(sentences.length * 0.25));
  var summary = scored.slice(0, count).sort(function(a, b) { return text.indexOf(a.s) - text.indexOf(b.s); }).map(function(x) { return x.s; }).join(' ');
  var ideas = scored.slice(0, Math.min(5, scored.length)).map(function(x) { return x.s; });
  return { summary: summary, ideas: ideas };
}

function generateFlashcards(text) {
  var sentences = (text.match(/[^.!?\n]+[.!?\n]+/g) || [text]).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 20; });
  var cards = [];
  sentences.forEach(function(s) {
    var defMatch = s.match(/^([A-Z][^,]{3,40}?)\s+(?:is|are|was|were|refers to|means|defined as)\s+(.{15,})/);
    if (defMatch) { cards.push({ q: 'What is ' + defMatch[1].trim() + '?', a: defMatch[2].trim() }); return; }
    var colonMatch = s.match(/^([A-Z][^:]{3,40}?):\s+(.{15,})/);
    if (colonMatch) { cards.push({ q: 'What is ' + colonMatch[1].trim() + '?', a: colonMatch[2].trim() }); return; }
  });
  if (cards.length < 3) {
    var ideas = summarize(text).ideas;
    ideas.forEach(function(s) {
      var words = s.trim().split(/\s+/);
      if (words.length > 5) {
        var keyWords = words.filter(function(w) { return w.length > 5 && w[0] === w[0].toUpperCase(); });
        var key = keyWords[0] || words[words.length - 2];
        if (key) cards.push({ q: 'Fill in: ' + s.replace(key, '______'), a: key });
      }
    });
  }
  var seen = new Set();
  return cards.filter(function(c) { var k = c.q.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
}

function suggestStudyTasks(text) {
  var ideas = summarize(text).ideas;
  var tasks = [];
  var prefixes = ['Review', 'Study', 'Memorize', 'Practice', 'Understand', 'Summarize'];
  ideas.forEach(function(s, i) {
    var words = s.split(/\s+/);
    var topics = words.filter(function(w) { return w.length > 4 && w[0] === w[0].toUpperCase() && !/^(The|This|That|These|Those|When|Where|How|Why|What|With|From|Into|Over|Under|After|Before)$/.test(w); });
    var topic = (topics[0] || words.slice(0, 3).join(' ')).replace(/[,;:.!?]$/, '');
    if (topic && topic.length > 3) tasks.push({ text: prefixes[i % prefixes.length] + ' ' + topic, category: 'Study', source: s.slice(0, 60) + (s.length > 60 ? '...' : '') });
  });
  var firstWords = text.trim().split(/\s+/).slice(0, 4).join(' ');
  tasks.unshift({ text: 'Review notes: ' + firstWords + '...', category: 'Study', source: 'Auto-generated' });
  return tasks.slice(0, 6);
}

var _fcCards = [], _fcIndex = 0;

function renderFlashcard() {
  if (_fcCards.length === 0) return;
  var card = _fcCards[_fcIndex];
  var el = $('flashcard');
  el.classList.remove('flipped');
  $('fc-front-text').textContent = card.q;
  $('fc-back-text').textContent = card.a;
  $('fc-counter').textContent = (_fcIndex + 1) + ' / ' + _fcCards.length;
  $('fc-progress').innerHTML = _fcCards.map(function(_, i) { return '<span class="fc-dot ' + (i === _fcIndex ? 'active' : i < _fcIndex ? 'done' : '') + '"></span>'; }).join('');
}

function showAIPanel(panelId, badgeLabel, badgeColor) {
  ['ai-results','ai-flashcards','ai-suggested-tasks','ai-loading','ai-empty'].forEach(function(id) { $(id).classList.add('hidden'); });
  $(panelId).classList.remove('hidden');
  var badge = $('ai-mode-badge');
  badge.textContent = badgeLabel; badge.classList.remove('hidden');
  badge.style.cssText = badgeColor ? 'background:' + badgeColor + ';color:#fff;border-radius:20px;padding:.2rem .7rem;font-size:.72rem;font-weight:700' : '';
}

// ============================
// PROFILE & SETTINGS
// ============================
function updateAvatar() {
  var name = S.profile.name || 'Student';
  var parts = name.trim().split(/\s+/);
  var initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  $('sidebar-avatar').textContent = initials;
  $('settings-avatar').textContent = initials;
  $('sidebar-name').textContent = name;
}

function populateLangSelect() {
  var sel = $('input-lang');
  sel.innerHTML = I18N.langs().map(function(l) { return '<option value="' + l.code + '" ' + (l.code === S.settings.lang ? 'selected' : '') + '>' + l.name + '</option>'; }).join('');
}

function loadSettings() {
  $('input-name').value = S.profile.name || '';
  $('input-daily-goal').value = S.profile.dailyGoal || 4;
  $('input-focus-dur').value = Math.round(S.timer.focusDur / 60);
  $('input-break-dur').value = Math.round(S.timer.breakDur / 60);
  $('chk-sound').checked = S.settings.sound;
  $('chk-notif').checked = S.settings.notif;
  var autoEl = $('chk-autostart');
  if (autoEl) autoEl.checked = S.settings.autoStart || false;
  populateLangSelect();
  applyTheme(S.settings.theme);
  updateAvatar();
}

function renderAll() {
  loadSettings();
  renderTodos();
  renderPlanner();
  renderCalendar();
  refreshDashboard();
  refreshStats();
  updateTimerDisplay();
  updateRing();
  updateTimerUI();
}

// ============================
// FOCUS MODE
// ============================
function enterFocusMode() {
  $('focus-overlay').classList.remove('hidden');
  $('focus-timer').textContent = fmtTime(S.timer.secs);
  var q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('focus-quote').textContent = '"' + q.t + '" \u2014 ' + q.a;
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function() {});
}

function exitFocusMode() {
  $('focus-overlay').classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen().catch(function() {});
}

// ============================
// SOUND & NOTIFICATIONS
// ============================
function playSound() {
  if (!S.settings.sound) return;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 554, 659].forEach(function(f, i) {
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = f; osc.type = 'sine'; gain.gain.value = 0.15;
      osc.start(ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch(e) {}
}

function sendNotif(msg) {
  if (!S.settings.notif) return;
  if ('Notification' in window && Notification.permission === 'granted') new Notification('Fontys Focus Hub', { body: msg });
}

// ============================
// TOAST
// ============================
function toast(icon, msg) {
  var el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + msg + '</span>';
  $('toast-container').appendChild(el);
  setTimeout(function() { el.classList.add('exit'); el.addEventListener('animationend', function() { el.remove(); }); }, 3000);
}

// ============================
// ADAPTIVE STUDY COACH
// ============================
var _insightTab = 'overview';
var _subjectChartMode = 'hours';

function initInsightsTabs() {
  document.querySelectorAll('.insights-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.insights-tab').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.insights-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      _insightTab = btn.dataset.itab;
      var panel = $('itab-' + _insightTab);
      if (panel) panel.classList.add('active');
      refreshInsightsTab(_insightTab);
    });
  });
  document.querySelectorAll('.sct-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.sct-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _subjectChartMode = btn.dataset.sct;
      renderSubjectChart(buildSubjectMap());
    });
  });
}

function buildSubjectMap() {
  var map = {};
  S.todos.forEach(function(tk) {
    if (!tk.category) return;
    if (!map[tk.category]) map[tk.category] = { tasks: 0, completed: 0, hours: 0, sessions: 0 };
    map[tk.category].tasks++;
    if (tk.completed) map[tk.category].completed++;
  });
  S.planner.forEach(function(p) {
    if (!map[p.subject]) map[p.subject] = { tasks: 0, completed: 0, hours: 0, sessions: 0 };
    var sh = parseInt(p.start.split(':')[0]), sm = parseInt(p.start.split(':')[1]);
    var eh = parseInt(p.end.split(':')[0]), em = parseInt(p.end.split(':')[1]);
    map[p.subject].hours += Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
    map[p.subject].sessions++;
  });
  return map;
}

function renderSubjectChart(subjectMap) {
  var subjects = Object.entries(subjectMap);
  var wrap = $('subject-chart-wrap'), empty = $('subject-empty');
  if (subjects.length === 0) { wrap && wrap.classList.add('hidden'); empty && empty.classList.remove('hidden'); return; }
  wrap && wrap.classList.remove('hidden'); empty && empty.classList.add('hidden');
  var getVal = function(e) { return _subjectChartMode === 'hours' ? e[1].hours : e[1].tasks; };
  var sorted = subjects.slice().sort(function(a, b) { return getVal(b) - getVal(a); });
  var maxVal = Math.max.apply(null, sorted.map(getVal).concat([0.01]));
  var COLORS = ['var(--purple)','var(--blue)','var(--green)','var(--orange)','#e879f9','#22d3ee','#f97316'];
  var barsEl = $('subject-bars'); if (!barsEl) return;
  barsEl.innerHTML = sorted.slice(0, 7).map(function(entry, i) {
    var val = getVal(entry), pct = (val / maxVal) * 100;
    var label = _subjectChartMode === 'hours' ? val.toFixed(1) + 'h' : val + ' tasks';
    var rate = entry[1].tasks > 0 ? Math.round((entry[1].completed / entry[1].tasks) * 100) : null;
    return '<div class="subject-bar-row"><div class="subject-bar-name" title="' + esc(entry[0]) + '">' + esc(entry[0]) + '</div><div class="subject-bar-track"><div class="subject-bar-fill" style="width:' + pct + '%;background:' + COLORS[i % COLORS.length] + '"></div></div><div class="subject-bar-val">' + label + (rate !== null ? '<span class="sbar-rate">' + rate + '%</span>' : '') + '</div></div>';
  }).join('');
  var sumEl = $('subject-summary');
  if (sumEl && sorted.length > 0) {
    var top = sorted[0], total = sorted.reduce(function(s, e) { return s + getVal(e); }, 0);
    var topPct = total > 0 ? Math.round((getVal(top) / total) * 100) : 0;
    sumEl.textContent = sorted.length + ' subjects \u00B7 top: ' + top[0] + ' (' + topPct + '%)';
  }
}

function renderHourlyHeatmap() {
  var el = $('hourly-heatmap'); if (!el) return;
  var counts = new Array(24).fill(0);
  S.sessionLog.forEach(function(s) { if (s.completed) counts[s.hour]++; });
  var max = Math.max.apply(null, counts.concat([1]));
  var LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];
  if (counts.every(function(c) { return c === 0; })) { el.innerHTML = '<div class="empty-state" style="padding:.5rem"><span class="empty-icon" style="font-size:1.5rem">\u23F0</span><p style="font-size:.75rem">Complete sessions to see activity patterns</p></div>'; return; }
  el.innerHTML = '<div class="hh-grid">' + counts.map(function(c, h) {
    var int = Math.round((c / max) * 4);
    return '<div class="hh-cell hh-int-' + int + '" title="' + LABELS[h] + ': ' + c + '"><span class="hh-lbl">' + LABELS[h] + '</span></div>';
  }).join('') + '</div><div class="hh-legend"><span>Low</span><div class="hh-leg-cells"><div class="hh-cell hh-int-0 hh-s"></div><div class="hh-cell hh-int-2 hh-s"></div><div class="hh-cell hh-int-4 hh-s"></div></div><span>High</span></div>';
}

function renderPomodoroHealth() {
  var el = $('pomodoro-stats'); if (!el) return;
  var logs = S.sessionLog, total = logs.length, completed = logs.filter(function(s) { return s.completed; }).length;
  if (total === 0) { el.innerHTML = '<div class="empty-state" style="padding:.5rem"><span class="empty-icon" style="font-size:1.5rem">\uD83C\uDF45</span><p style="font-size:.75rem">Start your first Pomodoro session</p></div>'; return; }
  var rate = Math.round((completed / total) * 100);
  var avgDur = completed > 0 ? Math.round(logs.filter(function(s) { return s.completed; }).reduce(function(s, l) { return s + l.dur; }, 0) / completed) : 0;
  var recent = logs.slice(-10), recentStops = recent.filter(function(s) { return !s.completed; }).length;
  var currMin = Math.round(S.timer.focusDur / 60);
  var suggest = '';
  if (recentStops >= 4 && currMin > 15) suggest = '<div class="pom-suggest tip-warn">\uD83D\uDCA1 Try ' + Math.max(10, Math.round(currMin * 0.7)) + 'min sessions</div>';
  else if (recentStops === 0 && recent.length >= 5) suggest = '<div class="pom-suggest tip-success">\uD83D\uDE80 Try ' + Math.min(60, currMin + 5) + 'min sessions</div>';
  el.innerHTML = '<div class="pom-metrics"><div class="pom-metric"><span class="pom-val" style="color:var(--green)">' + completed + '</span><span class="pom-lbl">Done</span></div><div class="pom-metric"><span class="pom-val" style="color:var(--orange)">' + (total - completed) + '</span><span class="pom-lbl">Stopped</span></div><div class="pom-metric"><span class="pom-val" style="color:var(--purple)">' + rate + '%</span><span class="pom-lbl">Rate</span></div><div class="pom-metric"><span class="pom-val" style="color:var(--blue)">' + avgDur + 'm</span><span class="pom-lbl">Avg</span></div></div><div class="pom-bar-wrap"><div class="pom-bar-fill" style="width:' + rate + '%"></div></div>' + suggest;
}

function renderDailyLoad() {
  var el = $('daily-load-bars'); if (!el) return;
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var data = S.stats.daily[dateKey(d)] || { sessions: 0, minutes: 0 };
    days.push({ label: d.toLocaleDateString('en', { weekday: 'short' }), sessions: data.sessions });
  }
  var maxS = Math.max.apply(null, days.map(function(d) { return d.sessions; }).concat([1])), goal = S.profile.dailyGoal || 4;
  el.innerHTML = '<div class="dlb-chart">' + days.map(function(d) {
    var pct = Math.max((d.sessions / maxS) * 100, d.sessions > 0 ? 8 : 0);
    var color = d.sessions > goal * 1.5 ? 'var(--orange)' : d.sessions >= goal ? 'var(--green)' : d.sessions > 0 ? 'var(--purple)' : 'var(--border)';
    return '<div class="dlb-col"><div class="dlb-bar-wrap" title="' + d.sessions + ' sessions"><div class="dlb-bar-fill" style="height:' + pct + '%;background:' + color + '"></div></div><span class="dlb-lbl">' + d.label + '</span><span class="dlb-val">' + (d.sessions > 0 ? d.sessions : '') + '</span></div>';
  }).join('') + '</div><div class="dlb-legend"><span style="color:var(--green)">\u25CF Goal</span><span style="color:var(--orange)">\u25CF Overload</span></div>';
}

function refreshInsightsTab(tab) {
  if (tab === 'subjects') renderSubjectChart(buildSubjectMap());
  else if (tab === 'patterns') { renderHourlyHeatmap(); renderPomodoroHealth(); renderDailyLoad(); }
}

function refreshInsights() {
  var today = dateKey(new Date());
  var todayData = S.stats.daily[today] || { sessions: 0, minutes: 0 };
  var goal = S.profile.dailyGoal || 4;
  var tips = [];
  var hourCounts = new Array(24).fill(0);
  S.sessionLog.forEach(function(s) { if (s.completed) hourCounts[s.hour]++; });
  var peakHour = hourCounts.indexOf(Math.max.apply(null, hourCounts));
  var hasSessions = S.sessionLog.length > 0;
  if (hasSessions && hourCounts[peakHour] > 0) {
    var ampm = peakHour >= 12 ? 'PM' : 'AM', h12 = peakHour % 12 || 12;
    $('ins-best-time').textContent = h12 + ':00 ' + ampm;
    tips.push({ icon: '\u23F0', text: t('coach.tipBestTime').replace('{time}', h12 + ':00 ' + ampm), type: 'tip-info' });
  } else { $('ins-best-time').textContent = t('coach.noData'); }

  var earlyStops = S.sessionLog.slice(-10).filter(function(s) { return !s.completed; }).length;
  if (earlyStops > 3 && S.timer.focusDur > 600) {
    tips.push({ icon: '\uD83D\uDCA1', text: t('coach.tipShorter').replace('{min}', Math.max(10, Math.round(S.timer.focusDur / 60 * 0.7))), type: 'tip-warn' });
  }

  var remaining = Math.max(0, goal - todayData.sessions);
  if (remaining > 0) {
    $('ins-recommended').textContent = remaining + ' ' + t('coach.sessionsLeft');
    var hoursLeft = 23 - new Date().getHours();
    if (hoursLeft < 4 && remaining > 2) tips.push({ icon: '\uD83C\uDFC3', text: t('coach.tipBehind').replace('{n}', remaining), type: 'tip-warn' });
    else if (remaining <= 2) tips.push({ icon: '\uD83D\uDCAA', text: t('coach.tipAlmostThere').replace('{n}', remaining), type: 'tip-success' });
  } else {
    $('ins-recommended').textContent = '\u2705 ' + t('coach.goalDone');
    tips.push({ icon: '\uD83C\uDF89', text: t('coach.tipGoalMet'), type: 'tip-success' });
  }

  $('ins-goal').textContent = Math.min(Math.round((todayData.sessions / goal) * 100), 100) + '%';

  if (todayData.sessions >= 6 && todayData.minutes >= 150) tips.push({ icon: '\u26A0\uFE0F', text: t('coach.tipOverload'), type: 'tip-warn' });

  var subjectMap = buildSubjectMap();
  var subjects = Object.entries(subjectMap).sort(function(a, b) { return (b[1].tasks + b[1].hours) - (a[1].tasks + a[1].hours); });
  if (subjects.length > 0) {
    $('ins-subject').textContent = subjects[0][0];
    if (subjects.length >= 2) {
      var topVal = subjects[0][1].tasks + subjects[0][1].hours, secVal = subjects[1][1].tasks + subjects[1][1].hours;
      if (topVal > secVal * 3 && secVal > 0) tips.push({ icon: '\u2696\uFE0F', text: t('coach.tipBalance').replace('{subj}', subjects[1][0]), type: 'tip-purple' });
    }
  } else { $('ins-subject').textContent = '\u2014'; }

  var streak = calcStreak();
  if (streak >= 7) tips.push({ icon: '\uD83C\uDFC6', text: t('coach.tipStreak').replace('{n}', streak) + ' Incredible week!', type: 'tip-success' });
  else if (streak >= 3) tips.push({ icon: '\uD83D\uDD25', text: t('coach.tipStreak').replace('{n}', streak), type: 'tip-success' });
  else if (streak === 0 && hasSessions) tips.push({ icon: '\uD83D\uDCC5', text: t('coach.tipStreakBroken'), type: 'tip-info' });
  else if (streak === 0 && !hasSessions) tips.push({ icon: '\uD83D\uDCAB', text: 'Start your first session today to kick off your streak!', type: 'tip-info' });

  var nightS = S.sessionLog.filter(function(s) { return s.completed && (s.hour >= 22 || s.hour <= 5); }).length;
  var mornS = S.sessionLog.filter(function(s) { return s.completed && s.hour >= 7 && s.hour <= 10; }).length;
  if (nightS > mornS && nightS >= 3) tips.push({ icon: '\uD83C\uDF05', text: 'You often study late at night. Morning sessions (7\u201310am) can boost retention by up to 30%.', type: 'tip-info' });

  var recentC = S.sessionLog.filter(function(s) { return s.completed; }).slice(-5);
  if (recentC.length >= 4) {
    var span = recentC.length > 1 ? (new Date(recentC[recentC.length-1].ts) - new Date(recentC[0].ts)) / 60000 : 0;
    if (span < 120 && span > 0) tips.push({ icon: '\uD83D\uDED1', text: t('coach.tipLongBreak'), type: 'tip-warn' });
  }

  if (tips.length === 0) tips.push({ icon: '\uD83D\uDC4B', text: t('coach.tipWelcome'), type: 'tip-info' });

  $('insights-tips').innerHTML = tips.slice(0, 4).map(function(tp) {
    return '<div class="insight-tip ' + tp.type + '"><span class="tip-icon">' + tp.icon + '</span><span>' + tp.text + '</span></div>';
  }).join('');

  refreshInsightsTab(_insightTab);
}

// ============================
// UTILITIES
// ============================
function fmtTime(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function esc(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// ============================
// EVENT SETUP
// ============================
function setup() {
  $('btn-open-dashboard').addEventListener('click', showApp);
  $('btn-back-landing').addEventListener('click', showLanding);
  $('btn-mobile-menu').addEventListener('click', function() { sidebar.classList.toggle('open'); overlay.classList.toggle('vis'); });
  overlay.addEventListener('click', closeMobile);
  document.querySelectorAll('.nav-item[data-page]').forEach(function(n) { n.addEventListener('click', function() { navigateTo(n.dataset.page); }); });
  $('btn-goto-todos').addEventListener('click', function() { navigateTo('todos'); });
  $('btn-goto-timer').addEventListener('click', function() { navigateTo('timer'); });
  $('btn-mini-start').addEventListener('click', function() { if (!S.timer.running) startTimer(); navigateTo('timer'); });

  $('todo-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var text = $('todo-input').value.trim(); if (!text) return;
    addTodo(text, $('todo-category').value.trim(), $('todo-notes').value.trim(), $('todo-priority').value);
    $('todo-input').value = ''; $('todo-category').value = ''; $('todo-notes').value = ''; $('todo-priority').value = '';
  });
  $('todo-list').addEventListener('change', function(e) { if (e.target.classList.contains('todo-checkbox')) toggleTodo(e.target.dataset.tid); });
  $('todo-list').addEventListener('click', function(e) { var btn = e.target.closest('.todo-delete'); if (btn) deleteTodo(btn.dataset.tid); });
  $('btn-clear-done').addEventListener('click', clearCompleted);
  document.querySelectorAll('.filter-btn').forEach(function(b) {
    b.addEventListener('click', function() {
      S.filter = b.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(function(x) { x.classList.toggle('active', x === b); });
      renderTodos();
    });
  });

  $('btn-timer-toggle').addEventListener('click', toggleTimer);
  $('btn-timer-reset').addEventListener('click', resetTimer);
  $('btn-timer-skip').addEventListener('click', skipTimer);
  $('btn-apply-dur').addEventListener('click', function() {
    var f = parseFloat($('input-focus-dur').value), b = parseFloat($('input-break-dur').value);
    if (f > 0) S.timer.focusDur = Math.round(f * 60);
    if (b > 0) S.timer.breakDur = Math.round(b * 60);
    resetTimer(); save(); toast('\u2699\uFE0F', 'Timer updated');
  });
  document.querySelectorAll('.mode-tab').forEach(function(b) {
    b.addEventListener('click', function() {
      if (S.timer.running) return;
      S.timer.isBreak = b.dataset.mode === 'break';
      S.timer.secs = S.timer.isBreak ? S.timer.breakDur : S.timer.focusDur;
      updateTimerDisplay(); updateRing(); updateTimerUI();
    });
  });
  $('btn-fullscreen').addEventListener('click', enterFocusMode);
  $('btn-exit-focus').addEventListener('click', exitFocusMode);
  $('btn-focus-toggle').addEventListener('click', toggleTimer);

  $('planner-form').addEventListener('submit', function(e) {
    e.preventDefault();
    addPlanSession($('plan-subject').value, $('plan-date').value, $('plan-start').value, $('plan-end').value);
    $('planner-form').reset(); $('plan-date').value = dateKey(new Date());
  });
  $('btn-cal-prev').addEventListener('click', function() { S.calWeekOffset--; renderCalendar(); });
  $('btn-cal-next').addEventListener('click', function() { S.calWeekOffset++; renderCalendar(); });
  $('btn-ics-export').addEventListener('click', exportICS);

  $('btn-summarize').addEventListener('click', function() {
    var text = $('ai-input').value.trim(); if (!text) { toast('\u26A0\uFE0F', t('ai.emptyMsg')); return; }
    var r = summarize(text);
    showAIPanel('ai-results', '\uD83D\uDCC4 Summary', 'var(--blue)');
    $('ai-summary').textContent = r.summary || 'No clear summary found.';
    $('ai-ideas').innerHTML = r.ideas.map(function(i) { return '<li>' + esc(i) + '</li>'; }).join('');
  });
  $('btn-flashcards').addEventListener('click', function() {
    var text = $('ai-input').value.trim(); if (!text) { toast('\u26A0\uFE0F', t('ai.emptyMsg')); return; }
    _fcCards = generateFlashcards(text); _fcIndex = 0;
    if (_fcCards.length === 0) { toast('\uD83D\uDCA1', 'Not enough structured content for flashcards.'); return; }
    showAIPanel('ai-flashcards', '\uD83C\uDCCF Flashcards (' + _fcCards.length + ')', 'var(--purple)');
    renderFlashcard(); toast('\uD83C\uDCCF', _fcCards.length + ' flashcards generated!');
  });
  $('flashcard-scene').addEventListener('click', function() { $('flashcard').classList.toggle('flipped'); });
  $('btn-fc-prev').addEventListener('click', function() { if (_fcIndex > 0) { _fcIndex--; renderFlashcard(); } });
  $('btn-fc-next').addEventListener('click', function() { if (_fcIndex < _fcCards.length - 1) { _fcIndex++; renderFlashcard(); } });
  $('btn-suggest-tasks').addEventListener('click', function() {
    var text = $('ai-input').value.trim(); if (!text) { toast('\u26A0\uFE0F', t('ai.emptyMsg')); return; }
    var tasks = suggestStudyTasks(text);
    showAIPanel('ai-suggested-tasks', '\u2705 Suggested Tasks', 'var(--green)');
    $('suggested-task-list').innerHTML = tasks.map(function(task, i) {
      return '<li class="suggested-task-item" data-idx="' + i + '"><button class="btn-add-single-task btn btn-ghost btn-sm" data-idx="' + i + '" title="Add to tasks">+</button><div class="suggested-task-content"><span class="suggested-task-text">' + esc(task.text) + '</span><span class="suggested-task-source">' + esc(task.source) + '</span></div><span class="suggested-task-cat">' + esc(task.category) + '</span></li>';
    }).join('');
    window._suggestedTasks = tasks;
  });
  $('suggested-task-list').addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-add-single-task'); if (!btn) return;
    var task = window._suggestedTasks[parseInt(btn.dataset.idx)];
    if (task) { addTodo(task.text, task.category, ''); btn.textContent = '\u2713'; btn.disabled = true; btn.style.color = 'var(--green)'; }
  });
  $('btn-add-all-tasks').addEventListener('click', function() {
    if (!window._suggestedTasks) return;
    window._suggestedTasks.forEach(function(task) { addTodo(task.text, task.category, ''); });
    toast('\u2705', window._suggestedTasks.length + ' tasks added!');
    document.querySelectorAll('.btn-add-single-task').forEach(function(b) { b.textContent = '\u2713'; b.disabled = true; b.style.color = 'var(--green)'; });
  });

  document.querySelectorAll('.theme-btn').forEach(function(b) { b.addEventListener('click', function() { applyTheme(b.dataset.theme); }); });
  $('input-lang').addEventListener('change', function() { S.settings.lang = $('input-lang').value; I18N.set(S.settings.lang); save(); refreshDashboard(); });
  $('input-name').addEventListener('input', function() { S.profile.name = $('input-name').value; save(); updateAvatar(); });
  $('input-daily-goal').addEventListener('change', function() { S.profile.dailyGoal = parseInt($('input-daily-goal').value) || 4; save(); refreshDashboard(); });
  $('chk-sound').addEventListener('change', function() { S.settings.sound = $('chk-sound').checked; save(); });
  $('chk-notif').addEventListener('change', function() {
    if ($('chk-notif').checked && 'Notification' in window) {
      Notification.requestPermission().then(function(p) { S.settings.notif = p === 'granted'; $('chk-notif').checked = S.settings.notif; save(); });
    } else { S.settings.notif = false; save(); }
  });
  var autoEl = $('chk-autostart');
  if (autoEl) autoEl.addEventListener('change', function() { S.settings.autoStart = autoEl.checked; save(); toast('\u2699\uFE0F', autoEl.checked ? 'Auto-start enabled' : 'Auto-start disabled'); });

  var fab = $('fab-quick-add'), qPanel = $('quick-add-panel');
  if (fab) {
    fab.addEventListener('click', function() {
      var isOpen = !qPanel.classList.contains('hidden');
      if (isOpen) { qPanel.classList.add('hidden'); fab.classList.remove('open'); }
      else { qPanel.classList.remove('hidden'); fab.classList.add('open'); setTimeout(function() { $('quick-add-input').focus(); }, 50); }
    });
  }
  if ($('btn-quick-add-submit')) {
    $('btn-quick-add-submit').addEventListener('click', function() {
      var text = $('quick-add-input').value.trim(); if (!text) return;
      addTodo(text, $('quick-add-cat').value.trim(), '', $('quick-add-prio').value);
      $('quick-add-input').value = ''; $('quick-add-cat').value = ''; $('quick-add-prio').value = '';
      qPanel.classList.add('hidden'); fab.classList.remove('open');
    });
    $('quick-add-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('btn-quick-add-submit').click(); });
  }
  document.addEventListener('click', function(e) {
    if (qPanel && !qPanel.classList.contains('hidden') && !qPanel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      qPanel.classList.add('hidden'); fab.classList.remove('open');
    }
  });

  var emptyAddBtn = $('btn-empty-add-task');
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', function() { navigateTo('todos'); setTimeout(function() { $('todo-input').focus(); }, 100); });

  $('btn-reset-all').addEventListener('click', function() {
    if (!confirm('Reset all data? This cannot be undone.')) return;
    localStorage.removeItem('ffh');
    S.todos = []; S.stats = { totalSessions: 0, totalMinutes: 0, tasksCompleted: 0, daily: {} };
    S.sessionLog = []; S.planner = []; S.profile = { name: '', dailyGoal: 4 };
    resetTimer(); save(); renderAll(); loadSettings();
    toast('\uD83D\uDD04', 'All data reset');
  });

  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); toggleTimer(); }
    if (e.key === 'n' || e.key === 'N') { navigateTo('todos'); setTimeout(function() { $('todo-input').focus(); }, 100); }
    if (e.key === 'Escape') exitFocusMode();
  });

  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', function() { if (S.settings.theme === 'system') applyTheme('system'); });
}

// ============================
// INIT
// ============================
async function init() {
  load();
  I18N.detect();
  if (S.settings.lang) I18N.set(S.settings.lang);
  I18N.apply();
  applyTheme(S.settings.theme);
  loadSettings();
  renderTodos();
  renderPlanner();
  updateTimerDisplay();
  updateRing();
  updateTimerUI();
  refreshStats();
  renderCalendar();
  $('plan-date').value = dateKey(new Date());
  initInsightsTabs();

  try {
    var user = await Cloud.init();
    Cloud.onAuthChange(async function(u, event) {
      updateAccountUI();
      if (u && event === 'SIGNED_IN') { await cloudLoadAll(); renderAll(); }
    });
    if (user) { updateAccountUI(); await cloudLoadAll(); renderAll(); }
    else { updateAccountUI(); updateSyncBadge('offline'); }
  } catch(e) {
    console.warn('Cloud init failed:', e);
    updateSyncBadge('offline');
  }
}

init();
setup();

})();
