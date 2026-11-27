import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/core/workspace.ts';
import { parse, extractDate, validatePlan, applyPlan } from '../src/core/assistant.ts';

const workspace = () => normalize({ tasks: [], areas: [{ id: 'studies', title: 'Estudos' }] });

test('cria tarefa em português, reconhece amanhã e prioridade, sem alterar o espaço', () => {
  const state = workspace();
  const plan = parse('Crie revisar proposta amanhã com prioridade alta', state, '2026-10-17');
  assert.equal(plan.actions[0]!.title, 'revisar proposta');
  assert.equal(plan.actions[0]!.date, '2026-10-18');
  assert.equal(plan.actions[0]!.priority, 'high');
  assert.equal(state.tasks.length, 0);
});

test('captura em lote e não remove números legítimos dos títulos', () => {
  const plan = parse('Crie tarefas: estudar; 2026 planejamento; treinar na área Estudos', workspace(), '2026-10-17');
  assert.equal(plan.actions.length, 3);
  assert.equal(plan.actions[1]!.title, '2026 planejamento');
  assert.equal(plan.actions[2]!.areaId, 'studies');
  assert.equal(plan.actions[2]!.title, 'treinar');
});

test('valida datas impossíveis e resolve segunda-feira corretamente', () => {
  assert.equal(parse('Crie estudar em 30/02', workspace(), '2026-10-17').actions.length, 0);
  assert.equal(extractDate('segunda', '2026-10-17').date, '2026-10-19');
  assert.equal(extractDate('próxima segunda', '2026-10-19').date, '2026-10-26');
  assert.equal(extractDate('depois de amanhã', '2026-10-17').date, '2026-10-19');
});

test('reagendamento desambiguado preserva o título da tarefa', () => {
  const state = normalize({
    tasks: [
      { id: 'a', title: 'Revisar proposta' },
      { id: 'b', title: 'Revisar contrato' },
    ],
  });
  assert.equal(parse('Adie revisar proposta para amanhã', state, '2026-10-17').actions[0]!.id, 'a');
  assert.equal(parse('Adie revisar para amanhã', state, '2026-10-17').actions.length, 0);
});

test('proposta exige tarefas existentes e rejeita ação ou data inválida', () => {
  assert.throws(() => validatePlan({ message: 'x', actions: [{ type: 'delete', title: 'x' }] }, workspace()));
  assert.throws(() =>
    validatePlan({ message: 'x', actions: [{ type: 'update', id: 'fake', title: 'x' }] }, workspace()),
  );
  assert.throws(() =>
    validatePlan({ message: 'x', actions: [{ type: 'create', title: 'x', date: '2026-02-30' }] }, workspace()),
  );
});

test('aplicar proposta não altera o original e conclusão respeita recorrência', () => {
  const state = normalize({ tasks: [{ id: 't', title: 'Revisar proposta', date: '2026-10-17', repeat: 'weekly' }] });
  const plan = parse('Conclua revisar proposta', state, '2026-10-17');
  const result = applyPlan(plan, state, new Date(2026, 9, 17, 12));
  assert.equal(state.tasks[0]!.done, false);
  assert.equal(result.next.tasks[0]!.done, true);
  assert.equal(result.next.tasks.length, 2);
  assert.equal(result.next.tasks[1]!.date, '2026-10-24');
});

test('planejamento do dia limita o foco a três tarefas', () => {
  const state = normalize({ tasks: Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: 'Tarefa ' + i })) });
  assert.equal(parse('Organize meu dia', state, '2026-10-17').actions.length, 3);
});

test('aceita captura com o prefixo nova tarefa sem levar o comando ao título', () => {
  assert.equal(
    parse('Nova tarefa revisar proposta amanhã', workspace(), '2026-10-17').actions[0]!.title,
    'revisar proposta',
  );
  assert.equal(parse('Tarefas: ler', workspace(), '2026-10-17').actions[0]!.title, 'ler');
  assert.equal(parse('tarefas pendentes?', workspace(), '2026-10-17').actions.length, 0);
});
