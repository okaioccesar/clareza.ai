/**
 * Assistant dialog. Messages go to the online AI when it is configured; otherwise the
 * local parser answers simple commands. Either way, changes are proposals the person applies.
 */
import { dateKey } from '../../core/dates.ts';
import { applyPlan, parse, validatePlan, type Plan, type PlanAction } from '../../core/assistant.ts';
import type { Task } from '../../core/model.ts';
import { effectiveArea } from '../../core/workspace.ts';
import { $, all } from '../dom.ts';
import { find, save, store } from '../store.ts';
import { toast } from '../toast.ts';
import { dateLabel } from '../format.ts';
import { render } from '../render.ts';
import { LOCKED_EVENT } from '../session.ts';
import { accountService } from './account.ts';

type Status = 'pending' | 'applied' | 'discarded' | 'undone';
interface Message {
  role: 'user' | 'assistant';
  text: string;
  plan?: Plan;
  status: Status;
  /** Snapshot of the tasks a proposal changes, to detect edits made after it was suggested. */
  base: (Task | undefined)[];
}

const messages: Message[] = [];
let busy = false;
let request: AbortController | null = null;
let conversation = 0;
let cancelled = false;
/** null = not checked yet. */
let online: boolean | null = null;

const log = () => $('#assistant-messages');
const input = () => $<HTMLTextAreaElement>('#assistant-input');
const scrollEnd = () => (log().scrollTop = log().scrollHeight);

function actionLabel(action: PlanAction) {
  return [
    action.type === 'create' ? 'Nova tarefa' : 'Atualizar',
    action.date !== undefined ? dateLabel(action.date) : '',
    action.priority === 'high' ? 'Prioridade alta' : '',
    action.pinned ? 'Fixar em Hoje' : '',
    action.status === 'done' ? 'Concluir' : '',
    action.areaId ? find.area(action.areaId)?.title : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function addMessage(role: Message['role'], text: string, plan?: Plan): Message {
  const message: Message = {
    role,
    text,
    plan,
    status: 'pending',
    base: (plan?.actions ?? []).filter((a) => a.type === 'update').map((a) => structuredClone(find.task(a.id))),
  };
  messages.push(message);
  renderMessage(message);
  scrollEnd();
  return message;
}

function renderMessage(message: Message) {
  // Built with DOM APIs (textContent), so AI output can never inject markup.
  const article = element('article', 'chat-message ' + message.role);
  article.append(
    element('span', 'chat-author', message.role === 'user' ? 'Você' : 'Assistente'),
    element('p', '', message.text),
  );
  if (message.plan?.actions.length) article.append(proposal(message));
  log().append(article);
}

function proposal(message: Message) {
  const plan = message.plan!;
  const box = element('div', 'chat-plan');
  const list = element('ul', 'chat-plan-list');
  for (const action of plan.actions) {
    const item = element('li');
    item.append(element('strong', '', action.title), element('small', '', actionLabel(action)));
    list.append(item);
  }
  const controls = element('div', 'chat-plan-actions');
  const apply = element('button', 'button primary', 'Aplicar proposta');
  const discard = element('button', 'button secondary', 'Descartar');
  apply.type = discard.type = 'button';

  apply.onclick = () => {
    if (message.status !== 'pending' || busy) return;
    try {
      if (message.base.some((before) => before && JSON.stringify(before) !== JSON.stringify(find.task(before.id))))
        throw new Error(
          'Uma tarefa mudou desde esta proposta. Peça uma nova proposta para usar as informações atuais.',
        );
      const result = applyPlan(plan, store.data);
      const previous = store.data;
      store.replace(result.next);
      if (!save()) return store.replace(previous);
      message.status = 'applied';
      render();
      const status = element('p', 'chat-plan-status', 'Proposta aplicada.');
      const applied = JSON.stringify(store.data);
      const undoButton = element('button', 'text-button', 'Desfazer');
      undoButton.type = 'button';
      const undo = () => {
        if (message.status !== 'applied') return;
        if (JSON.stringify(store.data) !== applied)
          return void addMessage(
            'assistant',
            'O espaço mudou depois da proposta. Ajuste as tarefas individualmente para preservar suas alterações.',
          );
        const current = store.data;
        store.replace(result.before);
        if (!save()) {
          store.replace(current);
          return void addMessage('assistant', 'Não foi possível salvar. As alterações da proposta foram mantidas.');
        }
        render();
        message.status = 'undone';
        status.textContent = 'Alterações desfeitas.';
        undoButton.remove();
        toast('Alterações do assistente desfeitas.');
      };
      undoButton.onclick = undo;
      controls.replaceChildren(status, undoButton);
      toast('Proposta aplicada.', undo);
    } catch (error) {
      addMessage('assistant', (error as Error).message);
    }
  };
  discard.onclick = () => {
    if (message.status !== 'pending') return;
    message.status = 'discarded';
    controls.replaceChildren(element('p', 'chat-plan-status', 'Proposta descartada.'));
  };
  controls.append(apply, discard);
  box.append(list, controls);
  return box;
}

function welcome() {
  addMessage(
    'assistant',
    'Posso transformar pendências em tarefas e organizar seus próximos passos.\n\nExperimente “Organize meu dia” ou “Crie revisar proposta amanhã”. Você revisa cada proposta antes de aplicar.',
  );
}

function setBusy(value: boolean) {
  busy = value;
  $<HTMLButtonElement>('#assistant-send').disabled = value;
  input().disabled = value;
  $<HTMLButtonElement>('#assistant-clear').disabled = value;
  $('#assistant-stop').hidden = !value;
  $('#assistant-send').textContent = value ? 'Aguarde…' : 'Enviar';
  log().setAttribute('aria-busy', String(value));
}

async function checkAvailability() {
  const current = conversation;
  const label = $('#assistant-availability');
  try {
    const response = await fetch('/api/chat');
    const data = await response.json();
    if (current !== conversation) return;
    online = response.ok && !!data.configured;
  } catch {
    if (current !== conversation) return;
    online = false;
  }
  label.textContent = online
    ? 'IA online conectada.'
    : 'IA online indisponível. Respondo comandos simples neste dispositivo.';
}

function history() {
  return messages
    .slice(0, -1)
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: m.text + (m.plan?.actions.length ? `\nProposta (${m.status}): ${JSON.stringify(m.plan.actions)}` : ''),
    }));
}

