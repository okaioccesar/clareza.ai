/**
 * Accounts and sync (Supabase auth + /api/workspace).
 *
 * - The workspace is only shown after a session is restored (the landing is shown otherwise).
 * - Each account has its own offline copy; guest data is never uploaded without an explicit import.
 * - Writes carry the last known revision; the server rejects stale writes and the user picks a version.
 */
import type { Workspace } from '../../core/model.ts';
import { dateKey } from '../../core/dates.ts';
import { merge, newId, normalize } from '../../core/workspace.ts';
import { empty, equal, hasContent, parseCache, reconcile, type CacheRecord } from '../../core/sync.ts';
import { $, downloadJSON, maybe, storage } from '../dom.ts';
import { GUEST_KEY, readGuest, saveGuest, setStatus, store, useSaver } from '../store.ts';
import { toast } from '../toast.ts';
import { render } from '../render.ts';
import { LOCKED_EVENT, PROFILE_EVENT, profile } from '../session.ts';
import { brand } from '../../brand.ts';

type Phase = 'local' | 'connecting' | 'clean' | 'pending' | 'offline' | 'conflict' | 'expired' | 'error';
type AuthMode = 'signin' | 'signup' | 'reset' | 'recovery';

interface User {
  id: string;
  email?: string;
  is_anonymous?: boolean;
  user_metadata?: Record<string, string | undefined>;
}
interface Session {
  access_token: string;
  user: User;
}
interface AuthResult<T> {
  data: T;
  error?: { code?: string; message?: string } | null;
}
/** The subset of the Supabase client used here (also implemented by test doubles). */
interface AuthClient {
  auth: {
    onAuthStateChange(listener: (event: string, session: Session | null) => void): unknown;
    getSession(): Promise<AuthResult<{ session: Session | null }>>;
    getUser(): Promise<AuthResult<{ user: User }>>;
    signInWithOAuth(options: unknown): Promise<AuthResult<unknown>>;
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<AuthResult<{ session: Session | null }>>;
    signUp(input: unknown): Promise<AuthResult<unknown>>;
    resetPasswordForEmail(email: string, options: unknown): Promise<AuthResult<unknown>>;
    updateUser(input: unknown): Promise<AuthResult<{ user: User }>>;
    signOut(options: unknown): Promise<AuthResult<unknown> | { error?: unknown }>;
  };
}
declare global {
  interface Window {
    ClarezaAuth?: { createClient(url: string, key: string, options: unknown): AuthClient };
    ClarezaAccount?: typeof accountApi;
  }
}

interface RemoteResult {
  user: { id: string; email?: string };
  revision: number;
  data?: unknown;
  conflict: boolean;
}

const MESSAGES: Record<Phase, string> = {
  local: 'Salvo neste navegador',
  connecting: 'Conectando sua conta…',
  clean: 'Sincronizado',
  pending: 'Salvo neste navegador · sincronizando…',
  offline: 'Salvo neste navegador · sem conexão',
  conflict: 'Duas versões · escolha como continuar',
  expired: 'Entre novamente para sincronizar',
  error: 'Não foi possível sincronizar',
};

const cacheKey = (id: string) => `${GUEST_KEY}.account.${id}`;
const httpError = (message: string, status?: number) => Object.assign(new Error(message), { status });

