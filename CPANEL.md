# Publicação no cPanel — `cpanel.zip`

O pacote `dist/cpanel.zip` contém **somente** o necessário para servir o site em `suporte.givovatransportes.com.br`: o export estático do Next.js, o vídeo tutorial, os ícones, o service worker de notificações, as regras `.htaccess` e o proxy PHP `/api`. Não é preciso Node.js, npm, Python ou banco de dados no cPanel.

> **Para onde o pacote aponta:** `api/config.php` vem configurado com a API **atual** de produção (`https://sistemachamadosti.onrender.com`, FastAPI). O frontend detecta a versão da API e funciona com as duas: com a FastAPI os recursos novos (mensagens ao colaborador, métricas, visões "Abertos/Meus", ordenação, novo link) ficam ocultos. Depois de publicar e validar a API NestJS, troque apenas `backend_url` (seção 4).

## 1. Gerar o pacote

```bash
cd givova-ti-frontend
npm ci
npm run build:cpanel
```

O script faz o build estático (`CPANEL_EXPORT=1`, API em `/api`, atualização por consulta periódica), junta `deploy/cpanel/`, calcula os hashes da CSP para os scripts inline, recusa arquivos proibidos (fontes, `.env`, mapas, chaves, `node_modules`…) e padrões de segredos, grava `dist/cpanel.zip` e o relê verificando o CRC de cada arquivo. O resumo e o SHA-256 ficam em `dist/cpanel-manifest.json`.

## 2. Instalar

1. Faça **backup** da pasta atual do site no Gerenciador de Arquivos (comprima `public_html`/raiz do subdomínio e baixe).
2. Confirme que o certificado HTTPS (AutoSSL) do subdomínio está ativo.
3. Ative **Mostrar arquivos ocultos** (para ver `.htaccess` e `.user.ini`).
4. Apague da raiz os arquivos da versão anterior (`_next/`, `index.html`, pastas de rotas, `api/`), **ou** extraia por cima: os nomes do Next mudam a cada build e arquivos antigos apenas ocupam espaço.
5. Envie `cpanel.zip` para a **raiz do documento do subdomínio** e extraia ali (sem criar subpasta). Devem existir na raiz: `index.html`, `.htaccess`, `.user.ini`, `_next/`, `api/index.php`, `api/config.php`.
6. Apague o `cpanel.zip` do servidor depois de extrair.
7. Abra `https://suporte.givovatransportes.com.br/` e `…/api/health` (deve responder `{"status":"ok",…}`).

## 3. Requisitos da hospedagem

- Apache 2.4 ou LiteSpeed com `.htaccess` (`mod_rewrite`, `mod_headers`; `mod_deflate` opcional). O servidor atual é LiteSpeed.
- PHP 8.1+ com cURL e certificados CA atualizados; HTTPS de saída liberado para `*.onrender.com`.
- Uploads: `.user.ini` define `upload_max_filesize=5M`, `post_max_size=6M`, `max_execution_time=40`. Limites administrativos ou ModSecurity do provedor podem prevalecer.

## 4. Apontar para a API NestJS (cutover)

Somente depois de seguir `backend-nest/README.md` (backup, novo serviço, `npm run migrate`, validação):

1. Edite `api/config.php` no cPanel e troque `backend_url` pela URL HTTPS do novo serviço (sem barra no final). O host precisa terminar com um sufixo de `allowed_host_suffixes`.
2. Abra `/api/catalog` e confirme `"api_version":2`.
3. Teste um chamado completo (abrir → assumir → mensagem → resolver).
4. Rollback: volte o valor anterior de `backend_url`.

`config.php` contém apenas endereços públicos; nunca coloque senhas, chaves ou a conexão do banco nele. Ele é bloqueado para acesso via HTTP.

## 5. O que o pacote garante

| Item | Como |
| --- | --- |
| Rotas e atualização (F5) | Cada rota tem `index.html`; `/ti` → `/ti/`; caminhos desconhecidos retornam 404 real com página própria. |
| Links antigos | `/chamado/GV-000123#chave` → `/acompanhar/?protocol=GV-000123#chave` (a chave fica no navegador); `/painel` → `/ti/`. |
| HTTPS | Redirecionamento 301 e HSTS (sem `includeSubDomains`). |
| Cabeçalhos | CSP com hashes (sem `unsafe-inline` para scripts), `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. |
| Cache | HTML/service worker revalidam; `/_next/static` imutável por 1 ano; ícones 1 dia; vídeo 7 dias. |
| Arquivos internos | `.htaccess`, `.user.ini`, `api/config.php`, dotfiles, mapas, fontes e backups retornam 403. |
| Proxy `/api` | URL fixa (sem SSRF), lista de rotas/métodos, escrita só com `Origin` do próprio site, encaminha apenas o cookie de sessão e a chave do chamado validados, limites de 6 MB (requisição) e 12 MB (resposta), TLS verificado, sem seguir redirecionamentos, erros genéricos. |
| Cookie | Reescrito como `Secure; HttpOnly; SameSite=Strict; Path=/`, sem `Domain` (somente este host). |
| Carga no PHP | Sem conexões longas (SSE desativado). O painel da TI consulta só `/api/dashboard` a cada 15 s e recarrega a fila quando algo muda; o acompanhamento consulta a cada 15 s apenas com a aba visível. |

## 6. Validação automatizada

`givova-ti-frontend/e2e/cpanel/` sobe o **ZIP real** em Apache 2.4 + PHP 8.3 (Docker) com duas cópias: uma ligada à API NestJS e outra à FastAPI legada (via um terminador TLS de teste que se apresenta como `*.onrender.com`, exercitando o proxy sem alterações). O Playwright verifica rotas, redirecionamentos, cabeçalhos, bloqueios, proxy, cookies, o ciclo completo do chamado com anexo, acessibilidade (axe, WCAG 2.2 AA) e ausência de rolagem horizontal em celular, tablet e notebook. O mesmo fluxo roda no CI.

Limitações: não foi possível testar a conta cPanel real (LiteSpeed, ModSecurity, limites do provedor). Notificações Web Push com o navegador fechado dependem das chaves VAPID e da permissão de cada computador; após trocar de domínio ou limpar dados do navegador, cada técnico precisa reativar em **Notificações**.
