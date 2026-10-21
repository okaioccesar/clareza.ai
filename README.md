# clareza.ai

Um espaço pessoal para tarefas, projetos, áreas da vida e páginas de notas. A interface oferece temas claro, escuro e sistema, captura rápida, visão semanal e um assistente que prepara propostas antes de alterar tarefas.

Produção pública, sem login: [clareza-lake.vercel.app](https://clareza-lake.vercel.app/). As prévias continuam protegidas pela Vercel. O projeto está conectado à branch `main` deste repositório.

## Desenvolvimento

Use Node.js 24 ou mais recente.

```sh
npm ci
npm test
npm run preview
```

A prévia estática abre em `http://127.0.0.1:4187`. Os comandos locais do assistente funcionam nessa prévia; a função `/api/chat` precisa do ambiente da Vercel para o modo online. Veja [VERCEL.md](VERCEL.md) para configurar o AI Gateway sem colocar credenciais no código público.

## Estrutura

- `dist/domain.js`: normalização, importação e recorrência dos dados.
- `dist/app.js` e `dist/organization.js`: tarefas, projetos, páginas e áreas.
- `dist/workspace-core.js` e `dist/workspace.js`: resumo do dia, filtros, captura rápida e preservação de foco.
- `dist/shell.js`: navegação responsiva e preferência da barra lateral.
- `dist/workspace.css`: superfícies, tipografia, layouts e movimento da interface.
- `api/chat.js`: conexão do servidor com o AI Gateway.

Os dados continuam no armazenamento local do navegador, na chave `clareza.workspace.v3`. A barra lateral e o tema têm preferências separadas. Exportação e importação ficam em **Meu espaço e dados**; login e sincronização entre dispositivos ainda não fazem parte desta versão.

## Verificação

Os testes cobrem os dados e a recorrência, propostas do assistente, tratamento da API, temas e interações com DOM simulado. Esses testes não substituem uma revisão visual em navegador nem um teste de toque em aparelho real. A interface respeita redução de movimento e mantém ações por teclado imediatas.
