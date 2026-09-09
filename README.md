# Givova TI — Sistema de Chamados

Central interna para abrir, acompanhar e atender chamados. Frontend Next.js/React/TypeScript/Tailwind com botão no padrão shadcn/ui (Radix/CVA) e ícones Lucide. Backend Python/FastAPI, SQLAlchemy, Alembic, Pydantic e PostgreSQL via psycopg.

## Requisitos

- Python 3.12 ou superior (validado com 3.12).
- Node.js 20.9 ou superior e npm.
- PostgreSQL 16 ou superior, iniciado e acessível (validação local com PostgreSQL 18).
- Dois terminais PowerShell, abertos na pasta deste repositório.

Não é necessário Redis, Docker ou instalar bibliotecas Python globalmente.

### Banco portátil opcional no Windows

Neste computador foi preparado um PostgreSQL isolado em `.local/pgdata`, escutando somente em `127.0.0.1:55432`, com senha aleatória em `backend/.env`. Não foi instalado serviço do Windows. Para reiniciá-lo, na raiz do repositório:

```powershell
.\backend\.venv\Scripts\python.exe scripts/local_db.py start
```

Use `status` para consultar e `stop` para encerrar. Se já estiver iniciado, não execute `start` novamente. Para reproduzir o ambiente portátil em outro Windows, crie a `.venv` e instale as dependências do backend, mas **não crie `.env` ainda**. Depois execute na raiz:

```powershell
npm install --prefix .local/postgres @embedded-postgres/windows-x64@18.4.0-beta.17 --ignore-scripts
.\backend\.venv\Scripts\python.exe scripts/local_db.py init
.\backend\.venv\Scripts\python.exe scripts/local_db.py start
```

O auxiliar não sobrescreve configurações existentes. Este pacote é apenas uma conveniência local de teste; para disponibilizar o sistema na empresa, use o PostgreSQL administrado pela TI. Os binários, dados e credenciais de `.local` são ignorados pelo Git.

## 1. Banco de desenvolvimento

No pgAdmin ou psql, conectado como administrador **do banco local**, crie um usuário `givova` com senha própria e um banco `givova_ti` cujo proprietário seja esse usuário. No psql:

```sql
CREATE ROLE givova LOGIN;
\password givova
CREATE DATABASE givova_ti OWNER givova;
```

O comando `\password` solicita a senha sem colocá-la no SQL/histórico. Nunca use a conexão de produção para desenvolver ou testar.

## 2. Backend (primeiro terminal)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.lock.txt
Copy-Item .env.example .env
```

Edite `backend/.env` e configure `DATABASE_URL` com usuário, senha, endereço, porta e banco locais. Formato:

```dotenv
DATABASE_URL=postgresql+psycopg://USUARIO:SENHA_CODIFICADA@localhost:5432/givova_ti
ALLOWED_ORIGINS=["http://localhost:3000"]
COOKIE_SECURE=false
SESSION_HOURS=8
TIMEZONE=America/Sao_Paulo
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=http://localhost:3000
```

Codifique caracteres reservados da senha na URL (por exemplo, `@` vira `%40`). Não publique o arquivo `.env`. Se já existir configuração local, preserve-a em vez de copiar por cima.

```powershell
python -m alembic upgrade head
python -m app.manage create-user
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`create-user` pergunta usuário, nome e senha duas vezes. Exige ao menos 12 caracteres e salva somente hash Argon2. Não existe senha inicial ou conta padrão. Repita o comando para cadastrar outros técnicos. Todos os técnicos têm as mesmas permissões na V1.

Para habilitar notificações do computador, gere uma única vez o par de chaves Web Push:

```powershell
python -m app.manage generate-vapid
```

Copie os dois valores para o `.env`. Guarde `VAPID_PRIVATE_KEY` como segredo e não gere outro par enquanto houver computadores cadastrados.

Se o PowerShell bloquear a ativação, use diretamente `.\.venv\Scripts\python.exe` no lugar de `python` em cada comando; não precisa alterar a política do Windows. Em desenvolvimento, pode acrescentar `--reload` ao Uvicorn.

Verifique em outro terminal:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