// ——— State ———
let client: AuthClient | null = null;
let session: Session | null = null;
let account: { id: string; email?: string } | null = null;
let initializing = true;
let available = false;
let connecting = false;
let generation = 0;
let revision = 0;
let dirty = false;
let writeId = newId();
let phase: Phase = 'local';
let conflict: RemoteResult | null = null;
let flight: { generation: number; id: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastData = '';
let lastCacheRaw = '';
let authMode: AuthMode = 'signin';
let busy = false;
let reconnecting = false;
let latestBackup = '';
let publicConfig: { url: string; publishableKey: string } | null = null;
let googleEnabled: boolean | null = null;
let checkingGoogle = false;
let localMode = false;
let guestError = '';

const dialog = () => $<HTMLDialogElement>('#account-dialog');
const returnUrl = new URL(location.href);
const returnHash = new URLSearchParams(returnUrl.hash.slice(1));
const returnError = returnUrl.searchParams.get('error') || returnHash.get('error');
const returnCode = returnUrl.searchParams.has('code');

function message(text: string, error = false) {
  const element = $('#account-message');
  element.textContent = text;
  element.classList.toggle('error', error);
}

function guestData(): Workspace {
  return readGuest();
}

function persist() {
  if (!account) return;
  const key = cacheKey(account.id);
  const existing = localStorage.getItem(key);
  if (existing && existing !== lastCacheRaw) {
    // Another tab wrote pending changes; keep them as a backup before overwriting.
    const other = parseCache(existing);
    if (other?.dirty && !equal(other.data, store.data))
      backup(other.data, 'Alterações de outra aba antes desta gravação');
  }
  const raw = JSON.stringify({ format: 1, revision, data: store.data, dirty, writeId } satisfies CacheRecord);
  localStorage.setItem(key, raw);
  lastCacheRaw = raw;
}

function backup(data: Workspace, label: string) {
  const key = `${cacheKey(account!.id)}.backup.${Date.now()}.${newId()}`;
  localStorage.setItem(key, JSON.stringify({ label, data, createdAt: new Date().toISOString() }));
  latestBackup = key;
}

// ——— Landing / workspace gate ———
const dialogHome = document.createComment('account-dialog-home');

function updateAccess() {
  const shell = $('#app-shell');
  const landing = $('#login-landing');
  const slot = $('#login-auth-slot');
  const unlocked =
    localMode || (!!account && !!session && !connecting && phase !== 'expired' && authMode !== 'recovery');
  const wasUnlocked = !shell.hidden;
  const loading = !localMode && (initializing || connecting);
  $('#session-loading').hidden = !loading;
  shell.hidden = !unlocked || loading;
  shell.toggleAttribute('inert', shell.hidden);
  landing.hidden = unlocked || loading;
  if (wasUnlocked && !unlocked) document.dispatchEvent(new Event(LOCKED_EVENT));
  if (loading) {
    if (dialog().open) dialog().close();
    return;
  }
  if (unlocked) {
    if (dialog().parentNode === slot) {
      dialog().close();
      dialogHome.after(dialog());
      $('#view').focus();
    }
  } else {
    document
      .querySelectorAll<HTMLDialogElement>('dialog[open]')
      .forEach((modal) => modal !== dialog() && modal.close());
    if (dialog().parentNode !== slot) {
      if (dialog().open) dialog().close();
      slot.append(dialog());
    }
    dialog().open = true;
  }
}

function displayName(): string {
  const meta = session?.user?.user_metadata;
  return meta?.display_name || meta?.full_name || account?.email || '';
}

function update() {
  updateAccess();
  const signedIn = !!account;
  setStatus(signedIn || connecting ? MESSAGES[phase] : localMode ? 'Modo local' : MESSAGES.local);
  profile.name = displayName();
  $('#profile-name').textContent = profile.name || 'Espaço pessoal';
  document.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: signedIn ? session?.user : null }));
  $('#profile-status').textContent = signedIn ? MESSAGES[phase] : localMode ? 'Modo local' : MESSAGES.local;
  $('#account-button-label').textContent = signedIn ? 'Minha conta' : 'Entrar ou criar conta';
  $('#account-open').title = signedIn ? 'Conta e preferências' : 'Entrar ou criar conta';
  $('#account-signed-in').hidden = !signedIn;
  $('#account-auth').hidden = signedIn && !reconnecting && phase !== 'expired';
  $('#account-title').textContent = signedIn ? 'Sua conta' : 'Entre no seu espaço.';
  maybe('.account-intro')?.toggleAttribute('hidden', signedIn);
  $('#account-email').textContent = account?.email || '';
  $('#account-sync-description').textContent = MESSAGES[phase];
  $('#account-conflict').hidden = !conflict;
  $('#account-backup').hidden = !latestBackup;
  $('#account-import').hidden = true;
  if (signedIn) {
    try {
      const guest = guestData();
      if (hasContent(guest)) {
        $('#account-import').hidden = false;
        $('#account-import-description').textContent =
          `Este navegador tem ${guest.tasks.length} tarefas, ${guest.projects.length} projetos e ${guest.pages.length} páginas no modo local.`;
      }
    } catch {
      /* Unreadable guest data is simply not offered for import. */
    }
  }
  const banner = signedIn && ['offline', 'conflict', 'expired', 'error'].includes(phase);
  $('#sync-banner').hidden = !banner;
  $('#sync-banner-text').textContent =
    phase === 'conflict'
      ? 'Outro dispositivo alterou o espaço. Suas alterações foram preservadas; escolha como continuar.'
      : MESSAGES[phase];

  const offline = navigator.onLine === false;
  $<HTMLButtonElement>('#account-submit').disabled = !available || busy || connecting;
  $('#account-google-section').hidden = authMode === 'reset' || authMode === 'recovery';
  $<HTMLButtonElement>('#account-google').disabled =
    !available || busy || connecting || googleEnabled !== true || offline;
  $('#account-google-status').textContent = offline
    ? 'Conecte-se à internet para entrar com Google.'
    : !available
      ? ''
      : checkingGoogle
        ? 'Verificando acesso com Google…'
        : googleEnabled === false
          ? 'O acesso com Google estará disponível em breve.'
          : googleEnabled === null
            ? 'Google indisponível no momento. Você pode entrar por e-mail.'
            : '';
  document
    .querySelectorAll<HTMLButtonElement>('[data-auth-mode], #account-forgot, [data-account-action]')
    .forEach((b) => (b.disabled = busy || connecting));
}

