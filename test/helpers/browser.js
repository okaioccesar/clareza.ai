// Boots the built app (dist/) in jsdom with a fake Supabase client and API.
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { normalize } from '../../src/core/workspace.ts';

export const GUEST_KEY = 'clareza.workspace.v3';
export const UID = '11111111-1111-4111-8111-111111111111';
export const SESSION = {
  access_token: 'test-session-token',
  user: { id: UID, email: 'owner@test.invalid', user_metadata: {} },
};
export const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
export const cacheKey = GUEST_KEY + '.account.' + UID;

const html = fs.readFileSync('dist/index.html', 'utf8');
const scripts = ['theme.js', 'app.js'].map((file) => [file, fs.readFileSync('dist/' + file, 'utf8')]);

export async function boot(
  t,
  {
    guest = normalize({ tasks: [] }),
    remote: remoteData = null,
    signedIn = false,
    sessionWait = null,
    cache = null,
    offline = false,
    mobile = false,
    googleEnabled = true,
    oauthError = null,
    sessionError = null,
    configured = true,
    url = 'https://clareza.example/',
    beforeStart = () => {},
  } = {},
) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  const $ = (selector) => w.document.querySelector(selector);

  let active = signedIn ? structuredClone(SESSION) : null;
  let listener = () => {};
  let networkDown = offline;
  const remote = { revision: remoteData ? 1 : 0, data: remoteData };
  const writes = [];
  const oauthCalls = [];
  const holds = { GET: null, PUT: null };
  let clientOptions;

  const mediaQueries = [];
  w.matchMedia = (query) => {
    const media = { matches: query.includes('max-width') ? mobile : false, listeners: [] };
    media.addEventListener = (_name, fn) => media.listeners.push(fn);
    media.removeEventListener = () => {};
    mediaQueries.push({ query, media });
    return media;
  };
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.crypto.randomUUID = crypto.randomUUID;
  Object.defineProperty(w.navigator, 'onLine', { get: () => !networkDown });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  if (cache) w.localStorage.setItem(cacheKey, JSON.stringify(cache));

  w.ClarezaAuth = {
    createClient(_url, _key, options) {
      clientOptions = options;
      return {
        auth: {
          onAuthStateChange: (fn) => (listener = fn),
          getSession: async () => {
            if (sessionWait) await sessionWait;
            return { data: { session: active }, error: sessionError };
          },
          signInWithOAuth: async (options) => {
            oauthCalls.push(options);
            return { data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: oauthError };
          },
          signInWithPassword: async () => {
            active = structuredClone(SESSION);
            listener('SIGNED_IN', active);
            return { data: { session: active } };
          },
          signOut: async () => {
            active = null;
            listener('SIGNED_OUT', null);
            return {};
          },
          signUp: async () => ({ data: { session: null } }),
          resetPasswordForEmail: async () => ({}),
          getUser: async () => ({ data: { user: active?.user } }),
          updateUser: async ({ data } = {}) => {
            if (data)
              active = {
                ...active,
                user: { ...active.user, user_metadata: { ...active.user.user_metadata, ...data } },
              };
            return { data: { user: active?.user } };
          },
        },
      };
    },
  };

  const response = (status, body) => ({ ok: status < 400, status, json: async () => structuredClone(body) });
  w.fetch = async (input, options = {}) => {
    if (input === '/api/config')
      return response(
        200,
        configured
          ? { configured: true, url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' }
          : { configured: false },
      );
    if (networkDown) throw new Error('Network unavailable');
    if (input === 'https://example.supabase.co/auth/v1/settings')
      return response(200, { external: { google: googleEnabled } });
    if (input === '/api/chat') return response(200, { configured: false });
    assert.equal(input, '/api/workspace');
    assert.equal(options.headers.Authorization, 'Bearer test-session-token');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      writes.push(body);
      if (holds.PUT) await holds.PUT;
      if (body.revision !== remote.revision)
        return response(409, { ...remote, status: 'conflict', user: SESSION.user });
      remote.revision++;
      remote.data = body.data;
      return response(200, { status: 'ok', revision: remote.revision, user: SESSION.user });
    }
    const snapshot = structuredClone(remote);
    if (holds.GET) await holds.GET;
    return response(200, { ...snapshot, user: SESSION.user });
  };

  beforeStart(w);
  for (const [filename, code] of scripts) vm.runInContext(code, dom.getInternalVMContext(), { filename });
  t.after(() => {
    w.close();
    assert.deepEqual(errors.map(String), []);
  });
  await tick();

  const app = {
    w,
    $,
    $$: (selector) => [...w.document.querySelectorAll(selector)],
    remote,
    writes,
    oauthCalls,
    get clientOptions() {
      return clientOptions;
    },
    data: () => w.clareza.snapshot(),
    text: (selector) => $(selector)?.textContent ?? '',
    network(down) {
      networkDown = down;
    },
    auth(event, next) {
      active = next;
      listener(event, next);
    },
    setSession(next) {
      active = next;
    },
    hold(method) {
      let release;
      holds[method] = new Promise((resolve) => (release = resolve));
      return () => {
        holds[method] = null;
        release();
      };
    },
    async login() {
      $('#account-open').click();
      $('#account-email-input').value = 'owner@test.invalid';
      $('#account-password').value = 'test-password';
      $('#account-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await tick();
    },
    input(selector, value) {
      const element = $(selector);
      element.value = value;
      element.dispatchEvent(new w.Event('input', { bubbles: true }));
    },
    change(selector, value) {
      const element = typeof selector === 'string' ? $(selector) : selector;
      if (value !== undefined) element.value = value;
      element.dispatchEvent(new w.Event('change', { bubbles: true }));
    },
    submit(selector) {
      $(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    },
    add(title) {
      app.input('#quick-task-title', title);
      app.submit('#quick-task-form');
    },
    async go(hash) {
      w.location.hash = hash;
      await tick();
    },
    async sync() {
      $('[data-account-action="sync"]').click();
      await tick();
    },
    resize(isMobile) {
      for (const { query, media } of mediaQueries)
        if (query.includes('max-width')) {
          media.matches = isMobile;
          media.listeners.forEach((fn) => fn(media));
        }
    },
  };
  return app;
}

/** Signed-in app showing `workspace` (as the account's remote data). */
export function open(t, workspace = {}, options = {}) {
  return boot(t, { signedIn: true, remote: normalize({ tasks: [], ...workspace }), ...options });
}
