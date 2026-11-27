/** Profile dialog: display name, bio and photo stored in the account's metadata. */
import { $ } from '../dom.ts';
import { LOCKED_EVENT, PROFILE_EVENT } from '../session.ts';
import { accountService } from './account.ts';

interface ProfileUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, string | undefined>;
}

/** Only plain HTTPS image links are accepted (no credentials, no other schemes). */
export function photoURL(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'EU'
  );
}

export function setupProfile() {
  const dialog = $<HTMLDialogElement>('#profile-dialog');
  const form = $<HTMLFormElement>('#profile-form');
  const avatar = $('#profile-open');
  const status = $('#profile-message');
  const saveButton = $<HTMLButtonElement>('#profile-save');
  const field = (id: string) => $<HTMLInputElement>(id);
  let owner: string | null = null;
  let version = 0;

  function display(user: ProfileUser | null) {
    const meta = user?.user_metadata || {};
    avatar.replaceChildren(document.createTextNode(initials(meta.display_name || meta.full_name || user?.email || '')));
    const url = photoURL(meta.profile_photo ?? meta.avatar_url ?? '');
    if (url) {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      img.onerror = () => img.remove();
      avatar.append(img);
    }
  }

  document.addEventListener(PROFILE_EVENT, (event) => display((event as CustomEvent<ProfileUser | null>).detail));

  avatar.addEventListener('click', async () => {
    const current = ++version;
    form.reset();
    dialog.showModal();
    status.textContent = 'Carregando perfil…';
    saveButton.disabled = true;
    try {
      const user = await accountService.profile();
      if (current !== version) return;
      if (!user) throw new Error('Entre na sua conta para editar o perfil.');
      owner = user.id;
      const meta = user.user_metadata || {};
      field('#profile-display-name').value = meta.display_name || meta.full_name || '';
      field('#profile-bio').value = meta.bio || '';
      field('#profile-photo').value = meta.profile_photo ?? meta.avatar_url ?? '';
      display(user);
      status.textContent = '';
      saveButton.disabled = false;
      field('#profile-display-name').focus();
    } catch (error) {
      if (current === version) status.textContent = (error as Error).message;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveButton.disabled) return;
    const name = field('#profile-display-name').value.trim();
    const photo = field('#profile-photo').value.trim();
    if (!name) return void (status.textContent = 'Preencha seu nome.');
    if (photo && !photoURL(photo)) return void (status.textContent = 'Use um link HTTPS válido para a foto.');
    const current = version;
    saveButton.disabled = true;
    status.textContent = 'Salvando…';
    try {
      const user = await accountService.profile();
      if (current !== version || user?.id !== owner) return;
      const saved = await accountService.saveProfile({
        display_name: name,
        bio: field('#profile-bio').value.trim(),
        profile_photo: photo,
      });
      if (current !== version) return;
      display(saved);
      status.textContent = 'Perfil salvo na sua conta.';
    } catch (error) {
      if (current === version) status.textContent = (error as Error).message;
    } finally {
      if (current === version) saveButton.disabled = false;
    }
  });

  document.addEventListener(LOCKED_EVENT, () => {
    version++;
    owner = null;
    dialog.close();
    form.reset();
    display(null);
  });
}
