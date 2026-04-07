// ============================================================
//  WeekFlow — app.js
//  Firebase Realtime Database + full weekly planner logic
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, push, remove, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ---- Firebase init ----
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
//  STATE
// ============================================================
let tasks = {};         // { taskId: { name, day, time, duration, category, note, priority, done } }
let settings = {};
let currentView = 'week';  // 'week' | 'day'
let currentDay = new Date().getDay(); // 0-6
let editingTaskId = null;

const DAY_NAMES = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAY_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const CAT_LABELS = {
  perso:'🏠 Perso', etudes:'📚 Études', netimo:'💼 Nétimo',
  sport:'🏃 Sport', social:'💬 Social', sante:'❤️ Santé',
  loisir:'🎮 Loisir', autre:'📌 Autre'
};
const PRIO_ICON = { high:'🔴', mid:'🟡', low:'🟢' };

const DEFAULT_SETTINGS = {
  theme: 'midnight', accent: 'cyan', font: 'playfair',
  density: 'comfy', weekStart: 1, timeRange: '6-22',
  userName: '',
  catColors: {
    perso:'#60a5fa', etudes:'#a78bfa', netimo:'#34d399',
    sport:'#f97316', social:'#f472b6', sante:'#fb7185',
    loisir:'#fbbf24', autre:'#94a3b8'
  }
};

// ============================================================
//  FIREBASE LISTENERS
// ============================================================
function initFirebase() {
  // Tasks
  onValue(ref(db, 'weekflow/tasks'), snap => {
    tasks = snap.val() || {};
    renderAll();
  });

  // Settings
  onValue(ref(db, 'weekflow/settings'), snap => {
    const saved = snap.val() || {};
    settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!settings.catColors) settings.catColors = DEFAULT_SETTINGS.catColors;
    applySettings();
    renderAll();
  });
}

// ============================================================
//  RENDER
// ============================================================
function renderAll() {
  updateStats();
  updateProgress();
  if (currentView === 'week') renderWeek();
  else renderDay(currentDay);
}

function getWeekOrder() {
  const ws = parseInt(settings.weekStart ?? 1);
  const order = [];
  for (let i = 0; i < 7; i++) order.push((ws + i) % 7);
  return order;
}

function renderWeek() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  const today = new Date().getDay();
  const order = getWeekOrder();

  order.forEach(dayIdx => {
    const dayTasks = getTasksForDay(dayIdx);
    const col = document.createElement('div');
    col.className = 'day-col' + (dayIdx === today ? ' today' : '');

    const count = dayTasks.length;
    col.innerHTML = `
      <div class="day-col-header">
        <span class="day-name">${DAY_NAMES[dayIdx]}</span>
        <span class="day-task-count">${count > 0 ? count + ' tâche' + (count>1?'s':'') : ''}</span>
      </div>
      <div class="day-col-body" id="col-${dayIdx}"></div>
    `;
    grid.appendChild(col);

    const body = col.querySelector(`#col-${dayIdx}`);
    if (dayTasks.length === 0) {
      body.innerHTML = `<div class="empty-col">Aucune tâche</div>`;
    } else {
      dayTasks.forEach(([id, task]) => {
        body.appendChild(buildTaskCard(id, task, 'week'));
      });
    }
    // Add inline button
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

  // Update day pills highlight
  document.querySelectorAll('.day-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.day) === dayIdx);
  });

  // Update page title
  document.getElementById('pageTitle').textContent =
    settings.userName ? `Bonjour ${settings.userName} 👋` : DAY_NAMES[dayIdx];

  container.innerHTML = `
    <div class="day-view-header">
      <h2>${DAY_NAMES[dayIdx]}</h2>
      <div class="day-date">${dayIdx === today ? "Aujourd'hui · " : ''}Semaine type</div>
    </div>
    <div class="day-tasks-list" id="dayTasksList"></div>
    <button class="day-add-btn" id="dayAddBtn">
      <span style="font-size:20px;color:var(--accent)">+</span>
      Ajouter une tâche pour ${DAY_NAMES[dayIdx]}
    </button>
  `;

  const list = document.getElementById('dayTasksList');
  if (dayTasks.length === 0) {
    list.innerHTML = `<div class="empty-col" style="padding:32px;font-size:13px">Aucune tâche ce jour — profites-en ! 🌿</div>`;
  } else {
    dayTasks.forEach(([id, task]) => list.appendChild(buildTaskCard(id, task, 'day')));
  }
  document.getElementById('dayAddBtn').addEventListener('click', () => openTaskModal(null, dayIdx));
}

