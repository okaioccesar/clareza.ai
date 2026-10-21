import domain from '../dist/domain.js';

export type Workspace = ReturnType<typeof domain.normalize>;
export type WorkspaceWrite = { data: Workspace; revision: number; writeId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateWrite(body: unknown): WorkspaceWrite {
  if (!body || typeof body !== 'object') throw new Error('Envie um espaço válido.');
  const input = body as Record<string, unknown>;
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0 || typeof input.writeId !== 'string' || !uuid.test(input.writeId)) throw new Error('Versão de sincronização inválida.');
  const data = input.data as Record<string, unknown>;
  if (!data || typeof data !== 'object' || data.version !== 3 || !Array.isArray(data.tasks) || !Array.isArray(data.projects) || !Array.isArray(data.pages) || !Array.isArray(data.areas) || typeof data.scratch !== 'string' || !data.daily || typeof data.daily !== 'object' || Array.isArray(data.daily)) throw new Error('O formato do espaço não é válido.');
  if (data.tasks.length > 10000 || data.projects.length > 1000 || data.pages.length > 1000 || data.areas.length > 200) throw new Error('O espaço excedeu o limite de registros desta versão. Exporte uma cópia.');
  if (Buffer.byteLength(JSON.stringify(data)) > 2 * 1024 * 1024) throw new Error('O espaço excedeu 2 MB. Exporte uma cópia antes de reduzir o conteúdo.');
  return { data: domain.normalize(data), revision: Number(input.revision), writeId: input.writeId };
}
