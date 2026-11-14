# Givova TI — Central de chamados

Sistema interno da Givova Transportes para abrir, acompanhar e atender chamados de TI.

| Parte | Tecnologia | Pasta | Hospedagem |
| --- | --- | --- | --- |
| Frontend | Next.js 16 (App Router, export estático), React 19, TypeScript estrito, Tailwind CSS 4, Radix/shadcn, Lucide, TanStack Query | `givova-ti-frontend/` | cPanel (`dist/cpanel.zip`) |
| API | Node.js 22, NestJS 11, PostgreSQL (`pg`) | `backend-nest/` | Railway (imagem Docker) |
| Banco | PostgreSQL | — | Railway (rede privada) |
| Proxy | PHP 8.1+ (mesma origem, lista de rotas) | `deploy/cpanel/` | cPanel |
| API legada (referência/rollback) | Python/FastAPI + Alembic | `backend/` | Render (fora do ar desde 04/11/2026) |

Documentos: [Railway](RAILWAY.md) · [API NestJS](backend-nest/README.md) · [Publicação no cPanel](CPANEL.md) · [Relatório da modernização](RELATORIO_MODERNIZACAO.md) · histórico: [Auditoria V1](AUDITORIA.md), [Relatório V1](RELATORIO_V1.md).

## Como funciona

1. **Colaborador** abre `/chamado/`: escolhe o tipo de problema (atalhos na página inicial), toca em uma sugestão, opcionalmente descreve e cola um print (Ctrl+V), confirma nome/setor/local (lembrados no computador) e envia.
2. Recebe o protocolo `GV-000123` e o link `/acompanhar/?protocol=GV-000123#chave`. A chave fica no fragmento (`#`), nunca é enviada em URL ao servidor e só trafega no cabeçalho `X-Ticket-Key`. O chamado também fica salvo na página inicial daquele computador.
3. **TI** entra em `/ti/`: indicadores, fila com visões (Abertos, Novos, Meus, Aguardando, Resolvidos, Todos), busca, filtros, ordenação, alerta de novos chamados (som e notificações do Windows opcionais).
4. O técnico **assume** (o colaborador vê "A TI está indo até você!"), muda situação/prioridade, envia **mensagens ao colaborador**, gera um **novo link** se o colaborador perdeu o anterior e **resolve** registrando a solução.
5. O colaborador acompanha tudo na mesma página, com atualização automática.

Regras: status `NOVO → EM_ATENDIMENTO ⇄ AGUARDANDO_USUARIO/AGUARDANDO_TERCEIRO → RESOLVIDO`, `CANCELADO` a partir de qualquer status aberto; chamados encerrados não são reabertos; prioridade inicial `NORMAL`, alterada só pela TI; ações concorrentes são serializadas por bloqueio de linha no PostgreSQL.

## Desenvolvimento local

Requisitos: Node.js 22.12+, PostgreSQL 16+ (ou Docker), npm.

```bash
# Banco descartável (exemplo com Docker)
docker run -d --name givova-dev -e POSTGRES_DB=givova_ti -e POSTGRES_USER=givova -e POSTGRES_PASSWORD=dev_only -p 5432:5432 postgres:16
```

API (primeiro terminal):

```bash
cd backend-nest
npm ci
cp .env.example .env        # ajuste DATABASE_URL para o banco de desenvolvimento
npm run build
npm run migrate
npm run cli -- create-user
npm start                   # http://localhost:8000
```

Frontend (segundo terminal):

```bash
cd givova-ti-frontend
npm ci
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local
npm run dev                 # http://localhost:3000
```

Use `localhost` (não `127.0.0.1`) nos dois serviços por causa do cookie `SameSite`.

## Testes

```bash
# API: tipos + unitários + integração com PostgreSQL real (schemas descartáveis)
cd backend-nest && npm run typecheck && TEST_DATABASE_URL=postgresql://... npm test

# Frontend: lint + tipos + Vitest
cd givova-ti-frontend && npm run check

# Pacote cPanel + E2E (Apache/PHP em Docker, API NestJS e FastAPI legada) — ver CPANEL.md
cd givova-ti-frontend && npm run build:cpanel
```

O CI (`.github/workflows/ci.yml`) executa tudo isso, incluindo a comparação do schema baseline com as migrations Alembic e o E2E do `cpanel.zip`.

## Segurança e dados

- Nenhuma credencial padrão; senhas só como hash Argon2; sessões revogáveis no servidor; cookies `HttpOnly`/`Secure`/`SameSite=Strict`.
- Migrations somente aditivas, aplicadas manualmente (`npm run migrate`), compatíveis com o banco e o backend atuais. Faça backup antes de qualquer migration em produção.
- Nunca use a conexão de produção em desenvolvimento ou testes.
- Computadores compartilhados: por padrão o navegador **não guarda** nome, local nem links de chamados. Só com a opção "Lembrar meus dados e chamados neste computador" (desmarcada por padrão) esses dados ficam salvos, expiram (90 dias para os dados pessoais, 30 dias para os chamados) e podem ser apagados em "Esquecer este computador" ou "Não sou eu".
- O indicador "Atrasado" só aparece se a API tiver `SLA_FIRST_RESPONSE_MINUTES` configurado; não há metas embutidas.
