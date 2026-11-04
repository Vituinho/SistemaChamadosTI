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

As primeiras execuções encontraram e motivaram correções reais: nome acessível dos links do logotipo e dos botões de conta/filtros/notificações, contraste de textos sobre o fundo cinza e região rolável do detalhe sem foco por teclado.

## 8. Pendências e limitações (não verificadas)

1. **API de produção indisponível em 04/11/2026**: `sistemachamadosti.onrender.com` não respondeu (120 s). Verifique o serviço no painel do Render (suspenso, falha de deploy ou banco).
2. A API NestJS **não foi implantada**. Siga `backend-nest/README.md` (novo serviço, `npm run migrate`, validação) e depois troque `api/config.php`.
3. Conta cPanel real (LiteSpeed, ModSecurity, limites do provedor) não testada; a validação usou Apache 2.4 + PHP 8.3.
4. Web Push com o navegador fechado não foi testado de ponta a ponta (depende de VAPID, permissão e serviço do navegador); o envio e a limpeza de assinaturas foram testados com transporte simulado.
5. O limite de login por IP é compartilhado por todos atrás do proxy do cPanel (30 tentativas/5 min por IP; 10 por usuário).
6. Indicador "Atrasado" usa metas de 1º atendimento configuráveis (`SLA_FIRST_RESPONSE_MINUTES`) — confirme os valores com a equipe.
7. Recuperação de senha pela interface não existe; use `npm run cli -- reset-password <usuario>`.

## 9. Checklist

Legenda: ✅ concluído e verificado por teste automatizado · ☑️ concluído, verificado manualmente · ⚠️ não verificado / depende de ação externa

| Funcionalidade | Status |
| --- | --- |
| Abrir chamado (validação, sugestões, sistema afetado, anexo, dados lembrados) | ✅ |
| Protocolo, link de acompanhamento com chave secreta, salvar no computador | ✅ |
| Acompanhamento com atualização automática (polling no cPanel; SSE fora dele) | ✅ polling (E2E) · ✅ SSE (integração API) · ☑️ SSE no navegador |
| Login da TI, sessão no servidor, logout, expiração, limite de tentativas | ✅ |
| Compatibilidade com senhas Argon2 existentes (pwdlib) | ✅ |
| Fila: visões, busca, filtros, ordenação, paginação | ✅ API · ✅ busca/visões no E2E |
| Assumir (concorrência: apenas um vence) | ✅ |
| Situação, prioridade, cancelamento, transições inválidas bloqueadas | ✅ |
| Resolver com solução; encerrados imutáveis | ✅ |
| Histórico persistido e cronológico | ✅ |
| Mensagens da TI ao colaborador (API v2) | ✅ |
| Novo link de acompanhamento (invalida o anterior) | ✅ API · ☑️ interface |
| Indicadores reais (atrasados, 1º atendimento, resolução, carga) | ✅ API · ☑️ interface |
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
| API de produção atual respondendo | ⚠️ indisponível em 04/11/2026 (seção 8) |
