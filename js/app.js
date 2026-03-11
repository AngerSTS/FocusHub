/* ============================================================
   FONTYS FOCUS HUB — Main Application
   State, navigation, todos, timer, stats, planner, calendar,
   AI summarizer, profile, theme, keyboard shortcuts
   ============================================================ */
(function () {
'use strict';

// ============================
// CONSTANTS & QUOTES
// ============================
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
  planner: [],
  profile: { name: '', dailyGoal: 4 },
  settings: { theme: 'dark', lang: 'en', sound: true, notif: false },
  filter: 'all',
  calWeekOffset: 0,
};

function load() {
  try {
    const d = localStorage.getItem('ffh');
    if (d) { const p = JSON.parse(d); Object.assign(S, { ...S, ...p, timer: { ...S.timer, ...p.timer, running: false, iid: null } }); }
  } catch (e) { console.warn('Load error:', e); }
  S.timer.secs = S.timer.isBreak ? S.timer.breakDur : S.timer.focusDur;
}

function save() {
  const c = { ...S }; c.timer = { ...c.timer, running: false, iid: null };
  localStorage.setItem('ffh', JSON.stringify(c));
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
function showApp() { landing.classList.add('hidden'); app.classList.remove('hidden'); refreshDashboard(); }
function showLanding() { app.classList.add('hidden'); landing.classList.remove('hidden'); }

function navigateTo(page) {
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  closeMobile();
  if (page === 'dashboard') refreshDashboard();
  if (page === 'stats') refreshStats();
  if (page === 'calendar') renderCalendar();
}

function closeMobile() { sidebar.classList.remove('open'); overlay.classList.remove('vis'); }

// ============================
// GREETING & DATE
// ============================
function setGreeting() {
  const h = new Date().getHours();
  const k = h < 12 ? 'greeting.morning' : h < 17 ? 'greeting.afternoon' : h < 21 ? 'greeting.evening' : 'greeting.night';
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
  const today = dateKey(new Date());
  const todayData = S.stats.daily[today] || { sessions: 0, minutes: 0 };

  // Stats cards — computed from real data
  $('ds-tasks').textContent = S.stats.tasksCompleted;
  $('ds-sessions').textContent = S.stats.totalSessions;
  const hrs = (S.stats.totalMinutes / 60);
  $('ds-hours').textContent = hrs >= 1 ? hrs.toFixed(1) + 'h' : S.stats.totalMinutes + 'm';
  $('ds-streak').textContent = calcStreak();

  // Daily goal progress
  const goal = S.profile.dailyGoal || 4;
  const prog = Math.min((todayData.sessions / goal) * 100, 100);
  $('dash-goal-bar').style.width = prog + '%';
  $('goal-badge').textContent = todayData.sessions + ' / ' + goal;

  // Mini timer
  $('mini-timer').textContent = fmtTime(S.timer.secs);
  $('btn-mini-start').textContent = S.timer.running ? t('timer.focusing') : t('dash.startFocus');

  // Recent tasks (last 5)
  const recent = S.todos.slice(-5).reverse();
  const tl = $('dash-task-list'), te = $('dash-empty-tasks');
  if (recent.length === 0) { te.classList.remove('hidden'); tl.innerHTML = ''; }
  else { te.classList.add('hidden'); tl.innerHTML = recent.map(tk => `<li><span class="task-dot ${tk.completed ? 'done' : ''}"></span><span style="${tk.completed ? 'text-decoration:line-through;color:var(--text3)' : ''}">${esc(tk.text)}</span></li>`).join(''); }

  // Upcoming planner sessions
  const now = new Date();
  const upcoming = S.planner.filter(p => new Date(p.date + 'T' + p.end) >= now).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 4);
  const pl = $('dash-plan-list'), pe = $('dash-empty-plan');
  if (upcoming.length === 0) { pe.classList.remove('hidden'); pl.innerHTML = ''; }
  else { pe.classList.add('hidden'); pl.innerHTML = upcoming.map(p => `<li><span class="plan-chip">${esc(p.subject)}</span><span>${p.date} ${p.start}-${p.end}</span></li>`).join(''); }

  // Quote
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('dash-quote').textContent = '"' + q.t + '"';
  $('dash-quote-author').textContent = '— ' + q.a;
}

function calcStreak() {
  let streak = 0, d = new Date();
  // If no sessions today yet, start checking from yesterday
  if (!(S.stats.daily[dateKey(d)] && S.stats.daily[dateKey(d)].sessions > 0)) d.setDate(d.getDate() - 1);
  while (true) {
    const k = dateKey(d);
    if (S.stats.daily[k] && S.stats.daily[k].sessions > 0) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

// ============================
// TODOS
// ============================
let dragId = null;

function renderTodos() {
  let list = S.todos;
  if (S.filter === 'active') list = list.filter(t => !t.completed);
  else if (S.filter === 'completed') list = list.filter(t => t.completed);

  const ul = $('todo-list'), emp = $('todos-empty');
  if (list.length === 0) { emp.classList.remove('hidden'); ul.innerHTML = ''; }
  else {
    emp.classList.add('hidden');
    ul.innerHTML = list.map(tk => `
      <li class="todo-item" draggable="true" data-id="${tk.id}">
        <div class="todo-drag" title="Drag to reorder">⋮⋮</div>
        <input type="checkbox" class="todo-checkbox" ${tk.completed ? 'checked' : ''} data-tid="${tk.id}">
        <div class="todo-content">
          <span class="todo-text ${tk.completed ? 'done' : ''}">${esc(tk.text)}</span>
          <div class="todo-meta">
            ${tk.category ? '<span class="todo-cat">' + esc(tk.category) + '</span>' : ''}
          </div>
          ${tk.notes ? '<div class="todo-note">' + esc(tk.notes) + '</div>' : ''}
        </div>
        <button class="todo-delete" data-tid="${tk.id}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </li>`).join('');
  }

  const active = S.todos.filter(t => !t.completed).length;
  $('todo-count').textContent = active + ' active / ' + S.todos.length + ' total';

  // Attach drag events
  ul.querySelectorAll('.todo-item').forEach(li => {
    li.addEventListener('dragstart', e => { dragId = li.dataset.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); dragId = null; });
    li.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    li.addEventListener('drop', e => { e.preventDefault(); reorderTodo(dragId, li.dataset.id); });
  });
}

function addTodo(text, cat, notes) {
  S.todos.push({ id: Date.now().toString(), text, category: cat || '', notes: notes || '', completed: false, order: S.todos.length, createdAt: new Date().toISOString() });
  save(); renderTodos(); refreshDashboard(); toast('✅', t('todos.add') + ': ' + text);
}

function toggleTodo(id) {
  const tk = S.todos.find(t => t.id === id); if (!tk) return;
  tk.completed = !tk.completed;
  if (tk.completed) S.stats.tasksCompleted++; else S.stats.tasksCompleted = Math.max(0, S.stats.tasksCompleted - 1);
  save(); renderTodos(); refreshDashboard();
}

function deleteTodo(id) {
  S.todos = S.todos.filter(t => t.id !== id);
  save(); renderTodos(); refreshDashboard(); toast('🗑️', 'Task deleted');
}

function reorderTodo(fromId, toId) {
  if (fromId === toId) return;
  const fi = S.todos.findIndex(t => t.id === fromId);
  const ti = S.todos.findIndex(t => t.id === toId);
  if (fi < 0 || ti < 0) return;
  const [item] = S.todos.splice(fi, 1);
  S.todos.splice(ti, 0, item);
  save(); renderTodos();
}

function clearCompleted() {
  const c = S.todos.filter(t => t.completed).length;
  if (!c) return;
  S.todos = S.todos.filter(t => !t.completed);
  save(); renderTodos(); refreshDashboard(); toast('🧹', 'Cleared ' + c + ' tasks');
}

// ============================
// POMODORO TIMER
// ============================
function toggleTimer() {
  if (S.timer.running) pauseTimer(); else startTimer();
}

function startTimer() {
  S.timer.running = true; updateTimerUI();
  S.timer.iid = setInterval(() => {
    S.timer.secs--;
    if (S.timer.secs <= 0) {
      clearInterval(S.timer.iid); S.timer.running = false;
      if (!S.timer.isBreak) {
        // Focus done
        const dur = S.timer.focusDur / 60;
        S.stats.totalSessions++; S.stats.totalMinutes += Math.round(dur);
        S.timer.longCount++;
        const dk = dateKey(new Date());
        if (!S.stats.daily[dk]) S.stats.daily[dk] = { sessions: 0, minutes: 0 };
        S.stats.daily[dk].sessions++; S.stats.daily[dk].minutes += Math.round(dur);
        save();
        playSound(); sendNotif(t('timer.sessionDone'));
        toast('🎉', t('timer.sessionDone'));
        // Switch to break
        if (S.timer.longCount >= 4) { S.timer.secs = S.timer.breakDur * 3; S.timer.longCount = 0; }
        else S.timer.secs = S.timer.breakDur;
        S.timer.isBreak = true;
      } else {
        // Break done
        S.timer.secs = S.timer.focusDur; S.timer.isBreak = false;
        playSound(); sendNotif(t('timer.breakDone'));
        toast('⏰', t('timer.breakDone'));
      }
      updateTimerUI(); refreshDashboard(); refreshStats();
    }
    updateTimerDisplay(); updateRing();
    $('mini-timer').textContent = fmtTime(S.timer.secs);
    $('focus-timer').textContent = fmtTime(S.timer.secs);
  }, 1000);
}

function pauseTimer() { clearInterval(S.timer.iid); S.timer.running = false; updateTimerUI(); }

function resetTimer() {
  clearInterval(S.timer.iid); S.timer.running = false; S.timer.isBreak = false;
  S.timer.secs = S.timer.focusDur;
  updateTimerUI(); updateTimerDisplay(); updateRing();
  $('mini-timer').textContent = fmtTime(S.timer.secs);
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'focus'));
}