async function checkGoogle() {
  if (!publicConfig || checkingGoogle) return;
  checkingGoogle = true;
  update();
  try {
    const response = await fetch(publicConfig.url.replace(/\/$/, '') + '/auth/v1/settings', {
      headers: { apikey: publicConfig.publishableKey },
      signal: AbortSignal.timeout?.(8000),
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const settings = await response.json();
    googleEnabled = settings.external?.google === true;
  } catch {
    googleEnabled = null;
  } finally {
    checkingGoogle = false;
    update();
  }
}

function cleanAuthReturn() {
  const url = new URL(location.href);
  for (const name of ['error', 'error_code', 'error_description', 'code']) url.searchParams.delete(name);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('error')) {
    for (const name of ['error', 'error_code', 'error_description']) hash.delete(name);
    url.hash = hash.toString();
  }
  history.replaceState(null, '', url.href);
}

function showReturnError() {
  cleanAuthReturn();
  message(
    returnError === 'access_denied'
      ? 'Entrada cancelada. Você pode tentar novamente.'
      : 'Não foi possível concluir o acesso. O link pode ter expirado; tente entrar novamente.',
    true,
  );
  openAccount();
}

function setPhase(value: Phase) {
  phase = value;
  update();
}

// ——— Server ———
async function callApi(method: 'GET' | 'PUT', body?: unknown, active = session): Promise<RemoteResult> {
  if (!active?.access_token) throw httpError('Entre novamente para sincronizar.', 401);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch('/api/workspace', {
      method,
      headers: {
        Authorization: 'Bearer ' + active.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok && response.status !== 409)
      throw httpError(result.error || 'Não foi possível sincronizar.', response.status);
    if (!result.user?.id || !Number.isSafeInteger(result.revision))
      throw new Error('A conta retornou dados inválidos.');
    if (result.user.id !== active.user.id) throw httpError('A sessão não corresponde à conta. Entre novamente.', 401);
    return { ...result, conflict: response.status === 409 };
  } finally {
    clearTimeout(timeout);
  }
}

async function freshSession(owner = account?.id): Promise<Session> {
  const result = await client!.auth.getSession();
  const active = result.data?.session;
  if (result.error || !active || active.user.id !== owner)
    throw httpError('Sua sessão mudou. Entre novamente para sincronizar.', 401);
  return active;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}

/** Saver used while signed in: local cache first, then a debounced upload. */
function saveAccount(): boolean {
  const serialized = JSON.stringify(store.data);
  const previous = { dirty, writeId, lastData };
  if (serialized !== lastData) {
    dirty = true;
    writeId = newId();
    lastData = serialized;
  }
  try {
    persist();
  } catch {
    ({ dirty, writeId, lastData } = previous);
    setPhase('error');
    toast('Não foi possível salvar nesta conta. Exporte uma cópia para preservar as alterações.');
    return false;
  }
  if (dirty && !conflict) {
    setPhase(navigator.onLine === false ? 'offline' : 'pending');
    schedule();
  } else update();
  return true;
}

async function flush() {
  if (!account || !dirty || conflict || flight || connecting) return;
  if (navigator.onLine === false) return setPhase('offline');
  const operation = { generation, id: account.id };
  const payload = JSON.parse(JSON.stringify(store.data));
  const sent = JSON.stringify(payload);
  const sentId = writeId;
  const expected = revision;
  flight = operation;
  setPhase('pending');
  try {
    const active = await freshSession(operation.id);
    if (operation.generation !== generation) return;
    const result = await callApi('PUT', { data: payload, revision: expected, writeId: sentId }, active);
    if (operation.generation !== generation || operation.id !== account?.id) return;
    if (result.conflict) {
      conflict = result;
      return setPhase('conflict');
    }
    revision = result.revision;
    dirty = JSON.stringify(store.data) !== sent;
    persist();
    setPhase(dirty ? 'pending' : 'clean');
  } catch (error) {
    if (operation.generation === generation) {
      setPhase((error as { status?: number }).status === 401 ? 'expired' : 'offline');
      message((error as Error).message, true);
    }
  } finally {
    if (flight === operation) {
      flight = null;
      if (dirty && phase === 'pending') schedule();
    }
  }
}

function restoreGuest() {
  clearTimeout(timer);
  generation++;
  flight = null;
  account = null;
  revision = 0;
  dirty = false;
  conflict = null;
  latestBackup = '';
  lastCacheRaw = '';
  reconnecting = false;
  useSaver(null);
  try {
    store.replace(guestData());
    store.loadError = guestError;
  } catch {
    store.replace(empty());
    store.loadError = 'Os dados locais não puderam ser lidos. A cópia original foi preservada.';
  }
  phase = 'local';
  render();
  update();
}

function openAccountState(
  remote: RemoteResult | null,
  cached: CacheRecord | null,
  user: { id: string; email?: string },
) {
  // Save guest edits made while the account was connecting, before switching data.
  saveGuest();
  account = user;
  profile.name = displayName();
  if (remote) {
    const resolved = reconcile(remote, cached);
    store.replace(resolved.data);
    revision = resolved.revision;
    dirty = resolved.dirty;
    conflict = resolved.conflict ? remote : null;
    writeId = cached?.writeId || newId();
  } else {
    store.replace(cached!.data);
    revision = cached!.revision;
    dirty = cached!.dirty;
    writeId = cached!.writeId;
  }
  lastData = JSON.stringify(store.data);
  store.loadError = '';
  useSaver(saveAccount);
}

async function acceptSession(next: Session | null) {
  if (next && account && next.user.id === account.id) {
    session = next;
    if (phase === 'expired') phase = dirty ? 'pending' : 'clean';
    update();
    if (dirty && !conflict) schedule();
    return;
  }
  if (connecting && next?.user?.id === session?.user?.id) return;
  if (!next) {
    session = null;
    connecting = false;
    generation++;
    if (account) restoreGuest();
    else {
      phase = 'local';
      update();
    }
    return;
  }
  if (account) restoreGuest();
  session = next;
  const current = ++generation;
  connecting = true;
  setPhase('connecting');
  try {
    const remote = await callApi('GET', undefined, next);
    if (current !== generation) return;
    lastCacheRaw = localStorage.getItem(cacheKey(remote.user.id)) || '';
    openAccountState(remote, parseCache(lastCacheRaw), remote.user);
    latestBackup =
      Object.keys(localStorage)
        .filter((key) => key.startsWith(cacheKey(remote.user.id) + '.backup.'))
        .sort()
        .at(-1) || '';
    persist();
    phase = conflict ? 'conflict' : dirty ? 'pending' : 'clean';
    reconnecting = authMode === 'recovery';
    render();
    message('');
  } catch (error) {
    if (current !== generation) return;
    // Offline: open the account's own offline copy. It never replaces the guest storage.
    try {
      lastCacheRaw = localStorage.getItem(cacheKey(next.user.id)) || '';
      const cached = parseCache(lastCacheRaw);
      if (cached && (error as { status?: number }).status !== 401) {
        openAccountState(null, cached, { id: next.user.id, email: next.user.email });
        phase = 'offline';
        render();
      } else phase = 'error';
    } catch {
      phase = 'error';
    }
    message((error as Error).message, true);
  } finally {
    if (current === generation) {
      connecting = false;
      update();
      if (dirty && !conflict && phase === 'pending') schedule();
    }
  }
}

const isEditing = () =>
  !!maybe('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');

async function refresh() {
  if (!account || connecting || flight || conflict) return;
  if (dirty) return flush();
  if (isEditing() || navigator.onLine === false) return;
  const current = generation;
  const readRevision = revision;
  const readData = lastData;
  try {
    const active = await freshSession();
    const remote = await callApi('GET', undefined, active);
    if (current !== generation || dirty || isEditing() || flight || revision !== readRevision || lastData !== readData)
      return;
    if (remote.revision !== revision) {
      store.replace(remote.data ? normalize(remote.data) : empty());
      revision = remote.revision;
      lastData = JSON.stringify(store.data);
      writeId = newId();
      persist();
      render();
    }
    setPhase('clean');
  } catch (error) {
    if (current === generation) setPhase((error as { status?: number }).status === 401 ? 'expired' : 'offline');
  }
}

// ——— Sign-in form ———
function setAuthMode(mode: AuthMode) {
  authMode = mode;
  message('');
  const recovery = mode === 'recovery';
  const reset = mode === 'reset';
  const password = $<HTMLInputElement>('#account-password');
  $('#account-email-label').hidden = recovery;
  $<HTMLInputElement>('#account-email-input').disabled = recovery;
  $('#account-password-label').hidden = reset;
  password.disabled = reset;
  password.minLength = mode === 'signup' || recovery ? 10 : 1;
  password.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('#account-password-label span').textContent = recovery ? 'Nova senha' : 'Senha';
  $('#account-submit').textContent =
    mode === 'signup' ? 'Criar conta' : reset ? 'Enviar recuperação' : recovery ? 'Salvar nova senha' : 'Entrar';
  $('#account-forgot').textContent = mode === 'signin' ? 'Esqueci minha senha' : 'Voltar para entrar';
  $('#account-tabs').hidden = recovery || reset;
  document
    .querySelectorAll<HTMLElement>('[data-auth-mode]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.authMode === mode)));
  update();
}

export function openAccount() {
  update();
  if (!dialog().open) dialog().showModal();
  if (authMode === 'recovery') $('#account-password').focus();
  else if (!account) $('#account-email-input').focus();
  if (!account || reconnecting) checkGoogle();
}

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  over_email_send_rate_limit: 'Aguarde alguns minutos antes de solicitar outro e-mail.',
  weak_password: 'Escolha uma senha mais forte, com pelo menos 10 caracteres.',
  user_already_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
};

async function submitAuth(event: Event) {
  event.preventDefault();
  if (!client || busy) return;
  busy = true;
  update();
  message('Aguarde…');
  try {
    const email = $<HTMLInputElement>('#account-email-input').value.trim();
    const password = $<HTMLInputElement>('#account-password').value;
    const redirect = new URL('/', location.origin).href;
    const auth = client.auth;
    const result =
      authMode === 'signup'
        ? await auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        : authMode === 'reset'
          ? await auth.resetPasswordForEmail(email, { redirectTo: redirect })
          : authMode === 'recovery'
            ? await auth.updateUser({ password })
            : await auth.signInWithPassword({ email, password });
    if (result.error)
      throw new Error(
        AUTH_ERRORS[result.error.code || ''] || 'Não foi possível concluir. Verifique os dados e tente novamente.',
      );
    $<HTMLInputElement>('#account-password').value = '';
    if (authMode === 'signup') message('Confira seu e-mail para confirmar a conta. Depois, volte para entrar.');
    else if (authMode === 'reset')
      message('Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.');
    else if (authMode === 'recovery') {
      setAuthMode('signin');
      reconnecting = false;
      message('Senha atualizada.');
    } else {
      await acceptSession((result.data as { session: Session | null }).session);
      message(account ? 'Conta conectada.' : 'Não foi possível abrir o espaço da conta.', !account);
    }
  } catch (error) {
    message((error as Error).message, true);
  } finally {
    busy = false;
    update();
  }
}

async function signInWithGoogle() {
  if (!client || busy || connecting || googleEnabled !== true) return;
  if (!saveGuest())
    return message('Não foi possível salvar seus dados neste navegador. Exporte uma cópia antes de entrar.', true);
  busy = true;
  update();
  message('Abrindo o Google…');
  $<HTMLInputElement>('#account-password').value = '';
  try {
    const result = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: new URL('/', location.origin).href, queryParams: { prompt: 'select_account' } },
    });
    if (result.error) throw new Error();
  } catch {
    message('Não foi possível abrir o Google. Tente novamente em instantes.', true);
  } finally {
    busy = false;
    update();
  }
}

