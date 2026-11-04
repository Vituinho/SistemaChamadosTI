# Givova TI — API (NestJS)

API da central de chamados. Substitui o backend Python/FastAPI (`../backend`, mantido apenas para rollback) **sem mudar o contrato** usado pelo frontend nem os dados existentes.

- Node.js 22.12+ · NestJS 11 · PostgreSQL 16+ (`pg`, SQL parametrizado, pool e transações)
- Hashes Argon2 e SHA-256 compatíveis com o backend legado: técnicos **não** precisam trocar senha; sessões e links de acompanhamento continuam válidos.
- Mesmas rotas, mesmos campos JSON e mesmo cookie `givova_session`; recursos novos são **aditivos** e anunciados em `GET /catalog → features`.

## Estrutura

```text
src/
  main.ts / bootstrap.ts   inicialização, helmet, CORS, CSRF, limites, logs, filtro de erros
  config/                  variáveis de ambiente tipadas e validadas (falha rápida)
  common/                  catálogo, cripto, protocolo, contrato de erro, middlewares, validação
  database/                pool PostgreSQL, transações, migrations, detecção de schema
  auth/                    login (limite de tentativas), sessões, guard, DTO
  tickets/                 controller público/TI, rastreamento, serviço, repositório SQL, imagens, SSE
  dashboard/               indicadores reais (tempo de 1º atendimento, resolução, atrasos, carga)
  push/                    Web Push (VAPID)
  cli/                     migrate, create-user, reset-password, revoke-sessions, list-users, generate-vapid
migrations/                SQL somente aditivo (0000 = baseline idêntico ao Alembic 0001–0005)
test/                      unitários + integração com PostgreSQL real
```

## Configuração

Copie `.env.example` para `.env` (nunca versione). Principais variáveis:

