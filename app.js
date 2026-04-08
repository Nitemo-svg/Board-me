// ============================================================
//  WeekFlow v2 — app.js
//  Firebase Realtime Database · temps de début/fin · mobile-first
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, push, remove, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8Qcy-fht-ghmfZ4Y9RAvl66bLZayk6iw",
  authDomain: "web-app-board.firebaseapp.com",
  databaseURL: "https://web-app-board-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "web-app-board",
  storageBucket: "web-app-board.firebasestorage.app",
  messagingSenderId: "1076638830945",
  appId: "1:1076638830945:web:dca8361b52a1f9b0cfb520"
};
const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);

// ============================================================
//  CONSTANTS
// ============================================================
const DAY_NAMES  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const CAT_LABELS = {
  perso:'🏠 Perso', etudes:'📚 Études', netimo:'💼 Nétimo',
  sport:'🏃 Sport', social:'💬 Social', sante:'❤️ Santé',
  loisir:'🎮 Loisir', autre:'📌 Autre'
};
const PRIO_ICON = { high:'🔴', mid:'🟡', low:'🟢' };
const DEFAULT_SETTINGS = {
  theme:'midnight', accent:'cyan', font:'playfair', density:'comfy',
  weekStart:1, userName:'',
  catColors:{
    perso:'#60a5fa', etudes:'#a78bfa', netimo:'#34d399',
    sport:'#f97316', social:'#f472b6', sante:'#fb7185',
    loisir:'#fbbf24', autre:'#94a3b8'
  }
};

// ============================================================
//  STATE
// ============================================================
let tasks = {};
let settings = { ...DEFAULT_SETTINGS };
let currentView = 'week';
let currentDay = new Date().getDay();
let editingTaskId = null;

// ============================================================
//  FIREBASE
// ============================================================
function initFirebase() {
  onValue(ref(db, 'weekflow/tasks'), snap => {
    tasks = snap.val() || {};
    renderAll();
  });
  onValue(ref(db, 'weekflow/settings'), snap => {
    const saved = snap.val() || {};
    settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!settings.catColors) settings.catColors = DEFAULT_SETTINGS.catColors;
    applySettings();
    renderAll();
  });
}

// ============================================================
//  UTILS
// ============================================================
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToDuration(mins) {
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2,'0')}`;
}

function getDuration(task) {
  if (!task.timeStart || !task.timeEnd) return null;
  const diff = timeToMinutes(task.timeEnd) - timeToMinutes(task.timeStart);
  return diff > 0 ? diff : null;
}

function totalHoursForDay(dayIdx) {
  let total = 0;
  Object.values(tasks).filter(t => parseInt(t.day) === dayIdx).forEach(t => {
    const d = getDuration(t);
    if (d) total += d;
  });
  return total;
}

function getTasksForDay(dayIdx) {
  return Object.entries(tasks)
    .filter(([,t]) => parseInt(t.day) === dayIdx)
    .sort((a,b) => (a[1].timeStart||'').localeCompare(b[1].timeStart||''));
}

function catColorBg(cat) {
  const c = settings.catColors?.[cat] || DEFAULT_SETTINGS.catColors[cat] || '#94a3b8';
  const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  return `rgba(${r},${g},${b},0.18)`;
}
function catColorFg(cat) {
  return settings.catColors?.[cat] || DEFAULT_SETTINGS.catColors[cat] || '#94a3b8';
}

function totalPlanifiedHours() {
  let total = 0;
  Object.values(tasks).forEach(t => { const d = getDuration(t); if (d) total += d; });
  const h = Math.floor(total / 60), m = total % 60;
  return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
}

// ============================================================
//  RENDER
// ============================================================
function renderAll() {
  updateStats();
  if (currentView === 'week') renderWeek();
  else renderDay(currentDay);
}

function getWeekOrder() {
  const ws = parseInt(settings.weekStart ?? 1);
  return Array.from({length:7}, (_,i) => (ws + i) % 7);
}

function renderWeek() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  const today = new Date().getDay();

  getWeekOrder().forEach(dayIdx => {
    const dayTasks = getTasksForDay(dayIdx);
    const col = document.createElement('div');
    col.className = 'day-col' + (dayIdx === today ? ' today' : '');

    const totalMins = totalHoursForDay(dayIdx);
    const durationStr = totalMins > 0 ? minutesToDuration(totalMins) : '';
    col.innerHTML = `
      <div class="day-col-header">
        <span class="day-name">${DAY_NAMES[dayIdx]}</span>
        <span class="day-task-count">${durationStr}</span>
      </div>
      <div class="day-col-body" id="col-${dayIdx}"></div>
    `;
    grid.appendChild(col);

    const body = col.querySelector(`#col-${dayIdx}`);
    if (dayTasks.length === 0) {
      body.innerHTML = `<div class="empty-col">Rien de prévu</div>`;
    } else {
      dayTasks.forEach(([id, task]) => body.appendChild(buildTaskCard(id, task, 'week')));
    }
    const addBtn = document.createElement('button');
    addBtn.className = 'add-task-inline';
    addBtn.innerHTML = `<span>+</span> Ajouter`;
    addBtn.addEventListener('click', () => openTaskModal(null, dayIdx));
    body.appendChild(addBtn);
  });
}

