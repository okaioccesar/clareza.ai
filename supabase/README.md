# Banco do clareza.ai

Projeto `rxlikrptnuxsodgpirbp`, região São Paulo (`sa-east-1`), criado com cotação de US$ 0/mês confirmada pelo proprietário. As credenciais de produção são configuradas na Vercel. O aplicativo usa somente a chave publicável e o token do usuário; não usa chave `service_role`.

O espaço de cada conta fica em um documento JSONB versionado em `private.account_workspaces`. Isso mantém tarefas, áreas, projetos e páginas consistentes em uma gravação atômica. A chave primária é o usuário autenticado; as políticas RLS restringem leitura e alteração ao proprietário. O schema `private` não deve ser exposto na Data API.

As funções públicas `read_account_workspace` e `write_account_workspace` usam `security invoker`, exigem sessão e são executáveis apenas pelo papel `authenticated`. A escrita compara a revisão esperada e usa um identificador idempotente. Uma alteração antiga retorna conflito em vez de sobrescrever outro dispositivo.

`migrations/` contém o schema aplicado. `tests/ownership.sql` verifica isolamento entre duas contas, bloqueio anônimo, versões e idempotência em uma transação revertida. Nenhum usuário de teste permanece no banco.

Para e-mails de cadastro e recuperação, configure o Site URL e os Redirect URLs em [Auth → URL Configuration](https://supabase.com/dashboard/project/rxlikrptnuxsodgpirbp/auth/url-configuration), usando `https://clareza-lake.vercel.app/`. O cadastro público também precisa de um serviço SMTP adequado; o envio padrão do Supabase tem restrições. Mantenha a confirmação de e-mail habilitada.

## Acesso com Google

O aplicativo usa `signInWithOAuth`, fluxo PKCE e o tratamento automático de retorno do SDK. O botão consulta a configuração pública do Supabase e só permite iniciar quando o provedor está habilitado e há conexão. Abrir a tela de conta refaz essa verificação. Cancelamentos e códigos inválidos recebem uma mensagem no aplicativo; os detalhes do provedor não são exibidos.

Para ativar, siga a [documentação oficial do Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google):

1. No projeto correto do [Google Auth Platform](https://console.cloud.google.com/auth/overview), configure a identidade do aplicativo `clareza.ai`, o público e o contato do responsável. Solicite somente `openid`, `userinfo.email` e `userinfo.profile`. Em modo de teste, cadastre os usuários de teste; revise a publicação do público antes de liberar para qualquer pessoa.
2. Em [Clients](https://console.cloud.google.com/auth/clients), crie um cliente OAuth do tipo **Web application**. Use `https://clareza-lake.vercel.app` como origem JavaScript autorizada e `https://rxlikrptnuxsodgpirbp.supabase.co/auth/v1/callback` como URI de redirecionamento autorizada.
3. Em [Supabase → Google](https://supabase.com/dashboard/project/rxlikrptnuxsodgpirbp/auth/providers?provider=Google), preencha o Client ID e Client Secret, habilite o provedor e salve. O segredo fica somente no painel Supabase, nunca no Git, no navegador do aplicativo, em `dist/` ou no chat. Não é necessário adicionar um segredo Google à Vercel.
4. Em [URL Configuration](https://supabase.com/dashboard/project/rxlikrptnuxsodgpirbp/auth/url-configuration), use `https://clareza-lake.vercel.app/` como Site URL e inclua essa URL exata nas URLs de retorno permitidas. Não use permissões amplas para prévias.
5. No site, abra **Entrar ou criar conta**, clique em **Continuar com Google**, conclua o consentimento e confira a conta conectada. Crie uma tarefa, atualize a página e confirme que a tarefa permanece na conta. Os dados do modo local só são importados por escolha explícita.

O login Google não depende de SMTP do aplicativo. E-mails de recuperação de senha e cadastro por senha continuam com sua configuração própria. Não são solicitados acessos ao Gmail, Drive ou Agenda. A ativação externa ainda estava pendente na verificação desta etapa; os testes automatizados usam respostas simuladas e não substituem o consentimento real do Google.
