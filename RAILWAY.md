# Railway — API NestJS + PostgreSQL

Arquitetura final:

```text
Navegador ──HTTPS──> cPanel suporte.givovatransportes.com.br
                      ├─ export estático Next.js 16 / React 19
                      └─ /api/* → api/index.php (lista fixa de hosts) ──HTTPS──> Railway: serviço "api" (NestJS, Node 22)
                                                                                   └─ rede privada ──> Railway: "Postgres"
```

O banco **não** tem acesso público. A API fala com ele por `postgres.railway.internal` (rede privada criptografada do Railway). Nada neste repositório faz deploy automaticamente: o CI só testa e empacota.

> Referências usadas (documentação oficial do Railway, consultada em 04/11/2026): monorepo, Dockerfiles, healthchecks, variáveis de referência, rede privada, encerramento de deploys, serverless, preços/limites de uso, backups e CLI. O formato `railway.json` ("Config as Code") está **depreciado** (novos serviços não podem usá-lo; deixa de ser lido em 01/12/2026), por isso a configuração abaixo é feita no painel e a imagem é definida pelo `backend-nest/Dockerfile`.

## 1. Criar o projeto (painel do Railway)

1. **New Project → Deploy from GitHub repo** → `Vituinho/SistemaChamadosTI`. Renomeie o serviço para **`api`**.
2. **+ New → Database → PostgreSQL**. Mantenha o nome **`Postgres`** (é usado na variável de referência). **Não** adicione *Public Access* / TCP Proxy.
3. Região: a mesma para os dois serviços. Não há região na América do Sul; **US East (Virginia)** costuma ter a menor latência a partir do Brasil.

## 2. Serviço `api` — Settings

| Configuração | Valor |
| --- | --- |
| Source → Root Directory | `/backend-nest` |
| Source → Branch | `main` (somente após o merge do PR; até lá use um ambiente de *staging*) |
| Source → Wait for CI | **Ativado** (o deploy só acontece se o workflow de CI passar) |
| Build | Dockerfile detectado automaticamente em `/backend-nest/Dockerfile` (Node 22.23.4, `npm ci`) |
| Watch Paths | `/backend-nest/**` (mudanças só no frontend não redeployam a API) |
| Deploy → Custom Start Command | *vazio* (a imagem já executa `node dist/src/main.js`; **não** use `npm start`, que não repassa SIGTERM) |
| Deploy → Pre-deploy Command | *vazio* — migrations são manuais (seção 5) |
| Deploy → Healthcheck Path | `/health` (verifica a API **e** o banco; usado só durante o deploy) |
| Deploy → Healthcheck Timeout | `120` |
| Deploy → Serverless | **Desativado** (com o app dormindo o primeiro chamado após inatividade recebe 502) |
| Deploy → Restart Policy | On Failure, 10 tentativas |
| Deploy → Replicas | **1** (limites de login, de abertura de chamados e eventos ao vivo são por processo) |
| Resource Limits | 1 vCPU / 1 GB (o consumo real esperado é bem menor; o limite evita surpresas) |
| Networking → Public Networking | **Generate Domain** (`<nome>.up.railway.app`) ou domínio próprio (ex.: `api-suporte.givovatransportes.com.br`, com o CNAME indicado pelo Railway) |

## 3. Serviço `api` — Variables

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência **privada**; nunca `DATABASE_PUBLIC_URL`) |
| `DATABASE_SSL` | `false` (rede privada já criptografada por WireGuard) |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `["https://suporte.givovatransportes.com.br"]` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | *(opcional)* — vale `1` automaticamente no Railway |
| `SESSION_HOURS` | `8` |
| `TIMEZONE` | `America/Sao_Paulo` |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `20` (tempo entre SIGTERM e SIGKILL; a API drena em até `SHUTDOWN_GRACE_SECONDS`, padrão 10) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | **mesmo par** usado hoje (sem ele, cada computador precisa reativar as notificações). Marque a chave privada como *sealed*. Se o par antigo foi perdido: `npm run cli -- generate-vapid` |
| `SLA_FIRST_RESPONSE_MINUTES` | *não definir* até a empresa aprovar metas (sem ela não há indicador "Atrasado") |
| `TICKET_CREATE_MAX_PER_IP` | `60` (padrão) |

`PORT` é injetada pelo Railway. A API escuta em `::` (IPv6 + IPv4). Nenhum segredo vai para o repositório ou para o pacote do cPanel.

## 4. Dados existentes (Render → Railway)

**Bloqueio atual:** a API do Render não responde desde 04/11/2026 e o estado do banco do Render não pôde ser verificado sem acesso ao painel. Pela documentação do Render, um banco **Free** expira 30 dias após a criação, fica inacessível, tem **14 dias** de carência para upgrade para plano pago e depois é **apagado com todos os dados**; bancos Free **não têm backups**. Em planos pagos há recuperação (PITR) e exportação na página *Recovery*.

Faça já, no painel do Render (somente o responsável):

