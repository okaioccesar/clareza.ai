# Conversa e organização com OpenAI

O assistente chama a API da OpenAI diretamente pelo servidor (`api/chat.js`). A chave nunca é enviada ao navegador. O login é verificado pelo Supabase antes da chamada ao modelo.

## Ativar

1. Criar uma chave de projeto em https://platform.openai.com/api-keys e configurar faturamento/créditos da API. A assinatura do ChatGPT não substitui a configuração da API.
2. Na Vercel, projeto `clareza` → Settings → Environment Variables, cadastrar `OPENAI_API_KEY` como segredo no ambiente Production.
3. Opcionalmente definir `OPENAI_MODEL`. O padrão preserva o modelo já usado pelo projeto: `gpt-4.1-mini`. Verificar disponibilidade e datas de descontinuação na documentação antes de uso prolongado.
4. Fazer um novo deploy. No assistente do site, enviar uma pergunta e conferir a resposta. Uma indicação de configuração significa presença da chave, não validação de saldo ou permissões.

## Comportamento

- Conversa em português, com histórico temporário e contexto de até 100 tarefas abertas.
- Títulos, datas, prioridades, projetos e áreas são enviados para a OpenAI. Notas e páginas não entram no contexto.
- Propostas de criação, conclusão ou reagendamento precisam de revisão e aplicação explícita no aplicativo. Perguntas podem receber uma resposta sem proposta.
- Cada resposta é validada antes de ser aplicada. A API usa `store:false` e não persiste a conversa no projeto; isso não substitui as políticas de retenção do provedor.
- Erros mantêm o texto disponível para tentar novamente; cancelar não altera tarefas. Sair da conta limpa a conversa.
- O limite de 12 mensagens/minuto é por conta e por instância do servidor; não constitui um teto global de gastos. Definir limites e acompanhar o consumo na plataforma antes de ampliar o uso.

Referências: https://developers.openai.com/api/reference/resources/chat e https://developers.openai.com/api/docs/models/gpt-4.1-mini.

A integração de WhatsApp foi removida. As migrações antigas permanecem como histórico, seguidas da migração de remoção.

O assistente usa exclusivamente a API da OpenAI, sem modo de comandos locais ou fallback offline.
