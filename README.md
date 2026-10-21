# clareza.ai

Um espaço pessoal para tarefas, projetos, áreas da vida e páginas de notas. A interface oferece temas claro, escuro e sistema, captura rápida, visão semanal e um assistente que prepara propostas antes de alterar tarefas.

Produção pública, sem login: [clareza-lake.vercel.app](https://clareza-lake.vercel.app/). As prévias continuam protegidas pela Vercel. O projeto está conectado à branch `main` deste repositório.

## Desenvolvimento

Use Node.js 24.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run preview
```

A prévia abre em `http://127.0.0.1:4187` e atende os arquivos e as APIs. Ela carrega `.env.local`, quando presente; esse arquivo é ignorado pelo Git. Copie os nomes de variáveis de `.env.example` e configure somente um projeto de desenvolvimento autorizado. Sem configuração, o modo local continua disponível. `npm run build` gera o cliente Supabase em `dist/cloud-client.js`.

## Estrutura

- `dist/domain.js`: normalização, importação e recorrência dos dados.
- `dist/app.js` e `dist/organization.js`: tarefas, projetos, páginas e áreas.
- `dist/workspace-core.js` e `dist/workspace.js`: resumo do dia, filtros, captura rápida e preservação de foco.
- `dist/shell.js`: navegação responsiva e preferência da barra lateral.
- `dist/workspace.css`: superfícies, tipografia, layouts e movimento da interface.
- `api/chat.js`: conexão do servidor com o AI Gateway.
- `api/config.ts`, `api/workspace.ts` e `server/`: API TypeScript, autenticação e validação do espaço.
- `dist/cloud.js` e `dist/sync-core.js`: contas, cópia offline, importação explícita e resolução de conflitos.
- `supabase/`: migração PostgreSQL, políticas de acesso e teste real de isolamento.

O modo local mantém a chave `clareza.workspace.v3`. Ao entrar, cada conta recebe uma cópia local separada e sincronização com o Supabase. O aplicativo não importa dados locais automaticamente: use **Minha conta → Adicionar dados locais à conta**. Sair retorna ao espaço local; a cópia offline da conta permanece neste perfil do navegador. Use um perfil pessoal para dados privados.

As alterações são salvas no navegador antes do envio. Se dois dispositivos alterarem o espaço, o aplicativo preserva as versões e pede uma escolha. O banco compara revisões e impede gravações antigas. Veja [supabase/README.md](supabase/README.md) para detalhes e a configuração necessária dos e-mails de cadastro e recuperação. A IA online permanece opcional, conforme [VERCEL.md](VERCEL.md).

O acesso com Google está implementado e depende da ativação do provedor no Supabase e da criação do cliente OAuth no Google Cloud. O [guia de configuração](supabase/README.md#acesso-com-google) contém as URLs exatas. O botão informa a disponibilidade real; nenhuma credencial secreta Google faz parte do código do aplicativo.

## Verificação

Os testes cobrem os dados e a recorrência, propostas do assistente, tratamento da API, temas e interações com DOM simulado. Esses testes não substituem uma revisão visual em navegador nem um teste de toque em aparelho real. A interface respeita redução de movimento e mantém ações por teclado imediatas.