function buildTaskCard(id, task, mode) {
  const card = document.createElement('div');
  card.className = `task-card cat-${task.category || 'autre'}${task.done ? ' done' : ''}`;
  card.dataset.id = id;

  // Apply custom cat color if set
  const catColor = settings.catColors?.[task.category];
  if (catColor) card.style.setProperty('--cat-color', catColor);

  const prioIcon = PRIO_ICON[task.priority] || '';
  const durationTxt = task.duration ? `${task.duration}min` : '';

  card.innerHTML = `
    <div class="task-card-inner">
      <div class="task-check" data-id="${id}"></div>
      <div class="task-info">
        <div class="task-name">${escHtml(task.name || 'Sans titre')}</div>
        <div class="task-meta">
          ${task.time ? `<span class="task-time">⏰ ${task.time}${durationTxt ? ' · '+durationTxt : ''}</span>` : ''}
          <span class="task-cat" style="background:${catColorBg(task.category)};color:${catColorFg(task.category)}">${CAT_LABELS[task.category] || task.category}</span>
          ${task.priority && task.priority !== 'mid' ? `<span class="task-prio">${prioIcon}</span>` : ''}
        </div>
        ${task.note ? `<div class="task-note">${escHtml(task.note)}</div>` : ''}
      </div>
    </div>
  `;

  // Toggle done
  card.querySelector('.task-check').addEventListener('click', e => {
    e.stopPropagation();
    toggleDone(id, task);
  });

  // Open edit
  card.addEventListener('click', () => openTaskModal(id, task.day));

  return card;
}

// ============================================================
//  HELPERS
// ============================================================
function getTasksForDay(dayIdx) {
  return Object.entries(tasks)
    .filter(([,t]) => parseInt(t.day) === dayIdx)
    .sort((a,b) => (a[1].time||'').localeCompare(b[1].time||''));
}

function catColorBg(cat) {
  const c = settings.catColors?.[cat] || DEFAULT_SETTINGS.catColors[cat] || '#94a3b8';
  return hexToRgba(c, 0.18);
}
function catColorFg(cat) {
  return settings.catColors?.[cat] || DEFAULT_SETTINGS.catColors[cat] || '#94a3b8';
}
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateStats() {
  const all = Object.values(tasks);
  const done = all.filter(t => t.done).length;
  document.getElementById('statTotal').textContent = all.length;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statLeft').textContent = all.length - done;
}
function updateProgress() {
  const all = Object.values(tasks);
  const pct = all.length ? Math.round(Object.values(tasks).filter(t=>t.done).length / all.length * 100) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = pct + '%';
}

// ============================================================
//  TASK MODAL
// ============================================================
function openTaskModal(taskId, dayHint) {
  editingTaskId = taskId;
  const modal = document.getElementById('taskModal');
  const task = taskId ? tasks[taskId] : null;

  document.getElementById('modalTitle').textContent = task ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('taskName').value = task?.name || '';
  document.getElementById('taskDay').value = task ? task.day : (dayHint ?? new Date().getDay());
  document.getElementById('taskTime').value = task?.time || '09:00';
  document.getElementById('taskDuration').value = task?.duration || 30;
  document.getElementById('taskCategory').value = task?.category || 'perso';
  document.getElementById('taskNote').value = task?.note || '';

  // Priority
  document.querySelectorAll('.prio-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.prio === (task?.priority || 'mid'));
  });

  document.getElementById('deleteTaskBtn').style.display = task ? 'inline-flex' : 'none';
  modal.classList.add('open');
  document.getElementById('taskName').focus();
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('open');
  editingTaskId = null;
}

