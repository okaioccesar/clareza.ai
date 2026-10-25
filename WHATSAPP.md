# Agente de organização no WhatsApp

Recepção implementada — integração ainda não ativada na Meta.

## Estrutura entregue

- `api/whatsapp.ts`: webhook HTTP em `/api/whatsapp`, verificação GET e assinatura HMAC-SHA256 sobre os bytes originais do POST.
- `server/whatsapp.ts`: extração mínima de mensagens e gravação durável em `whatsapp_inbox` no Supabase.
- Migração `20261025144026_whatsapp_inbox.sql` aplicada no projeto `clareza-ai`. A chave composta do número receptor e mensagem impede duplicação nas reentregas.
- A tabela tem RLS e nenhuma permissão para `anon` ou `authenticated`. Somente o backend com credencial de servidor pode acessá-la. O aviso informativo de RLS sem políticas é intencional: não há acesso pelo cliente.
- O piloto recebe apenas o remetente de teste e o número receptor configurados. Áudio e outros tipos ficam como `unsupported`, sem download de mídia.
- Falhas de banco retornam 503; sucesso só é confirmado após persistência. Eventos de status não criam mensagens.
- A rota permanece desligada por padrão. Nenhuma mensagem é enviada, nenhum contato é lido e nenhuma tarefa é criada por esta etapa.

Ainda faltam o vínculo comprovado entre telefone e conta, o processamento das mensagens, propostas com confirmação, envio de respostas e rotina de retenção. A caixa de entrada não é um worker em execução. Só ativar recebimento real após completar esse fluxo; a configuração atual serve ao piloto controlado.

## Próximo passo na Meta

O login por QR code no WhatsApp Web não conecta a Cloud API. Acessar https://developers.facebook.com/apps/ e configurar um aplicativo com WhatsApp Business Platform e número de teste. Não migrar o número pessoal para esse teste.

Callback preparado: `https://clareza-lake.vercel.app/api/whatsapp`.

Configurar no ambiente de servidor da Vercel:

| Variável | Uso |
| --- | --- |
| `WHATSAPP_WEBHOOK_ENABLED` | `true` somente ao iniciar o piloto |
| `WHATSAPP_VERIFY_TOKEN` | Segredo aleatório de pelo menos 32 caracteres; mesmo valor no cadastro do webhook |
| `WHATSAPP_APP_SECRET` | App Secret do aplicativo da Meta, usado para verificar assinatura |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número de teste fornecido pela Meta, não o telefone |
| `WHATSAPP_TEST_SENDER` | Telefone autorizado para o teste, com DDI, apenas dígitos |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial de servidor para a caixa de entrada; nunca a chave pública |

`SUPABASE_URL` já é usado pelo backend. Não colocar segredos em `dist`, no Git ou em mensagens. O token de envio da Meta não é necessário para esta etapa de recepção; será necessário quando implementarmos respostas.

Para verificar: cadastrar o callback e o token na Meta, assinar o campo `messages`, enviar uma mensagem do remetente de teste e conferir uma única linha na caixa de entrada. O webhook ainda não responde pelo WhatsApp. Desligar o piloto após o teste e definir expiração/remoção das mensagens antes de uso contínuo.

Referências técnicas: [exemplo oficial da Meta](https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads), [Cloud API](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api), [Vercel Node.js](https://vercel.com/docs/functions/runtimes/node-js).

## Primeira experiência

1. A pessoa conecta seu número pela conta do clarity.ai usando um código temporário, de uso único, confirmado no WhatsApp.
2. Envia “Preciso estudar amanhã e entregar o trabalho sexta”.
3. O agente consulta apenas o espaço associado ao número confirmado e responde com uma proposta de tarefas.
4. A pessoa confirma os itens. Só então o backend salva as alterações e elas aparecem no site.

Começar com texto, consulta das tarefas de hoje e criação de tarefas. Áudio, lembretes programados e alteração de tarefas ficam para etapas seguintes.

## Arquitetura proposta

WhatsApp Business Platform → webhook HTTPS → fila de processamento → vínculo da conta → planejamento → confirmação → gravação com controle de revisão → resposta no WhatsApp.

- Receber mensagens pela API oficial da Meta; Twilio é uma alternativa com sandbox para prototipação.
- Validar a assinatura do webhook usando o corpo original. Recusar eventos inválidos.
- Registrar o identificador de cada mensagem para não criar tarefas duplicadas em reentregas.
- Confirmar o recebimento rapidamente e processar em uma fila durável.
- Compartilhar o contrato de propostas do chatbot, mas validar ações no servidor antes de salvar. O modelo não escolhe a conta proprietária.
- Guardar propostas pendentes com expiração e revisão do espaço. Recalcular se os dados mudarem antes da confirmação.
- Disponibilizar desconexão e cancelamento de lembretes. Não associar contas apenas pelo telefone informado em texto.
- Manter tokens e credenciais somente no servidor; não incluir mensagens completas nos logs.

## Configurações necessárias

Conta empresarial da Meta, aplicativo com WhatsApp, número habilitado, credencial de servidor e webhook. Começar com número de teste antes da ativação real. Credenciais devem ser inseridas no ambiente da Vercel, nunca enviadas pelo chat ou versionadas.

Mensagens proativas exigem opt-in. Fora da janela de atendimento de 24 horas desde a última mensagem recebida, usar template aprovado. Confirmar regras, elegibilidade do caso de uso e custos vigentes antes de ativar; não pressupor custo zero.

## Critérios de aceitação

- Um número não vinculado nunca consegue consultar dados de uma conta.
- Uma mensagem repetida ou uma confirmação repetida não duplica tarefas.
- Nenhuma gravação acontece antes de uma confirmação válida e não expirada.
- Mudanças concorrentes no site não são sobrescritas pelo agente.
- Desconectar revoga imediatamente o acesso; falhas de IA não simulam tarefas salvas.

Fontes consultadas em 25/10/2026:
- https://www.postman.com/meta/whatsapp-business-platform/overview
- https://www.twilio.com/docs/whatsapp/api

## Chatbot do site: entregue nesta etapa

Contexto das propostas entre mensagens, cancelamento da requisição, recuperação do texto quando há erro, indicação de configuração da IA e sessão verificada pelo servidor. A conversa é temporária e é apagada ao perder acesso à conta. Não há memória persistente nem integração com WhatsApp nesta entrega.

O limitador do endpoint ainda é por instância da Function. Antes de ampliar o uso, adicionar quota persistente por conta e orçamento de IA; o limitador atual não é um limite global de gastos.