function context() {
  const data = store.data;
  return {
    today: dateKey(),
    tasks: data.tasks
      .filter((t) => !t.done)
      .slice(0, 100)
      .map((t) => ({
        id: t.id,
        title: t.title,
        date: t.date,
        priority: t.priority,
        areaId: effectiveArea(data, t),
        projectId: t.projectId,
        status: t.status,
      })),
    areas: data.areas.map((a) => ({ id: a.id, title: a.title })),
    projects: data.projects.filter((p) => !p.archived).map((p) => ({ id: p.id, title: p.title })),
  };
}

function localAnswer(text: string): Plan {
  online = false;
  $('#assistant-availability').textContent = 'IA online indisponível. Respondo comandos simples neste dispositivo.';
  return parse(text, store.data);
}

async function askOnline(text: string, current: number): Promise<Plan | null> {
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const token = await accountService.accessToken();
    if (current !== conversation || controller.signal.aborted) return null;
    // Without an account (local mode) or without the AI configured, answer locally.
    if (!token) return localAnswer(text);
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      signal: controller.signal,
      body: JSON.stringify({ message: text, context: context(), history: history() }),
    });
    const data = await response.json();
    if (response.status === 503) return localAnswer(text);
    if (!response.ok) throw new Error(data.error || 'A IA online não está disponível agora.');
    return validatePlan(data, store.data);
  } finally {
    clearTimeout(timeout);
    if (request === controller) request = null;
  }
}

async function submit(raw: string) {
  const text = String(raw || '').trim();
  if (!text || busy) return;
  if (text.length > 4000) return toast('Use até 4.000 caracteres por mensagem.');
  const current = conversation;
  cancelled = false;
  addMessage('user', text);
  input().value = '';

  if (online === false) {
    const plan = parse(text, store.data);
    addMessage('assistant', plan.message, plan);
    return;
  }

  setBusy(true);
  const waiting = element('div', 'chat-waiting', 'Pensando…');
  log().append(waiting);
  scrollEnd();
  try {
    const plan = await askOnline(text, current);
    if (current !== conversation || !plan) return;
    if (cancelled) return void addMessage('assistant', 'Resposta interrompida. Nenhuma tarefa foi alterada.');
    addMessage('assistant', plan.message, plan);
  } catch (error) {
    if (current !== conversation) return;
    const failure = error as Error;
    addMessage(
      'assistant',
      cancelled
        ? 'Resposta interrompida. Nenhuma tarefa foi alterada.'
        : failure.name === 'AbortError'
          ? 'A resposta demorou além do esperado. Tente novamente em instantes.'
          : failure.message,
    );
    if (!cancelled) input().value = text;
  } finally {
    waiting.remove();
    if (current === conversation) {
      setBusy(false);
      if ($<HTMLDialogElement>('#assistant-dialog').open) input().focus();
      scrollEnd();
    }
  }
}

export function openAssistant(prompt = '') {
  if (!messages.length) welcome();
  const dialog = $<HTMLDialogElement>('#assistant-dialog');
  if (!dialog.open) dialog.showModal();
  if (prompt) input().value = prompt;
  input().focus();
  checkAvailability();
}

export function setupAssistant() {
  $('#assistant-open').addEventListener('click', () => openAssistant());
  $('#assistant-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submit(input().value);
  });
  input().addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit(input().value);
    }
  });
  all('[data-chat-prompt]').forEach((button) =>
    button.addEventListener('click', () => submit(button.dataset.chatPrompt!)),
  );
  $('#assistant-clear').addEventListener('click', () => {
    if (busy) return;
    messages.splice(0);
    log().replaceChildren();
    welcome();
  });
  $('#assistant-stop').addEventListener('click', () => {
    cancelled = true;
    request?.abort();
  });
  document.addEventListener(LOCKED_EVENT, () => {
    conversation++;
    request?.abort();
    request = null;
    messages.splice(0);
    log().replaceChildren();
    input().value = '';
    $<HTMLDialogElement>('#assistant-dialog').close();
    setBusy(false);
  });
}
