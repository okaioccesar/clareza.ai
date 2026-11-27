# clarity.ai

Um espaço pessoal para tarefas, projetos, áreas da vida e páginas de notas, com lembretes, revisão semanal e um assistente que propõe mudanças antes de aplicá-las.

Produção: [clareza-lake.vercel.app](https://clareza-lake.vercel.app/) (branch `main`, publicada pela Vercel).

> O nome do produto está definido em um único lugar: [`src/brand.ts`](src/brand.ts). O build substitui `%BRAND%` no HTML, e o servidor usa o mesmo valor no prompt do assistente.

## O que o app faz

- **Hoje** — saudação, resumo do dia, captura rápida, filtros (todas, fixadas, atrasadas, concluídas), progresso, intenção do dia e rascunho.
- **Tarefas** — lista ou quadro (kanban), filtros por status e projeto, busca.
- **Semana** — colunas por dia com arrastar e soltar; no celular vira uma agenda vertical.
- **Revisão semanal** — o que foi concluído, reagendamento em lote das atrasadas (com desfazer), reflexão e três prioridades que aparecem em Hoje. É sugerida de sexta a segunda até ser salva.
- **Lembretes** — tarefas podem ter horário. Com as notificações ativadas em **Preferências**, o app avisa no horário (ou minutos antes) e envia um resumo do dia. Funcionam enquanto o app estiver aberto em uma aba; avisos com o app fechado virão com o aplicativo nativo.
- **Meu espaço** — áreas da vida, projetos (com progresso) e páginas com blocos (texto, título, checklist, citação, divisor).
- **Assistente** — com a IA online configurada, conversa e propõe mudanças; sem ela, entende comandos simples localmente ("Crie revisar proposta amanhã", "Organize meu dia"). Nada muda sem **Aplicar proposta**, e tudo pode ser desfeito.
- **Busca** (`Ctrl K` ou `/`), atalho para nova tarefa (`Ctrl Enter`), temas claro/escuro/sistema e layout para celular.
- **Conta** — login por e-mail ou Google (Supabase), cópia offline por conta, sincronização com detecção de conflitos e importação explícita dos dados locais.

## Desenvolvimento

Use Node.js 24.

```sh
npm ci
npm run dev        # build contínuo (observa alterações)
npm run preview    # http://127.0.0.1:4187 — serve dist/ e as APIs
```

Sem Supabase configurado, a página de entrada mostra **Continuar sem conta (modo local)**, apenas em `localhost`, para desenvolver sem login. Para usar contas, copie os nomes de `.env.example` para `.env.local` com os valores de um projeto de desenvolvimento.

```sh
npm test           # build + todos os testes
npm run typecheck  # TypeScript estrito
npm run format     # Prettier
```

## Estrutura

```
src/
  brand.ts              nome do produto
  index.html            estrutura da página (o build preenche %BRAND%)
  theme.ts              tema aplicado antes da primeira pintura
  core/                 regras puras, sem DOM (reutilizáveis no app nativo)
    model.ts            tipos do espaço (tarefas, áreas, projetos, páginas, revisões)
    workspace.ts        validação, importação e recorrência
    dates.ts, day.ts    datas e o que entra em "Hoje"
    sync.ts             reconciliação da cópia offline com a conta
    assistant.ts        comandos locais e validação das propostas da IA
    review.ts           revisão semanal
    reminders.ts        quais lembretes disparar e quando
  app/                  interface
    main.ts             ponto de entrada
    store.ts            espaço em uso e como é salvo
    ui.ts, render.ts    rota, estado da tela, renderização e foco
    components/         lista de tarefas, quadro, cartões
    views/              Hoje, Semana, Revisão, Meu espaço, página…
    features/           formulário, busca, conta, assistente, notificações…
  styles/               tokens, base, layout, componentes, telas, entrada
public/                 favicon e service worker (notificações)
api/                    funções da Vercel: config, workspace, chat
server/                 código compartilhado pelas funções
supabase/               migrações, políticas de acesso e teste de isolamento
test/                   testes do núcleo, da interface (jsdom) e das APIs
scripts/                build e servidor local
```

`dist/` é gerado pelo build e não é versionado.

## Dados e privacidade

- O espaço é um único documento JSON (formato 3). Campos novos (horário das tarefas, revisões) são opcionais e compatíveis com cópias antigas.
- Sem login, os dados ficam no navegador (`clareza.workspace.v3`). Com login, cada conta tem sua cópia offline e sincroniza com o Supabase; o banco compara revisões e recusa gravações antigas. Veja [supabase/README.md](supabase/README.md).
- A IA online é opcional ([OPENAI.md](OPENAI.md)). Ela recebe a mensagem e os títulos, prazos e prioridades das tarefas abertas; notas e páginas não são enviadas.
- Preferências de tela, tema e notificações ficam só neste dispositivo.

## Verificação

Os testes cobrem regras de dados e recorrência, revisão semanal, lembretes, assistente, sincronização (offline, conflitos, troca de conta, OAuth), interações da interface, tema e as APIs. Eles rodam contra o app compilado em um DOM simulado; não substituem uma revisão em navegador e em celular reais.

Próximos passos em [ROADMAP.md](ROADMAP.md). Decisões de arquitetura e dicas para evoluir o projeto em [docs/GUIA.md](docs/GUIA.md).