function renderDay(dayIdx) {
  const container = document.getElementById('dayFull');
  const today = new Date().getDay();
  const dayTasks = getTasksForDay(dayIdx);

  // Update strips
  document.querySelectorAll('.day-pill, .dsp').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.day) === dayIdx);
  });

  if (currentView === 'day') {
    document.getElementById('pageTitle').textContent =
      settings.userName ? `Bonjour ${settings.userName} 👋` : DAY_NAMES[dayIdx];
  }

  const totalMins = totalHoursForDay(dayIdx);
  const dStr = totalMins > 0 ? ` · ${minutesToDuration(totalMins)} planifiées` : '';

  container.innerHTML = `
    <div class="day-view-header">
      <h2>${DAY_NAMES[dayIdx]}</h2>
      <div class="day-date">${dayIdx === today ? "Aujourd'hui" : 'Semaine type'}${dStr}</div>
    </div>
    <div class="day-tasks-list" id="dayTasksList"></div>
    <button class="day-add-btn" id="dayAddBtn">
      <span style="font-size:22px;color:var(--accent)">+</span>
      Ajouter une activité
    </button>
  `;

  const list = document.getElementById('dayTasksList');
  if (dayTasks.length === 0) {
    list.innerHTML = `<div class="empty-col" style="padding:32px;font-size:13px">Journée libre 🌿</div>`;
  } else {
    dayTasks.forEach(([id, task]) => list.appendChild(buildTaskCard(id, task, 'day')));
  }
  document.getElementById('dayAddBtn').addEventListener('click', () => openTaskModal(null, dayIdx));
}

function buildTaskCard(id, task, mode) {
  const card = document.createElement('div');
  card.className = `task-card cat-${task.category || 'autre'}`;
  card.dataset.id = id;

  const catColor = settings.catColors?.[task.category];
  if (catColor) card.style.setProperty('--cat-color', catColor);

  // Time block display
  let timePart = '';
  if (task.timeStart && task.timeEnd) {
    const durMins = getDuration(task);
    const durStr  = durMins ? minutesToDuration(durMins) : '';
    timePart = `
      <span class="task-timeblock">
        ${task.timeStart} <span class="dot">→</span> ${task.timeEnd}
      </span>
      ${durStr ? `<span class="task-duration-lbl">${durStr}</span>` : ''}
    `;
  } else if (task.timeStart) {
    timePart = `<span class="task-timeblock">${task.timeStart}</span>`;
  }

  const prioIcon = task.priority && task.priority !== 'mid' ? `<span class="task-prio">${PRIO_ICON[task.priority]||''}</span>` : '';

  card.innerHTML = `
    <div class="task-name">${escHtml(task.name || 'Sans titre')}</div>
    <div class="task-meta">
      ${timePart}
      <span class="task-cat" style="background:${catColorBg(task.category)};color:${catColorFg(task.category)}">${CAT_LABELS[task.category] || task.category}</span>
      ${prioIcon}
    </div>
    ${task.note ? `<div class="task-note">${escHtml(task.note)}</div>` : ''}
  `;

  card.addEventListener('click', () => openTaskModal(id, task.day));
  return card;
}