// ——— Signed-in actions ———
async function accountAction(action: string) {
  if (!account) return;
  if (action === 'export') return downloadJSON(`${brand.slug}-conta-${dateKey()}.json`, store.data);
  if (action === 'backup') {
    try {
      downloadJSON(
        `${brand.slug}-copia-anterior-${dateKey()}.json`,
        JSON.parse(localStorage.getItem(latestBackup)!).data,
      );
    } catch {
      message('Não foi possível abrir a cópia anterior.', true);
    }
    return;
  }
  if (action === 'reconnect') {
    reconnecting = true;
    setAuthMode('signin');
    $<HTMLInputElement>('#account-email-input').value = account.email || '';
    return update();
  }
  if (action === 'sync') {
    if (dirty) await flush();
    else {
      dialog().close();
      await refresh();
    }
    return;
  }
  if (action === 'import') {
    if (conflict) return message('Resolva as duas versões antes de importar.', true);
    try {
      const before = store.data;
      store.replace(merge(store.data, guestData()));
      if (!saveAccount()) return store.replace(before);
      render();
      message('Dados locais adicionados à conta. A cópia local foi mantida.');
    } catch {
      message('Não foi possível ler os dados locais. A cópia foi preservada.', true);
    }
    return;
  }
  if (action === 'use-remote' || action === 'use-local') {
    if (!conflict) return;
    try {
      if (action === 'use-remote') {
        backup(store.data, 'Minha versão antes de carregar a conta');
        store.replace(conflict.data ? normalize(conflict.data) : empty());
        revision = conflict.revision;
        dirty = false;
        writeId = newId();
        lastData = JSON.stringify(store.data);
        conflict = null;
        persist();
        render();
        setPhase('clean');
      } else {
        backup(conflict.data ? normalize(conflict.data) : empty(), 'Versão da conta antes de substituir');
        revision = conflict.revision;
        conflict = null;
        dirty = true;
        writeId = newId();
        persist();
        setPhase('pending');
        schedule();
      }
      message('Escolha aplicada. A cópia anterior está disponível para baixar.');
    } catch {
      message('Não há espaço para guardar a cópia anterior. Exporte o espaço antes de continuar.', true);
    }
    return;
  }
  if (action === 'logout') {
    if (!saveAccount()) return;
    busy = true;
    update();
    try {
      const result = await client!.auth.signOut({ scope: 'local' });
      if ((result as { error?: unknown }).error)
        throw new Error('Não foi possível sair. Verifique sua conexão e tente novamente.');
      session = null;
      connecting = false;
      restoreGuest();
      message('Você saiu. A cópia da conta permanece separada dos dados locais.');
    } catch (error) {
      message((error as Error).message, true);
    } finally {
      busy = false;
      update();
    }
  }
}

