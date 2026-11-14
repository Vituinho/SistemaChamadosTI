# Relatório técnico — Modernização Givova TI (novembro/2026)

Branch: `refactor/nestjs-backend-cpanel-20261104` (continuação do PR #1, ainda em draft). **Nada foi publicado, enviado (push) ou implantado.** O banco de produção não foi acessado.

## 1. Auditoria inicial (estado encontrado)

| Área | Situação | Decisão |
| --- | --- | --- |
| Frontend | Next.js 16/React 19 funcional; páginas monolíticas (painel da TI em um arquivo de 210 linhas longas); polling de 3 endpoints a cada 15 s + detalhe a cada 3 s; favicon/SVGs padrão do create-next-app; lockfile fora de sincronia. | Reescrita modular preservando URLs, fluxo e modelo de chave no fragmento. |
| API NestJS (PR #1) | Protótipo plano (6 arquivos), validação manual, sem DTOs, sem validação de configuração, sem helmet/logs estruturados/migrations, um único smoke test, sem lockfile. CI verde. | Reestruturar em módulos mantendo o contrato; não começar do zero. |
| API FastAPI | Em produção (Render); referência do contrato e das migrations Alembic 0001–0005. | Mantida intacta para rollback. |
| Proxy PHP | Bem desenhado (URL fixa, lista de rotas, origem); timeout de 18 s menor que o "despertar" do Render; sem rotas novas. | Endurecido e ampliado (seção 4). |
| Produção (somente leitura, 04/11) | Site no cPanel com **LiteSpeed** respondendo 200. **A API do Render (`sistemachamadosti.onrender.com`) não respondeu em 120 s; o proxy devolve 504.** | Fora do alcance (sem acesso ao Render). Ver "Pendências". |

Linha de base: frontend lint/tipos/3 testes OK; Nest 6 testes unitários OK; smoke test do Nest OK contra PostgreSQL 16 migrado pelo **Alembic real**.

## 2. Arquitetura entregue

```text
Navegador ──HTTPS──> cPanel (LiteSpeed/Apache)
                      ├─ export estático Next.js (HTML/JS/CSS, CSP com hashes)
                      └─ /api/* → api/index.php (lista de rotas) ──HTTPS──> API (Render)
                                                                         ├─ NestJS (novo)  ┐ mesmo
                                                                         └─ FastAPI (atual)┘ PostgreSQL
```

O frontend lê `GET /catalog → api_version/features` e só exibe recursos suportados, então o **mesmo `cpanel.zip` funciona com a API atual e com a nova**.

### API (backend-nest)
Módulos `auth`, `tickets` (TI + rastreamento público), `dashboard`, `push`, `catalog`, `health`, `database`; repositório SQL parametrizado separado do serviço de regras; DTOs `class-validator`; filtro global de erros `{ detail, fields }`; configuração validada na inicialização; logs JSON com `requestId`; helmet, CORS restrito, verificação de origem e de tipo de conteúdo; transações com `SELECT … FOR UPDATE` em toda mudança de estado; SSE com um único ciclo de consulta compartilhado; CLI de operação.

Recursos novos (aditivos): mensagens da TI ao colaborador; novo link de acompanhamento (invalida o anterior); fila com `scope=open|waiting|closed`, `assigned=me|none`, `sort=oldest|newest|priority|activity`; dashboard com `revision`, `open`, `overdue`, `opened_today`, tempo médio de 1º atendimento e de resolução (7 dias, calculados dos timestamps reais) e carga por técnico.

### Frontend
Módulos `new-ticket`, `tracking`, `technician`, `tickets`; design system próprio sobre Radix (botões, campos com erros acessíveis, diálogos, popover, menu, switch, tooltip, toasts) e tokens da marca (laranja Givova com contraste AA). TanStack Query controla cache, novas tentativas e atualização.

## 3. Melhorias de experiência

**Colaborador:** atalhos por tipo de problema na página inicial; formulário em uma página com blocos grandes, sugestões de um clique, sistema afetado, descrição e print opcionais (arrastar, escolher ou **Ctrl+V**) com pré-visualização; dados pessoais lembrados no computador (opcional); resumo de erros com links e foco; confirmação com protocolo; página de acompanhamento com etapas, técnico responsável, **mensagens da TI**, solução, histórico, copiar/compartilhar link; "seus chamados neste computador"; colar link antigo ou novo.

**TI:** tela de login dedicada (mostrar senha, aviso de sessão expirada); indicadores clicáveis; carga da equipe; fila com visões, busca (atalho `/`), filtros com chips, ordenação, setas ↑/↓, paginação; indicador **Atrasado** por prioridade; painel lateral (ou tela cheia no celular) com fluxo contextual: Assumir → situação → prioridade → mensagem (respostas rápidas) → Resolver (modelos de solução), novo link, cancelar com confirmação; alerta de novo chamado com som opcional e notificações do Windows; link direto `?ticket=ID`.

## 4. Segurança

- Sessões: token de 256 bits, apenas SHA-256 no banco, validação a cada requisição, revogação por logout/CLI; cookie `HttpOnly; Secure; SameSite=Strict` (o proxy força os atributos e remove `Domain`).
- Senhas Argon2id; hashes do backend Python continuam válidos (testado com hash real do `pwdlib`).
- Login limitado por usuário+IP e por IP; resposta idêntica para usuário inexistente e senha errada.
- CSRF: SameSite estrito + `Origin`/`Sec-Fetch-Site` na API e no proxy + bloqueio de `text/plain`/formulários.
- Uploads: conteúdo real verificado, recodificado em WEBP sem EXIF/GPS, limite de pixels e tamanho, servido com `CSP sandbox`.
- Chave de acompanhamento: só no fragmento e no cabeçalho, comparação em tempo constante, troca pela TI.
- Proxy PHP: URL fixa com validação de esquema/host/sufixo (sem SSRF), rotas e métodos explícitos, chave aceita só em rotas de rastreamento, consulta só em GET, limites de tamanho, TLS verificado, sem redirecionamentos, cabeçalhos de resposta filtrados.
- Site: CSP com hashes dos scripts inline (sem `unsafe-inline` em scripts), `frame-ancestors 'none'`, HSTS, `Permissions-Policy`, COOP, bloqueio de arquivos internos.
- O empacotador recusa fontes, `.env`, chaves, mapas e padrões de segredos no ZIP.

## 5. Banco de dados

Schema atual preservado. `0000_baseline.sql` = Alembic 0001–0005 (diferença zero no `pg_dump`). `0006` é aditiva (2 colunas com default + 5 índices). O migrator exige Alembic `0005`, roda sob advisory lock, uma transação por migration, nunca automaticamente. Testado em banco com dados no formato legado: tickets, histórico, anexos, sessões e sequência de IDs preservados; INSERT no formato antigo continua funcionando (rollback).

**Backup antes do cutover:** `pg_dump -Fc "$DATABASE_URL" > givova-$(date +%F).dump`; restaurar em banco descartável com `pg_restore -d <descartável> givova-AAAA-MM-DD.dump` para conferir. **Rollback:** apontar o proxy de volta para o FastAPI; a 0006 não precisa ser revertida.

## 6. Desempenho

- Painel da TI ocioso, por aba: antes 3 requisições a cada 15 s (≈0,2 req/s) e mais 1 a cada 3 s com um chamado aberto (≈0,53 req/s); agora 1 requisição a cada 15 s (`/dashboard`, ≈0,07 req/s), com a fila e o detalhe recarregados só quando a revisão muda — de 3× a 8× menos chamadas ao PHP do cPanel. Com a API legada (sem revisão) a fila é recarregada a cada 15 s apenas com a aba visível.
- Acompanhamento só consulta com a aba visível; sem SSE no cPanel (nenhum worker PHP preso).
- SSE (fora do cPanel): um ciclo de consulta por processo, não por conexão.
- Índices para ordenação da fila, "meus chamados", métricas e limpeza de sessões; contagem e página em paralelo.
- `sharp` sem cache e com 1 thread (memória previsível no Render); fonte Inter auto-hospedada; vídeo e `_next/static` com cache longo.

## 7. Testes executados

| Verificação | Resultado |
| --- | --- |
| API — TypeScript (`tsc --noEmit`) | OK |
| API — 62 testes (25 unitários + 37 integração em PostgreSQL 16 real, schemas isolados) | **62/62 OK** |
| Baseline SQL × Alembic 0001–0005 (`pg_dump`) | **Idêntico** |
| Frontend — ESLint, TypeScript | OK |
| Frontend — Vitest (16 unidade + 6 componentes) | **22/22 OK** |
| `next build` com `CPANEL_EXPORT=1` | OK (todas as rotas estáticas) |
| `cpanel.zip` — CRC, arquivos obrigatórios/proibidos, segredos | OK |
| PHP 8.3 `php -l` do proxy | OK |
| Navegador (manual, NestJS + Next dev): abrir → protocolo → login → assumir → mensagem → resolver, com atualização ao vivo do colaborador; layout 375 px | OK |
| E2E Playwright no ZIP real (Apache 2.4 + PHP 8.3), alvo NestJS | **17/17 OK** |
| E2E Playwright no ZIP real, alvo FastAPI legada | **17/17 OK** |

### 7.1 E2E do pacote cPanel

Ambiente: `dist/cpanel.zip` extraído em Apache 2.4.69 + PHP 8.3 (Docker), HTTPS com CA de teste, proxy PHP **sem alterações** apontando para um terminador TLS que se apresenta como `*.onrender.com`; APIs NestJS e FastAPI reais com PostgreSQL 16 descartável (a FastAPI migrada pelo Alembic real e usando um hash Argon2 gerado pelo Node). Chromium 1.63 (Playwright), 34/34 testes em 1,8 min:

- Rotas diretas e com F5, barra final, `/painel`, link antigo `/chamado/GV-x`, 404 real, HTTP→HTTPS.
- CSP com hashes (sem violações no console), HSTS, `X-Frame-Options`, `nosniff`, `Permissions-Policy`, cache imutável de `_next/static`.
- 403 para `.htaccess`, `.user.ini`, `api/config.php`; proxy: 404 fora da lista, 405, 403 sem `Origin`/origem externa, 400 para chave inválida ou em rota errada, 415 para `text/plain`.
- Cookie `Secure; HttpOnly; SameSite=Strict; Path=/` sem `Domain`; logout revoga.
- Ciclo completo com dois navegadores: abrir com imagem → recarregar o acompanhamento → login da TI → buscar → assumir (confirmação) → colaborador vê "A TI está indo até você!" → mensagem da TI (só NestJS; oculta na FastAPI) → prioridade → resolver → colaborador vê solução e histórico → chamado listado na página inicial → link antigo funciona → chave errada não revela nada → logout.
- Alerta de novo chamado no painel aberto (detecção pelo `/dashboard`).
- Validação do formulário e de anexo (PDF recusado).
- axe WCAG 2.2 AA (sério/crítico = 0) em início, abrir chamado (com e sem erros), acompanhamento, tutorial, login e painel com detalhe aberto; teclado (link "pular para o conteúdo" e foco visível).
- Sem rolagem horizontal em 375 px, 768 px e 1366 px, inclusive no painel da TI.

Pacote validado: `dist/cpanel.zip` gerado do commit `0f5844b` (3,34 MiB, 84 arquivos, 8 hashes CSP), SHA-256 `0b9d7c529dfe632a67c4f8f104629d1ce05b4eaceca8c45e4c9da634784a96f8`.

As primeiras execuções encontraram e motivaram correções reais: nome acessível dos links do logotipo e dos botões de conta/filtros/notificações, contraste de textos sobre o fundo cinza e região rolável do detalhe sem foco por teclado.

## 8. Pendências e limitações (não verificadas)

1. **API de produção indisponível em 04/11/2026** — ver seção 10. Ação necessária no painel do Render (somente pelo responsável).
2. A API NestJS **não foi implantada**. Siga `backend-nest/README.md` (novo serviço, `npm run migrate`, validação) e depois troque `api/config.php`.
3. Conta cPanel real (LiteSpeed, ModSecurity, limites do provedor) não testada; a validação usou Apache 2.4 + PHP 8.3.
4. Web Push com o navegador fechado não foi testado de ponta a ponta (depende de VAPID, permissão e serviço do navegador); o envio e a limpeza de assinaturas foram testados com transporte simulado.
5. **API atual (FastAPI) atrás do proxy do cPanel:** o limite é de 10 logins por IP a cada 5 min, *contando os bem-sucedidos*, e todos os técnicos chegam com o IP do cPanel. Reproduzido no E2E (429 após 10 logins): na prática, a equipe inteira divide 10 logins a cada 5 min. A API NestJS limita por usuário+IP (10, zerado após sucesso) e por IP (30), o que resolve o problema após o cutover.
6. Indicador "Atrasado": **desativado por padrão**. Só aparece quando `SLA_FIRST_RESPONSE_MINUTES` é configurado na API com as quatro prioridades. Os valores citados na documentação são apenas exemplo; a política deve ser definida pela empresa.
7. Recuperação de senha pela interface não existe; use `npm run cli -- reset-password <usuario>`.

## 9. Checklist

Legenda: ✅ concluído e verificado por teste automatizado · ☑️ concluído, verificado manualmente · ⚠️ não verificado / depende de ação externa

| Funcionalidade | Status |
| --- | --- |
| Abrir chamado (validação, sugestões, sistema afetado, anexo, dados lembrados com consentimento) | ✅ |
| Protocolo, link de acompanhamento com chave secreta, salvar no computador (opcional) | ✅ |
| Acompanhamento com atualização automática (polling no cPanel; SSE fora dele) | ✅ polling (E2E) · ✅ SSE (integração API) · ☑️ SSE no navegador |
| Login da TI, sessão no servidor, logout, expiração, limite de tentativas | ✅ |
| Compatibilidade com senhas Argon2 existentes (pwdlib) | ✅ |
| Fila: visões, busca, filtros, ordenação, paginação | ✅ API · ✅ busca/visões no E2E |
| Assumir (concorrência: apenas um vence) | ✅ |
| Situação, prioridade, cancelamento, transições inválidas bloqueadas | ✅ |
| Resolver com solução; encerrados imutáveis | ✅ |
| Histórico persistido e cronológico | ✅ |
| Mensagens da TI ao colaborador (API v2) | ✅ |
| Novo link de acompanhamento (autorização, invalida o anterior, encerra transmissões, auditoria) | ✅ API · ☑️ interface |
| Indicadores reais (1º atendimento, resolução, carga) | ✅ API · ☑️ interface |
| Indicador "Atrasado" (só com SLA configurado; sem padrão embutido) | ✅ |
| Computadores compartilhados: memória local opcional, expiração, "Esquecer este computador" | ✅ unitário · ✅ E2E |
| Limite de abertura de chamados por IP; push só para serviços de navegador | ✅ |
| Alerta de novo chamado no painel | ✅ |
| Som do painel | ☑️ (depende de permissão do navegador) |
| Web Push com o navegador fechado | ⚠️ envio/limpeza testados com transporte simulado; entrega real não testada |
| Uploads seguros (conteúdo real, WEBP, sem EXIF, limites) | ✅ |
| CSRF / CORS / cabeçalhos de segurança / proxy PHP | ✅ |
| Migrations não destrutivas e baseline = Alembic | ✅ |
| Frontend funciona com a API atual (FastAPI) e a nova (NestJS) | ✅ |
| Acessibilidade WCAG 2.2 AA (axe) e teclado | ✅ automatizado · ⚠️ leitor de tela real não testado |
| Responsivo (celular, tablet, notebook) | ✅ |
| `cpanel.zip` válido (estrutura, CRC, sem segredos) | ✅ |
| Publicação no cPanel real | ⚠️ não realizada (aguarda autorização) |
| API NestJS implantada no Render | ⚠️ não realizada (aguarda autorização) |
| API de produção atual respondendo | ⚠️ indisponível em 04/11/2026 (seção 10) |

## 10. Revisão após o push (04/11/2026)

**Push e PR.** O branch já estava publicado (`d0004be`) quando a revisão começou; o PR #1 continua em **draft**, sem merge. O push gerou apenas um deploy **Preview** da Vercel (como em todos os pushes anteriores do branch); o último deploy **Production** da Vercel continua sendo o de `main` (13/10). Nenhum workflow faz deploy e não há configuração do Render no repositório.

**CI.** Na primeira execução, o job do frontend falhou uma vez por um teste com corrida de tempo (o foco vai para o resumo de erros no quadro de animação seguinte); corrigido com espera explícita e executado 3 vezes seguidas sem falha. As ações `checkout`/`setup-node` foram atualizadas para v5 (Node 24).

**Segurança — achados e correções.**
- Dependências com vulnerabilidades conhecidas: Next.js 16.3.4 (avisos críticos de recursos de servidor — afetam os previews da Vercel, não o export estático) → **16.4.2**; `sharp` (CVEs da libvips, relevante porque decodificamos uploads) → **0.35.5**; `multer` aninhado no `@nestjs/platform-express` (DoS) forçado para **2.5.0** via `overrides`. `npm audit --omit=dev`: 0 vulnerabilidades nos dois pacotes.
- `POST /tickets` público sem limite → limite por IP configurável, aplicado antes de ler o upload.
- Assinaturas Web Push aceitavam qualquer URL HTTPS (um técnico autenticado poderia fazer a API enviar requisições a hosts arbitrários) → somente serviços de push dos navegadores; linhas antigas com outros hosts são ignoradas no envio.
- Dependências: nenhuma desnecessária encontrada (cada pacote tem uso no código ou nos testes).

**Novo link de acompanhamento (verificado por testes).** Exige sessão de técnico (401 sem sessão; a chave do colaborador não substitui a sessão), origem permitida (403 para origem externa) e chamado existente (404). Grava apenas o hash da nova chave; a chave antiga passa a responder 404; transmissões ao vivo abertas com a chave antiga recebem `expired` e são encerradas; o histórico registra *quem* (campo `author`), *quando* e que o link anterior foi desativado, sem conter nenhuma chave. Requisições recusadas não alteram a chave.

**Computadores compartilhados.** Lembrar dados passou a ser **opcional e desmarcado por padrão**. Sem consentimento, nada é gravado no navegador (nome, local ou chaves) e o acompanhamento orienta a copiar o link. Com consentimento, os dados expiram (90/30 dias) e podem ser apagados em "Esquecer este computador" (página inicial) ou "Não sou eu" (formulário); desmarcar a opção ao enviar apaga tudo. O preenchimento automático do navegador para o nome fica desativado quando a opção está desmarcada. Observação: o histórico do navegador ainda guarda o endereço da página de acompanhamento (com a chave no fragmento), como antes; em computadores compartilhados recomenda-se janela anônima ou limpar o histórico.

**SLA.** As metas de 1º atendimento não têm mais valor padrão: sem `SLA_FIRST_RESPONSE_MINUTES` (com as quatro prioridades) a API devolve `overdue: null` e a interface não mostra "Atrasado".

**Compatibilidade do banco.** Sem novas migrations nesta revisão. A 0006 continua aditiva (colunas com default + índices + `CHECK` em `kind` aceitando o valor padrão usado pelo FastAPI); o rollback para o FastAPI segue possível sem reverter migrations.

**Investigação da API do Render (somente leitura).** DNS resolve para a borda do Render (GCP us-west1 via Cloudflare); TCP e TLS completam em ~60 ms e a requisição é aceita, mas **nenhum byte de resposta** chega em 70 s — em qualquer caminho, inclusive inexistentes (que o app responderia com 404 imediatamente). Um host `*.onrender.com` inexistente responde em 0,65 s com `404 x-render-routing: no-server`, logo **o serviço existe** (não foi apagado). A página de status do Render indica "All Systems Operational" (não é incidente da plataforma). Conclusão provável: a instância do serviço **não consegue ficar saudável na inicialização** e o proxy do Render segura as requisições. O comando de início do serviço executa `alembic upgrade head` antes do Uvicorn; se o PostgreSQL estiver inacessível (por exemplo, banco gratuito do Render expirado — expira 30 dias após a criação), a inicialização trava ou reinicia em ciclo. **Confirme no painel do Render**: *Events* e *Logs* do serviço e o status/data de expiração do banco. Nada foi reiniciado, reconfigurado ou implantado.

## 11. Mudança de hospedagem: Render → Railway (04/11/2026)

Decisão: API NestJS e PostgreSQL no **Railway**; frontend estático continua no cPanel. Detalhes operacionais em [RAILWAY.md](RAILWAY.md).

**Preparado e testado (sem credenciais de produção):**
- `backend-nest/Dockerfile` (Node 22.23.4, `npm ci`, usuário sem privilégios, `node` como PID 1). O formato `railway.json` não foi usado: está depreciado e não é aceito por serviços novos.
- Escuta em `::` (IPv6+IPv4) com recuo para IPv4; `PORT` do Railway; `TRUST_PROXY=1` automático no Railway; produção exige `ALLOWED_ORIGINS` HTTPS explícitas; aviso se o banco for acessado pelo proxy TCP público.
- Encerramento gracioso: SIGTERM → `/health` 503, sem novas conexões, transmissões encerradas, requisições em andamento concluídas, pool fechado, saída 0 (testado com `docker stop`: 1,2 s).
- Banco: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (rede privada, sem acesso público). Migrations manuais, nunca no build/start, para não criar um banco "vazio porém migrado" antes da restauração.
- `cli db-report` (somente leitura) e `scripts/transfer-database.sh` (origem → destino **vazio**, comparação de contagens, IDs, sequências e *fingerprints*, migrations, nova comparação). Ensaiado localmente e no CI com banco criado pelo Alembic real + dados legados: idêntico em 18 verificações, só a 0006 aplicada, segunda execução recusada; a imagem da API serve os dados transferidos (login com hash legado, protocolos originais, anexo, sequência continuando em GV-000008).
- Proxy PHP: lista **exata** de hosts em `config.php` (sem sufixos/curingas), recusa IPs, `localhost`, `*.internal`, portas, caminhos, credenciais e caracteres de controle; cURL sem proxy de ambiente e sem redirecionamentos. 22 testes PHP (8.1 e 8.3).
- Empacotador: `cpanel.zip` de **produção** só com `--api-url` verificada ao vivo; sem isso gera `cpanel-staging.zip` (proxy responde 503) identificado em `build.json`.
- CI: imagem Docker + health + SIGTERM, testes do proxy PHP, ensaio da transferência de dados, E2E com a imagem da API; sem tokens e sem etapa de deploy.

**Resultados locais (worktree, sem push):** API 73/73; frontend lint, tipos, 27/27; PHP 22/22; E2E 40/40 (imagem da API e FastAPI legada); ensaio de transferência aprovado.

**Bloqueios:**
1. **Dados do Render.** Pela documentação do Render, banco Free expira em 30 dias, tem 14 dias de carência para upgrade e depois é apagado; Free não tem backups. O estado do banco só pode ser visto no painel do Render. Sem um dump/backup, os chamados antigos **não** podem ser migrados.
2. Projeto Railway ainda não criado; domínio da API desconhecido → apenas o pacote **staging** foi gerado. O `cpanel.zip` de produção depende da API publicada e verificada.
3. O pacote hoje publicado no cPanel só aceita `*.onrender.com`; é preciso publicar o pacote novo para usar o Railway.