async function saveTask() {
  const name = document.getElementById('taskName').value.trim();
  if (!name) { showToast('Ajoute un titre !'); return; }

  const prio = document.querySelector('.prio-btn.active')?.dataset.prio || 'mid';
  const payload = {
    name,
    day: parseInt(document.getElementById('taskDay').value),
    time: document.getElementById('taskTime').value,
    duration: parseInt(document.getElementById('taskDuration').value) || 30,
    category: document.getElementById('taskCategory').value,
    note: document.getElementById('taskNote').value.trim(),
    priority: prio,
    done: editingTaskId ? (tasks[editingTaskId]?.done || false) : false,
  };

  if (editingTaskId) {
    await update(ref(db, `weekflow/tasks/${editingTaskId}`), payload);
    showToast('Tâche mise à jour ✓');
  } else {
    await push(ref(db, 'weekflow/tasks'), payload);
    showToast('Tâche ajoutée ✓');
  }
  closeTaskModal();
}

async function deleteTask() {
  if (!editingTaskId) return;
  if (!confirm('Supprimer cette tâche ?')) return;
  await remove(ref(db, `weekflow/tasks/${editingTaskId}`));
  showToast('Tâche supprimée');
  closeTaskModal();
}

async function toggleDone(id, task) {
  await update(ref(db, `weekflow/tasks/${id}`), { done: !task.done });
}

// ============================================================
//  SETTINGS
// ============================================================
function openSettings() {
  // Populate form
  document.getElementById('userNameInput').value = settings.userName || '';
  document.getElementById('fontSelect').value = settings.font || 'playfair';
  document.getElementById('densitySelect').value = settings.density || 'comfy';
  document.getElementById('weekStartSelect').value = settings.weekStart ?? 1;
  document.getElementById('timeRangeSelect').value = settings.timeRange || '6-22';

  // Theme / accent swatches
  document.querySelectorAll('#themeSwatches .swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === settings.theme);
  });
  document.querySelectorAll('#accentSwatches .swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === settings.accent);
  });

  // Cat colors
  const catColorsDiv = document.getElementById('catColors');
  catColorsDiv.innerHTML = '';
  Object.entries(CAT_LABELS).forEach(([key, label]) => {
    const row = document.createElement('div');
    row.className = 'cat-color-row';
    row.innerHTML = `
      <label>${label}</label>
      <input type="color" id="catColor-${key}" value="${settings.catColors?.[key] || DEFAULT_SETTINGS.catColors[key]}" />
    `;
    catColorsDiv.appendChild(row);
  });

  document.getElementById('settingsModal').classList.add('open');
}

async function saveSettings() {
  const catColors = {};
  Object.keys(CAT_LABELS).forEach(key => {
    const inp = document.getElementById(`catColor-${key}`);
    if (inp) catColors[key] = inp.value;
  });

  const activeTheme = document.querySelector('#themeSwatches .swatch.active')?.dataset.theme || 'midnight';
  const activeAccent = document.querySelector('#accentSwatches .swatch.active')?.dataset.accent || 'cyan';

  const newSettings = {
    theme: activeTheme,
    accent: activeAccent,
    font: document.getElementById('fontSelect').value,
    density: document.getElementById('densitySelect').value,
    weekStart: parseInt(document.getElementById('weekStartSelect').value),
    timeRange: document.getElementById('timeRangeSelect').value,
    userName: document.getElementById('userNameInput').value.trim(),
    catColors
  };

  await set(ref(db, 'weekflow/settings'), newSettings);
  document.getElementById('settingsModal').classList.remove('open');
  showToast('Paramètres sauvegardés ✓');
}

