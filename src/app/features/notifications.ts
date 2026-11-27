/**
 * Browser notifications for tasks with a time and a daily summary.
 *
 * Reminders are checked every 30 seconds while the app is open in a tab (even in the
 * background). Settings are per device because notification permission is per device.
 * The schedule itself comes from core/reminders.ts, so native apps can reuse it later.
 */
import { dueReminders, normalizeSettings, type Reminder, type ReminderSettings } from '../../core/reminders.ts';
import { $, maybe, storage } from '../dom.ts';
import { find, store } from '../store.ts';
import { toast } from '../toast.ts';
import { navigate } from '../render.ts';
import { brand } from '../../brand.ts';
import { openEntity } from './entity-form.ts';

const SETTINGS_KEY = 'clareza.notifications';
const SHOWN_KEY = 'clareza.notifications.shown';
const LAST_CHECK_KEY = 'clareza.notifications.checked';
const CHECK_EVERY = 30_000;

let settings: ReminderSettings = normalizeSettings(safeJSON(storage.get(SETTINGS_KEY)));
let worker: ServiceWorkerRegistration | null = null;

function safeJSON(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const supported = () => typeof window.Notification === 'function';
/** Result of the last permission request in this session (some browsers report it only through the request). */
let requested: NotificationPermission | null = null;
const permission = (): NotificationPermission => (supported() ? (requested ?? Notification.permission) : 'denied');

export function getSettings(): ReminderSettings {
  return settings;
}

export function updateSettings(patch: Partial<ReminderSettings>) {
  settings = normalizeSettings({ ...settings, ...patch });
  storage.set(SETTINGS_KEY, JSON.stringify(settings));
  renderSettings();
}

/** Tags already shown (shared between tabs through localStorage). */
function shownTags(): string[] {
  const value = safeJSON(storage.get(SHOWN_KEY));
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function markShown(tag: string) {
  storage.set(SHOWN_KEY, JSON.stringify([...shownTags(), tag].slice(-200)));
}

async function show(reminder: Pick<Reminder, 'title' | 'body' | 'tag' | 'taskId'>) {
  const options: NotificationOptions = {
    body: reminder.body,
    tag: reminder.tag,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { taskId: reminder.taskId ?? '' },
  };
  try {
    if (worker) return await worker.showNotification(reminder.title, options);
    const notification = new Notification(reminder.title, options);
    notification.onclick = () => {
      window.focus();
      openTarget(reminder.taskId);
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; fall back to an in-app message.
    toast(`${reminder.title} — ${reminder.body}`);
  }
}

function openTarget(taskId?: string) {
  const task = find.task(taskId);
  if (task) openEntity('task', task);
  else navigate('today');
}

/** Shows reminders that became due since the last check. */
export function check(now = new Date()) {
  if (!settings.enabled || permission() !== 'granted') return;
  const last = Number(storage.get(LAST_CHECK_KEY)) || now.getTime() - 15 * 60_000;
  storage.set(LAST_CHECK_KEY, String(now.getTime()));
  const shown = new Set(shownTags());
  for (const reminder of dueReminders(store.data, settings, new Date(last), now)) {
    if (shown.has(reminder.tag)) continue;
    markShown(reminder.tag);
    show(reminder);
  }
}

async function enable(on: boolean) {
  if (!on) return updateSettings({ enabled: false });
  if (!supported()) return statusText('Este navegador não oferece notificações.');
  // Asking again is harmless: when the person blocked notifications, the browser answers "denied" without a prompt.
  let result = permission();
  if (result !== 'granted') result = requested = await Notification.requestPermission();
  if (result !== 'granted') {
    updateSettings({ enabled: false });
    return statusText('As notificações foram bloqueadas. Libere-as nas configurações do navegador para este site.');
  }
  storage.set(LAST_CHECK_KEY, String(Date.now()));
  updateSettings({ enabled: true });
  toast('Lembretes ativados neste dispositivo.');
}

function statusText(text: string) {
  const element = maybe('#notification-status');
  if (element) element.textContent = text;
}

export function renderSettings() {
  const enabled = maybe<HTMLInputElement>('#notify-enabled');
  if (!enabled) return;
  enabled.checked = settings.enabled && permission() === 'granted';
  $<HTMLInputElement>('#notify-tasks').checked = settings.tasks;
  $<HTMLInputElement>('#notify-summary').checked = settings.summary;
  $<HTMLInputElement>('#notify-summary-time').value = settings.summaryTime;
  const lead = $<HTMLSelectElement>('#notify-lead');
  lead.value = String(settings.lead);
  lead.dispatchEvent(new Event('change'));
  $('#notify-options').hidden = !enabled.checked;
  statusText(
    !supported()
      ? 'Este navegador não oferece notificações.'
      : permission() === 'denied'
        ? 'As notificações estão bloqueadas para este site. Libere-as nas configurações do navegador.'
        : enabled.checked
          ? 'Ativas neste dispositivo enquanto o app estiver aberto em uma aba.'
          : 'Receba avisos das tarefas com horário e um resumo do dia.',
  );
}

export function setupNotifications() {
  // The service worker is only used to display notifications and handle their clicks.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => (worker = registration))
      .catch(() => (worker = null));
    navigator.serviceWorker.addEventListener?.('message', (event) => {
      if (event.data?.type === 'open-task') openTarget(event.data.taskId);
    });
  }

  $('#notify-enabled').addEventListener('change', (event) => enable((event.target as HTMLInputElement).checked));
  $('#notify-tasks').addEventListener('change', (event) =>
    updateSettings({ tasks: (event.target as HTMLInputElement).checked }),
  );
  $('#notify-summary').addEventListener('change', (event) =>
    updateSettings({ summary: (event.target as HTMLInputElement).checked }),
  );
  $('#notify-summary-time').addEventListener('change', (event) =>
    updateSettings({ summaryTime: (event.target as HTMLInputElement).value }),
  );
  $('#notify-lead').addEventListener('change', (event) => {
    // renderSettings() dispatches a non-bubbling change only to refresh the picker label.
    if (event.bubbles) updateSettings({ lead: Number((event.target as HTMLSelectElement).value) });
  });
  $('#notify-test').addEventListener('click', () =>
    show({ title: brand.name, body: 'Tudo certo! Os lembretes vão aparecer assim.', tag: 'test-' + Date.now() }),
  );

  setInterval(() => check(), CHECK_EVERY);
  document.addEventListener('visibilitychange', () => check());
  check();
}
