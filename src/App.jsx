import React, { useState, useEffect, useMemo, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { db, auth, googleProvider } from "./firebase";
import {
  Search, Plus, Star, Link2, Calendar, Circle, Clock, CheckCheck,
  Trash2, Pencil, X, Check, BookOpen, Menu, AlertCircle, LogOut,
  FileText, Paperclip, Bell, Sun, Moon, TrendingUp, ChevronLeft, ChevronRight, LayoutList
} from "lucide-react";

// Сжимает выбранное фото и превращает в data URL, чтобы хранить
// прямо в Firestore без платного Firebase Storage.
function compressImageFile(file, maxWidth = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error("image failed"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 35.2 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.9 39.7 16.4 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.5l6.6 5.4C40.9 36.5 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

const STATUSES = [
  { id: "not_started", label: "Не начато", color: "var(--grey)", Icon: Circle },
  { id: "in_progress", label: "В процессе", color: "var(--accent)", Icon: Clock },
  { id: "done", label: "Сделано", color: "var(--green)", Icon: Check },
  { id: "submitted", label: "Сдано", color: "var(--blue)", Icon: CheckCheck },
];

const SUBJECT_COLORS = ["#e0a458", "#6fae8c", "#7195c9", "#c07d92", "#8f8fc2", "#5fa8a0", "#c98f5f"];
const SUBJECT_ICONS = ["📘", "📐", "🧪", "🎨", "🌍", "💻", "🎵", "🏃", "📖", "🔬", "✏️", "🗣️"];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function statusOf(id) {
  return STATUSES.find((s) => s.id === id) || STATUSES[0];
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

// Строит сетку дней месяца (с понедельника), для календаря
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // 0 = понедельник
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("hw-theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("hw-theme", theme);
    } catch (e) {}
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const themeVars = getThemeVars(theme);

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [query, setQuery] = useState("");
  const [activeSubject, setActiveSubject] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deadlineBanner, setDeadlineBanner] = useState([]);
  const notifiedRef = useRef(false);

  const [undoTask, setUndoTask] = useState(null);
  const undoTimerRef = useRef(null);

  const [viewMode, setViewMode] = useState("list"); // 'list' | 'calendar'
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showStats, setShowStats] = useState(false);

  const firstLoad = useRef(true);
  const saveTimer = useRef(null);

  // Следим за состоянием входа
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      // при смене пользователя (вход/выход) сбрасываем локальные данные
      // и разрешаем заново загрузить их для нового аккаунта
      firstLoad.current = true;
      setLoaded(false);
      setSubjects([]);
      setTasks([]);
    });
    return () => unsub();
  }, []);

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError("Не удалось войти — попробуйте ещё раз");
    }
  }
  function handleSignOut() {
    signOut(auth);
  }

  // Загрузка личных данных пользователя из Firestore
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "homework-users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setSubjects(data.subjects || []);
          setTasks(data.tasks || []);
        }
      } catch (e) {
        setSaveError("Не удалось загрузить данные — проверьте ключи Firebase и правила доступа");
      } finally {
        setLoaded(true);
      }
    })();
  }, [user]);

  // Сохранение в Firestore при любом изменении (с небольшой задержкой,
  // чтобы не писать в базу на каждую букву при вводе текста)
  useEffect(() => {
    if (!loaded || !user) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, "homework-users", user.uid), { subjects, tasks }, { merge: true });
        setSaveError(null);
      } catch (e) {
        setSaveError("Не удалось сохранить изменения");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [subjects, tasks, loaded, user]);

  // Проверяем задания с приближающимся дедлайном и, если можно, показываем
  // системное уведомление браузера (один раз за сеанс)
  useEffect(() => {
    if (!loaded || notifiedRef.current) return;
    notifiedRef.current = true;
    const soonTasks = tasks.filter((t) => {
      if (t.status === "submitted" || !t.deadline) return false;
      const d = daysUntil(t.deadline);
      return d !== null && d >= 0 && d <= 2;
    });
    if (soonTasks.length === 0) return;
    setDeadlineBanner(soonTasks);
    if (typeof Notification !== "undefined") {
      const notify = () => {
        const titles = soonTasks.slice(0, 3).map((t) => t.title).join(", ");
        new Notification("Скоро дедлайн", {
          body: soonTasks.length > 3 ? `${titles} и ещё ${soonTasks.length - 3}` : titles,
        });
      };
      if (Notification.permission === "granted") {
        notify();
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") notify();
        });
      }
    }
  }, [loaded, tasks]);

  const filteredSubjects = useMemo(() => {
    if (!query.trim()) return subjects;
    const q = query.trim().toLowerCase();
    return subjects.filter((s) => s.name.toLowerCase().includes(q));
  }, [subjects, query]);

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (activeSubject === "favorites") {
      list = list.filter((t) => t.favorite);
    } else if (activeSubject === "today") {
      const t0 = todayStr();
      list = list.filter((t) => t.deadline && t.deadline <= t0 && t.status !== "submitted");
    } else if (activeSubject !== "all") {
      list = list.filter((t) => t.subjectId === activeSubject);
    }
    if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (query.trim() && activeSubject === "all") {
      const q = query.trim().toLowerCase();
      const subjIds = new Set(subjects.filter((s) => s.name.toLowerCase().includes(q)).map((s) => s.id));
      list = list.filter(
        (t) => subjIds.has(t.subjectId) || t.title.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  }, [tasks, activeSubject, statusFilter, query, subjects]);

  function addSubject(name, color, icon) {
    setSubjects((s) => [...s, { id: uid(), name, color, icon: icon || "" }]);
  }
  function deleteSubject(id) {
    setSubjects((s) => s.filter((x) => x.id !== id));
    setTasks((t) => t.filter((x) => x.subjectId !== id));
    if (activeSubject === id) setActiveSubject("all");
  }
  function saveTask(task) {
    setTasks((t) => {
      const exists = t.some((x) => x.id === task.id);
      return exists ? t.map((x) => (x.id === task.id ? task : x)) : [...t, task];
    });
  }
  function deleteTaskWithUndo(task) {
    setTasks((t) => t.filter((x) => x.id !== task.id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoTask(task);
    undoTimerRef.current = setTimeout(() => setUndoTask(null), 5000);
  }
  function undoDelete() {
    if (!undoTask) return;
    setTasks((t) => [...t, undoTask]);
    clearTimeout(undoTimerRef.current);
    setUndoTask(null);
  }
  function toggleFavorite(id) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)));
  }
  function setTaskStatus(id, status) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, status } : x)));
  }
  function dismissDeadlineBanner() {
    setDeadlineBanner([]);
  }

  const taskCount = (subjectId) => tasks.filter((t) => t.subjectId === subjectId).length;

  const stats = useMemo(() => {
    const isDone = (t) => t.status === "done" || t.status === "submitted";
    const total = tasks.length;
    const done = tasks.filter(isDone).length;

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = toDateStr(weekAgo);
    const todayS = todayStr();
    const weekTasks = tasks.filter((t) => t.deadline && t.deadline >= weekAgoStr && t.deadline <= todayS);
    const weekDone = weekTasks.filter(isDone).length;

    const bySubject = subjects.map((s) => {
      const list = tasks.filter((t) => t.subjectId === s.id);
      const d = list.filter(isDone).length;
      return { subject: s, total: list.length, done: d };
    });

    return { total, done, weekTotal: weekTasks.length, weekDone, bySubject };
  }, [tasks, subjects]);

  if (!authChecked) {
    return (
      <div style={{ ...themeVars, background: "var(--bg)", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: SANS }}>
        <style>{CSS}</style>
        Загружаю…
      </div>
    );
  }

  if (!user) {
    return (
      <div style={themeVars} className="login-screen">
        <style>{CSS}</style>
        <button className="theme-toggle-btn" onClick={toggleTheme} title="Сменить тему">
          {theme === "dark" ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
        </button>
        <div className="login-card">
          <BookOpen size={30} strokeWidth={1.5} />
          <h1>Дневник заданий</h1>
          <p>Личный список домашних заданий — виден только вам, пока вы не поделитесь входом сами.</p>
          <button className="google-btn" onClick={handleSignIn}>
            <GoogleIcon /> Войти через Google
          </button>
          {authError && (
            <div className="save-error" style={{ marginTop: 12 }}>
              <AlertCircle size={14} strokeWidth={1.75} /> {authError}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ ...themeVars, background: "var(--bg)", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: SANS }}>
        <style>{CSS}</style>
        Загружаю данные…
      </div>
    );
  }

  return (
    <div className="app" style={themeVars}>
      <style>{CSS}</style>
      <button className="theme-toggle-btn" onClick={toggleTheme} title="Сменить тему">
        {theme === "dark" ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>

      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
        <div className="brand">
          <BookOpen size={18} strokeWidth={1.75} />
          <span>Дневник</span>
        </div>

        <div className="search-box">
          <Search size={15} strokeWidth={1.75} />
          <input
            placeholder="Найти предмет или задачу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <nav className="nav-list">
          <button
            className={"nav-item" + (activeSubject === "all" ? " active" : "")}
            onClick={() => setActiveSubject("all")}
          >
            <span className="dot all-dot" />
            Все предметы
            <span className="count">{tasks.length}</span>
          </button>
          <button
            className={"nav-item" + (activeSubject === "today" ? " active" : "")}
            onClick={() => setActiveSubject("today")}
          >
            <Bell size={13} strokeWidth={1.75} className="star-icon" />
            Сегодня
            <span className="count">
              {tasks.filter((t) => t.deadline && t.deadline <= todayStr() && t.status !== "submitted").length}
            </span>
          </button>
          <button
            className={"nav-item" + (activeSubject === "favorites" ? " active" : "")}
            onClick={() => setActiveSubject("favorites")}
          >
            <Star size={13} strokeWidth={1.75} className="star-icon" />
            Избранное
            <span className="count">{tasks.filter((t) => t.favorite).length}</span>
          </button>
        </nav>

        <div className="section-label">Предметы</div>
        <div className="subject-list">
          {filteredSubjects.map((s) => (
            <button
              key={s.id}
              className={"nav-item" + (activeSubject === s.id ? " active" : "")}
              onClick={() => setActiveSubject(s.id)}
            >
              {s.icon ? (
                <span className="subject-emoji">{s.icon}</span>
              ) : (
                <span className="dot" style={{ background: s.color }} />
              )}
              <span className="subject-name">{s.name}</span>
              <span className="count">{taskCount(s.id)}</span>
              <span
                className="row-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete({ type: "subject", id: s.id, name: s.name });
                }}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </span>
            </button>
          ))}
          {filteredSubjects.length === 0 && (
            <div className="empty-hint">Ничего не найдено</div>
          )}
        </div>

        <button className="add-subject-btn" onClick={() => setShowSubjectForm(true)}>
          <Plus size={15} strokeWidth={1.75} />
          Добавить предмет
        </button>

        <button className="add-subject-btn" onClick={() => setShowStats(true)}>
          <TrendingUp size={15} strokeWidth={1.75} />
          Статистика
        </button>

        <div className="user-row">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="user-avatar" />
          ) : (
            <div className="user-avatar user-avatar-fallback">{(user.displayName || user.email || "?")[0]}</div>
          )}
          <span className="user-name">{user.displayName || user.email}</span>
          <button className="icon-btn" onClick={handleSignOut} title="Выйти">
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} strokeWidth={1.75} />
          </button>
          <h1>
            {activeSubject === "all"
              ? "Все задания"
              : activeSubject === "today"
              ? "Сегодня"
              : activeSubject === "favorites"
              ? "Избранное"
              : subjects.find((s) => s.id === activeSubject)?.name || "Задания"}
          </h1>
          <button
            className="view-toggle-btn"
            onClick={() => setViewMode((v) => (v === "list" ? "calendar" : "list"))}
            title={viewMode === "list" ? "Показать календарь" : "Показать список"}
          >
            {viewMode === "list" ? <Calendar size={16} strokeWidth={1.75} /> : <LayoutList size={16} strokeWidth={1.75} />}
          </button>
          <button
            className="primary-btn"
            onClick={() =>
              setEditingTask({
                id: uid(),
                subjectId: activeSubject !== "all" && activeSubject !== "favorites" && activeSubject !== "today" ? activeSubject : subjects[0]?.id || "",
                title: "",
                description: "",
                deadline: viewMode === "calendar" ? selectedDate : "",
                status: "not_started",
                favorite: false,
                attachments: [],
              })
            }
            disabled={subjects.length === 0}
          >
            <Plus size={16} strokeWidth={2} />
            Новое задание
          </button>
        </header>

        {deadlineBanner.length > 0 && (
          <div className="deadline-banner">
            <Bell size={15} strokeWidth={1.75} />
            <span>
              Скоро дедлайн: {deadlineBanner.slice(0, 3).map((t) => t.title).join(", ")}
              {deadlineBanner.length > 3 && ` и ещё ${deadlineBanner.length - 3}`}
            </span>
            <button className="icon-btn" onClick={dismissDeadlineBanner}>
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}

        {saveError && (
          <div className="save-error">
            <AlertCircle size={14} strokeWidth={1.75} /> {saveError}
          </div>
        )}

        {viewMode === "calendar" ? (
          <CalendarView
            cursor={calendarCursor}
            setCursor={setCalendarCursor}
            tasks={tasks}
            subjects={subjects}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onOpenTask={setViewingTask}
            onToggleFavorite={toggleFavorite}
            onCycleStatus={(t) => {
              const i = STATUSES.findIndex((s) => s.id === t.status);
              setTaskStatus(t.id, STATUSES[(i + 1) % STATUSES.length].id);
            }}
            onEdit={setEditingTask}
            onDelete={deleteTaskWithUndo}
            onPreviewImage={setPreviewImage}
          />
        ) : (
          <>
            <div className="filter-row">
              {["all", ...STATUSES.map((s) => s.id)].map((f) => (
                <button
                  key={f}
                  className={"chip" + (statusFilter === f ? " chip-active" : "")}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === "all" ? "Все статусы" : statusOf(f).label}
                </button>
              ))}
            </div>

            <div className="task-list">
              {subjects.length === 0 && (
                <div className="empty-state">
                  <BookOpen size={28} strokeWidth={1.25} />
                  <p>Сначала добавьте предмет слева — тогда можно будет завести первое задание.</p>
                </div>
              )}

              {subjects.length > 0 && visibleTasks.length === 0 && (
                <div className="empty-state">
                  <p>Заданий здесь пока нет.</p>
                </div>
              )}

              {visibleTasks.map((t, idx) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  subject={subjects.find((s) => s.id === t.subjectId)}
                  delay={Math.min(idx, 8) * 35}
                  onOpen={() => setViewingTask(t)}
                  onToggleFavorite={() => toggleFavorite(t.id)}
                  onCycleStatus={() => {
                    const i = STATUSES.findIndex((s) => s.id === t.status);
                    setTaskStatus(t.id, STATUSES[(i + 1) % STATUSES.length].id);
                  }}
                  onEdit={() => setEditingTask(t)}
                  onDelete={() => deleteTaskWithUndo(t)}
                  onPreviewImage={setPreviewImage}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {showSubjectForm && (
        <SubjectForm
          onClose={() => setShowSubjectForm(false)}
          onSave={(name, color, icon) => {
            addSubject(name, color, icon);
            setShowSubjectForm(false);
          }}
        />
      )}

      {viewingTask && (
        <TaskDetail
          task={tasks.find((t) => t.id === viewingTask.id) || viewingTask}
          subject={subjects.find((s) => s.id === viewingTask.subjectId)}
          onClose={() => setViewingTask(null)}
          onEdit={() => {
            setEditingTask(viewingTask);
            setViewingTask(null);
          }}
          onStatusChange={(status) => setTaskStatus(viewingTask.id, status)}
          onPreviewImage={setPreviewImage}
        />
      )}

      {previewImage && (
        <div className="lightbox-scrim" onClick={() => setPreviewImage(null)}>
          <button className="lightbox-close" onClick={() => setPreviewImage(null)}>
            <X size={20} strokeWidth={2} />
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.label || ""}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          {previewImage.label && <div className="lightbox-caption">{previewImage.label}</div>}
        </div>
      )}

      {editingTask && (
        <TaskForm
          task={editingTask}
          subjects={subjects}
          onClose={() => setEditingTask(null)}
          onSave={(t) => {
            saveTask(t);
            setEditingTask(null);
          }}
        />
      )}

      {confirmDelete && (
        <div className="modal-scrim" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <p>{`Удалить предмет «${confirmDelete.name}» вместе со всеми его заданиями?`}</p>
            <div className="confirm-actions">
              <button className="ghost-btn" onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                className="danger-btn"
                onClick={() => {
                  deleteSubject(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
      {showStats && <StatsModal stats={stats} onClose={() => setShowStats(false)} />}

      {undoTask && (
        <div className="undo-toast">
          <span>Удалено: «{undoTask.title}»</span>
          <button className="undo-btn" onClick={undoDelete}>Отменить</button>
          <button className="icon-btn" onClick={() => { clearTimeout(undoTimerRef.current); setUndoTask(null); }}>
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}

function SubjectForm({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [icon, setIcon] = useState("");
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Новый предмет</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <label className="field-label">Название</label>
        <input
          className="text-input"
          autoFocus
          placeholder="Например, Алгебра"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="field-label">Цвет метки</label>
        <div className="color-row">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c}
              className={"color-swatch" + (color === c ? " selected" : "")}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <label className="field-label">Значок (необязательно)</label>
        <div className="icon-row">
          <button
            className={"icon-swatch" + (icon === "" ? " selected" : "")}
            onClick={() => setIcon("")}
            title="Без значка"
          >
            <span className="dot" style={{ background: color }} />
          </button>
          {SUBJECT_ICONS.map((e) => (
            <button
              key={e}
              className={"icon-swatch" + (icon === e ? " selected" : "")}
              onClick={() => setIcon(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="primary-btn"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), color, icon)}
          >
            <Check size={15} strokeWidth={2} /> Создать
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task: t, subject: subj, delay, onOpen, onToggleFavorite, onCycleStatus, onEdit, onDelete, onPreviewImage }) {
  const dLeft = daysUntil(t.deadline);
  const overdue = dLeft !== null && dLeft < 0 && t.status !== "submitted";
  const soon = dLeft !== null && dLeft >= 0 && dLeft <= 2 && t.status !== "submitted";
  const st = statusOf(t.status);
  return (
    <div
      className={"task-card" + (overdue ? " overdue" : "")}
      style={{ animationDelay: `${delay || 0}ms` }}
      onClick={onOpen}
    >
      <div className="task-top">
        <span className="subject-chip" style={{ "--c": subj?.color || "#888" }}>
          {subj?.icon ? `${subj.icon} ` : ""}{subj?.name || "Без предмета"}
        </span>
        <button className="star-btn" onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
          <Star
            size={16}
            strokeWidth={1.75}
            fill={t.favorite ? "var(--accent)" : "none"}
            color={t.favorite ? "var(--accent)" : "var(--text-faint)"}
          />
        </button>
      </div>

      <h3 className="task-title">{t.title}</h3>
      {t.description && <p className="task-desc">{t.description}</p>}

      {t.attachments?.length > 0 && (
        <div className="attachments">
          {t.attachments.map((a) =>
            a.type === "image" ? (
              <button
                key={a.id}
                type="button"
                className="attachment-chip"
                title={a.label || "Фото"}
                onClick={(e) => { e.stopPropagation(); onPreviewImage(a); }}
              >
                <img src={a.url} alt="" className="attachment-thumb" />
                {a.label || "Фото"}
              </button>
            ) : (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                download={a.type === "file" ? (a.label || "файл") : undefined}
                className="attachment-chip"
                title={a.label || (a.type === "link" ? a.url : "")}
                onClick={(e) => e.stopPropagation()}
              >
                {a.type === "file" ? (
                  <FileText size={12} strokeWidth={1.75} />
                ) : (
                  <Link2 size={12} strokeWidth={1.75} />
                )}
                {a.label || (a.type === "file" ? "Файл" : "Ссылка")}
              </a>
            )
          )}
        </div>
      )}

      <div className="task-bottom">
        <button
          className="status-cycle"
          style={{ "--sc": st.color }}
          title={`Статус: ${st.label} (нажмите, чтобы изменить)`}
          onClick={(e) => { e.stopPropagation(); onCycleStatus(); }}
        >
          <st.Icon size={12} strokeWidth={2.25} />
          {st.label}
        </button>
        {t.deadline && (
          <span className={"deadline" + (overdue ? " deadline-over" : soon ? " deadline-soon" : "")}>
            <Calendar size={12} strokeWidth={1.75} />
            {formatDate(t.deadline)}
            {overdue && " · просрочено"}
            {soon && !overdue && dLeft === 0 && " · сегодня"}
            {soon && !overdue && dLeft === 1 && " · завтра"}
          </span>
        )}
        <span className="spacer" />
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <Pencil size={14} strokeWidth={1.75} />
        </button>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function TaskDetail({ task, subject, onClose, onEdit, onStatusChange, onPreviewImage }) {
  const st = statusOf(task.status);
  const images = (task.attachments || []).filter((a) => a.type === "image");
  const files = (task.attachments || []).filter((a) => a.type !== "image");
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="subject-chip" style={{ "--c": subject?.color || "#888" }}>
            {subject?.icon ? `${subject.icon} ` : ""}{subject?.name || "Без предмета"}
          </span>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <h2 className="detail-title">{task.title}</h2>

        <div className="status-row" style={{ margin: "4px 0 16px" }}>
          {STATUSES.map((s) => (
            <button
              key={s.id}
              className={"status-dot status-dot-lg" + (task.status === s.id ? " status-dot-active" : "")}
              style={{ "--sc": s.color }}
              title={s.label}
              onClick={() => onStatusChange(s.id)}
            >
              <s.Icon size={13} strokeWidth={2.25} />
            </button>
          ))}
          <span className="detail-status-label">{st.label}</span>
        </div>

        {task.deadline && (
          <div className="detail-deadline">
            <Calendar size={13} strokeWidth={1.75} /> Срок: {formatDate(task.deadline)}
          </div>
        )}

        {task.description && <p className="detail-desc">{task.description}</p>}

        {images.length > 0 && (
          <>
            <label className="field-label">Фото</label>
            <div className="detail-gallery">
              {images.map((a) => (
                <button key={a.id} type="button" className="detail-photo" onClick={() => onPreviewImage(a)}>
                  <img src={a.url} alt={a.label || ""} />
                </button>
              ))}
            </div>
          </>
        )}

        {files.length > 0 && (
          <>
            <label className="field-label">Файлы и ссылки</label>
            <div className="detail-files">
              {files.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  download={a.type === "file" ? (a.label || "файл") : undefined}
                  className="detail-file-row"
                >
                  {a.type === "file" ? <FileText size={15} strokeWidth={1.75} /> : <Link2 size={15} strokeWidth={1.75} />}
                  <span>{a.label || (a.type === "file" ? "Файл" : a.url)}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {!task.description && images.length === 0 && files.length === 0 && (
          <p className="detail-desc" style={{ color: "var(--text-faint)" }}>
            Подробностей и вложений пока нет.
          </p>
        )}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            Закрыть
          </button>
          <button className="primary-btn" onClick={onEdit}>
            <Pencil size={14} strokeWidth={2} /> Редактировать
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskForm({ task, subjects, onClose, onSave }) {
  const [form, setForm] = useState(task);
  const [attType, setAttType] = useState("file");
  const [attUrl, setAttUrl] = useState("");
  const [attLabel, setAttLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function addAttachment() {
    if (!attUrl.trim()) return;
    set("attachments", [
      ...(form.attachments || []),
      { id: uid(), type: "link", url: attUrl.trim(), label: attLabel.trim() },
    ]);
    setAttUrl("");
    setAttLabel("");
  }

  const MAX_FILE_BYTES = 700 * 1024; // с запасом под лимит документа Firestore в 1 МБ

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы можно было выбрать тот же файл ещё раз
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await compressImageFile(file);
        set("attachments", [
          ...(form.attachments || []),
          { id: uid(), type: "image", url: dataUrl, label: attLabel.trim() || file.name },
        ]);
      } else {
        if (file.size > MAX_FILE_BYTES) {
          setUploadError(`Файл слишком большой (${Math.round(file.size / 1024)} КБ) — попробуйте до ~700 КБ`);
          setUploading(false);
          return;
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
        set("attachments", [
          ...(form.attachments || []),
          { id: uid(), type: "file", url: dataUrl, label: attLabel.trim() || file.name },
        ]);
      }
      setAttLabel("");
    } catch (err) {
      setUploadError("Не получилось прикрепить файл — попробуйте другой");
    } finally {
      setUploading(false);
    }
  }
  function removeAttachment(id) {
    set("attachments", form.attachments.filter((a) => a.id !== id));
  }

  const isNew = !task.title && task.attachments?.length === 0;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{isNew ? "Новое задание" : "Изменить задание"}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <label className="field-label">Предмет</label>
        <select className="text-input" value={form.subjectId} onChange={(e) => set("subjectId", e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="field-label">Что задали</label>
        <input
          className="text-input"
          autoFocus
          placeholder="Например, §12, упражнения 4–9"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />

        <label className="field-label">Подробности (необязательно)</label>
        <textarea
          className="text-input textarea"
          rows={3}
          placeholder="Детали задания, что взять с собой и т.д."
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />

        <div className="form-row">
          <div>
            <label className="field-label">Дедлайн</label>
            <input
              type="date"
              className="text-input"
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Статус</label>
            <select className="text-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="field-label">Вложения (файлы, фото или ссылки)</label>
        {form.attachments?.length > 0 && (
          <div className="attachments" style={{ marginBottom: 8 }}>
            {form.attachments.map((a) => (
              <span key={a.id} className="attachment-chip removable">
                {a.type === "image" ? (
                  <img src={a.url} alt="" className="attachment-thumb" />
                ) : a.type === "file" ? (
                  <FileText size={12} strokeWidth={1.75} />
                ) : (
                  <Link2 size={12} strokeWidth={1.75} />
                )}
                {a.label || (a.type === "link" ? a.url.slice(0, 24) : "Файл")}
                <X size={12} strokeWidth={2} onClick={() => removeAttachment(a.id)} />
              </span>
            ))}
          </div>
        )}
        <div className="attach-form">
          <select className="text-input small" value={attType} onChange={(e) => setAttType(e.target.value)}>
            <option value="file">Файл / фото</option>
            <option value="link">Ссылка</option>
          </select>
          {attType === "link" ? (
            <>
              <input
                className="text-input"
                placeholder="https://…"
                value={attUrl}
                onChange={(e) => setAttUrl(e.target.value)}
              />
              <input
                className="text-input small"
                placeholder="Подпись"
                value={attLabel}
                onChange={(e) => setAttLabel(e.target.value)}
              />
              <button className="ghost-btn" onClick={addAttachment}>
                <Plus size={14} strokeWidth={2} />
              </button>
            </>
          ) : (
            <>
              <input
                className="text-input"
                placeholder="Подпись (необязательно)"
                value={attLabel}
                onChange={(e) => setAttLabel(e.target.value)}
              />
              <label className={"ghost-btn file-picker" + (uploading ? " disabled" : "")}>
                {uploading ? "Обработка…" : (<><Paperclip size={14} strokeWidth={2} /> Прикрепить</>)}
                <input type="file" disabled={uploading} onChange={handleFilePick} />
              </label>
            </>
          )}
        </div>
        {uploadError && (
          <div className="save-error" style={{ marginTop: 6 }}>
            <AlertCircle size={13} strokeWidth={1.75} /> {uploadError}
          </div>
        )}

        <label className="checkbox-row">
          <input type="checkbox" checked={form.favorite} onChange={(e) => set("favorite", e.target.checked)} />
          Добавить в избранное
        </label>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            Отмена
          </button>
          <button className="primary-btn" disabled={!form.title.trim() || !form.subjectId} onClick={() => onSave(form)}>
            <Check size={15} strokeWidth={2} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarView({
  cursor, setCursor, tasks, subjects, selectedDate, setSelectedDate,
  onOpenTask, onToggleFavorite, onCycleStatus, onEdit, onDelete, onPreviewImage,
}) {
  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.deadline) return;
      (map[t.deadline] = map[t.deadline] || []).push(t);
    });
    return map;
  }, [tasks]);
  const todayS = todayStr();
  const dayTasks = (tasksByDate[selectedDate] || []).slice().sort((a, b) => a.title.localeCompare(b.title));

  function goMonth(delta) {
    let { year, month } = cursor;
    month += delta;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    setCursor({ year, month });
  }

  return (
    <div className="calendar-wrap">
      <div className="calendar-card">
        <div className="calendar-head">
          <button className="icon-btn" onClick={() => goMonth(-1)}><ChevronLeft size={16} strokeWidth={1.75} /></button>
          <span className="calendar-month">{MONTHS_RU[cursor.month]} {cursor.year}</span>
          <button className="icon-btn" onClick={() => goMonth(1)}><ChevronRight size={16} strokeWidth={1.75} /></button>
        </div>
        <div className="calendar-grid calendar-weekdays">
          {WEEKDAYS_RU.map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
        </div>
        <div className="calendar-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="calendar-cell calendar-cell-empty" />;
            const dStr = toDateStr(d);
            const dayItems = tasksByDate[dStr] || [];
            const isToday = dStr === todayS;
            const isSelected = dStr === selectedDate;
            const hasOverdue = dayItems.some((t) => dStr < todayS && t.status !== "submitted");
            return (
              <button
                key={dStr}
                className={
                  "calendar-cell" +
                  (isToday ? " calendar-cell-today" : "") +
                  (isSelected ? " calendar-cell-selected" : "")
                }
                onClick={() => setSelectedDate(dStr)}
              >
                <span className="calendar-daynum">{d.getDate()}</span>
                {dayItems.length > 0 && (
                  <span className={"calendar-dot" + (hasOverdue ? " calendar-dot-over" : "")}>{dayItems.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="calendar-day-list">
        <div className="section-label" style={{ padding: 0, marginBottom: 10 }}>
          {formatDate(selectedDate)}{selectedDate === todayS ? " · сегодня" : ""}
        </div>
        {dayTasks.length === 0 ? (
          <div className="empty-state"><p>На этот день ничего не задано.</p></div>
        ) : (
          dayTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              subject={subjects.find((s) => s.id === t.subjectId)}
              onOpen={() => onOpenTask(t)}
              onToggleFavorite={() => onToggleFavorite(t.id)}
              onCycleStatus={() => onCycleStatus(t)}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t)}
              onPreviewImage={onPreviewImage}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatsModal({ stats, onClose }) {
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const weekPct = stats.weekTotal ? Math.round((stats.weekDone / stats.weekTotal) * 100) : 0;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Статистика</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <label className="field-label">Всего выполнено</label>
        <div className="stat-row">
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${pct}%` }} /></div>
          <span className="stat-num">{pct}%</span>
        </div>
        <p className="detail-desc" style={{ margin: "4px 0 0" }}>{stats.done} из {stats.total} заданий</p>

        <label className="field-label">За последние 7 дней</label>
        <div className="stat-row">
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${weekPct}%` }} /></div>
          <span className="stat-num">{weekPct}%</span>
        </div>
        <p className="detail-desc" style={{ margin: "4px 0 0" }}>{stats.weekDone} из {stats.weekTotal} заданий с дедлайном на этой неделе</p>

        {stats.bySubject.length > 0 && (
          <>
            <label className="field-label">По предметам</label>
            <div className="stat-subject-list">
              {stats.bySubject.map(({ subject, total, done }) => {
                const p = total ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={subject.id} className="stat-subject-row">
                    <span className="stat-subject-name">
                      {subject.icon ? `${subject.icon} ` : ""}{subject.name}
                    </span>
                    <div className="stat-bar stat-bar-sm">
                      <div className="stat-bar-fill" style={{ width: `${p}%`, background: subject.color }} />
                    </div>
                    <span className="stat-num-sm">{done}/{total}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";

const darkVars = {
  "--bg": "#14161c",
  "--bg-elevated": "#1a1d24",
  "--surface": "#1f232c",
  "--surface-hover": "#262b35",
  "--border": "#2a2f3a",
  "--text": "#e9e7e0",
  "--text-dim": "#9aa0ac",
  "--text-faint": "#6b7280",
  "--accent": "#e0a458",
  "--accent-soft": "rgba(224,164,88,0.15)",
  "--green": "#6fae8c",
  "--blue": "#7195c9",
  "--red": "#d1706a",
  "--grey": "#6b7280",
};

const lightVars = {
  "--bg": "#f6f2ea",
  "--bg-elevated": "#ffffff",
  "--surface": "#ffffff",
  "--surface-hover": "#f0ead9",
  "--border": "#e4dcc8",
  "--text": "#2b2620",
  "--text-dim": "#6e6656",
  "--text-faint": "#a39a86",
  "--accent": "#b8752e",
  "--accent-soft": "rgba(184,117,46,0.13)",
  "--green": "#4f9370",
  "--blue": "#4a72a8",
  "--red": "#b8483f",
  "--grey": "#8b8272",
};

function getThemeVars(theme) {
  return theme === "light" ? lightVars : darkVars;
}

const CSS = `
  * { box-sizing: border-box; }
  .app { display: flex; height: 100vh; background: var(--bg); color: var(--text); font-family: ${SANS}; font-size: 15px; transition: background-color 0.2s ease, color 0.2s ease; }
  .scrim { display:none; }

  .theme-toggle-btn { position: fixed; top: 16px; right: 16px; z-index: 70; width: 36px; height: 36px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease; }
  .theme-toggle-btn:hover { color: var(--accent); border-color: var(--accent); transform: rotate(15deg); }

  .sidebar { width: 270px; flex-shrink: 0; background: var(--bg-elevated); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px 14px; overflow-y: auto; }
  .brand { display:flex; align-items:center; gap:8px; font-family: ${SERIF}; font-size: 20px; color: var(--text); margin-bottom: 18px; padding: 0 4px; }
  .brand svg { color: var(--accent); }

  .search-box { display:flex; align-items:center; gap:8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 16px; color: var(--text-faint); }
  .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 14px; width: 100%; font-family: ${SANS}; }
  .search-box input::placeholder { color: var(--text-faint); }

  .nav-list { display:flex; flex-direction:column; gap:2px; margin-bottom: 18px; }
  .section-label { font-size: 11.5px; letter-spacing: 0.04em; color: var(--text-faint); padding: 0 8px; margin-bottom: 8px; text-transform: uppercase; }
  .subject-list { display:flex; flex-direction:column; gap:2px; flex: 1; overflow-y:auto; }
  .empty-hint { color: var(--text-faint); font-size: 14px; padding: 8px; }

  .nav-item { display:flex; align-items:center; gap:9px; background:none; border:none; color: var(--text-dim); padding: 8px 8px; border-radius: 7px; cursor:pointer; text-align:left; font-size: 14.5px; font-family: ${SANS}; position: relative; transition: background-color 0.15s ease, color 0.15s ease; }
  .nav-item:hover { background: var(--surface-hover); color: var(--text); }
  .nav-item.active { background: var(--surface); color: var(--text); }
  .nav-item .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink:0; }
  .nav-item .all-dot { background: var(--text-faint); }
  .nav-item .star-icon { color: var(--accent); flex-shrink:0; }
  .subject-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nav-item .count { font-size: 11.5px; color: var(--text-faint); }
  .nav-item:hover .row-delete { display:flex; }
  .row-delete { display:none; align-items:center; color: var(--text-faint); padding: 2px; border-radius: 4px; }
  .row-delete:hover { color: var(--red); background: rgba(209,112,106,0.12); }

  .add-subject-btn { display:flex; align-items:center; justify-content:center; gap:6px; background:none; border: 1px dashed var(--border); color: var(--text-dim); padding: 9px; border-radius: 8px; cursor:pointer; font-size: 14px; margin-top: 10px; font-family: ${SANS}; }
  .add-subject-btn:hover { border-color: var(--accent); color: var(--accent); }

  .user-row { display:flex; align-items:center; gap:8px; margin-top: 10px; padding: 8px; border-top: 1px solid var(--border); }
  .user-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .user-avatar-fallback { display:flex; align-items:center; justify-content:center; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; text-transform: uppercase; }
  .user-name { flex: 1; font-size: 12.5px; color: var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .login-screen { min-height: 100vh; display:flex; align-items:center; justify-content:center; background: var(--bg); color: var(--text); font-family: ${SANS}; padding: 20px; }
  .login-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 16px; padding: 40px 32px; width: 360px; max-width: 100%; text-align: center; display:flex; flex-direction:column; align-items:center; gap: 10px; }
  .login-card svg:first-child { color: var(--accent); margin-bottom: 4px; }
  .login-card h1 { font-family: ${SERIF}; font-weight: 400; font-size: 26px; margin: 0; }
  .login-card p { font-size: 14px; color: var(--text-dim); line-height: 1.5; margin: 0 0 14px; }
  .google-btn { display:flex; align-items:center; justify-content:center; gap:10px; width: 100%; background: #fff; color: #1f1f1f; border: none; padding: 11px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor:pointer; font-family: ${SANS}; }
  .google-btn:hover { filter: brightness(0.97); }

  .main { flex: 1; display:flex; flex-direction:column; overflow-y:auto; padding: 24px 32px 40px; }
  .topbar { display:flex; align-items:center; gap: 14px; padding-bottom: 18px; margin-bottom: 4px; border-bottom: 1px solid var(--border); }
  .menu-btn { display:none; background:none; border:none; color: var(--text-dim); cursor:pointer; }
  .topbar h1 { font-family: ${SERIF}; font-weight: 400; font-size: 28px; margin: 0; flex: 1; color: var(--text); }

  .primary-btn { display:flex; align-items:center; gap:6px; background: var(--accent); color: #1c140a; border: none; padding: 9px 16px; border-radius: 8px; font-size: 14.5px; font-weight: 600; cursor:pointer; font-family: ${SANS}; transition: filter 0.15s ease, transform 0.1s ease; }
  .primary-btn:hover { filter: brightness(1.08); }
  .primary-btn:active { transform: scale(0.97); }
  .primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .filter-row { display:flex; gap:8px; flex-wrap:wrap; margin: 16px 0 20px; }
  .chip { background: transparent; border: 1px solid var(--border); color: var(--text-faint); padding: 5px 12px; border-radius: 999px; font-size: 13px; cursor:pointer; font-family: ${SANS}; transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease; }
  .chip:hover { color: var(--text); border-color: var(--text-faint); }
  .chip-active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

  .save-error { display:flex; align-items:center; gap:6px; color: var(--red); font-size: 12.5px; margin-bottom: 12px; }

  .task-list { display:flex; flex-direction:column; gap: 12px; }
  .empty-state { text-align:center; color: var(--text-faint); padding: 60px 20px; display:flex; flex-direction:column; align-items:center; gap: 10px; }
  .empty-state p { max-width: 340px; margin: 0; font-size: 14.5px; }

  .task-card { background: var(--surface); border: 1px solid transparent; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 20px -16px rgba(0,0,0,0.5); transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease; animation: cardIn 0.28s ease both; cursor: pointer; }
  .task-card:hover { border-color: var(--border); transform: translateY(-2px); box-shadow: 0 1px 0 rgba(255,255,255,0.02) inset, 0 14px 26px -16px rgba(0,0,0,0.6); }
  .task-card.overdue { border-color: rgba(209,112,106,0.35); }
  .task-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; }
  .subject-chip { font-size: 12px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); padding: 3px 9px; border-radius: 999px; font-weight: 600; }
  .star-btn { background:none; border:none; cursor:pointer; padding: 2px; display:flex; }

  .task-title { font-family: ${SERIF}; font-weight: 400; font-size: 19px; margin: 0 0 5px; color: var(--text); letter-spacing: 0.1px; }
  .task-desc { font-size: 14px; color: var(--text-faint); margin: 0 0 12px; line-height: 1.55; }

  .attachments { display:flex; flex-wrap:wrap; gap:6px; margin-bottom: 10px; }
  .attachment-chip { display:inline-flex; align-items:center; gap:5px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-dim); font-size: 12px; font-family: ${SANS}; padding: 4px 9px 4px 5px; border-radius: 7px; text-decoration:none; cursor:pointer; transition: color 0.15s ease, border-color 0.15s ease; }
  .attachment-chip:hover { color: var(--text); border-color: var(--text-faint); }
  .attachment-chip.removable { cursor: default; }
  .attachment-chip svg:last-child { cursor: pointer; margin-left: 2px; }
  .attachment-thumb { width: 16px; height: 16px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }

  .file-picker { position: relative; overflow: hidden; cursor: pointer; }
  .file-picker input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .file-picker.disabled { opacity: 0.6; pointer-events: none; }

  .task-bottom { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
  .status-row { display:flex; align-items:center; gap: 5px; }
  .status-cycle { display:flex; align-items:center; gap: 6px; background: color-mix(in srgb, var(--sc) 16%, transparent); border: 1px solid color-mix(in srgb, var(--sc) 40%, transparent); color: var(--sc); font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; cursor:pointer; transition: filter 0.15s ease, transform 0.1s ease; }
  .status-cycle:hover { filter: brightness(1.15); }
  .status-cycle:active { transform: scale(0.96); }
  .status-dot { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-faint); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.15s ease; padding:0; }
  .status-dot:hover { border-color: var(--sc); color: var(--sc); transform: scale(1.08); }
  .status-dot-active { background: color-mix(in srgb, var(--sc) 20%, transparent); border-color: var(--sc); color: var(--sc); }
  .status-dot-lg { width: 28px; height: 28px; }
  .detail-status-label { font-size: 13px; color: var(--text-dim); margin-left: 4px; }
  .deadline { display:flex; align-items:center; gap:4px; font-size: 12.5px; color: var(--text-faint); }
  .deadline-banner { display:flex; align-items:center; gap: 8px; background: var(--accent-soft); border: 1px solid rgba(224,164,88,0.3); color: var(--accent); padding: 9px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 16px; animation: slideDown 0.2s ease; }
  .deadline-banner span { flex: 1; }
  .deadline-soon { color: var(--accent); }
  .deadline-over { color: var(--red); }
  .spacer { flex: 1; }
  .icon-btn { background:none; border:none; color: var(--text-faint); cursor:pointer; padding: 4px; border-radius: 6px; display:flex; }
  .icon-btn:hover { color: var(--text); background: var(--surface-hover); }

  .modal-scrim { position: fixed; inset: 0; background: rgba(10,11,14,0.6); display:flex; align-items:center; justify-content:center; z-index: 50; padding: 20px; animation: scrimIn 0.15s ease; }
  .modal { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 22px 24px; width: 380px; max-width: 100%; max-height: 88vh; overflow-y: auto; animation: modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
  .modal.wide { width: 460px; }
  .modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; }
  .modal-head h2 { font-family: ${SERIF}; font-weight:400; font-size: 21px; margin:0; }

  .field-label { display:block; font-size: 11.5px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-faint); margin: 14px 0 7px; }
  .text-input { width: 100%; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 9px 11px; border-radius: 8px; font-size: 14.5px; outline: none; font-family: ${SANS}; transition: border-color 0.15s ease; }
  .text-input:focus { border-color: var(--accent); }
  .text-input.small { flex: 0 0 auto; width: auto; }
  .textarea { resize: vertical; font-family: ${SANS}; }

  .form-row { display:flex; gap: 12px; }
  .form-row > div { flex: 1; }

  .color-row { display:flex; gap: 8px; }
  .color-swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor:pointer; }
  .color-swatch.selected { border-color: var(--text); }

  .attach-form { display:flex; gap: 6px; align-items:center; }
  .attach-form .text-input { flex: 1; }

  .checkbox-row { display:flex; align-items:center; gap: 8px; margin-top: 16px; font-size: 14px; color: var(--text-dim); cursor: pointer; }

  .modal-actions { display:flex; justify-content:flex-end; gap: 10px; margin-top: 20px; }
  .ghost-btn { background:none; border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; border-radius: 8px; cursor:pointer; font-size: 14px; font-family: ${SANS}; display:flex; align-items:center; gap:6px; transition: color 0.15s ease, border-color 0.15s ease; }
  .ghost-btn:hover { color: var(--text); border-color: var(--text-faint); }
  .danger-btn { background: var(--red); color: #1c0a0a; border:none; padding: 8px 14px; border-radius: 8px; cursor:pointer; font-size: 14px; font-weight:600; font-family: ${SANS}; }
  .confirm-box { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 20px; width: 340px; max-width: 100%; }
  .confirm-box p { margin: 0 0 16px; font-size: 14.5px; color: var(--text); line-height: 1.5; }
  .confirm-actions { display:flex; justify-content:flex-end; gap: 10px; }

  .detail-modal { width: 520px; }
  .detail-title { font-family: ${SERIF}; font-weight: 400; font-size: 24px; margin: 4px 0 2px; color: var(--text); }
  .detail-deadline { display:flex; align-items:center; gap:6px; font-size: 13px; color: var(--text-faint); margin-bottom: 10px; }
  .detail-desc { font-size: 14.5px; color: var(--text-dim); line-height: 1.6; white-space: pre-wrap; margin: 4px 0 16px; }
  .detail-gallery { display:flex; flex-wrap:wrap; gap: 10px; margin: 8px 0 16px; }
  .detail-photo { display:block; width: 96px; height: 96px; border-radius: 10px; overflow:hidden; border: 1px solid var(--border); background: none; padding: 0; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease; }
  .detail-photo:hover { transform: scale(1.03); border-color: var(--accent); }
  .detail-photo img { width: 100%; height: 100%; object-fit: cover; display:block; }
  .detail-files { display:flex; flex-direction:column; gap: 6px; margin: 8px 0 6px; }
  .detail-file-row { display:flex; align-items:center; gap: 9px; padding: 9px 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; color: var(--text-dim); text-decoration:none; font-size: 14px; transition: border-color 0.15s ease, color 0.15s ease; }
  .detail-file-row:hover { color: var(--text); border-color: var(--text-faint); }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes modalIn {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .lightbox-scrim { position: fixed; inset: 0; background: rgba(6,7,10,0.88); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index: 60; padding: 40px 20px; animation: scrimIn 0.15s ease; cursor: zoom-out; }
  .lightbox-img { max-width: 100%; max-height: 80vh; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); cursor: default; animation: modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
  .lightbox-caption { color: var(--text-dim); font-size: 13px; margin-top: 14px; }
  .lightbox-close { position: absolute; top: 20px; right: 24px; background: var(--surface); border: 1px solid var(--border); color: var(--text); width: 36px; height: 36px; border-radius: 50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: border-color 0.15s ease; }
  .lightbox-close:hover { border-color: var(--text-faint); }

  .subject-emoji { font-size: 14px; line-height: 1; width: 8px; text-align:center; flex-shrink:0; }
  .icon-row { display:flex; flex-wrap:wrap; gap: 7px; }
  .icon-swatch { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); display:flex; align-items:center; justify-content:center; font-size: 15px; cursor:pointer; transition: border-color 0.15s ease; }
  .icon-swatch:hover { border-color: var(--text-faint); }
  .icon-swatch.selected { border-color: var(--accent); background: var(--accent-soft); }

  .view-toggle-btn { display:flex; align-items:center; justify-content:center; width: 36px; height: 36px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); cursor:pointer; transition: color 0.15s ease, border-color 0.15s ease; }
  .view-toggle-btn:hover { color: var(--text); border-color: var(--text-faint); }

  .undo-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display:flex; align-items:center; gap: 12px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text); padding: 11px 14px; border-radius: 10px; font-size: 13.5px; box-shadow: 0 12px 30px rgba(0,0,0,0.35); z-index: 65; animation: slideDown 0.2s ease; }
  .undo-btn { background: none; border: none; color: var(--accent); font-weight: 600; font-size: 13.5px; cursor: pointer; font-family: ${SANS}; }
  .undo-btn:hover { text-decoration: underline; }

  .calendar-wrap { display:flex; gap: 20px; flex-wrap: wrap; align-items:flex-start; }
  .calendar-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; width: 320px; flex-shrink: 0; }
  .calendar-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
  .calendar-month { font-family: ${SERIF}; font-size: 15px; color: var(--text); }
  .calendar-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .calendar-weekdays { margin-bottom: 4px; }
  .calendar-weekday { text-align:center; font-size: 11px; color: var(--text-faint); padding: 4px 0; }
  .calendar-cell { position:relative; aspect-ratio: 1; border-radius: 8px; background: none; border: 1px solid transparent; color: var(--text-dim); display:flex; flex-direction:column; align-items:center; justify-content:center; gap: 2px; cursor:pointer; font-size: 12.5px; font-family: ${SANS}; transition: background-color 0.15s ease, border-color 0.15s ease; }
  .calendar-cell:hover { background: var(--surface-hover); }
  .calendar-cell-empty { cursor:default; pointer-events:none; }
  .calendar-cell-today .calendar-daynum { color: var(--accent); font-weight: 700; }
  .calendar-cell-selected { border-color: var(--accent); background: var(--accent-soft); }
  .calendar-dot { font-size: 9.5px; font-weight: 700; color: var(--bg); background: var(--accent); border-radius: 999px; padding: 0 4px; min-width: 14px; line-height: 1.4; }
  .calendar-dot-over { background: var(--red); }
  .calendar-day-list { flex: 1; min-width: 260px; }

  .stat-row { display:flex; align-items:center; gap: 10px; }
  .stat-bar { flex:1; height: 8px; border-radius: 999px; background: var(--surface); overflow:hidden; }
  .stat-bar-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width 0.3s ease; }
  .stat-num { font-size: 12.5px; font-weight: 600; color: var(--text-dim); width: 36px; text-align:right; }
  .stat-subject-list { display:flex; flex-direction:column; gap: 8px; }
  .stat-subject-row { display:flex; align-items:center; gap: 8px; }
  .stat-subject-name { font-size: 12.5px; color: var(--text-dim); width: 100px; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .stat-bar-sm { height: 6px; }
  .stat-num-sm { font-size: 11.5px; color: var(--text-faint); width: 40px; text-align:right; flex-shrink:0; }

  @keyframes scrimIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 760px) {
    .sidebar { position: fixed; top:0; left:0; bottom:0; z-index: 40; transform: translateX(-100%); transition: transform 0.2s ease; box-shadow: 8px 0 24px rgba(0,0,0,0.4); }
    .sidebar.open { transform: translateX(0); }
    .scrim { display:block; position: fixed; inset:0; background: rgba(0,0,0,0.5); z-index: 39; }
    .menu-btn { display:flex; }
    .main { padding: 18px 16px 30px; }
    .topbar h1 { font-size: 21px; }
    .calendar-wrap { flex-direction: column; }
    .calendar-card { width: 100%; }
    .calendar-day-list { min-width: 0; width: 100%; }
  }
`;