function skipTimer() {
  clearInterval(S.timer.iid); S.timer.running = false;
  if (S.timer.isBreak) { S.timer.secs = S.timer.focusDur; S.timer.isBreak = false; }
  else { S.timer.secs = S.timer.breakDur; S.timer.isBreak = true; }
  updateTimerUI(); updateTimerDisplay(); updateRing();
}

function updateTimerDisplay() { $('timer-display').textContent = fmtTime(S.timer.secs); $('focus-timer').textContent = fmtTime(S.timer.secs); }

function updateRing() {
  const total = S.timer.isBreak ? S.timer.breakDur : S.timer.focusDur;
  const p = S.timer.secs / (total || 1);
  $('timer-ring').style.strokeDasharray = RING_C;
  $('timer-ring').style.strokeDashoffset = RING_C * (1 - p);
}

function updateTimerUI() {
  $('ic-play').classList.toggle('hidden', S.timer.running);
  $('ic-pause').classList.toggle('hidden', !S.timer.running);
  const lbl = S.timer.running ? (S.timer.isBreak ? t('timer.onBreak') : t('timer.focusing')) : t('timer.ready');
  $('timer-label').textContent = lbl; $('focus-lbl').textContent = lbl;
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === (S.timer.isBreak ? 'break' : 'focus')));
  // Session counters
  const dk = dateKey(new Date()), dd = S.stats.daily[dk] || { sessions: 0, minutes: 0 };
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

  // Progress bars
  const sp = Math.min((S.stats.totalSessions / 20) * 100, 100);
  const mp = Math.min((S.stats.totalMinutes / 500) * 100, 100);
  const tp = Math.min((S.stats.tasksCompleted / 30) * 100, 100);
  $('pg-sess').style.width = sp + '%'; $('pg-sess-txt').textContent = S.stats.totalSessions + '/20';
  $('pg-min').style.width = mp + '%'; $('pg-min-txt').textContent = S.stats.totalMinutes + '/500';
  $('pg-task').style.width = tp + '%'; $('pg-task-txt').textContent = S.stats.tasksCompleted + '/30';

  // Bar chart — last 7 days
  const days = []; const d = new Date();
  for (let i = 6; i >= 0; i--) { const dd = new Date(d); dd.setDate(d.getDate() - i); days.push(dd); }
  const vals = days.map(dd => (S.stats.daily[dateKey(dd)] || { minutes: 0 }).minutes);
  const max = Math.max(...vals, 25);
  const today = dateKey(new Date());
  $('stats-chart').innerHTML = days.map((dd, i) => {
    const h = max > 0 ? (vals[i] / max) * 150 : 0;
    const isToday = dateKey(dd) === today;
    const dayName = dd.toLocaleDateString(I18N.get(), { weekday: 'short' });
    return `<div class="bar-item"><div class="bar-rect" style="height:${Math.max(h,4)}px;${isToday ? '' : 'opacity:.5'}" data-v="${vals[i]}m"></div><span class="bar-lbl ${isToday ? 'today' : ''}">${dayName}</span></div>`;
  }).join('');
}

