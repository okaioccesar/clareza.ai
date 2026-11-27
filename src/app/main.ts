/** Application entry point: wires every module once the DOM is ready. */
import { hydrateIcons } from './icons.ts';
import { flushAutosave, loadGuest, onSaveError, save, store } from './store.ts';
import { setupToast, toast } from './toast.ts';
import { readRoute, showLoadError } from './render.ts';
import { setupActions } from './features/actions.ts';
import { setupEntityForm } from './features/entity-form.ts';
import { setupCommand } from './features/command.ts';
import { setupShell } from './features/shell.ts';
import { setupPickers } from './features/pickers.ts';
import { setupReview } from './features/review.ts';
import { setupAssistant } from './features/assistant.ts';
import { setupProfile } from './features/profile.ts';
import { setupSettings } from './features/settings.ts';
import { setupNotifications } from './features/notifications.ts';
import { setupAccount } from './features/account.ts';

function start() {
  loadGuest();
  hydrateIcons();
  setupToast();
  onSaveError((message) => toast(message));
  setupShell();
  setupActions();
  setupEntityForm();
  setupCommand();
  setupReview();
  setupAssistant();
  setupProfile();
  setupSettings();
  setupNotifications();
  setupPickers();
  setupAccount();

  window.addEventListener('hashchange', readRoute);
  window.addEventListener('beforeunload', () => {
    flushAutosave();
    save();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushAutosave();
  });

  readRoute();
  showLoadError();

  // Read-only snapshot of the workspace on screen, used by automated tests and handy in the console.
  Object.defineProperty(window, 'clareza', { value: Object.freeze({ snapshot: () => structuredClone(store.data) }) });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
