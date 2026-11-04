# Publicação no cPanel — `cpanel.zip`

O pacote contém **somente** o necessário para servir o site em `suporte.givovatransportes.com.br`: o export estático do Next.js, o vídeo tutorial, os ícones, o service worker de notificações, as regras `.htaccess` e o proxy PHP `/api`. Não é preciso Node.js, npm, Python ou banco de dados no cPanel.

> **Dois tipos de pacote**
>
> | Arquivo | Quando | Proxy `/api` |
> | --- | --- | --- |
> | `dist/cpanel.zip` — **produção** | `npm run build:cpanel -- --api-url https://<api-no-railway>` e a API respondeu (`/health` ok, `/catalog` com `api_version` 2) | aponta **somente** para esse host (lista fixa) |
> | `dist/cpanel-staging.zip` — **staging** | sem `--api-url` (ou com `--no-verify`) | sem API: `/api/*` responde 503 "não configurada" |
>
> `build.json` na raiz do site informa `channel` (`production`/`staging`) e `api_upstream`. **Nunca publique um pacote de staging em produção.** A API e o banco ficam no Railway — veja [RAILWAY.md](RAILWAY.md).

## 1. Gerar o pacote

```bash
cd givova-ti-frontend
npm ci
npm run build:cpanel -- --api-url https://<dominio-da-api>   # produção (verifica a API)
npm run build:cpanel                                       # staging (sem API)
```

O script faz o build estático (`CPANEL_EXPORT=1`, API em `/api`, atualização por consulta periódica), junta `deploy/cpanel/`, calcula os hashes da CSP para os scripts inline, recusa arquivos proibidos (fontes, `.env`, mapas, chaves, `node_modules`…) e padrões de segredos, grava o ZIP e o relê verificando o CRC de cada arquivo. Ao lado ficam o manifesto (`*-manifest.json`) e a soma de verificação (`*.zip.sha256`). O CI publica o pacote de staging (artefato `cpanel-staging`) a cada execução; o de produção (`cpanel-production`) só quando alguém executa o workflow manualmente informando `api_url` — o job apenas lê `/health` e `/catalog` e empacota, sem publicar nada.

Confira a integridade antes de enviar ao cPanel:

```bash
sha256sum -c cpanel.zip.sha256
```

No Windows (PowerShell): `Get-FileHash .\cpanel.zip -Algorithm SHA256` e compare com o valor do arquivo `.sha256`.

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
- PHP 8.1+ com cURL e certificados CA atualizados; HTTPS de saída (porta 443) liberado para o domínio da API no Railway.
- Uploads: `.user.ini` define `upload_max_filesize=5M`, `post_max_size=6M`, `max_execution_time=40`. Limites administrativos ou ModSecurity do provedor podem prevalecer.

## 4. API no Railway (cutover)

Somente depois de seguir `RAILWAY.md` (dados transferidos e conferidos, API validada):

1. Gere o pacote de **produção** com `--api-url` (seção 1) e publique-o (seção 2). `api/config.php` sai com `backend_url` e `allowed_hosts` = exatamente o host verificado.
2. Abra `/api/catalog` e confirme `"api_version":2`; abra `/build.json` e confirme `"channel": "production"`.
3. Teste um chamado completo (abrir → assumir → mensagem → resolver).
4. Trocar de domínio da API depois: gere um novo pacote com o novo `--api-url` (ou edite `backend_url` **e** `allowed_hosts` em `api/config.php`; o host precisa constar exatamente na lista).
5. Rollback: restaure o backup da pasta do site.

O pacote atualmente publicado no servidor (anterior a esta mudança) só aceita hosts `*.onrender.com`; ele **não** consegue apontar para o Railway — é preciso publicar o pacote novo.

`config.php` contém apenas endereços públicos; nunca coloque senhas, chaves ou a conexão do banco nele. Ele é bloqueado para acesso via HTTP.

## 5. O que o pacote garante

| Item | Como |
| --- | --- |
| Rotas e atualização (F5) | Cada rota tem `index.html`; `/ti` → `/ti/`; caminhos desconhecidos retornam 404 real com página própria. |
| Links antigos | `/chamado/GV-000123#chave` → `/acompanhar/?protocol=GV-000123#chave` (a chave fica no navegador); `/painel` → `/ti/`. |
| HTTPS | Redirecionamento 301 e HSTS (sem `includeSubDomains`). |
| Cabeçalhos | CSP com hashes (sem `unsafe-inline` para scripts), `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. |
| Cache | HTML/service worker revalidam; `/_next/static` imutável por 1 ano; ícones 1 dia; vídeo 7 dias. |
| Arquivos internos | `.htaccess`, `.user.ini`, `api/config.php`, `api/upstream.php`, dotfiles, mapas, fontes e backups retornam 403. |
| Proxy `/api` | URL fixa (sem SSRF) validada por **lista exata de hosts** (sem curingas; recusa IPs, `localhost`, `*.internal`, portas, caminhos e credenciais), nunca usa proxy de ambiente, lista de rotas/métodos, escrita só com `Origin` do próprio site, encaminha apenas o cookie de sessão e a chave do chamado validados, limites de 6 MB (requisição) e 12 MB (resposta), TLS verificado, sem seguir redirecionamentos, erros genéricos. |
| Cookie | Reescrito como `Secure; HttpOnly; SameSite=Strict; Path=/`, sem `Domain` (somente este host). |
| Carga no PHP | Sem conexões longas (SSE desativado). O painel da TI consulta só `/api/dashboard` a cada 15 s e recarrega a fila quando algo muda; o acompanhamento consulta a cada 15 s apenas com a aba visível. |

## 6. Validação automatizada

`givova-ti-frontend/e2e/cpanel/` sobe o **pacote real** em Apache 2.4 + PHP 8.3 (Docker) com três cópias: uma ligada à **imagem Docker da API** (a mesma que o Railway executa), outra à FastAPI legada (via um terminador TLS de teste com nomes `*.up.railway.app`) e uma sem API, que precisa responder 503. `deploy/tests/upstream_test.php` testa a validação de hosts do proxy em PHP 8.1 e 8.3. O Playwright verifica rotas, redirecionamentos, cabeçalhos, bloqueios, proxy, cookies, o ciclo completo do chamado com anexo, acessibilidade (axe, WCAG 2.2 AA) e ausência de rolagem horizontal em celular, tablet e notebook. O mesmo fluxo roda no CI.

Limitações: não foi possível testar a conta cPanel real (LiteSpeed, ModSecurity, limites do provedor). Notificações Web Push com o navegador fechado dependem das chaves VAPID e da permissão de cada computador; após trocar de domínio ou limpar dados do navegador, cada técnico precisa reativar em **Notificações**.