/** Used by the profile and assistant modules. */
const accountApi = {
  async profile(): Promise<User | null> {
    if (!account) return null;
    const result = await client!.auth.getUser();
    if (result.error) throw new Error('Não foi possível carregar o perfil.');
    return result.data.user;
  },
  async saveProfile(data: Record<string, string>): Promise<User> {
    await freshSession();
    const owner = account!.id;
    const result = await client!.auth.updateUser({ data });
    if (result.error) throw new Error('Não foi possível salvar o perfil. Tente novamente.');
    if (account?.id !== owner) throw new Error('A sessão mudou.');
    session!.user = result.data.user;
    update();
    render(); // The greeting on "Hoje" uses the display name.
    return result.data.user;
  },
  accessToken: async (): Promise<string | null> => (account ? (await freshSession()).access_token : null),
  get signedIn() {
    return !!account;
  },
};
export const accountService = accountApi;

// ——— Startup ———
interface PublicConfig {
  configured?: boolean;
  url?: string;
  publishableKey?: string;
}

async function loadConfig(): Promise<PublicConfig | null> {
  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout?.(10_000) });
    const config = (await response.json()) as PublicConfig;
    if (!response.ok) throw new Error('Configuração indisponível');
    if (config.configured)
      storage.set(
        'clareza.public-config',
        JSON.stringify({ configured: true, url: config.url, publishableKey: config.publishableKey }),
      );
    return config;
  } catch {
    try {
      return JSON.parse(storage.get('clareza.public-config') || 'null');
    } catch {
      return null;
    }
  }
}

