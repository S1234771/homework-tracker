import React, { useState, useEffect, useMemo, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Search, Plus, Star, Link2, Image as ImageIcon, Calendar,
  Trash2, Pencil, X, Check, BookOpen, Menu, AlertCircle, Copy, CheckCheck
} from "lucide-react";

const STATUSES = [
  { id: "not_started", label: "Не начато", color: "var(--grey)" },
  { id: "in_progress", label: "В процессе", color: "var(--accent)" },
  { id: "done", label: "Сделано", color: "var(--green)" },
  { id: "submitted", label: "Сдано", color: "var(--blue)" },
];

const SUBJECT_COLORS = ["#e0a458", "#6fae8c", "#7195c9", "#c07d92", "#8f8fc2", "#5fa8a0", "#c98f5f"];

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

// У каждой ссылки на сайт есть свой "?group=..." — все, кто открыл
// одну и ту же ссылку, видят и редактируют один и тот же список.
function getOrCreateGroupId() {
  const params = new URLSearchParams(window.location.search);
  let g = params.get("group");
  if (!g) {
    g = uid() + uid();
    params.set("group", g);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }
  return g;
}

export default function App() {
  const [groupId] = useState(getOrCreateGroupId);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [query, setQuery] = useState("");
  const [activeSubject, setActiveSubject] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const firstLoad = useRef(true);
  const saveTimer = useRef(null);

  // Загрузка данных группы из Firestore при открытии сайта
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "homework-groups", groupId));
        if (snap.exists()) {
          const data = snap.data();
          setSubjects(data.subjects || []);
          setTasks(data.tasks || []);
        }
      } catch (e) {
        setSaveError("Не удалось загрузить данные — проверьте ключи Firebase и подключение");
      } finally {
        setLoaded(true);
      }
    })();
  }, [groupId]);

  // Сохранение в Firestore при любом изменении (с небольшой задержкой,
  // чтобы не писать в базу на каждую букву при вводе текста)
  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, "homework-groups", groupId), { subjects, tasks }, { merge: true });
        setSaveError(null);
      } catch (e) {
        setSaveError("Не удалось сохранить изменения");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [subjects, tasks, loaded, groupId]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const filteredSubjects = useMemo(() => {
    if (!query.trim()) return subjects;
    const q = query.trim().toLowerCase();
    return subjects.filter((s) => s.name.toLowerCase().includes(q));
  }, [subjects, query]);

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (activeSubject === "favorites") {
      list = list.filter((t) => t.favorite);
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

  function addSubject(name, color) {
    setSubjects((s) => [...s, { id: uid(), name, color }]);
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
  function deleteTask(id) {
    setTasks((t) => t.filter((x) => x.id !== id));
  }
  function toggleFavorite(id) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)));
  }

  const taskCount = (subjectId) => tasks.filter((t) => t.subjectId === subjectId).length;

  if (!loaded) {
    return (
      <div style={{ ...styleVars, background: "var(--bg)", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: SANS }}>
        Загружаю данные…
      </div>
    );
  }

  return (
    <div className="app" style={styleVars}>
      <style>{CSS}</style>

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
              <span className="dot" style={{ background: s.color }} />
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

        <button className="share-btn" onClick={copyLink}>
          {linkCopied ? <CheckCheck size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
          {linkCopied ? "Ссылка скопирована" : "Скопировать ссылку доступа"}
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} strokeWidth={1.75} />
          </button>
          <h1>
            {activeSubject === "all"
              ? "Все задания"
              : activeSubject === "favorites"
              ? "Избранное"
              : subjects.find((s) => s.id === activeSubject)?.name || "Задания"}
          </h1>
          <button
            className="primary-btn"
            onClick={() =>
              setEditingTask({
                id: uid(),
                subjectId: activeSubject !== "all" && activeSubject !== "favorites" ? activeSubject : subjects[0]?.id || "",
                title: "",
                description: "",
                deadline: "",
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

        {saveError && (
          <div className="save-error">
            <AlertCircle size={14} strokeWidth={1.75} /> {saveError}
          </div>
        )}

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

          {visibleTasks.map((t) => {
            const subj = subjects.find((s) => s.id === t.subjectId);
            const dLeft = daysUntil(t.deadline);
            const overdue = dLeft !== null && dLeft < 0 && t.status !== "submitted";
            const soon = dLeft !== null && dLeft >= 0 && dLeft <= 2 && t.status !== "submitted";
            const st = statusOf(t.status);
            return (
              <div className={"task-card" + (overdue ? " overdue" : "")} key={t.id}>
                <div className="task-top">
                  <span className="subject-chip" style={{ "--c": subj?.color || "#888" }}>
                    {subj?.name || "Без предмета"}
                  </span>
                  <button className="star-btn" onClick={() => toggleFavorite(t.id)}>
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
                    {t.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="attachment-chip"
                        title={a.url}
                      >
                        {a.type === "image" ? <ImageIcon size={12} strokeWidth={1.75} /> : <Link2 size={12} strokeWidth={1.75} />}
                        {a.label || (a.type === "image" ? "Фото" : "Ссылка")}
                      </a>
                    ))}
                  </div>
                )}

                <div className="task-bottom">
                  <span className="status-badge" style={{ "--sc": st.color }}>
                    {st.label}
                  </span>
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
                  <button className="icon-btn" onClick={() => setEditingTask(t)}>
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setConfirmDelete({ type: "task", id: t.id, name: t.title })}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {showSubjectForm && (
        <SubjectForm
          onClose={() => setShowSubjectForm(false)}
          onSave={(name, color) => {
            addSubject(name, color);
            setShowSubjectForm(false);
          }}
        />
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
            <p>
              {confirmDelete.type === "subject"
                ? `Удалить предмет «${confirmDelete.name}» вместе со всеми его заданиями?`
                : `Удалить задание «${confirmDelete.name}»?`}
            </p>
            <div className="confirm-actions">
              <button className="ghost-btn" onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                className="danger-btn"
                onClick={() => {
                  if (confirmDelete.type === "subject") deleteSubject(confirmDelete.id);
                  else deleteTask(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectForm({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
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
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="primary-btn"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), color)}
          >
            <Check size={15} strokeWidth={2} /> Создать
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskForm({ task, subjects, onClose, onSave }) {
  const [form, setForm] = useState(task);
  const [attType, setAttType] = useState("link");
  const [attUrl, setAttUrl] = useState("");
  const [attLabel, setAttLabel] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function addAttachment() {
    if (!attUrl.trim()) return;
    set("attachments", [
      ...(form.attachments || []),
      { id: uid(), type: attType, url: attUrl.trim(), label: attLabel.trim() },
    ]);
    setAttUrl("");
    setAttLabel("");
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

        <label className="field-label">Вложения (фото или ссылки)</label>
        {form.attachments?.length > 0 && (
          <div className="attachments" style={{ marginBottom: 8 }}>
            {form.attachments.map((a) => (
              <span key={a.id} className="attachment-chip removable">
                {a.type === "image" ? <ImageIcon size={12} strokeWidth={1.75} /> : <Link2 size={12} strokeWidth={1.75} />}
                {a.label || a.url.slice(0, 24)}
                <X size={12} strokeWidth={2} onClick={() => removeAttachment(a.id)} />
              </span>
            ))}
          </div>
        )}
        <div className="attach-form">
          <select className="text-input small" value={attType} onChange={(e) => setAttType(e.target.value)}>
            <option value="link">Ссылка</option>
            <option value="image">Фото (URL)</option>
          </select>
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
        </div>

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

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";

const styleVars = {
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

const CSS = `
  * { box-sizing: border-box; }
  .app { display: flex; height: 100vh; background: var(--bg); color: var(--text); font-family: ${SANS}; font-size: 14px; }
  .scrim { display:none; }

  .sidebar { width: 270px; flex-shrink: 0; background: var(--bg-elevated); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px 14px; overflow-y: auto; }
  .brand { display:flex; align-items:center; gap:8px; font-family: ${SERIF}; font-size: 19px; color: var(--text); margin-bottom: 18px; padding: 0 4px; }
  .brand svg { color: var(--accent); }

  .search-box { display:flex; align-items:center; gap:8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 16px; color: var(--text-faint); }
  .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 13px; width: 100%; font-family: ${SANS}; }
  .search-box input::placeholder { color: var(--text-faint); }

  .nav-list { display:flex; flex-direction:column; gap:2px; margin-bottom: 18px; }
  .section-label { font-size: 12px; color: var(--text-faint); padding: 0 8px; margin-bottom: 6px; }
  .subject-list { display:flex; flex-direction:column; gap:2px; flex: 1; overflow-y:auto; }
  .empty-hint { color: var(--text-faint); font-size: 13px; padding: 8px; }

  .nav-item { display:flex; align-items:center; gap:9px; background:none; border:none; color: var(--text-dim); padding: 8px 8px; border-radius: 7px; cursor:pointer; text-align:left; font-size: 13.5px; font-family: ${SANS}; position: relative; }
  .nav-item:hover { background: var(--surface-hover); color: var(--text); }
  .nav-item.active { background: var(--surface); color: var(--text); }
  .nav-item .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink:0; }
  .nav-item .all-dot { background: var(--text-faint); }
  .nav-item .star-icon { color: var(--accent); flex-shrink:0; }
  .subject-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nav-item .count { font-size: 11px; color: var(--text-faint); }
  .nav-item:hover .row-delete { display:flex; }
  .row-delete { display:none; align-items:center; color: var(--text-faint); padding: 2px; border-radius: 4px; }
  .row-delete:hover { color: var(--red); background: rgba(209,112,106,0.12); }

  .add-subject-btn { display:flex; align-items:center; justify-content:center; gap:6px; background:none; border: 1px dashed var(--border); color: var(--text-dim); padding: 9px; border-radius: 8px; cursor:pointer; font-size: 13px; margin-top: 10px; font-family: ${SANS}; }
  .add-subject-btn:hover { border-color: var(--accent); color: var(--accent); }

  .share-btn { display:flex; align-items:center; justify-content:center; gap:6px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); padding: 9px; border-radius: 8px; cursor:pointer; font-size: 12.5px; margin-top: 8px; font-family: ${SANS}; }
  .share-btn:hover { color: var(--text); border-color: var(--text-faint); }

  .main { flex: 1; display:flex; flex-direction:column; overflow-y:auto; padding: 24px 32px 40px; }
  .topbar { display:flex; align-items:center; gap: 14px; margin-bottom: 6px; }
  .menu-btn { display:none; background:none; border:none; color: var(--text-dim); cursor:pointer; }
  .topbar h1 { font-family: ${SERIF}; font-weight: 400; font-size: 26px; margin: 0; flex: 1; color: var(--text); }

  .primary-btn { display:flex; align-items:center; gap:6px; background: var(--accent); color: #1c140a; border: none; padding: 9px 15px; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor:pointer; font-family: ${SANS}; }
  .primary-btn:hover { filter: brightness(1.08); }
  .primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .filter-row { display:flex; gap:8px; flex-wrap:wrap; margin: 16px 0 20px; }
  .chip { background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); padding: 6px 12px; border-radius: 999px; font-size: 12.5px; cursor:pointer; font-family: ${SANS}; }
  .chip:hover { color: var(--text); border-color: var(--text-faint); }
  .chip-active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

  .save-error { display:flex; align-items:center; gap:6px; color: var(--red); font-size: 12.5px; margin-bottom: 12px; }

  .task-list { display:flex; flex-direction:column; gap: 12px; }
  .empty-state { text-align:center; color: var(--text-faint); padding: 60px 20px; display:flex; flex-direction:column; align-items:center; gap: 10px; }
  .empty-state p { max-width: 340px; margin: 0; font-size: 13.5px; }

  .task-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .task-card.overdue { border-color: rgba(209,112,106,0.4); }
  .task-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; }
  .subject-chip { font-size: 11.5px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); padding: 3px 9px; border-radius: 999px; font-weight: 600; }
  .star-btn { background:none; border:none; cursor:pointer; padding: 2px; display:flex; }

  .task-title { font-family: ${SERIF}; font-weight: 400; font-size: 17px; margin: 0 0 4px; color: var(--text); }
  .task-desc { font-size: 13px; color: var(--text-dim); margin: 0 0 10px; line-height: 1.5; }

  .attachments { display:flex; flex-wrap:wrap; gap:6px; margin-bottom: 10px; }
  .attachment-chip { display:inline-flex; align-items:center; gap:5px; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-dim); font-size: 11.5px; padding: 4px 9px; border-radius: 7px; text-decoration:none; }
  .attachment-chip:hover { color: var(--text); border-color: var(--text-faint); }
  .attachment-chip.removable { cursor: default; }
  .attachment-chip svg:last-child { cursor: pointer; margin-left: 2px; }

  .task-bottom { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
  .status-badge { font-size: 11.5px; font-weight: 600; color: var(--sc); background: color-mix(in srgb, var(--sc) 16%, transparent); padding: 4px 10px; border-radius: 999px; }
  .deadline { display:flex; align-items:center; gap:4px; font-size: 12px; color: var(--text-faint); }
  .deadline-soon { color: var(--accent); }
  .deadline-over { color: var(--red); }
  .spacer { flex: 1; }
  .icon-btn { background:none; border:none; color: var(--text-faint); cursor:pointer; padding: 4px; border-radius: 6px; display:flex; }
  .icon-btn:hover { color: var(--text); background: var(--surface-hover); }

  .modal-scrim { position: fixed; inset: 0; background: rgba(10,11,14,0.6); display:flex; align-items:center; justify-content:center; z-index: 50; padding: 20px; }
  .modal { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 22px 24px; width: 380px; max-width: 100%; max-height: 88vh; overflow-y: auto; }
  .modal.wide { width: 460px; }
  .modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; }
  .modal-head h2 { font-family: ${SERIF}; font-weight:400; font-size: 19px; margin:0; }

  .field-label { display:block; font-size: 12px; color: var(--text-faint); margin: 12px 0 6px; }
  .text-input { width: 100%; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 9px 11px; border-radius: 8px; font-size: 13.5px; outline: none; font-family: ${SANS}; }
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

  .checkbox-row { display:flex; align-items:center; gap: 8px; margin-top: 16px; font-size: 13px; color: var(--text-dim); cursor: pointer; }

  .modal-actions { display:flex; justify-content:flex-end; gap: 10px; margin-top: 20px; }
  .ghost-btn { background:none; border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; border-radius: 8px; cursor:pointer; font-size: 13px; font-family: ${SANS}; display:flex; align-items:center; gap:6px; }
  .ghost-btn:hover { color: var(--text); border-color: var(--text-faint); }
  .danger-btn { background: var(--red); color: #1c0a0a; border:none; padding: 8px 14px; border-radius: 8px; cursor:pointer; font-size: 13px; font-weight:600; font-family: ${SANS}; }
  .confirm-box { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 20px; width: 340px; max-width: 100%; }
  .confirm-box p { margin: 0 0 16px; font-size: 13.5px; color: var(--text); line-height: 1.5; }
  .confirm-actions { display:flex; justify-content:flex-end; gap: 10px; }

  @media (max-width: 760px) {
    .sidebar { position: fixed; top:0; left:0; bottom:0; z-index: 40; transform: translateX(-100%); transition: transform 0.2s ease; box-shadow: 8px 0 24px rgba(0,0,0,0.4); }
    .sidebar.open { transform: translateX(0); }
    .scrim { display:block; position: fixed; inset:0; background: rgba(0,0,0,0.5); z-index: 39; }
    .menu-btn { display:flex; }
    .main { padding: 18px 16px 30px; }
    .topbar h1 { font-size: 21px; }
  }
`;