function updateStats() {
  const count = Object.values(tasks).length;
  document.getElementById('statTotal').textContent = count;
  document.getElementById('statHours').textContent = totalPlanifiedHours();

  const todayCount = getTasksForDay(new Date().getDay()).length;
  document.getElementById('topStat').textContent =
    todayCount > 0 ? `${todayCount} activité${todayCount>1?'s':''} aujourd'hui` : '';
}

// ============================================================
//  TASK MODAL
// ============================================================
function openTaskModal(taskId, dayHint) {
  editingTaskId = taskId;
  const task = taskId ? tasks[taskId] : null;

  document.getElementById('modalTitle').textContent = task ? 'Modifier l\'activité' : 'Nouvelle activité';
  document.getElementById('taskName').value   = task?.name || '';
  document.getElementById('taskDay').value    = task ? task.day : (dayHint ?? new Date().getDay());
  document.getElementById('taskTimeStart').value = task?.timeStart || '09:00';
  document.getElementById('taskTimeEnd').value   = task?.timeEnd   || '10:00';
  document.getElementById('taskCategory').value  = task?.category || 'perso';
  document.getElementById('taskNote').value   = task?.note || '';

  document.querySelectorAll('.prio-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.prio === (task?.priority || 'mid'));
  });
  document.getElementById('deleteTaskBtn').style.display = task ? 'inline-flex' : 'none';
  updateDurationPreview();

  document.getElementById('taskModal').classList.add('open');
  setTimeout(() => document.getElementById('taskName').focus(), 100);
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('open');
  editingTaskId = null;
}