const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

async function initialize() {
  try {
    const config = await loadConfig();
    if (
      !config?.configured ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') ||
      !String(config.publishableKey).startsWith('sb_publishable_')
    ) {
      message('As contas online ainda não estão disponíveis. Recarregue a página para tentar novamente.');
      // During development without Supabase, allow using the app with browser storage only.
      $('#local-mode').hidden = !isLocalHost();
      return;
    }
    if (!window.ClarezaAuth) throw new Error('Auth client missing');
    client = window.ClarezaAuth.createClient(config.url!, config.publishableKey!, {
      auth: {
        flowType: 'pkce',
        storageKey: 'clareza.auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    publicConfig = { url: config.url!, publishableKey: config.publishableKey! };
    available = true;
    checkGoogle();
    client.auth.onAuthStateChange((event, next) => {
      // Supabase recommends not awaiting inside this callback.
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') {
          reconnecting = true;
          setAuthMode('recovery');
          openAccount();
        }
        acceptSession(next);
      }, 0);
    });
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    await acceptSession(result.data.session);
    setInterval(refresh, 30_000);
    if (returnError || (returnCode && new URL(location.href).searchParams.has('code'))) showReturnError();
  } catch {
    if (returnError || returnCode) showReturnError();
    else message('Não foi possível conectar as contas. Verifique a conexão e recarregue a página.', true);
  } finally {
    initializing = false;
    update();
  }
}

