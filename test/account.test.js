// Accounts and sync: ported from the original suite, run against the new modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalize } from '../src/core/workspace.ts';
import { boot, tick, cacheKey, GUEST_KEY, SESSION } from './helpers/browser.js';

const guestWith = (id, title) => normalize({ tasks: [{ id, title }] });
const cached = (app) => JSON.parse(app.w.localStorage.getItem(cacheKey));

test('login não envia dados locais antes da importação e logout não mistura contas', async (t) => {
  const app = await boot(t, { guest: guestWith('guest', 'Tarefa local') });
  await app.login();
  assert.equal(app.data().tasks.length, 0);
  assert.equal(app.writes.length, 0);
  assert.equal(JSON.parse(app.w.localStorage.getItem(GUEST_KEY)).tasks.length, 1);
  app.$('[data-account-action="import"]').click();
  await app.sync();
  assert.equal(app.remote.data.tasks[0].title, 'Tarefa local');
  app.add('Só na minha conta');
  await app.sync();
  assert.equal(app.remote.data.tasks.length, 2);
  app.$('[data-account-action="logout"]').click();
  await tick();
  assert.deepEqual(
    app.data().tasks.map((task) => task.id),
    ['guest'],
  );
  assert.equal(app.text('#profile-name'), 'Espaço pessoal');
});

test('alterações offline sobrevivem na cópia da conta e são enviadas quando a conexão volta', async (t) => {
  const app = await boot(t, { signedIn: true });
  app.network(true);
  app.add('Tarefa offline');
  await app.sync();
  assert.equal(cached(app).dirty, true);
  assert.equal(cached(app).data.tasks[0].title, 'Tarefa offline');
  assert.equal(app.remote.revision, 0);
  app.network(false);
  app.w.dispatchEvent(new app.w.Event('online'));
  await tick();
  assert.equal(app.remote.data.tasks[0].title, 'Tarefa offline');
  assert.equal(app.text('#save-status'), 'Sincronizado');
});

test('conflito exige escolha e guarda cópia antes de carregar a versão remota', async (t) => {
  const app = await boot(t, { signedIn: true });
  app.add('Minha versão');
  app.remote.revision = 1;
  app.remote.data = guestWith('remote', 'Versão do outro dispositivo');
  await app.sync();
  assert.equal(app.$('#account-conflict').hidden, false);
  assert.equal(app.data().tasks[0].title, 'Minha versão');
  app.$('[data-account-action="use-remote"]').click();
  assert.equal(app.data().tasks[0].title, 'Versão do outro dispositivo');
  assert.equal(app.$('#account-backup').hidden, false);
  const backupKey = Object.keys(app.w.localStorage).find((k) => k.includes('.backup.'));
  assert.equal(JSON.parse(app.w.localStorage.getItem(backupKey)).data.tasks[0].title, 'Minha versão');
});

test('cópia pendente é carregada sem ser apagada por uma conta ainda vazia', async (t) => {
  const cache = {
    format: 1,
    revision: 0,
    data: guestWith('offline', 'Pendente de envio'),
    dirty: true,
    writeId: crypto.randomUUID(),
  };
  const app = await boot(t, { signedIn: true, cache });
  assert.equal(app.data().tasks[0].title, 'Pendente de envio');
  await app.sync();
  assert.equal(app.remote.data.tasks[0].title, 'Pendente de envio');
});

test('edições durante um envio permanecem pendentes até o próximo envio', async (t) => {
  const app = await boot(t, { signedIn: true });
  const release = app.hold('PUT');
  app.add('Primeira');
  await app.sync();
  app.add('Segunda');
  release();
  await tick();
  assert.equal(cached(app).dirty, true);
  assert.equal(cached(app).data.tasks.length, 2);
  assert.equal(app.remote.data.tasks.length, 1);
  await app.sync();
  assert.equal(cached(app).dirty, false);
  assert.equal(app.remote.data.tasks.length, 2);
  assert.equal(app.remote.revision, 2);
});

test('sair durante a abertura da conta impede que a resposta substitua o espaço local', async (t) => {
  const app = await boot(t, { guest: guestWith('guest', 'Local preservado') });
  const release = app.hold('GET');
  await app.login();
  app.auth('SIGNED_OUT', null);
  await tick();
  release();
  await tick();
  assert.equal(app.data().tasks[0].title, 'Local preservado');
  assert.equal(app.text('#profile-name'), 'Espaço pessoal');
  assert.equal(app.writes.length, 0);
});

test('uma sessão de outra conta não pode receber alterações da conta anterior', async (t) => {
  const app = await boot(t, { signedIn: true });
  app.add('Privada da primeira conta');
  app.setSession({ ...SESSION, user: { id: '22222222-2222-4222-8222-222222222222', email: 'second@test.invalid' } });
  await app.sync();
  assert.equal(app.writes.length, 0);
  assert.equal(app.text('#save-status'), 'Entre novamente para sincronizar');
  assert.equal(cached(app).dirty, true);
});

