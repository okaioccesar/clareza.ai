# Próximos passos

Concluído nesta versão: **revisão semanal guiada** e **lembretes com horário**.

## 1. Aplicativo para Android e iOS

Empacotar a versão web com Capacitor. O núcleo (`src/core/`) não depende do navegador, então as mesmas regras servem ao app.

- **Notificações nativas:** trocar o envio do navegador por `@capacitor/local-notifications`, agendando os lembretes calculados por `src/core/reminders.ts`. Assim os avisos chegam com o app fechado.
- **Antes da publicação:** novo nome e ícone, política de privacidade, exclusão de conta dentro do app (exigida pela Apple) e login com Google configurado para os esquemas de URL do app.

## 2. Sessão de foco ligada a uma tarefa

A ação "Focar" nos detalhes de uma tarefa inicia um temporizador discreto. Pausar, retomar ou encerrar ficam no mesmo controle. Concluir o tempo não conclui a tarefa automaticamente. Calcular o tempo pelo horário de término, para continuar correto ao trocar de aba.

## 3. Caixa de entrada com sugestões do assistente

Capturar várias ideias em uma mensagem; o assistente sugere títulos, datas e áreas em uma prévia editável. Apenas itens selecionados viram tarefas. O fluxo de propostas já existe.

## 4. Calendário com espaço disponível

Mostrar compromissos e tarefas na mesma visão semanal. Começar com leitura opcional do Google Calendar, que exige consentimento específico.

## 5. Lembretes com o app fechado na web

Web Push com chaves VAPID, inscrições salvas no Supabase e um agendador no servidor. Só vale a pena se a versão web continuar sendo usada além do app.

## Critério para manter a interface leve

Cada recurso entra no contexto em que é usado: revisão na semana, foco na tarefa, captura na entrada e compromissos no calendário. Evitar novos cartões permanentes e novas seções no menu sem necessidade.