// ============================
// PLANNER
// ============================
function renderPlanner() {
  const now = new Date();
  const upcoming = S.planner.filter(p => new Date(p.date + 'T' + p.end) >= now).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const ul = $('planner-list'), emp = $('planner-empty');
  if (upcoming.length === 0) { emp.classList.remove('hidden'); ul.innerHTML = ''; }
  else {
    emp.classList.add('hidden');
    ul.innerHTML = upcoming.map(p => `<li>
      <div class="planner-info"><span class="planner-subj">${esc(p.subject)}</span><span class="planner-time">${p.date} · ${p.start} – ${p.end}</span></div>
      <button class="btn btn-ghost btn-sm" onclick="window._delPlan('${p.id}')">${t('common.delete')}</button>
    </li>`).join('');
  }
}

function addPlanSession(subject, date, start, end) {
  S.planner.push({ id: Date.now().toString(), subject, date, start, end });
  save(); renderPlanner(); refreshDashboard(); toast('📅', 'Session added');
}

window._delPlan = function (id) {
  S.planner = S.planner.filter(p => p.id !== id);
  save(); renderPlanner(); renderCalendar(); refreshDashboard();
};

// ============================
// CALENDAR
// ============================
function renderCalendar() {
  const grid = $('cal-grid');
  const base = new Date(); base.setDate(base.getDate() + S.calWeekOffset * 7);
  const mon = new Date(base); mon.setDate(base.getDate() - ((base.getDay() + 6) % 7)); // Monday
  const today = dateKey(new Date());

  // Week label
  const sunDate = new Date(mon); sunDate.setDate(mon.getDate() + 6);
  $('cal-week-label').textContent = mon.toLocaleDateString(I18N.get(), { month: 'short', day: 'numeric' }) + ' – ' + sunDate.toLocaleDateString(I18N.get(), { month: 'short', day: 'numeric' });

  // Build grid: header row + hour rows (8-22)
  let html = '<div class="cal-hdr"></div>'; // corner
  for (let d = 0; d < 7; d++) {
    const dd = new Date(mon); dd.setDate(mon.getDate() + d);
    const isToday = dateKey(dd) === today;
    html += `<div class="cal-hdr ${isToday ? 'today-col' : ''}">${dd.toLocaleDateString(I18N.get(), { weekday: 'short', day: 'numeric' })}</div>`;
  }
  for (let h = 8; h <= 21; h++) {
    html += `<div class="cal-time">${String(h).padStart(2, '0')}:00</div>`;
    for (let d = 0; d < 7; d++) {
      const dd = new Date(mon); dd.setDate(mon.getDate() + d);
      const dk = dateKey(dd);
      // Check for events in this hour
      const ev = S.planner.filter(p => p.date === dk && parseInt(p.start) <= h && parseInt(p.end.split(':')[0]) > h);
      const evHtml = ev.map(e => `<div class="cal-event">${esc(e.subject)}</div>`).join('');
      html += `<div class="cal-cell">${evHtml}</div>`;
    }
  }
  grid.innerHTML = html;
}

