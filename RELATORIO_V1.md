# Relatório de entrega — Givova TI

## Ajuste posterior solicitado

Setores limitados a Faturamento, Financeiro, Logística e Monitoramento. Localização removida do formulário, listagem, detalhes, contrato da API e model. A migration `0002_remove_location.py` foi aplicada no PostgreSQL local, removendo somente a coluna de localização; chamados e históricos foram mantidos. Cadastros antigos conservam seu setor original, sem reclassificação arbitrária. Os 29 testes, lint, TypeScript e build passaram novamente após o ajuste.

## Resultado

V1 implementada e validada localmente com frontend real, FastAPI e PostgreSQL. O fluxo foi executado no navegador: abrir chamado → receber protocolo/link → aviso automático na TI → assumir → alterar prioridade/status → registrar solução → resolver → colaborador receber atualização → logout.

Não houve acesso nem alteração de banco de produção. As alterações foram organizadas em commits locais por área: backend, frontend e documentação. Não houve publicação.

## Trabalho do aprendiz preservado

- Estrutura com backend separado do frontend.
- Next.js App Router, React, TypeScript estrito, Tailwind e configurações de lint/build.
- Rota `/chamado`, conceito do formulário e seus campos úteis, agrupamento responsivo em colunas.
- Conceito do painel com cards e lista. A rota antiga `/painel` continua disponível como redirecionamento.

O backend encontrado era um protótipo Flask que apenas ecoava JSON e imprimia informações. Foi substituído por FastAPI conforme a stack obrigatória. Não havia persistência, migrations ou atendimento funcional para preservar. A auditoria anterior à implementação está em `AUDITORIA.md`.

## Problemas corrigidos

- Dados fictícios no painel e botões sem comportamento.
- URL de API fixa na porta 5000, ausência de tratamento de falhas e validação.
- Urgência livremente escolhida pelo colaborador.
- CORS irrestrito e backend em debug, sem autenticação.
- Ausência de persistência, protocolo, acompanhamento e documentação de execução.
- Filtros vazios incompatíveis com os enums da API, encontrados no teste integrado.
- Conversão incorreta de timestamps com offset retornados pelo PostgreSQL, detectada no navegador e coberta por teste de regressão.
- Chaves React repetidas entre detalhes e ações, encontradas no console e corrigidas.
- Ignoração de arquivos Python, ambientes virtuais e exemplos de ambiente ajustada.

## Funcionalidades implementadas

- Abertura com validação no cliente e servidor; prioridade NORMAL e status NOVO.
- Catálogos únicos de setores/categorias, sem dependência de seed.
- Protocolos amigáveis e acompanhamento com chave aleatória.
- Anexos PNG/JPEG/WEBP com limite de tamanho/pixels, verificação real e recodificação segura.
- Login Argon2, cookie HttpOnly, sessões persistidas/revogáveis, expiração, controle de origem e limitação de tentativas.
- Painel com quatro indicadores, busca, quatro filtros, paginação e ordenação dos mais antigos primeiro.
- Detalhes, histórico, responsável e tempo desde abertura.
- Atribuição com bloqueio de linha, transições válidas, prioridade, cancelamento e resolução com solução.
- SSE com reconexão, notificações internas e atualização alternativa periódica.
- Botão para solicitar notificações do navegador quando suportadas.
- Loading, erros, sucesso, estados vazios e confirmação das ações principais.
- CLI de criação segura de técnicos e seed opcional de desenvolvimento.

## Banco e migrations

Migration `0001_initial.py` cria `technicians`, `sessions`, `tickets`, `ticket_history` e `attachments`, com relacionamentos, índices e constraints de status/prioridade. Setores e categorias usam estrutura centralizada, conforme permitido no escopo. Anexos ficam no PostgreSQL e entram no mesmo backup dos chamados.

Foi preparado PostgreSQL 18.4 portátil em `.local/pgdata`, somente em `127.0.0.1:55432`, sem serviço do Windows. Credenciais aleatórias foram gravadas no `.env` local ignorado pelo Git. O auxiliar `scripts/local_db.py` permite iniciar, consultar e parar esse banco.