function applySettings() {
  const root = document.documentElement;
  root.setAttribute('data-theme', settings.theme || 'midnight');
  root.setAttribute('data-accent', settings.accent || 'cyan');
  root.setAttribute('data-font', settings.font || 'playfair');
  root.setAttribute('data-density', settings.density || 'comfy');

  // Apply custom cat colors to CSS vars
  if (settings.catColors) {
    Object.entries(settings.catColors).forEach(([key, val]) => {
      root.style.setProperty(`--cat-${key}`, val);
    });
  }

  // Date badge
  const now = new Date();
  document.getElementById('dateBadge').textContent =
    now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });

  // Page title
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
  const weekView = document.getElementById('weekView');
  const dayView = document.getElementById('dayView');
  const dayPicker = document.getElementById('dayPicker');

  document.getElementById('btnWeek').classList.toggle('active', view === 'week');
  document.getElementById('btnDay').classList.toggle('active', view === 'day');

  if (view === 'week') {
    weekView.style.display = '';
    dayView.style.display = 'none';
    dayPicker.style.display = 'none';
    document.getElementById('pageTitle').textContent =
      settings.userName ? `Bonjour ${settings.userName} 👋` : 'Ma semaine';
    renderWeek();
  } else {
    weekView.style.display = 'none';
    dayView.style.display = '';
    dayPicker.style.display = '';
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
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
function bindEvents() {
  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
  document.getElementById('topbarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // View buttons
  document.getElementById('btnWeek').addEventListener('click', () => setView('week'));
  document.getElementById('btnDay').addEventListener('click', () => setView('day'));

  // Day pills
  document.querySelectorAll('.day-pill').forEach(p => {
    p.addEventListener('click', () => {
      currentDay = parseInt(p.dataset.day);
      renderDay(currentDay);
    });
  });

  // Quick add
  document.getElementById('quickAddBtn').addEventListener('click', () => openTaskModal(null, new Date().getDay()));

  // Task modal
  document.getElementById('saveTaskBtn').addEventListener('click', saveTask);
  document.getElementById('cancelTaskBtn').addEventListener('click', closeTaskModal);
  document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('deleteTaskBtn').addEventListener('click', deleteTask);

  // Priority selector
  document.querySelectorAll('.prio-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.prio-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  // Close modal on backdrop click
  document.getElementById('taskModal').addEventListener('click', e => {
    if (e.target === document.getElementById('taskModal')) closeTaskModal();
  });

  // Settings
  document.getElementById('openSettings').addEventListener('click', openSettings);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('open');
  });
  document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsModal'))
      document.getElementById('settingsModal').classList.remove('open');
  });

  // Theme swatches
  document.querySelectorAll('#themeSwatches .swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('#themeSwatches .swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      document.documentElement.setAttribute('data-theme', s.dataset.theme);
    });
  });

  // Accent swatches
  document.querySelectorAll('#accentSwatches .swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('#accentSwatches .swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      document.documentElement.setAttribute('data-accent', s.dataset.accent);
    });
  });

  // Live preview: font / density
  document.getElementById('fontSelect').addEventListener('change', e => {
    document.documentElement.setAttribute('data-font', e.target.value);
  });
  document.getElementById('densitySelect').addEventListener('change', e => {
    document.documentElement.setAttribute('data-density', e.target.value);
  });

  // Reset data
  document.getElementById('resetDataBtn').addEventListener('click', async () => {
    if (confirm('Supprimer TOUTES les tâches ? Cette action est irréversible.')) {
      await remove(ref(db, 'weekflow/tasks'));
      document.getElementById('settingsModal').classList.remove('open');
      showToast('Toutes les tâches supprimées');
    }
  });

  // Enter key in task name
  document.getElementById('taskName').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveTask();
  });

  // Keyboard shortcut: Escape
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
  settings = Object.assign({}, DEFAULT_SETTINGS);
  applySettings();
  bindEvents();
  initFirebase();
});