test('recuperação mantém o formulário de nova senha visível depois de carregar a conta', async (t) => {
  const app = await boot(t);
  app.auth('PASSWORD_RECOVERY', structuredClone(SESSION));
  await tick();
  await tick();
  assert.equal(app.$('#account-auth').hidden, false);
  assert.equal(app.$('#account-email-label').hidden, true);
  assert.equal(app.text('#account-submit'), 'Salvar nova senha');
  assert.equal(app.$('#account-dialog').open, true);
});

test('uma leitura antiga não substitui alterações já sincronizadas durante a espera', async (t) => {
  const app = await boot(t, { signedIn: true });
  const release = app.hold('GET');
  app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));
  await tick();
  app.add('Alteração mais recente');
  await app.sync();
  assert.equal(app.remote.revision, 1);
  release();
  await tick();
  assert.equal(app.data().tasks[0].title, 'Alteração mais recente');
  assert.equal(cached(app).revision, 1);
});

test('Google inicia OAuth com PKCE, retorno ao próprio site e sem enviar dados locais', async (t) => {
  const app = await boot(t, { guest: guestWith('guest', 'Dado local privado') });
  app.$('#account-open').click();
  app.$('#account-google').click();
  await tick();
  assert.equal(app.clientOptions.auth.flowType, 'pkce');
  assert.equal(app.clientOptions.auth.detectSessionInUrl, true);
  assert.equal(app.oauthCalls.length, 1);
  assert.equal(app.oauthCalls[0].provider, 'google');
  assert.equal(app.oauthCalls[0].options.redirectTo, 'https://clareza.example/');
  assert.equal(app.oauthCalls[0].options.queryParams.prompt, 'select_account');
  assert.equal(app.oauthCalls[0].options.scopes, undefined);
  assert.equal(app.writes.length, 0);
  assert.equal(JSON.parse(app.w.localStorage.getItem(GUEST_KEY)).tasks[0].id, 'guest');
  app.auth('SIGNED_IN', structuredClone(SESSION));
  await tick();
  await tick();
  assert.equal(app.data().tasks.length, 0);
  assert.equal(app.writes.length, 0);
});

test('Google desabilitado não inicia redirecionamento e mantém login por e-mail disponível', async (t) => {
  const app = await boot(t, { googleEnabled: false });
  app.$('#account-open').click();
  await tick();
  assert.equal(app.$('#account-google').disabled, true);
  assert.match(app.text('#account-google-status'), /disponível em breve/);
  app.$('#account-google').click();
  assert.equal(app.oauthCalls.length, 0);
  assert.equal(app.$('#account-submit').disabled, false);
});

test('Google não redireciona se a cópia local falhar ao salvar', async (t) => {
  const app = await boot(t);
  app.$('#account-open').click();
  const original = app.w.Storage.prototype.setItem;
  app.w.Storage.prototype.setItem = function (key, value) {
    if (key === GUEST_KEY) throw new Error('Quota');
    return original.call(this, key, value);
  };
  app.$('#account-google').click();
  await tick();
  assert.equal(app.oauthCalls.length, 0);
  assert.match(app.text('#account-message'), /Exporte uma cópia/);
});

test('falha ao abrir Google não revela resposta do provedor e permite tentar de novo', async (t) => {
  const app = await boot(t, { oauthError: { message: 'sensitive-provider-detail' } });
  app.$('#account-open').click();
  app.$('#account-google').click();
  await tick();
  assert.match(app.text('#account-message'), /Não foi possível abrir o Google/);
  assert.doesNotMatch(app.text('#account-message'), /sensitive-provider-detail/);
  assert.equal(app.$('#account-google').disabled, false);
});

test('retorno cancelado limpa parâmetros de autenticação e preserva a rota e os dados locais', async (t) => {
  const app = await boot(t, {
    guest: guestWith('local', 'Continuar aqui'),
    url: 'https://clareza.example/?error=access_denied&error_description=private-provider-error&keep=1#today',
  });
  assert.equal(app.$('#account-dialog').open, true);
  assert.match(app.text('#account-message'), /Entrada cancelada/);
  assert.equal(app.w.location.search, '?keep=1');
  assert.equal(app.w.location.hash, '#today');
  assert.equal(app.data().tasks[0].id, 'local');
  assert.equal(app.writes.length, 0);
});

test('código de retorno expirado é removido e oferece nova tentativa de login', async (t) => {
  const app = await boot(t, {
    sessionError: new Error('Expired code'),
    url: 'https://clareza.example/?code=expired-code#inbox',
  });
  assert.equal(app.w.location.search, '');
  assert.equal(app.w.location.hash, '#inbox');
  assert.equal(app.$('#account-dialog').open, true);
  assert.match(app.text('#account-message'), /link pode ter expirado/);
});

test('retorno sem verificador PKCE não simula sucesso nem deixa código na URL', async (t) => {
  const app = await boot(t, { url: 'https://clareza.example/?code=unprocessed-code' });
  assert.equal(app.w.location.search, '');
  assert.match(app.text('#account-message'), /tente entrar novamente/);
  assert.equal(app.$('#account-dialog').open, true);
  assert.equal(app.writes.length, 0);
});

