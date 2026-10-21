# Banco do clareza.ai

Projeto `rxlikrptnuxsodgpirbp`, região São Paulo (`sa-east-1`), criado com cotação de US$ 0/mês confirmada pelo proprietário. As credenciais de produção são configuradas na Vercel. O aplicativo usa somente a chave publicável e o token do usuário; não usa chave `service_role`.

O espaço de cada conta fica em um documento JSONB versionado em `private.account_workspaces`. Isso mantém tarefas, áreas, projetos e páginas consistentes em uma gravação atômica. A chave primária é o usuário autenticado; as políticas RLS restringem leitura e alteração ao proprietário. O schema `private` não deve ser exposto na Data API.

As funções públicas `read_account_workspace` e `write_account_workspace` usam `security invoker`, exigem sessão e são executáveis apenas pelo papel `authenticated`. A escrita compara a revisão esperada e usa um identificador idempotente. Uma alteração antiga retorna conflito em vez de sobrescrever outro dispositivo.

`migrations/` contém o schema aplicado. `tests/ownership.sql` verifica isolamento entre duas contas, bloqueio anônimo, versões e idempotência em uma transação revertida. Nenhum usuário de teste permanece no banco.

Para e-mails de cadastro e recuperação, configure o Site URL e os Redirect URLs em [Auth → URL Configuration](https://supabase.com/dashboard/project/rxlikrptnuxsodgpirbp/auth/url-configuration), usando `https://clareza-lake.vercel.app/`. O cadastro público também precisa de um serviço SMTP adequado; o envio padrão do Supabase tem restrições. Mantenha a confirmação de e-mail habilitada.
