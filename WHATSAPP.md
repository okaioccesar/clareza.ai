# Agente de organização no WhatsApp

Proposta de implementação — integração ainda não ativada.

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