O retorno deve ser `status: ok`. A documentação interativa da API está em [localhost:8000/docs](http://localhost:8000/docs). `/health` verifica a conexão com o banco e retorna 503 se estiver indisponível.

## 3. Frontend (segundo terminal)

```powershell
cd givova-ti-frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Abra [localhost:3000](http://localhost:3000). O arquivo `.env.local` contém apenas `NEXT_PUBLIC_API_URL=http://localhost:8000`. Reinicie o Next.js após mudar essa variável. Ela é pública e não deve conter secrets.

Use `localhost` nos dois serviços. Misturar `127.0.0.1` e `localhost` no navegador interfere no cookie SameSite. O bind `127.0.0.1` do Uvicorn continua aceitando a conexão pelo hostname `localhost`.

## Como usar

1. Colaborador abre `/` ou `/chamado`, digita seu nome e escolhe o setor e o tipo de problema nos botões grandes. Pode clicar em uma sugestão para preencher o resumo ou escrever uma frase curta. **Descrição e imagem são opcionais** e ficam em “Quer acrescentar algo?”. Os setores disponíveis são Faturamento, Financeiro, Logística, Juridico, Departamento Pessoal e Monitoramento; não há campo de localização.
2. Ao enviar, recebe protocolo `GV-000001` e link de acompanhamento. Guarde o endereço **completo**, incluindo o fragmento após `#`. A chave não é enviada na URL ao servidor; as consultas usam um cabeçalho privado.
3. Técnico abre `/ti`, faz login e recebe novos chamados automaticamente. `/painel` redireciona para `/ti`.
4. Filtra/busca na fila, abre detalhes e confirma **Assumir chamado**. O responsável e o horário ficam registrados.
5. Ajusta prioridade/status, escreve a solução e confirma **Resolver chamado**.
6. O colaborador vê o andamento automaticamente. Histórico e solução ficam persistidos.

O acompanhamento mostra as etapas Recebido → Em atendimento → Resolvido, com instruções simples. Detalhes e histórico podem ser expandidos quando necessário. Descrição omitida, vazia ou `null` na API é salva como texto vazio; o limite continua sendo 5000 caracteres quando informada. O resumo continua obrigatório, mas as sugestões evitam digitação desnecessária.

Neste ambiente local foi criada a conta `ti`, com senha aleatória entregue ao responsável fora do repositório. A senha fica armazenada no banco somente como hash Argon2. Não há credencial padrão para novas instalações.

O link de acompanhamento é uma credencial de acesso ao próprio chamado. Não há recuperação pública pelo protocolo, para evitar expor dados pessoais. Se perder o link, procure a TI.

## Regras da V1

- Status: `NOVO`, `EM_ATENDIMENTO`, `AGUARDANDO_USUARIO`, `AGUARDANDO_TERCEIRO`, `RESOLVIDO`, `CANCELADO`.
- Para iniciar atendimento, use a ação de assumir; para resolver, use a ação de resolução com uma solução de 3–3000 caracteres.
- Chamados encerrados não podem ser reabertos ou alterados nesta versão. Registre um novo chamado se necessário.
- Prioridade inicial `NORMAL`, alterável apenas pela TI para `BAIXA`, `NORMAL`, `ALTA` ou `URGENTE`.
- Setores e categorias centralizados em `backend/app/catalog.py`. São independentes de seed e podem futuramente ser substituídos por tabelas administrativas.
- Anexo opcional: PNG/JPEG/WEBP real, até 5 MB e 16 megapixels. O servidor verifica e recodifica os pixels como WEBP, sem metadados. Conteúdo salvo no PostgreSQL, acessível somente pela TI ou pela chave do chamado. Requisições têm limite de 6 MB.
- SSE consulta revisões persistidas a cada 2 segundos, com reconexão e fallback de atualização a cada 15 segundos. Não exige Redis. O servidor libera conexões com o banco entre consultas.
- Novo chamado gera um aviso destacado na TI com nome, setor, resumo e botão **Ver chamado**, inclusive quando os filtros da fila ocultam o pedido. O aviso permanece até ser aberto ou dispensado; se chegarem vários, mostra o mais recente e todos continuam na fila.
- **Ativar no computador** cadastra este navegador para receber novos chamados pelas notificações do Windows, inclusive com o site fechado. O painel oferece um botão de teste e outro para desativar somente este computador. O navegador precisa continuar autorizado a funcionar em segundo plano. O som da aba continua opcional e só funciona enquanto o painel está aberto.
- Ao confirmar **Assumir chamado**, a página de acompanhamento do colaborador mostra automaticamente **A TI está indo até você!**, com o nome do responsável. A mensagem acompanha o status **Em atendimento** e muda ao aguardar retorno, resolver ou cancelar. O colaborador deve manter seu acompanhamento aberto para ver as atualizações.
- Sessões aleatórias revogáveis em cookies HttpOnly/SameSite, expiram após 8 horas. Logout revoga a sessão no banco. Origens de escrita são verificadas. Login limitado a 10 tentativas por IP/5 minutos por processo; execute um worker na V1.
- Banco aplica bloqueio de linha ao assumir/alterar/resolver, para serializar ações concorrentes.
- Os indicadores usam o fuso `America/Sao_Paulo`; timestamps são armazenados em UTC e apresentados no fuso do navegador.

## Seed opcional

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.manage seed
```

Cria um único chamado fictício apenas se o banco não tiver chamados. Não cria contas nem senhas. Produção não depende do seed.

## Testes e verificações

Backend, dentro de `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m alembic check
.\.venv\Scripts\python.exe -m compileall -q app
```

Sem `TEST_DATABASE_URL`, pytest usa SQLite em memória para os testes rápidos e pula apenas a concorrência de bloqueio de linha. Para validar PostgreSQL, configure `TEST_DATABASE_URL` com uma conexão **de desenvolvimento/teste** e execute pytest novamente. Os testes criam e removem schemas aleatórios `test_*`, sem tocar nas tabelas da aplicação. O usuário de testes precisa de permissão para criar schemas. Não aponte para produção.

As migrations são versionadas em `backend/alembic/versions`. `alembic upgrade head` cria a estrutura; `alembic check` detecta divergências com os models. `alembic downgrade base` **remove os dados**: só use em banco descartável.

Frontend, dentro de `givova-ti-frontend`:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
npm start
```

`npm start` usa o build de produção; não execute junto com `npm run dev` na mesma porta. Dependências exatas estão em `package-lock.json` e `backend/requirements.lock.txt`; `requirements.txt` declara os intervalos para futuras atualizações controladas.

## Estrutura

```text
backend/
  app/              configuração, banco, models, schemas, segurança, API e CLI
  alembic/versions/ migrations independentes dos models atuais
  tests/            fluxos críticos, segurança, imagens, eventos e concorrência
givova-ti-frontend/
  app/chamado/      abertura e acompanhamento
  app/ti/           login e painel
  components/       detalhes compartilhados e botão shadcn/ui
  lib/              cliente API tipado, SSE e apresentação
```

## Uso na rede interna

Antes de disponibilizar para outros computadores, configure os endereços reais de frontend/API, `ALLOWED_ORIGINS`, HTTPS e `COOKIE_SECURE=true`. Os dois endereços devem estar no mesmo site (por exemplo, `suporte.empresa` e `api.empresa`) por causa do cookie SameSite. Ajuste o bind dos servidores conforme a rede autorizada. No proxy reverso, desative buffering para SSE e permita conexões longas. O servidor de desenvolvimento do Next.js não é o servidor de produção: use build + start.

Faça backup do PostgreSQL (inclui anexos e histórico). Não há integração WhatsApp, inventário, AD, Microsoft 365 ou gestão de SLA nesta V1. Uma futura relação de equipamento pode ser adicionada ao Ticket por migration sem mudar o identificador atual.

## Produção no Render e Vercel

No Render, mantenha as variáveis atuais e acrescente:

```dotenv
VAPID_PUBLIC_KEY=VALOR_GERADO_PELO_COMANDO
VAPID_PRIVATE_KEY=VALOR_GERADO_PELO_COMANDO
VAPID_SUBJECT=https://sistema-chamados-ti-omega.vercel.app
```

Não adicione a chave privada à Vercel. O frontend obtém a chave pública pela API depois do login. O start command do Render já executa `alembic upgrade head`, que criará a tabela de computadores cadastrados no próximo deploy. Após o deploy, entre em `/ti`, clique em **Ativar no computador**, aceite a permissão do navegador e use **Testar notificação**.

## Documentos de entrega

- [Auditoria inicial](AUDITORIA.md): estado encontrado e decisões de preservação.
- [Relatório de entrega](RELATORIO_V1.md): verificações executadas, resultados e limitações.