function exportICS() {
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fontys Focus Hub//EN\r\nCALSCALE:GREGORIAN\r\n';
  S.planner.forEach(p => {
    const ds = p.date.replace(/-/g, '') + 'T' + p.start.replace(':', '') + '00';
    const de = p.date.replace(/-/g, '') + 'T' + p.end.replace(':', '') + '00';
    ics += `BEGIN:VEVENT\r\nDTSTART:${ds}\r\nDTEND:${de}\r\nSUMMARY:${p.subject}\r\nDESCRIPTION:Study session - ${p.subject}\r\nEND:VEVENT\r\n`;
  });
  ics += 'END:VCALENDAR';
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fontys-focus-hub.ics'; a.click();
  toast('📥', 'Calendar exported as .ics');
}

// ============================
// AI SUMMARIZER (client-side extractive)
// ============================
function summarize(text) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  if (sentences.length === 0) return { summary: '', ideas: [] };
  // Word frequency scoring
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);
  // Score each sentence
  const scored = sentences.map(s => {
    const sw = s.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const score = sw.reduce((sum, w) => sum + (freq[w] || 0), 0) / (sw.length || 1);
    return { s: s.trim(), score };
  });
  scored.sort((a, b) => b.score - a.score);
  const count = Math.max(1, Math.ceil(sentences.length * 0.25));
  const summary = scored.slice(0, count).sort((a, b) => text.indexOf(a.s) - text.indexOf(b.s)).map(x => x.s).join(' ');
  const ideas = scored.slice(0, Math.min(5, scored.length)).map(x => x.s);
  return { summary, ideas };
}

