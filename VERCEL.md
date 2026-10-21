# Clareza na Vercel

Publicado em produção: https://clareza-lake.vercel.app

Projeto `clareza`, identificado por `prj_dT2lPV1cyKj9LnUGX2FluUl426JR`. O domínio de produção é público, sem login, conforme confirmação do proprietário. A Vercel usa Standard Protection (`prod_deployment_urls_and_all_previews`), mantendo as prévias e os endereços únicos de deployment protegidos. O vínculo local fica em `.vercel/project.json`, ignorado pelo Git.

A liberação foi verificada sem cookies ou credenciais: a raiz de produção retornou HTTP 200 com o HTML do aplicativo; `/api/chat` retornou HTTP 200 com `configured: false`; o endereço único do deployment redirecionou para autenticação. Os relatos de inspeção bloqueada nas publicações antigas, abaixo, são históricos.

A interface usa `dist/`; as funções TypeScript `api/config.ts` e `api/workspace.ts` atendem contas e sincronização, e `api/chat.js` atende a IA online. O cliente e o servidor usam `@supabase/supabase-js`. A navegação usa fragmentos (`/#space`, `/#today`), portanto não necessita de regra de redirecionamento de rotas.

## Assistente e aparência

O seletor de tema oferece Claro, Escuro e Sistema, com preferência salva no navegador. O assistente começa no modo **Comandos locais**, que não envia tarefas a serviços externos. Ele prepara propostas para criação em lote, resumo, planejamento, conclusão e reagendamento; só altera tarefas após o clique em **Aplicar proposta**.

Para **IA online**, configure `AI_GATEWAY_API_KEY` no ambiente de produção da Vercel e publique novamente, ou use o OIDC automático da Vercel quando autorizado ao AI Gateway. O modelo padrão `openai/gpt-4.1-mini` foi verificado na lista oficial; `AI_GATEWAY_MODEL` permite selecionar outro ID válido. O uso online depende de credenciais, acesso e créditos do AI Gateway. Nenhuma chave deve ser colocada em `dist/`, no chat ou no Git. Não houve compra ou ativação de cobrança automática.

O modo online envia mensagem, títulos, prazos, prioridades, nomes de áreas/projetos e histórico recente. Não envia notas ou conteúdo das páginas. A interface informa isso antes do envio. A resposta da IA é tratada como proposta não confiável e validada antes da confirmação. No domínio público, `/api/chat` também é acessível sem login e atualmente informa que não há IA configurada. O limite de frequência da função é apenas uma proteção local por instância; habilitar um provedor pago para visitantes exige considerar autenticação, limites compartilhados e orçamento.

## Publicação

Use esta pasta (`clareza`) como raiz do projeto. O arquivo `vercel.json` define o preset Other, `npm ci`, `npm run build` e a pasta de saída `dist`. O build gera `cloud-client.js`; esse arquivo não é versionado. O runtime é Node.js 24.

As variáveis `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` estão configuradas em produção. `/api/config` publica apenas esses valores públicos; a API valida o token de cada usuário e o banco aplica RLS. Não configure chave `service_role`. As prévias sem essas variáveis funcionam no modo local.

Pelo terminal, com a conta já autenticada:

```text
npx vercel@latest --prod
```

Antes de confirmar o destino, confira a conta, o projeto e a proteção de acesso. A proteção da hospedagem anterior não é transferida automaticamente para a Vercel.

## Seus dados

Sem login, tarefas e notas permanecem no armazenamento local do navegador. Uma conta sincroniza seu próprio espaço; a importação dos dados locais é explícita. Para transferir dados de outro domínio, abra **Meu espaço e dados → Exportar meu espaço** no endereço antigo e **Importar uma cópia** no destino.

Antes de abrir o cadastro público, conclua a configuração de URL e SMTP descrita em [supabase/README.md](supabase/README.md). O conector utilizado não oferece alteração da configuração Auth. Mantenha a confirmação de e-mail habilitada.

## Verificação

```text
npm test
npm run typecheck
npm run build
```

Após publicar, confira a tela inicial, os arquivos CSS/JS e as rotas `/#space` e `/#inbox`.

A etapa de contas foi verificada em produção com duas contas temporárias, sem envio de e-mails: login real no Supabase, escrita e leitura pela API publicada, isolamento entre contas, proprietário forjado, revisão desatualizada, idempotência, token inválido e origem externa. As contas e seus dados foram removidos após o teste. A análise de segurança do Supabase não retornou alertas. O cadastro e a recuperação por e-mail ainda dependem da configuração Auth/SMTP; esse fluxo de e-mail não foi validado. Não houve inspeção visual em navegador nesta etapa.

A atualização com tema escuro e assistente foi publicada como `dpl_Cen7VPNQawLKK9hzoSZEAKVkqws2`, com status `READY` e os aliases de produção confirmados. Os 24 testes passaram; a integração do provedor foi testada com respostas simuladas. Uma resposta real da IA online ainda não foi verificada. A inspeção visual está bloqueada pela política do navegador deste ambiente, e a leitura dos logs retornou 403; não há CLI Vercel instalado para a alternativa autenticada.
