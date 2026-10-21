# Clareza na Vercel

Publicado em produção: https://clareza-lake.vercel.app

Projeto `clareza`, identificado por `prj_dT2lPV1cyKj9LnUGX2FluUl426JR`. A publicação inicial está em `READY` e exige autenticação da Vercel em todos os endereços. O vínculo local fica em `.vercel/project.json`, ignorado pelo Git. A integração confirmou a publicação e a proteção, mas negou a inspeção do conteúdo autenticado e dos logs com HTTP 403; essa inspeção não foi concluída.

A interface usa `dist/`; a função `api/chat.js` atende a IA online. Não há dependências de execução; o jsdom é usado apenas nos testes de desenvolvimento. A navegação usa fragmentos (`/#space`, `/#today`), portanto não necessita de regra de redirecionamento de rotas.

## Assistente e aparência

O seletor de tema oferece Claro, Escuro e Sistema, com preferência salva no navegador. O assistente começa no modo **Comandos locais**, que não envia tarefas a serviços externos. Ele prepara propostas para criação em lote, resumo, planejamento, conclusão e reagendamento; só altera tarefas após o clique em **Aplicar proposta**.

Para **IA online**, configure `AI_GATEWAY_API_KEY` no ambiente de produção da Vercel e publique novamente, ou use o OIDC automático da Vercel quando autorizado ao AI Gateway. O modelo padrão `openai/gpt-4.1-mini` foi verificado na lista oficial; `AI_GATEWAY_MODEL` permite selecionar outro ID válido. O uso online depende de credenciais, acesso e créditos do AI Gateway. Nenhuma chave deve ser colocada em `dist/`, no chat ou no Git. Não houve compra ou ativação de cobrança automática.

O modo online envia mensagem, títulos, prazos, prioridades, nomes de áreas/projetos e histórico recente. Não envia notas ou conteúdo das páginas. A interface informa isso antes do envio. A resposta da IA é tratada como proposta não confiável e validada antes da confirmação. A proteção por login da Vercel deve continuar habilitada, inclusive para `/api/chat`; o limite de frequência da função é apenas uma proteção local por instância.

## Publicação

Use esta pasta (`clareza`) como raiz do projeto. O arquivo `vercel.json` define o preset Other e a pasta de saída `dist`, sem etapa de instalação ou construção.

Pelo terminal, com a conta já autenticada:

```text
npx vercel@latest --prod
```

Antes de confirmar o destino, confira a conta, o projeto e a proteção de acesso. A proteção da hospedagem anterior não é transferida automaticamente para a Vercel.

## Seus dados

As tarefas e notas permanecem no armazenamento local do navegador. No endereço antigo, abra **Meu espaço e dados → Exportar meu espaço**. No novo endereço, use **Meu espaço e dados → Importar uma cópia**. A mudança de hospedagem não adiciona login nem sincronização de dados.

## Verificação

```text
node --test domain.test.cjs assistant.test.cjs api.test.cjs theme.test.cjs
```

Após publicar, confira a tela inicial, os arquivos CSS/JS e as rotas `/#space` e `/#inbox`.

A atualização com tema escuro e assistente foi publicada como `dpl_Cen7VPNQawLKK9hzoSZEAKVkqws2`, com status `READY` e os aliases de produção confirmados. Os 24 testes passaram; a integração do provedor foi testada com respostas simuladas. Uma resposta real da IA online ainda não foi verificada. A inspeção visual está bloqueada pela política do navegador deste ambiente, e a leitura dos logs retornou 403; não há CLI Vercel instalado para a alternativa autenticada.
