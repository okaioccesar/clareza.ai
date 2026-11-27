# Guia do projeto

Como o código está organizado, por que, e como reaproveitar esta base no próximo app.

## A ideia central: núcleo separado da tela

O projeto tem duas camadas:

1. **`src/core/` — as regras.** Funções puras que recebem dados e devolvem dados: o que é uma tarefa válida, quando uma tarefa recorrente se repete, o que entra em "Hoje", quais lembretes disparar, como reconciliar duas versões do espaço. Não sabem que existe navegador, HTML ou banco.
2. **`src/app/` — a interface.** Mostra os dados, reage a cliques e chama o núcleo.

Essa separação é o que permite:

- **Testar rápido:** os testes do núcleo rodam em milissegundos, sem navegador.
- **Levar para o celular:** o app nativo (Capacitor) reaproveita `src/core/` inteiro. As notificações nativas, por exemplo, só trocam *como* o aviso é mostrado; *quando* mostrar continua vindo de `reminders.ts`.
- **Mudar o visual sem medo:** o CSS e os componentes podem ser refeitos sem tocar nas regras.

## Como uma ação percorre o código

Exemplo: marcar uma tarefa como concluída.

1. A lista é desenhada por `components/tasks.ts` (`taskRow`), com `data-action="toggle-task"` no checkbox.
2. `features/actions.ts` recebe o evento (um único ouvinte para a tela toda) e chama `changeStatus` do núcleo.
3. `changeStatus` (`core/workspace.ts`) atualiza a tarefa e, se for recorrente, cria a próxima ocorrência.
4. `commit()` (`render.ts`) salva pelo `store`, redesenha a tela preservando o foco e mostra o aviso.
5. O `store` usa o "salvador" atual: no modo local, `localStorage`; com conta, `features/account.ts`, que guarda a cópia offline e envia ao servidor.

Para criar uma funcionalidade nova, o caminho costuma ser: tipo em `core/model.ts` → regra em `core/` com teste → tela em `views/` → interação em `features/`.

## Convenções

- **Segurança do HTML:** todo HTML gerado passa pelo template `html\`...\`` (`app/dom.ts`), que escapa automaticamente os valores. Um título como `<img onerror=...>` aparece como texto.
- **Dados de fora são sempre validados:** tudo que vem do armazenamento, de uma importação, do servidor ou da IA passa por `normalize` ou `validatePlan`.
- **Nada some sem volta:** exclusões e mudanças em lote mostram "Desfazer".
- **Estilos:** cores, raios e sombras ficam em `styles/tokens.css`; o tema escuro só redefine essas variáveis.
- **Nome do produto:** apenas em `src/brand.ts`.

## Reaproveitar para o app do sonho

Um app de "o que você fez hoje pelo seu sonho" encaixa bem nesta base:

| Precisa de                         | Já existe aqui                                     |
| ---------------------------------- | -------------------------------------------------- |
| Login, conta, sincronização        | `features/account.ts`, `core/sync.ts`, `supabase/` |
| Funcionar offline                  | cópia por conta + reconciliação                    |
| Lembrete diário ("e hoje?")        | `core/reminders.ts` + notificações                 |
| Revisão da semana / do progresso   | `core/review.ts`, `views/review.ts`                |
| Assistente que sugere passos       | `core/assistant.ts`, `api/chat.ts`                 |
| Visual, tema escuro, celular       | `styles/`                                          |

O que mudaria é o **modelo**: em vez de tarefas, algo como `Dream` (o sonho), `Step` (passos) e `Checkin` (o registro diário: o que fiz hoje, quanto tempo, como me senti). Comece pelo `core/model.ts` e pelos testes das regras (sequência de dias, progresso da semana) antes de qualquer tela.

## Como usar IA para construir melhor

O que funcionou neste projeto e vale repetir:

1. **Peça diagnóstico antes de pedir código.** "Leia o projeto e me diga o que está frágil" rende mais do que "melhore o código".
2. **Testes primeiro nas regras.** Com testes, a IA pode reescrever com segurança: aqui, 97 testes garantiram que a reescrita manteve o comportamento de sincronização, login e conflitos.
3. **Uma fonte de verdade para cada coisa.** O código antigo tinha vários arquivos redefinindo as mesmas funções; cada pedido à IA empilhava mais uma camada. Peça "onde isso deveria morar?" antes de "adicione isso".
4. **Verifique na tela, não só no teste.** Vários problemas (rolagem lateral no celular, botão desalinhado, conflito de nome de classe) só apareceram nos prints. Peça prints do celular e do tema escuro.
5. **Peça mudanças pequenas e revisáveis.** Um pull request por assunto facilita entender o que mudou e desfazer se necessário.
6. **Nunca cole segredos no chat.** Chaves ficam nas variáveis de ambiente da Vercel/Supabase.