| Variável | Padrão | Observação |
| --- | --- | --- |
| `DATABASE_URL` | — | Obrigatória. Use banco de desenvolvimento ao testar. |
| `DATABASE_SSL` | `false` | `true` para conexões externas com certificado válido. |
| `ALLOWED_ORIGINS` | `["http://localhost:3000"]` | Lista JSON de origens do frontend (CORS + verificação de escrita). |
| `COOKIE_SECURE` | `true` | Obrigatório `true` com `NODE_ENV=production`. |
| `SESSION_HOURS` | `8` | Duração fixa da sessão (1–72). |
| `TRUST_PROXY` | `0` (`1` no Railway) | Número de proxies confiáveis à frente da API. No Railway o padrão é `1` (detectado pelas variáveis `RAILWAY_*`). |
| `HOST` | `::` | Endereço de escuta (IPv6 + IPv4; cai para `0.0.0.0` se não houver IPv6). |
| `SHUTDOWN_GRACE_SECONDS` | `10` | Tempo para concluir requisições após SIGTERM (mantenha abaixo de `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`). |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_MAX_ATTEMPTS_PER_IP` | `10` / `30` | Janela de 5 min. |
| `SLA_FIRST_RESPONSE_MINUTES` | *(não definido)* | **Opcional.** Metas de 1º atendimento em minutos para as quatro prioridades, ex.: `{"URGENTE":15,"ALTA":30,"NORMAL":120,"BAIXA":480}` (apenas exemplo, não é política aprovada). Sem a variável, nenhum chamado é marcado como "Atrasado". |
| `TICKET_CREATE_MAX_PER_IP` | `60` | Chamados abertos por IP a cada 10 min (o endpoint é público). Atrás do proxy do cPanel todos compartilham um IP. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | vazio | Reutilize o par já usado em produção. |
| `TIMEZONE` | `America/Sao_Paulo` | Usado em "resolvidos hoje". |
| `LOG_FORMAT` | `json` em produção | Logs estruturados com `requestId`. |

Configuração inválida impede a inicialização com mensagem clara.

## Comandos

```bash
npm ci
npm run build
npm run migrate          # aplica migrations pendentes (nunca roda sozinho)
npm run migrate -- --dry-run
npm start                # porta PORT (padrão 8000)
npm run cli -- create-user
npm run cli -- reset-password <usuario>   # também encerra as sessões do usuário
npm run cli -- revoke-sessions <usuario>
npm run cli -- list-users
npm run cli -- db-report [--json]          # somente leitura: contagens e fingerprints
```

Senhas são pedidas sem eco no terminal (ou via `GIVOVA_PASSWORD` em scripts) e nunca aceitas como argumento de linha de comando.

## Banco de dados e migrations

- `0000_baseline.sql` reproduz exatamente o schema criado pelas migrations Alembic 0001–0005 (verificado por `pg_dump` no CI). Só é aplicado em banco **vazio**.
- Em banco existente (produção), o comando exige `alembic_version = 0005`, pula o baseline e aplica apenas o que falta.
- `0006_history_kind_and_indexes.sql` é aditivo: colunas `ticket_history.kind/author_name` (com default, compatíveis com o FastAPI) e índices. Nenhuma migration remove ou reescreve dados; um teste bloqueia `DROP`, `TRUNCATE`, `DELETE` e mudança de tipo.
- Sem a 0006 a API continua funcionando; apenas o recurso de mensagens fica desativado (anunciado em `/catalog`).

## Segurança

- Sessão: token aleatório de 256 bits; no banco apenas SHA-256; cookie `HttpOnly`, `SameSite=Strict`, `Secure`; validação no servidor a cada requisição; logout e CLI revogam.
- CSRF: SameSite estrito + verificação de `Origin`/`Sec-Fetch-Site` + bloqueio de tipos de conteúdo de formulário.
- Validação: DTOs `class-validator` rejeitam campos desconhecidos (422 `{ detail, fields }`).
- `POST /tickets` (público) tem limite por IP verificado antes de ler o upload.
- Web Push: só são aceitas assinaturas de serviços de push dos navegadores (FCM, Mozilla, Windows/WNS, Apple); a API nunca envia requisições a hosts arbitrários.
- Novo link de acompanhamento: exige sessão de técnico e origem permitida; troca o hash da chave, encerra transmissões ao vivo abertas com a chave antiga e registra no histórico quem gerou (`author`) e quando.
- Uploads: somente `POST /tickets`, um arquivo `attachment` até 5 MB; conteúdo verificado pelo `sharp` (PNG/JPEG/WEBP, ≤16 MP, sem animação) e recodificado em WEBP sem metadados; servido com `CSP sandbox`.
- Acompanhamento: chave aleatória só no cabeçalho `X-Ticket-Key`, comparação em tempo constante; protocolo sozinho não revela nada.
- Cabeçalhos via helmet, `Cache-Control: no-store`, erros sem detalhes internos, logs sem query string, corpo ou segredos.

## Testes

```bash
npm run typecheck
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/banco_descartavel npm test
```

Os testes de integração criam um schema `test_<aleatório>` por suíte e o removem ao final. Sem `TEST_DATABASE_URL` eles aparecem como *skipped*. **Nunca** aponte para produção.

## Deploy no Railway

Passo a passo completo (serviços, variáveis, transferência dos dados, validação, rollback e custos) em [../RAILWAY.md](../RAILWAY.md). Resumo:

- Root Directory `/backend-nest`; o Railway constrói o `Dockerfile` (Node 22.23.4, `npm ci`, usuário sem privilégios, `node` como PID 1).
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (rede privada), healthcheck `/health`, 1 réplica, Serverless desligado, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=20`.
- Migrations **nunca** rodam no build/start: `node dist/src/cli/cli.js migrate` pelo túnel `railway connect Postgres --tunnel-only`, depois de restaurar os dados.
- Encerramento gracioso: ao receber SIGTERM o `/health` passa a 503, conexões novas são recusadas, transmissões ao vivo terminam e as requisições em andamento têm até `SHUTDOWN_GRACE_SECONDS` (padrão 10) antes de o pool do banco fechar.

### Transferência de dados

`scripts/transfer-database.sh` copia um banco de origem para um destino **vazio** e prova a cópia com `cli db-report` (contagens, IDs, sequências e *fingerprints*), aplica as migrations aditivas e confere de novo. Recusa destinos não vazios. O mesmo script é ensaiado no CI com um banco criado pelo Alembic real e dados no formato legado (`test/fixtures/legacy-data.sql`).

```bash
npm run build
DATABASE_URL=... node dist/src/cli/cli.js db-report        # somente leitura
SOURCE_URL=... TARGET_URL=... bash scripts/transfer-database.sh
```

### Rollback

Railway → *Deployments* → *Rollback*. As migrations são aditivas (o backend FastAPI de `../backend` continua compatível com o schema). Faça backup (`pg_dump -Fc`) antes de qualquer mudança no banco.