- `alembic upgrade head`: aplicado com sucesso.
- `alembic check`: nenhuma divergência.
- Upgrade → downgrade → upgrade em schema descartável: passou.
- Concorrência de atribuição no PostgreSQL: uma operação 200 e outra 409.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| Instalação local de dependências frontend/backend | Concluída |
| `npm run lint` | Sem erros ou warnings |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou; rotas estáticas e acompanhamento dinâmico gerados |
| `python -m compileall -q backend/app` | Passou |
| Import da aplicação FastAPI | Passou |
| `GET /health` com Uvicorn real | 200, banco acessível |
| pytest final contra PostgreSQL | **29 testes passaram** |
| Migrations ida/volta em schema isolado | Passou |
| Fluxo real no navegador | Passou |
| Notificação interna ao criar chamado em outra aba | Confirmada sem recarregar |
| Atualização do colaborador ao assumir/resolver | Confirmada sem recarregar |
| Inspeção visual desktop | Realizada |
| `git diff --check` | Sem erros de whitespace |

A suíte cobre campos inválidos, prioridades indevidas, leituras/escritas sem autenticação, chave de acompanhamento, filtros/paginação, sessão/expiração/logout/origem, limitação de login, imagens falsas/grandes, transições/resolução, cancelamento, SSE, fuso horário, concorrência e migrations. O modo rápido SQLite também foi executado durante o desenvolvimento; o resultado final acima usa PostgreSQL real.

Há dois avisos de depreciação nas bibliotecas de teste Starlette/AnyIO relacionados ao cliente httpx e a BlockingPortal. Não são erros da aplicação e não foram ocultados. O npm não reportou vulnerabilidades na instalação realizada.

## Ambiente local e como rodar

A porta 3000 já estava ocupada; o teste usou [localhost:3001](http://localhost:3001). O processo existente na porta 3000 não foi encerrado. API em `127.0.0.1:8000`; PostgreSQL em `127.0.0.1:55432`. O `.env` local permite as origens 3000 e 3001.

Para retomar o ambiente, na raiz do projeto, verifique o banco:

```powershell
.\backend\.venv\Scripts\python.exe scripts/local_db.py status
# Se estiver parado:
.\backend\.venv\Scripts\python.exe scripts/local_db.py start
```

Backend, em um terminal (não inicie uma segunda instância se a porta já estiver ocupada):

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.manage create-user
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, em outro terminal:

```powershell
cd givova-ti-frontend
npm run dev -- --port 3001
```

O README explica instalação do zero, banco convencional, `.venv`, migrations, testes, seed e execução de produção. `requirements.lock.txt` e `package-lock.json` fixam as versões testadas.

## Credenciais e configurações

Configure `DATABASE_URL`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`, `SESSION_HOURS`, `TIMEZONE` e `NEXT_PUBLIC_API_URL`. Não existe usuário/senha administrativo padrão: crie seu técnico com `python -m app.manage create-user`.

Foi usado um técnico temporário apenas para o teste de navegador. Ao finalizar, suas sessões foram revogadas e a senha foi substituída por valor aleatório descartado. O registro permanece somente para preservar o responsável do chamado fictício resolvido. Não use essa conta; crie sua própria conta pelo comando acima.

## Limitações de validação e próximos passos externos

- A estrutura responsiva está implementada, mas a ferramenta de navegador manteve viewport de 1280px mesmo após solicitar 390px. Não foi possível concluir inspeção visual em celular/tablet nesta sessão; faça essa homologação em dispositivos reais.
- Notificação interna foi comprovada. O prompt de permissão/notificação nativa do sistema operacional não foi exercitado; depende do navegador, HTTPS/localhost e permissão do usuário.
- Publicação na rede, domínio, HTTPS, backup operacional e contas reais da TI dependem das configurações da empresa. Não houve deploy ou alteração de produção.
- Recuperação de senha, reabertura e administração de catálogos pela interface não fazem parte desta V1. As limitações e comandos estão no README.