function updateDurationPreview() {
  const s = document.getElementById('taskTimeStart').value;
  const e = document.getElementById('taskTimeEnd').value;
  const diff = timeToMinutes(e) - timeToMinutes(s);
  const el = document.getElementById('durationPreview');
  if (diff > 0) {
    el.textContent = `Durée : ${minutesToDuration(diff)}`;
    el.style.display = 'block';
  } else if (diff < 0) {
    el.textContent = `⚠ L'heure de fin est avant le début`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function saveTask() {
  const name = document.getElementById('taskName').value.trim();
  if (!name) { showToast('Ajoute un titre !'); return; }
  const timeStart = document.getElementById('taskTimeStart').value;
  const timeEnd   = document.getElementById('taskTimeEnd').value;
  if (timeToMinutes(timeEnd) <= timeToMinutes(timeStart)) {
    showToast('La fin doit être après le début !'); return;
  }

  const payload = {
    name,
    day:       parseInt(document.getElementById('taskDay').value),
    timeStart,
    timeEnd,
    category:  document.getElementById('taskCategory').value,
    note:      document.getElementById('taskNote').value.trim(),
    priority:  document.querySelector('.prio-btn.active')?.dataset.prio || 'mid',
  };

  if (editingTaskId) {
    await update(ref(db, `weekflow/tasks/${editingTaskId}`), payload);
    showToast('Activité mise à jour ✓');
  } else {
    await push(ref(db, 'weekflow/tasks'), payload);
    showToast('Activité ajoutée ✓');
  }
  closeTaskModal();
}

async function deleteTask() {
  if (!editingTaskId) return;
  if (!confirm('Supprimer cette activité ?')) return;
  await remove(ref(db, `weekflow/tasks/${editingTaskId}`));
  showToast('Activité supprimée');
  closeTaskModal();
}

// ============================================================
//  SETTINGS
// ============================================================
function openSettings() {
  document.getElementById('userNameInput').value    = settings.userName || '';
  document.getElementById('fontSelect').value       = settings.font || 'playfair';
  document.getElementById('densitySelect').value    = settings.density || 'comfy';
  document.getElementById('weekStartSelect').value  = settings.weekStart ?? 1;

  document.querySelectorAll('#themeSwatches .swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.theme === settings.theme));
  document.querySelectorAll('#accentSwatches .swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.accent === settings.accent));

  const div = document.getElementById('catColors');
  div.innerHTML = '';
  Object.entries(CAT_LABELS).forEach(([key, label]) => {
    const row = document.createElement('div');
    row.className = 'cat-color-row';
    row.innerHTML = `<label>${label}</label><input type="color" id="catColor-${key}" value="${settings.catColors?.[key] || DEFAULT_SETTINGS.catColors[key]}" />`;
    div.appendChild(row);
  });

  document.getElementById('settingsModal').classList.add('open');
}

async function saveSettings() {
  const catColors = {};
  Object.keys(CAT_LABELS).forEach(key => {
    const inp = document.getElementById(`catColor-${key}`);
    if (inp) catColors[key] = inp.value;
  });
  const newSettings = {
    theme:     document.querySelector('#themeSwatches .swatch.active')?.dataset.theme || 'midnight',
    accent:    document.querySelector('#accentSwatches .swatch.active')?.dataset.accent || 'cyan',
    font:      document.getElementById('fontSelect').value,
    density:   document.getElementById('densitySelect').value,
    weekStart: parseInt(document.getElementById('weekStartSelect').value),
    userName:  document.getElementById('userNameInput').value.trim(),
    catColors
  };
  await set(ref(db, 'weekflow/settings'), newSettings);
  document.getElementById('settingsModal').classList.remove('open');
  showToast('Paramètres sauvegardés ✓');
}

function applySettings() {
  const root = document.documentElement;
  root.setAttribute('data-theme',   settings.theme   || 'midnight');
  root.setAttribute('data-accent',  settings.accent  || 'cyan');
  root.setAttribute('data-font',    settings.font    || 'playfair');
  root.setAttribute('data-density', settings.density || 'comfy');
  if (settings.catColors) {
    Object.entries(settings.catColors).forEach(([k,v]) => root.style.setProperty(`--cat-${k}`, v));
  }
  const now = new Date();
  document.getElementById('dateBadge').textContent =
    now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  if (currentView === 'week') {
    document.getElementById('pageTitle').textContent =
      settings.userName ? `Bonjour ${settings.userName} 👋` : 'Ma semaine';
  }
}

// ============================================================
//  VIEW SWITCHING
// ============================================================
function setView(view) {
  currentView = view;
  const isWeek = view === 'week';

  document.getElementById('weekView').style.display  = isWeek ? '' : 'none';
  document.getElementById('dayView').style.display   = isWeek ? 'none' : '';
  document.getElementById('dayStrip').style.display  = isWeek ? 'none' : '';
  document.getElementById('dayPicker').style.display = isWeek ? 'none' : '';

  // Sidebar buttons
  document.getElementById('sidebarBtnWeek')?.classList.toggle('active', isWeek);
  document.getElementById('sidebarBtnDay')?.classList.toggle('active', !isWeek);
  // Bottom nav buttons
  document.getElementById('btnWeek')?.classList.toggle('active', isWeek);
  document.getElementById('btnDay')?.classList.toggle('active', !isWeek);

  if (isWeek) {
    document.getElementById('pageTitle').textContent =
      settings.userName ? `Bonjour ${settings.userName} 👋` : 'Ma semaine';
    renderWeek();
  } else {
    currentDay = new Date().getDay();
    renderDay(currentDay);
  }
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// ============================================================
//  EVENTS
// ============================================================
function bindEvents() {
  // Sidebar toggle (desktop)
  document.getElementById('sidebarToggle')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('collapsed'));
  document.getElementById('topbarToggle')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('collapsed'));

  // View buttons (sidebar + bottom nav)
  document.getElementById('sidebarBtnWeek')?.addEventListener('click', () => setView('week'));
  document.getElementById('sidebarBtnDay')?.addEventListener('click', () => setView('day'));
  document.getElementById('btnWeek')?.addEventListener('click', () => setView('week'));
  document.getElementById('btnDay')?.addEventListener('click', () => setView('day'));

  // Quick add (FAB + sidebar)
  const openAdd = () => openTaskModal(null, currentView === 'day' ? currentDay : new Date().getDay());
  document.getElementById('quickAddBtn')?.addEventListener('click', openAdd);
  document.getElementById('sidebarQuickAdd')?.addEventListener('click', openAdd);

  // Day pills (sidebar) & day strip (mobile)
  document.querySelectorAll('.day-pill, .dsp').forEach(p => {
    p.addEventListener('click', () => {
      currentDay = parseInt(p.dataset.day);
      renderDay(currentDay);
    });
  });

  // Task modal
  document.getElementById('saveTaskBtn').addEventListener('click', saveTask);
  document.getElementById('cancelTaskBtn').addEventListener('click', closeTaskModal);
  document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('deleteTaskBtn').addEventListener('click', deleteTask);
  document.getElementById('taskModal').addEventListener('click', e => {
    if (e.target === document.getElementById('taskModal')) closeTaskModal();
  });

  // Live duration preview
  document.getElementById('taskTimeStart').addEventListener('input', updateDurationPreview);
  document.getElementById('taskTimeEnd').addEventListener('input', updateDurationPreview);

  // Priority
  document.querySelectorAll('.prio-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.prio-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));

  // Enter to save
  document.getElementById('taskName').addEventListener('keydown', e => { if (e.key === 'Enter') saveTask(); });

  // Settings (sidebar + bottom nav)
  const openSet = () => openSettings();
  document.getElementById('openSettings')?.addEventListener('click', openSet);
  document.getElementById('sidebarSettings')?.addEventListener('click', openSet);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('closeSettings').addEventListener('click', () =>
    document.getElementById('settingsModal').classList.remove('open'));
  document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsModal'))
      document.getElementById('settingsModal').classList.remove('open');
  });

  // Theme / accent swatches (live preview)
  document.querySelectorAll('#themeSwatches .swatch').forEach(s => s.addEventListener('click', () => {
    document.querySelectorAll('#themeSwatches .swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active');
    document.documentElement.setAttribute('data-theme', s.dataset.theme);
  }));
  document.querySelectorAll('#accentSwatches .swatch').forEach(s => s.addEventListener('click', () => {
    document.querySelectorAll('#accentSwatches .swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active');
    document.documentElement.setAttribute('data-accent', s.dataset.accent);
  }));
  document.getElementById('fontSelect').addEventListener('change', e =>
    document.documentElement.setAttribute('data-font', e.target.value));
  document.getElementById('densitySelect').addEventListener('change', e =>
    document.documentElement.setAttribute('data-density', e.target.value));

  // Reset
  document.getElementById('resetDataBtn').addEventListener('click', async () => {
    if (confirm('Supprimer TOUTES les activités ?')) {
      await remove(ref(db, 'weekflow/tasks'));
      document.getElementById('settingsModal').classList.remove('open');
      showToast('Activités réinitialisées');
    }
  });

  // Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTaskModal();
      document.getElementById('settingsModal').classList.remove('open');
    }
  });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  applySettings();
  bindEvents();
  initFirebase();
});