1. Abra o banco → **Info**: plano, data de criação/expiração e status.
2. Se estiver *expirado* e dentro da carência: o único caminho para recuperar os dados é **fazer upgrade para um plano pago** (custo e decisão da empresa); depois exporte (passo 3).
3. Exporte: copie a **External Database URL** (exige `sslmode=require`) e siga a seção 5. Alternativa em plano pago: *Recovery → Create export*.
4. Se o banco já foi apagado e não existe nenhum dump/backup, **os chamados antigos não podem ser migrados**. Nesse caso o Railway começará vazio — isso deve ser decidido e comunicado, nunca apresentado como migração.

## 5. Transferência e migrations (procedimento ensaiado no CI)

Pré-requisitos na máquina do operador: este repositório, Node 22, `npm ci && npm run build` em `backend-nest`, cliente PostgreSQL (`pg_dump`/`pg_restore`/`psql`) com versão **≥ a do servidor de origem**, e a CLI do Railway (`railway login`, `railway link`).

```bash
# Terminal 1 — túnel para o Postgres do Railway (sem expor o banco)
railway connect Postgres --tunnel-only
# anote a URL local impressa (postgresql://...@localhost:<porta>/railway)

# Terminal 2 — em backend-nest/
export SOURCE_URL='postgresql://...render.com/...?sslmode=require'   # External URL do Render
export TARGET_URL='postgresql://...@localhost:<porta>/railway'       # URL do túnel
bash scripts/transfer-database.sh
```

O script: gera o relatório da origem (somente leitura), faz `pg_dump` (somente leitura), **recusa** destino não vazio, restaura em uma transação, compara contagens, intervalos de IDs, sequências e *fingerprints* md5 de chamados, histórico, anexos e técnicos, aplica as migrations aditivas (`0006`) e compara de novo. Guarde o dump (contém dados pessoais) como backup.

Se o banco do Railway estiver vazio por decisão (sem dados recuperáveis): `DATABASE_URL=<túnel> node dist/src/cli/cli.js migrate` e `... create-user`.

Depois: `DATABASE_URL=<túnel> node dist/src/cli/cli.js db-report` deve mostrar os mesmos números da origem.

## 6. Validar a API e gerar o pacote do cPanel

1. `https://<dominio-da-api>/health` → `{"status":"ok"}` e `/catalog` → `"api_version":2`.
2. Gere o pacote de **produção** (a API é verificada antes; sem verificação não há pacote de produção):
   ```bash
   cd givova-ti-frontend && npm ci
   npm run build:cpanel -- --api-url https://<dominio-da-api>
   ```
   ou no GitHub: *Actions → CI → Run workflow* com `api_url` → artefato `cpanel-production`.
3. Publique `dist/cpanel.zip` no cPanel conforme `CPANEL.md` (faça backup da pasta atual antes).
4. Teste um chamado completo (abrir → assumir → mensagem → resolver) e o login de um técnico existente.

## 7. Rollback

- **API:** Railway → serviço `api` → *Deployments* → *Rollback* para o deploy anterior.
- **Banco:** as migrations são aditivas; não é preciso revertê-las. Antes de cada mudança, faça backup (seção 8).
- **cPanel:** restaure o backup da pasta do site feito antes de extrair o pacote.
- **Backend legado (FastAPI, `backend/`):** mantido no repositório para referência e eventual retorno; ele lê o mesmo schema (a `0006` só adicionou colunas com valor padrão).

## 8. Recursos e custos (sistema interno pequeno)

Preços publicados pelo Railway em 04/11/2026: RAM US$ 10/GB-mês, CPU US$ 20/vCPU-mês, volume US$ 0,15/GB-mês, egress US$ 0,05/GB; plano **Hobby** US$ 5/mês com US$ 5 de uso incluídos; **Pro** US$ 20/mês com US$ 20 incluídos. Confirme os valores atuais antes de contratar.

Recomendação:

- **Plano Hobby** é suficiente para o volume de uma central interna (dezenas de chamados por dia). Considere Pro se precisar de mais membros/recursos de equipe.
- **1 réplica**, **Serverless desativado**. A API ociosa usa tipicamente ~100–200 MB de RAM e quase nada de CPU; o Postgres algumas centenas de MB e poucos GB de volume (anexos ficam no banco). Estimativa grosseira: na faixa de poucos dólares a ~US$ 10/mês além da assinatura — acompanhe o painel *Usage* no primeiro mês.
- **Limites de uso** (Workspace → Usage): alerta por e-mail (ex.: US$ 10) e **hard limit** (mínimo US$ 10; ao atingir, *todos os serviços são desligados*, então defina com folga, ex.: US$ 25).
- **Resource limits** do serviço `api`: 1 vCPU / 1 GB; Postgres: 1 vCPU / 1 GB.
- **Backups:** ative backups agendados no volume do Postgres (*Backups* → Daily) e mantenha um `pg_dump` periódico fora do Railway (ex.: semanal), pois restaurações do Railway só funcionam no mesmo projeto/ambiente. A disponibilidade de backups por plano não está descrita na página de preços — confira no painel.
- Não exponha o banco publicamente (evita egress e superfície de ataque); use `railway connect --tunnel-only` para manutenção.
