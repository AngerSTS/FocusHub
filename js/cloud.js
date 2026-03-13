/* ============================================================
   FONTYS FOCUS HUB — Supabase Cloud Sync
   Handles auth, database reads/writes, and real-time sync
   ============================================================ */
window.Cloud = (function () {
  'use strict';

  const SUPABASE_URL = 'https://ijcizfbjznphatcgkurd.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY2l6ZmJqem5waGF0Y2drdXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzU5MDIsImV4cCI6MjA4OTAxMTkwMn0.04Tf1tCs8OrbHEcuzUfWtlbpTV61LlZfSUW_PnKMMW4';

  let _client = null;
  let _user = null;
  let _onAuthChange = null;

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    // Load Supabase from CDN if not already loaded
    if (!window.supabase) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
    }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Listen for auth state changes
    _client.auth.onAuthStateChange(async (event, session) => {
      _user = session?.user ?? null;
      if (_onAuthChange) _onAuthChange(_user, event);
    });

    // Check current session
    const { data: { session } } = await _client.auth.getSession();
    _user = session?.user ?? null;
    return _user;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // ── Auth ──────────────────────────────────────────────────
  async function signUp(email, password, name) {
    const { data, error } = await _client.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      await initUserRows(data.user.id, name);
    }
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await _client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await _client.auth.signOut();
    if (error) throw error;
    _user = null;
  }

  async function resetPassword(email) {
    const { error } = await _client.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  function getUser() { return _user; }
  function isLoggedIn() { return !!_user; }
  function onAuthChange(fn) { _onAuthChange = fn; }

  // ── Bootstrap new user rows ───────────────────────────────
  async function initUserRows(userId, name = '') {
    await Promise.allSettled([
      _client.from('profiles').upsert({ id: userId, name }),
      _client.from('settings').upsert({ id: userId }),
      _client.from('stats').upsert({ id: userId }),
    ]);
  }

  // ── PROFILE ───────────────────────────────────────────────
  async function loadProfile() {
    if (!_user) return null;
    const { data, error } = await _client.from('profiles').select('*').eq('id', _user.id).single();
    if (error && error.code === 'PGRST116') {
      await initUserRows(_user.id);
      return { name: '', daily_goal: 4 };
    }
    return data;
  }

  async function saveProfile(profile) {
    if (!_user) return;
    await _client.from('profiles').upsert({
      id: _user.id,
      name: profile.name || '',
      daily_goal: profile.dailyGoal || 4,
    });
  }

  // ── SETTINGS ──────────────────────────────────────────────
  async function loadSettings() {
    if (!_user) return null;
    const { data, error } = await _client.from('settings').select('*').eq('id', _user.id).single();
    if (error && error.code === 'PGRST116') {
      await _client.from('settings').upsert({ id: _user.id });
      return null;
    }
    return data;
  }

  async function saveSettings(s) {
    if (!_user) return;
    await _client.from('settings').upsert({
      id: _user.id,
      theme: s.theme,
      lang: s.lang,
      sound: s.sound,
      notif: s.notif,
      auto_start: s.autoStart,
      focus_dur: s.focusDur,
      break_dur: s.breakDur,
    });
  }

  // ── TODOS ─────────────────────────────────────────────────
  async function loadTodos() {
    if (!_user) return null;
    const { data, error } = await _client.from('todos')
      .select('*').eq('user_id', _user.id).order('sort_order', { ascending: true });
    if (error) { console.error('loadTodos:', error); return null; }
    return data.map(r => ({
      id: r.id, text: r.text, category: r.category, notes: r.notes,
      priority: r.priority, completed: r.completed, order: r.sort_order,
      createdAt: r.created_at,
    }));
  }

  async function saveTodos(todos) {
    if (!_user) return;
    // Delete all then re-insert (simple strategy for small datasets)
    await _client.from('todos').delete().eq('user_id', _user.id);
    if (todos.length === 0) return;
    const rows = todos.map((t, i) => ({
      id: t.id, user_id: _user.id, text: t.text, category: t.category || '',
      notes: t.notes || '', priority: t.priority || '', completed: t.completed,
      sort_order: i, created_at: t.createdAt || new Date().toISOString(),
    }));
    const { error } = await _client.from('todos').insert(rows);
    if (error) console.error('saveTodos:', error);
  }

  async function upsertTodo(todo, order) {
    if (!_user) return;
    await _client.from('todos').upsert({
      id: todo.id, user_id: _user.id, text: todo.text, category: todo.category || '',
      notes: todo.notes || '', priority: todo.priority || '', completed: todo.completed,
      sort_order: order ?? 0, created_at: todo.createdAt || new Date().toISOString(),
    });
  }

  async function deleteTodoCloud(id) {
    if (!_user) return;
    await _client.from('todos').delete().eq('id', id).eq('user_id', _user.id);
  }

  // ── STATS ─────────────────────────────────────────────────
  async function loadStats() {
    if (!_user) return null;
    const { data, error } = await _client.from('stats').select('*').eq('id', _user.id).single();
    if (error) return null;
    return {
      totalSessions: data.total_sessions,
      totalMinutes: data.total_minutes,
      tasksCompleted: data.tasks_completed,
      daily: data.daily || {},
    };
  }

  async function saveStats(stats) {
    if (!_user) return;
    await _client.from('stats').upsert({
      id: _user.id,
      total_sessions: stats.totalSessions,
      total_minutes: stats.totalMinutes,
      tasks_completed: stats.tasksCompleted,
      daily: stats.daily,
    });
  }

  // ── SESSION LOG ───────────────────────────────────────────
  async function loadSessionLog() {
    if (!_user) return null;
    const { data, error } = await _client.from('session_log')
      .select('*').eq('user_id', _user.id).order('ts', { ascending: true });
    if (error) return null;
    return data.map(r => ({ ts: r.ts, hour: r.hour, dur: r.dur, completed: r.completed }));
  }

  async function appendSession(session) {
    if (!_user) return;
    await _client.from('session_log').insert({
      user_id: _user.id, ts: session.ts, hour: session.hour,
      dur: session.dur, completed: session.completed,
    });
  }

  // ── PLANNER ───────────────────────────────────────────────
  async function loadPlanner() {
    if (!_user) return null;
    const { data, error } = await _client.from('planner')
      .select('*').eq('user_id', _user.id).order('date', { ascending: true });
    if (error) return null;
    return data.map(r => ({
      id: r.id, subject: r.subject, date: r.date,
      start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5),
    }));
  }

  async function addPlannerSession(session) {
    if (!_user) return;
    const { error } = await _client.from('planner').insert({
      id: session.id, user_id: _user.id, subject: session.subject,
      date: session.date, start_time: session.start, end_time: session.end,
    });
    if (error) console.error('addPlannerSession:', error);
  }

  async function deletePlannerSession(id) {
    if (!_user) return;
    await _client.from('planner').delete().eq('id', id).eq('user_id', _user.id);
  }

  // ── FULL LOAD (on login) ──────────────────────────────────
  async function loadAll() {
    if (!_user) return null;
    const [profile, settingsData, todos, stats, sessionLog, planner] = await Promise.all([
      loadProfile(), loadSettings(), loadTodos(), loadStats(), loadSessionLog(), loadPlanner(),
    ]);
    return { profile, settings: settingsData, todos, stats, sessionLog, planner };
  }

  return {
    init, signUp, signIn, signOut, resetPassword,
    getUser, isLoggedIn, onAuthChange,
    loadAll, loadProfile, saveProfile,
    loadSettings, saveSettings,
    loadTodos, saveTodos, upsertTodo, deleteTodoCloud,
    loadStats, saveStats,
    loadSessionLog, appendSession,
    loadPlanner, addPlannerSession, deletePlannerSession,
  };
})();
