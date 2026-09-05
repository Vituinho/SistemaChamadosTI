# Auditoria inicial — Givova TI

O repositório começou sem alterações locais. Foram lidos todos os arquivos de aplicação e configuração existentes.

## Preservado
- Diretórios `backend` e `givova-ti-frontend`, Next.js App Router, React, TypeScript estrito e Tailwind 4.
- Rota `/chamado`, campos de identificação/localização/descrição e organização do formulário em colunas responsivas.
- Conceito de painel com indicadores e lista de chamados; `/painel` permanecerá como atalho.

## Problemas encontrados
- `backend/app.py` usava Flask, contrariando a stack solicitada; apenas imprimia dados pessoais e ecoava o JSON, sem persistência nem validação.
- CORS irrestrito, debug ativo e ausência de autenticação, models, migrations, dependências declaradas e testes.
- Formulário chamava uma URL fixa na porta 5000, não validava campos nem tratava falhas; colaborador escolhia urgência.
- Painel inteiramente estático, indicadores e chamados fictícios, botões sem ações.
- Ausentes protocolos, acompanhamento, responsáveis, histórico, upload e notificações.
- Metadados e idioma padrão do create-next-app; README não explicava backend ou banco.
- `.gitignore` não cobria Python e ignorava inclusive os exemplos de ambiente.

## Direção da implementação
Completar a estrutura existente com FastAPI e SQLAlchemy, PostgreSQL com Alembic, catálogo central, sessões revogáveis, anexos validados e SSE baseado em revisões persistidas. Não há banco existente a migrar nem lógica de atendimento funcional a substituir. Não será introduzido inventário, Redis ou serviço externo.