test('o espaço fica oculto até o login e a página de entrada volta ao sair', async (t) => {
  const app = await boot(t);
  assert.equal(app.$('#app-shell').hidden, true);
  assert.equal(app.$('#app-shell').hasAttribute('inert'), true);
  assert.equal(app.$('#login-landing').hidden, false);
  assert.equal(app.$('#account-dialog').parentNode.id, 'login-auth-slot');
  await app.login();
  assert.equal(app.$('#app-shell').hidden, false);
  assert.equal(app.$('#app-shell').hasAttribute('inert'), false);
  assert.equal(app.$('#login-landing').hidden, true);
  app.$('[data-account-action="logout"]').click();
  await tick();
  assert.equal(app.$('#app-shell').hidden, true);
  assert.equal(app.$('#login-landing').hidden, false);
});

test('sessão restaurada abre o espaço e sessão perdida o bloqueia de novo', async (t) => {
  const app = await boot(t, { signedIn: true });
  assert.equal(app.$('#app-shell').hidden, false);
  app.auth('SIGNED_OUT', null);
  await tick();
  assert.equal(app.$('#app-shell').hidden, true);
  assert.equal(app.$('#account-dialog').parentNode.id, 'login-auth-slot');
});

test('página de entrada fecha o menu móvel ao perder a sessão e libera o espaço ao entrar de novo', async (t) => {
  const app = await boot(t, { signedIn: true, mobile: true });
  app.$('#mobile-menu').click();
  assert.equal(app.w.document.body.classList.contains('mobile-nav-open'), true);
  assert.equal(app.$('main').hasAttribute('inert'), true);
  app.auth('SIGNED_OUT', null);
  await tick();
  assert.equal(app.$('#login-landing').hidden, false);
  assert.equal(app.w.document.body.classList.contains('mobile-nav-open'), false);
  assert.equal(app.$('#sidebar-backdrop').hidden, true);
  assert.equal(app.$('#mobile-menu').getAttribute('aria-expanded'), 'false');
  await app.login();
  assert.equal(app.$('#app-shell').hidden, false);
  assert.equal(app.$('main').hasAttribute('inert'), false);
});

test('restauração lenta mantém o carregamento sem mostrar o login e libera a sessão', async (t) => {
  let release;
  const sessionWait = new Promise((resolve) => (release = resolve));
  const app = await boot(t, { signedIn: true, sessionWait });
  assert.equal(app.$('#session-loading').hidden, false);
  assert.equal(app.$('#login-landing').hidden, true);
  assert.equal(app.$('#app-shell').hidden, true);
  release();
  await tick();
  await tick();
  assert.equal(app.$('#session-loading').hidden, true);
  assert.equal(app.$('#login-landing').hidden, true);
  assert.equal(app.$('#app-shell').hidden, false);
});

test('atualização remota em andamento não fecha nem substitui a edição do modal', async (t) => {
  const app = await boot(t, { signedIn: true });
  app.add('Editar depois');
  await app.sync();
  const release = app.hold('GET');
  app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));
  await tick();
  app.$('.task-row [data-action="edit-task"]').click();
  app.$('#entity-form [name="title"]').value = 'Rascunho ainda não salvo';
  app.remote.revision++;
  release();
  await tick();
  assert.equal(app.$('#entity-dialog').open, true);
  assert.equal(app.$('#entity-form [name="title"]').value, 'Rascunho ainda não salvo');
});

test('perfil salva nome e descrição na conta, atualiza a barra lateral e recusa links inseguros', async (t) => {
  const app = await boot(t, { signedIn: true });
  app.$('#profile-open').click();
  await tick();
  app.$('#profile-display-name').value = 'Kaio César';
  app.$('#profile-bio').value = 'Empreendedor';
  app.submit('#profile-form');
  await tick();
  assert.equal(app.text('#profile-name'), 'Kaio César');
  assert.match(app.text('#profile-message'), /salvo/);
  assert.match(app.text('.today-heading h1'), /, Kaio\.$/, 'a saudação usa o primeiro nome');
  app.$('#profile-dialog').close();
  app.$('#profile-open').click();
  await tick();
  assert.equal(app.$('#profile-bio').value, 'Empreendedor');
  app.$('#profile-photo').value = 'javascript:alert(1)';
  app.submit('#profile-form');
  await tick();
  assert.match(app.text('#profile-message'), /HTTPS/);
});

test('sem contas configuradas, o modo local só aparece em localhost', async (t) => {
  const production = await boot(t, { configured: false });
  assert.equal(production.$('#local-mode').hidden, true);
  assert.equal(production.$('#app-shell').hidden, true);
  const local = await boot(t, { configured: false, url: 'http://localhost:4187/' });
  assert.equal(local.$('#local-mode').hidden, false);
  local.$('#local-mode-start').click();
  assert.equal(local.$('#app-shell').hidden, false);
  local.add('Tarefa local');
  assert.equal(JSON.parse(local.w.localStorage.getItem(GUEST_KEY)).tasks[0].title, 'Tarefa local');
});