function createStudyNotes(text) {
  const { summary, ideas } = summarize(text);
  let notes = '📝 STUDY NOTES\n\n';
  notes += '📌 Summary:\n' + summary + '\n\n';
  notes += '💡 Key Points:\n' + ideas.map((i, n) => (n + 1) + '. ' + i).join('\n');
  return notes;
}

// ============================
// PROFILE & SETTINGS
// ============================
function updateAvatar() {
  const name = S.profile.name || 'Student';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  $('sidebar-avatar').textContent = initials;
  $('settings-avatar').textContent = initials;
  $('sidebar-name').textContent = name;
}

function populateLangSelect() {
  const sel = $('input-lang');
  sel.innerHTML = I18N.langs().map(l => `<option value="${l.code}" ${l.code === S.settings.lang ? 'selected' : ''}>${l.name}</option>`).join('');
}

function loadSettings() {
  $('input-name').value = S.profile.name || '';
  $('input-daily-goal').value = S.profile.dailyGoal || 4;
  $('input-focus-dur').value = Math.round(S.timer.focusDur / 60);
  $('input-break-dur').value = Math.round(S.timer.breakDur / 60);
  $('chk-sound').checked = S.settings.sound;
  $('chk-notif').checked = S.settings.notif;
  populateLangSelect();
  applyTheme(S.settings.theme);
  updateAvatar();
}

