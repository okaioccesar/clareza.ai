(function (root) {
    const id = () => globalThis.crypto.randomUUID();
    const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(new Date(s + 'T12:00:00')) === s;
    const text = (s, n) => typeof s === 'string' ? s.slice(0, n) : '', array = a => Array.isArray(a) ? a : [], unique = a => [...new Map(a.map(x => [x.id, x])).values()];
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) throw new Error('Escolha uma exportação válida do clarity.ai.');
        const colors = ['blue', 'green', 'orange', 'rose', 'purple'];
        const areas = unique(array(raw.areas).filter(a => a && typeof a.id === 'string' && typeof a.title === 'string').map(a => ({ id: a.id, title: text(a.title, 200), description: text(a.description, 2000), color: colors.includes(a.color) ? a.color : 'blue' })));
        const areaId = s => areas.some(a => a.id === s) ? s : '';
        const projects = unique(array(raw.projects).filter(p => p && typeof p.id === 'string' && typeof p.title === 'string').map(p => ({ id: p.id, title: text(p.title, 200), description: text(p.description, 2000), color: colors.includes(p.color) ? p.color : 'blue', archived: !!p.archived, areaId: areaId(p.areaId) })));
        const pages = unique(array(raw.pages).filter(p => p && typeof p.id === 'string' && typeof p.title === 'string').map(p => ({ id: p.id, title: text(p.title, 200), areaId: areaId(p.areaId), projectId: projects.some(x => x.id === p.projectId) ? p.projectId : '', favorite: !!p.favorite, updatedAt: typeof p.updatedAt === 'string' && !Number.isNaN(Date.parse(p.updatedAt)) ? p.updatedAt : '', blocks: unique(array(p.blocks).slice(0, 1000).filter(b => b && typeof b === 'object').map(b => ({ id: typeof b.id === 'string' ? b.id : id(), type: ['text', 'heading', 'check', 'quote', 'divider'].includes(b.type) ? b.type : 'text', text: text(b.text, 20000), checked: !!b.checked }))) })));
        const tasks = unique(raw.tasks.filter(t => t && typeof t.id === 'string' && typeof t.title === 'string').map(t => ({ id: t.id, title: text(t.title, 200), notes: text(t.notes, 2000), date: validDate(t.date) ? t.date : '', areaId: areaId(t.areaId), priority: t.priority === 'high' ? 'high' : 'normal', status: t.done || t.status === 'done' ? 'done' : t.status === 'doing' ? 'doing' : 'todo', done: !!t.done || t.status === 'done', projectId: projects.some(p => p.id === t.projectId) ? t.projectId : '', pinned: !!t.pinned, completedAt: typeof t.completedAt === 'string' && !Number.isNaN(Date.parse(t.completedAt)) ? t.completedAt : null, createdAt: text(t.createdAt, 50), repeat: validDate(t.date) && ['daily', 'weekly', 'monthly'].includes(t.repeat) ? t.repeat : 'none', repeatDay: Number.isInteger(t.repeatDay) && t.repeatDay >= 1 && t.repeatDay <= 31 ? t.repeatDay : validDate(t.date) ? Number(t.date.slice(-2)) : 1, nextTaskId: text(t.nextTaskId, 200), generatedFrom: text(t.generatedFrom, 200), subtasks: unique(array(t.subtasks).slice(0, 200).filter(s => s && typeof s.title === 'string').map(s => ({ id: typeof s.id === 'string' ? s.id : id(), title: text(s.title, 200), done: !!s.done }))) })));
        const daily = {}; if (raw.daily && typeof raw.daily === 'object') Object.entries(raw.daily).filter(([k]) => validDate(k)).forEach(([k, v]) => daily[k] = text(v, 5000));
        return { version: 3, areas, tasks, projects, pages, daily, scratch: text(raw.scratch, 20000) };
    }
    function weekDates(offset = 0, now = new Date()) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); return Array.from({ length: 7 }, (_, i) => { const day = new Date(d); day.setDate(day.getDate() + i); return dateKey(day) }) }
    function merge(existing, incoming) { return normalize({ areas: unique([...array(incoming.areas), ...array(existing.areas)]), tasks: unique([...incoming.tasks, ...existing.tasks]), projects: unique([...incoming.projects, ...existing.projects]), pages: unique([...incoming.pages, ...existing.pages]), daily: { ...incoming.daily, ...existing.daily }, scratch: existing.scratch || incoming.scratch }) }
    function nextDate(date, repeat, today = dateKey(), anchorDay = Number(date.slice(-2))) {
        if (!validDate(date) || !validDate(today) || !['daily', 'weekly', 'monthly'].includes(repeat)) return '';
        const base = new Date(date + 'T12:00:00'), current = new Date(today + 'T12:00:00');
        if (repeat === 'monthly') {
            let year = base.getFullYear(), month = base.getMonth() + 1;
            if (year < current.getFullYear() || (year === current.getFullYear() && month < current.getMonth())) { year = current.getFullYear(); month = current.getMonth() }
            let d = new Date(year, month, Math.min(anchorDay, new Date(year, month + 1, 0, 12).getDate()), 12);
            if (dateKey(d) <= today) { year = d.getFullYear(); month = d.getMonth() + 1; d = new Date(year, month, Math.min(anchorDay, new Date(year, month + 1, 0, 12).getDate()), 12) }
            return dateKey(d);
        }
        const step = repeat === 'daily' ? 1 : 7; let d = new Date(base); d.setDate(d.getDate() + step);
        if (dateKey(d) <= today) { const elapsed = Math.floor((current.getTime() - d.getTime()) / 86400000); d.setDate(d.getDate() + (Math.floor(elapsed / step) + 1) * step); while (dateKey(d) <= today) d.setDate(d.getDate() + step) }
        return dateKey(d);
    }
    function changeStatus(tasks, task, status, now = new Date()) {
        const previouslyDone = task.done; task.status = status; task.done = status === 'done'; task.completedAt = task.done ? (task.completedAt || now.toISOString()) : null;
        if (!task.done || previouslyDone || task.nextTaskId || !['daily', 'weekly', 'monthly'].includes(task.repeat)) return null;
        const existing = tasks.find(t => t.generatedFrom === task.id); if (existing) { task.nextTaskId = existing.id; return null }
        const next = nextDate(task.date, task.repeat, dateKey(now), task.repeatDay || Number(task.date.slice(-2))); if (!next) return null;
        const created = { ...task, id: id(), date: next, status: 'todo', done: false, completedAt: null, pinned: false, nextTaskId: '', generatedFrom: task.id, createdAt: now.toISOString(), subtasks: array(task.subtasks).map(s => ({ ...s, id: id(), done: false })) };
        task.nextTaskId = created.id; tasks.push(created); return created;
    }
    const api = { id, dateKey, validDate, normalize, weekDates, merge, nextDate, changeStatus }; root.Clareza = api; if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