export function setupAccount() {
  guestError = store.loadError;
  dialog().before(dialogHome);
  window.ClarezaAccount = accountApi;

  $('#account-open').addEventListener('click', openAccount);
  $('#sync-banner-action').addEventListener('click', openAccount);
  $('#account-google').addEventListener('click', signInWithGoogle);
  $('#account-forgot').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'reset' : 'signin'));
  document
    .querySelectorAll<HTMLElement>('[data-auth-mode]')
    .forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.authMode as AuthMode)));
  $('#account-form').addEventListener('submit', submitAuth);
  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-account-action]');
    if (button && !busy) accountAction(button.dataset.accountAction!);
  });
  $('#local-mode-start').addEventListener('click', () => {
    localMode = true;
    message('');
    update();
    render();
  });

  window.addEventListener('online', () => {
    if (dirty) flush();
    else refresh();
    if (dialog().open) checkGoogle();
  });
  window.addEventListener('offline', update);
  window.addEventListener('storage', (event) => {
    if (!account || event.key !== cacheKey(account.id) || !event.newValue || dirty || isEditing()) return;
    try {
      const other = parseCache(event.newValue);
      if (other && !other.dirty && other.revision >= revision) {
        store.replace(other.data);
        revision = other.revision;
        lastData = JSON.stringify(store.data);
        lastCacheRaw = event.newValue;
        writeId = other.writeId;
        render();
        setPhase('clean');
      }
    } catch {
      /* A corrupt cache from another tab is ignored. */
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  // While signed out, the landing is the only interactive surface.
  dialog().addEventListener('cancel', (event) => {
    if (!$('#login-landing').hidden) event.preventDefault();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        !$('#login-landing').hidden &&
        (!$('#login-auth-slot').contains(event.target as Node) ||
          event.ctrlKey ||
          event.metaKey ||
          event.key === 'Escape')
      )
        event.stopImmediatePropagation();
    },
    true,
  );

  update();
  initialize();
}