// ============================
// FOCUS MODE
// ============================
function enterFocusMode() {
  $('focus-overlay').classList.remove('hidden');
  $('focus-timer').textContent = fmtTime(S.timer.secs);
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('focus-quote').textContent = '"' + q.t + '" — ' + q.a;
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function exitFocusMode() {
  $('focus-overlay').classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// ============================
// SOUND & NOTIFICATIONS
// ============================
function playSound() {
  if (!S.settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 554, 659].forEach((f, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = f; osc.type = 'sine'; gain.gain.value = 0.15;
      osc.start(ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch (e) { /* Audio not supported */ }
}

function sendNotif(msg) {
  if (!S.settings.notif) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Fontys Focus Hub', { body: msg });
  }
}

// ============================
// TOAST
// ============================
function toast(icon, msg) {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('exit'); el.addEventListener('animationend', () => el.remove()); }, 3000);
}

// ============================
// UTILITIES
// ============================
function fmtTime(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// ============================
// EVENT SETUP
// ============================
function setup() {
  // Landing / nav
  $('btn-open-dashboard').addEventListener('click', showApp);
  $('btn-back-landing').addEventListener('click', showLanding);
  $('btn-mobile-menu').addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('vis'); });
  overlay.addEventListener('click', closeMobile);

  // Sidebar nav
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.addEventListener('click', () => navigateTo(n.dataset.page)));

  // Dashboard quick links
  $('btn-goto-todos').addEventListener('click', () => navigateTo('todos'));
  $('btn-goto-timer').addEventListener('click', () => navigateTo('timer'));
  $('btn-goto-planner').addEventListener('click', () => navigateTo('planner'));
  $('btn-mini-start').addEventListener('click', () => { if (!S.timer.running) startTimer(); navigateTo('timer'); });

  // Todos
  $('todo-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('todo-input').value.trim(); if (!text) return;
    addTodo(text, $('todo-category').value.trim(), $('todo-notes').value.trim());
    $('todo-input').value = ''; $('todo-category').value = ''; $('todo-notes').value = '';
  });
  $('todo-list').addEventListener('change', e => { if (e.target.classList.contains('todo-checkbox')) toggleTodo(e.target.dataset.tid); });
  $('todo-list').addEventListener('click', e => { const btn = e.target.closest('.todo-delete'); if (btn) deleteTodo(btn.dataset.tid); });
  $('btn-clear-done').addEventListener('click', clearCompleted);
  document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
    S.filter = b.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(x => x.classList.toggle('active', x === b));
    renderTodos();
  }));

  // Timer
  $('btn-timer-toggle').addEventListener('click', toggleTimer);
  $('btn-timer-reset').addEventListener('click', resetTimer);
  $('btn-timer-skip').addEventListener('click', skipTimer);
  $('btn-apply-dur').addEventListener('click', () => {
    const f = parseFloat($('input-focus-dur').value), b = parseFloat($('input-break-dur').value);
    if (f > 0) S.timer.focusDur = Math.round(f * 60);
    if (b > 0) S.timer.breakDur = Math.round(b * 60);
    resetTimer(); save(); toast('⚙️', 'Timer updated');
  });
  document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => {
    if (S.timer.running) return;
    const isBreak = b.dataset.mode === 'break';
    S.timer.isBreak = isBreak;
    S.timer.secs = isBreak ? S.timer.breakDur : S.timer.focusDur;
    updateTimerDisplay(); updateRing(); updateTimerUI();
  }));
  $('btn-fullscreen').addEventListener('click', enterFocusMode);
  $('btn-exit-focus').addEventListener('click', exitFocusMode);
  $('btn-focus-toggle').addEventListener('click', toggleTimer);

  // Planner
  $('planner-form').addEventListener('submit', e => {
    e.preventDefault();
    addPlanSession($('plan-subject').value, $('plan-date').value, $('plan-start').value, $('plan-end').value);
    $('planner-form').reset(); $('plan-date').value = dateKey(new Date());
  });

  // Calendar
  $('btn-cal-prev').addEventListener('click', () => { S.calWeekOffset--; renderCalendar(); });
  $('btn-cal-next').addEventListener('click', () => { S.calWeekOffset++; renderCalendar(); });
  $('btn-ics-export').addEventListener('click', exportICS);

  // AI
  $('btn-summarize').addEventListener('click', () => {
    const text = $('ai-input').value.trim();
    if (!text) { toast('⚠️', t('ai.emptyMsg')); return; }
    const r = summarize(text);
    $('ai-results').classList.remove('hidden'); $('ai-empty').classList.add('hidden');
    $('ai-summary').textContent = r.summary;
    $('ai-ideas').innerHTML = r.ideas.map(i => '<li>' + esc(i) + '</li>').join('');
  });
  $('btn-study-notes').addEventListener('click', () => {
    const text = $('ai-input').value.trim();
    if (!text) { toast('⚠️', t('ai.emptyMsg')); return; }
    const notes = createStudyNotes(text);
    $('ai-results').classList.remove('hidden'); $('ai-empty').classList.add('hidden');
    $('ai-summary').textContent = notes;
    $('ai-ideas').innerHTML = '';
  });

  // Settings
  document.querySelectorAll('.theme-btn').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
  $('input-lang').addEventListener('change', () => { S.settings.lang = $('input-lang').value; I18N.set(S.settings.lang); save(); refreshDashboard(); });
  $('input-name').addEventListener('input', () => { S.profile.name = $('input-name').value; save(); updateAvatar(); });
  $('input-daily-goal').addEventListener('change', () => { S.profile.dailyGoal = parseInt($('input-daily-goal').value) || 4; save(); refreshDashboard(); });
  $('chk-sound').addEventListener('change', () => { S.settings.sound = $('chk-sound').checked; save(); });
  $('chk-notif').addEventListener('change', () => {
    if ($('chk-notif').checked && 'Notification' in window) {
      Notification.requestPermission().then(p => { S.settings.notif = p === 'granted'; $('chk-notif').checked = S.settings.notif; save(); });
    } else { S.settings.notif = false; save(); }
  });
  $('btn-reset-all').addEventListener('click', () => {
    if (!confirm('Reset all data? This cannot be undone.')) return;
    localStorage.removeItem('ffh');
    S.todos = []; S.stats = { totalSessions: 0, totalMinutes: 0, tasksCompleted: 0, daily: {} };
    S.planner = []; S.profile = { name: '', dailyGoal: 4 };
    resetTimer(); save(); renderTodos(); renderPlanner(); renderCalendar(); refreshDashboard(); refreshStats(); loadSettings();
    toast('🔄', 'All data reset');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); toggleTimer(); }
    if (e.key === 'n' || e.key === 'N') { navigateTo('todos'); setTimeout(() => $('todo-input').focus(), 100); }
    if (e.key === 'Escape') exitFocusMode();
  });

  // System theme listener
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (S.settings.theme === 'system') applyTheme('system'); });
}

// ============================
// INIT
// ============================
function init() {
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
  // Set default date for planner
  $('plan-date').value = dateKey(new Date());
}

init();
setup();

})();
