/** Preferences dialog: appearance, notifications and backup. */
import { dateKey } from '../../core/dates.ts';
import { merge, normalize } from '../../core/workspace.ts';
import { $, downloadJSON } from '../dom.ts';
import { store } from '../store.ts';
import { toast } from '../toast.ts';
import { commit } from '../render.ts';
import { brand } from '../../brand.ts';
import { renderSettings } from './notifications.ts';

export function openSettings() {
  const account = $<HTMLDialogElement>('#account-dialog');
  if (account.open) account.close();
  renderSettings();
  $<HTMLDialogElement>('#settings-dialog').showModal();
}

export function setupSettings() {
  $('#settings-open').addEventListener('click', openSettings);

  $('#export').addEventListener('click', () => {
    downloadJSON(`${brand.slug}-espaco-${dateKey()}.json`, { ...store.data, exportedAt: new Date().toISOString() });
    toast('Cópia do espaço exportada.');
  });

  $('#import').addEventListener('click', () => $('#import-file').click());
  $<HTMLInputElement>('#import-file').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('A cópia precisa ter menos de 10 MB.');
      const incoming = normalize(JSON.parse(await file.text()));
      const previous = structuredClone(store.data);
      store.replace(merge(store.data, incoming));
      store.loadError = '';
      $<HTMLDialogElement>('#settings-dialog').close();
      commit('Cópia importada. Os registros existentes foram preservados.', () => {
        store.replace(previous);
        commit('Importação desfeita.');
      });
    } catch (error) {
      toast((error as Error).message || 'Não foi possível importar.');
    }
    input.value = '';
  });
}
