/**
 * The assistant only proposes changes. Proposals (from the local parser or the AI)
 * are validated here and applied to a copy of the workspace, so they can be undone.
 */
import type { Status, Task, Workspace } from './model.ts';
import { addDays, dateKey, fromKey, isDateKey } from './dates.ts';
import { blankTask, changeStatus } from './workspace.ts';

export interface PlanAction {
  type: 'create' | 'update';
  id?: string;
  title: string;
  date?: string;
  priority?: 'normal' | 'high';
  status?: Status;
  areaId?: string;
  pinned?: boolean;
}

export interface Plan {
  message: string;
  actions: PlanAction[];
}

const fold = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reply = (message: string, actions: PlanAction[] = []): Plan => ({ message, actions });

interface FoundDate {
  date: string;
  matched: string;
  invalid?: boolean;
}

const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

/** Finds the first date expression in Portuguese text ("amanhã", "sexta", "28/10"...). */
export function extractDate(text: string, today: string): FoundDate {
  let match = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (match) return { date: isDateKey(match[0]) ? match[0] : '', matched: match[0], invalid: !isDateKey(match[0]) };

  match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (match) {
    const date = `${match[3] || today.slice(0, 4)}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
    return { date: isDateKey(date) ? date : '', matched: match[0], invalid: !isDateKey(date) };
  }

  match = text.match(/\bdepois de amanh[ãa](?=\s|[,.!?;]|$)/i);
  if (match) return { date: addDays(today, 2), matched: match[0] };
  match = text.match(/\bamanh[ãa](?=\s|[,.!?;]|$)/i);
  if (match) return { date: addDays(today, 1), matched: match[0] };
  match = text.match(/\bhoje\b/i);
  if (match) return { date: today, matched: match[0] };

  match = text.match(/\b(?:pr[óo]xim[ao]\s+)?(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?\b/i);
  if (match) {
    const current = fromKey(today).getDay();
    const target = WEEKDAYS.indexOf(fold(match[1]!));
    let days = (target - current + 7) % 7;
    if (!days && /^proxim/.test(fold(match[0]))) days = 7;
    return { date: addDays(today, days), matched: match[0] };
  }
  return { date: '', matched: '' };
}

function findOpenTask(query: string, workspace: Workspace): Task[] {
  const q = fold(query).trim();
  if (!q) return [];
  const open = workspace.tasks.filter((t) => !t.done);
  const exact = open.filter((t) => fold(t.title) === q);
  return exact.length ? exact : open.filter((t) => fold(t.title).includes(q));
}

function byPriority(workspace: Workspace): Task[] {
  return workspace.tasks
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        Number(b.priority === 'high') - Number(a.priority === 'high') ||
        (a.date || '9999').localeCompare(b.date || '9999'),
    );
}

const HELP =
  'Sem a IA online, eu entendo comandos simples:\n\n' +
  '• Crie revisar proposta amanhã com prioridade alta\n' +
  '• Crie tarefas: estudar; treinar; organizar documentos\n' +
  '• Adie revisar proposta para segunda\n' +
  '• Conclua revisar proposta\n' +
  '• Organize meu dia · Planeje minha semana · Resumo';

/** Local, rule-based assistant used when the online AI is not available. */
export function parse(input: string, workspace: Workspace, today = dateKey()): Plan {
  const text = String(input || '').trim();
  const normalized = fold(text);
  const pending = byPriority(workspace);
  if (!text) return reply('Escreva uma tarefa ou peça um resumo.');

  if (/^(resumo|resuma|listar|liste|mostr[ae])\b/.test(normalized)) {
    const due = pending.filter((t) => t.date === today).length;
    const late = pending.filter((t) => t.date && t.date < today).length;
    const high = pending.filter((t) => t.priority === 'high').length;
    const next = pending
      .slice(0, 5)
      .map((t) => `• ${t.title}${t.date ? ' — ' + t.date : ' — sem prazo'}`)
      .join('\n');
    return reply(
      `Você tem ${pending.length} tarefas em aberto: ${due} para hoje, ${late} atrasadas e ${high} com prioridade alta.` +
        (pending.length
          ? '\n\nPróximos passos:\n' + next
          : '\nSeu espaço está livre. Que tal adicionar o primeiro compromisso?'),
    );
  }

  if (/organize.*(meu dia|hoje)|planej[ae].*(meu dia|hoje)/.test(normalized)) {
    const focus = pending.filter((t) => !t.date || t.date <= today).slice(0, 3);
    return focus.length
      ? reply(
          'Separei até três tarefas para o seu foco de hoje, considerando prioridade e prazo. Revise a proposta antes de aplicar.',
          focus.map((t) => ({ type: 'update', id: t.id, title: t.title, date: today, pinned: true })),
        )
      : reply('Você não tem tarefas pendentes para hoje ou sem prazo. As tarefas futuras ficaram nas datas originais.');
  }

  if (/planej[ae].*semana|organize.*semana/.test(normalized)) {
    const week = pending.filter((t) => !t.date || t.date <= addDays(today, 6)).slice(0, 20);
    return week.length
      ? reply(
          'Distribuí as tarefas ao longo dos próximos sete dias, começando pelas prioridades. Esta é uma sugestão; revise os prazos antes de aplicar.',
          week.map((t, i) => ({
            type: 'update',
            id: t.id,
            title: t.title,
            date: addDays(today, Math.min(Math.floor(i / 3), 6)),
          })),
        )
      : reply('Não há tarefas em aberto para distribuir nos próximos sete dias.');
  }

  if (/^(conclu[ai]|concluir|finaliz[ae])\b/.test(normalized)) {
    const title = text.replace(/^(?:conclu[ai]|concluir|finaliz[ae])\s+(?:a\s+)?(?:tarefa\s+)?/i, '').trim();
    const matches = findOpenTask(title, workspace);
    if (matches.length !== 1)
      return reply(
        matches.length
          ? 'Encontrei mais de uma tarefa. Use o título completo:\n' +
              matches
                .slice(0, 5)
                .map((t) => '• ' + t.title)
                .join('\n')
          : 'Não encontrei uma tarefa em aberto com esse título.',
      );
    return reply('Posso marcar esta tarefa como concluída. Se for recorrente, a próxima ocorrência será criada.', [
      { type: 'update', id: matches[0]!.id, title: matches[0]!.title, status: 'done' },
    ]);
  }

  if (/^(adi[ae]|adiar|reagend[ae]|mova|mover)\b/.test(normalized)) {
    const date = extractDate(text, today);
    if (!date.date)
      return reply(
        'Informe um prazo válido, como “Adie revisar proposta para amanhã” ou “Reagende revisar proposta para 28/10”.',
      );
    const title = text
      .replace(/^(?:adi[ae]|adiar|reagend[ae]|mova|mover)\s+(?:a\s+)?(?:tarefa\s+)?/i, '')
      .replace(date.matched, '')
      .replace(/\s+(?:para|em|no dia|na|no)\s*$/i, '')
      .trim();
    const matches = findOpenTask(title, workspace);
    if (matches.length !== 1)
      return reply(
        matches.length
          ? 'Encontrei mais de uma tarefa. Informe o título completo.'
          : 'Não encontrei essa tarefa em aberto. Use o título que aparece na lista.',
      );
    return reply('Aqui está a mudança de prazo para você revisar.', [
      { type: 'update', id: matches[0]!.id, title: matches[0]!.title, date: date.date },
    ]);
  }

  if (/^(crie|criar|adicione|adicionar|anote|nova tarefa)\b|^tarefas?\s*:/.test(normalized)) {
    const body = text
      .replace(/^(?:crie|criar|adicione|adicionar|anote)\s*(?:as?\s+)?(?:tarefas?\s*)?:?\s*/i, '')
      .replace(/^(?:nova tarefa|tarefas?)\s*:?\s*/i, '');
    const chunks = body
      .split(/[;\n]+/)
      .map((s) => s.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/, '').trim())
      .filter(Boolean);
    if (chunks.length > 20) return reply('Envie no máximo 20 tarefas por vez.');

    const actions: PlanAction[] = [];
    for (const chunk of chunks) {
      const date = extractDate(chunk, today);
      if (date.invalid) return reply(`O prazo em “${chunk}” não é válido. Ajuste a data antes de continuar.`);
      let title = chunk;
      if (date.matched)
        title = title.replace(
          new RegExp('(?:\\s+(?:para|em|no dia|na|no))?\\s*' + escapeRegExp(date.matched), 'i'),
          '',
        );
      const priority = /prioridade\s+alta|alta\s+prioridade/i.test(title) ? 'high' : 'normal';
      title = title.replace(/\s*(?:com\s+)?(?:prioridade\s+(?:alta|normal)|(?:alta|normal)\s+prioridade)\b/gi, '');

      let areaId = '';
      for (const area of workspace.areas) {
        const marker = 'na area ' + fold(area.title);
        const index = fold(title).indexOf(marker);
        if (index >= 0) {
          areaId = area.id;
          title = title.slice(0, index) + title.slice(index + marker.length);
          break;
        }
      }
      title = title
        .replace(/^(?:uma?\s+)?tarefa\s*:?\s*/i, '')
        .replace(/^[\s,:-]+|[\s,:.-]+$/g, '')
        .trim();
      if (!title || title.length > 200) return reply('Cada tarefa precisa de um título de até 200 caracteres.');
      actions.push({ type: 'create', title, date: date.date, priority, areaId });
    }
    return actions.length
      ? reply(
          `Preparei ${actions.length === 1 ? 'uma tarefa' : actions.length + ' tarefas'}. Confira os títulos e prazos antes de adicionar.`,
          actions,
        )
      : reply('Escreva o título depois de “Crie”, por exemplo: “Crie revisar proposta amanhã”.');
  }

  return reply(HELP);
}

/** Rejects anything the app cannot safely apply. Returns a cleaned copy of the plan. */
export function validatePlan(raw: unknown, workspace: Workspace): Plan {
  const plan = raw as { message?: unknown; actions?: unknown };
  if (!plan || typeof plan.message !== 'string' || !Array.isArray(plan.actions) || plan.actions.length > 20)
    throw new Error('O assistente retornou uma proposta inválida.');

  const actions = plan.actions.map((input: Record<string, unknown>): PlanAction => {
    if (!input || (input.type !== 'create' && input.type !== 'update')) throw new Error('Ação não suportada.');
    const action: PlanAction = {
      type: input.type,
      title: String(input.title || '')
        .trim()
        .slice(0, 200),
    };
    if (action.type === 'update') {
      const task = workspace.tasks.find((t) => t.id === input.id);
      if (!task || task.done)
        throw new Error('Uma tarefa da proposta não está mais em aberto. Peça uma nova proposta.');
      action.id = task.id;
      action.title = task.title;
    }
    if (!action.title) throw new Error('A tarefa precisa de um título.');
    if (input.date !== undefined) {
      if (input.date !== '' && !isDateKey(input.date)) throw new Error('O assistente sugeriu uma data inválida.');
      action.date = input.date as string;
    }
    if (input.priority !== undefined) {
      if (input.priority !== 'normal' && input.priority !== 'high') throw new Error('Prioridade inválida.');
      action.priority = input.priority;
    }
    if (input.status !== undefined) {
      if (!['todo', 'doing', 'done'].includes(input.status as string)) throw new Error('Status inválido.');
      action.status = input.status as Status;
    }
    if (input.areaId !== undefined) {
      if (input.areaId && !workspace.areas.some((a) => a.id === input.areaId)) throw new Error('Área não encontrada.');
      action.areaId = String(input.areaId);
    }
    if (input.pinned !== undefined) action.pinned = !!input.pinned;
    return action;
  });

  const ids = actions.filter((a) => a.type === 'update').map((a) => a.id);
  if (new Set(ids).size !== ids.length) throw new Error('A proposta tenta alterar a mesma tarefa duas vezes.');
  return { message: plan.message.slice(0, 6000), actions };
}

/** Applies a plan to a copy of the workspace. The original stays untouched. */
export function applyPlan(
  raw: unknown,
  workspace: Workspace,
  now = new Date(),
): { before: Workspace; next: Workspace } {
  const plan = validatePlan(raw, workspace);
  const before = structuredClone(workspace);
  const next = structuredClone(workspace);
  for (const action of plan.actions) {
    if (action.type === 'create') {
      next.tasks.push(
        blankTask(
          {
            title: action.title,
            date: action.date || '',
            priority: action.priority || 'normal',
            areaId: action.areaId || '',
            pinned: !!action.pinned,
            repeatDay: 1,
          },
          now,
        ),
      );
      continue;
    }
    const task = next.tasks.find((t) => t.id === action.id)!;
    if (action.date !== undefined) {
      task.date = action.date;
      task.repeatDay = Number(action.date.slice(-2)) || 1;
      if (!action.date) {
        task.repeat = 'none';
        task.time = '';
      }
    }
    if (action.priority !== undefined) task.priority = action.priority;
    if (action.areaId !== undefined) task.areaId = action.areaId;
    if (action.pinned !== undefined) task.pinned = action.pinned;
    if (action.status) changeStatus(next.tasks, task, action.status, now);
  }
  return { before, next };
}
