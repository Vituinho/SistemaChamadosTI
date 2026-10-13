# Publicação no cPanel — Givova TI

Entrega preparada em 13/10/2026. O arquivo `dist/cpanel-givova-chamados.zip` contém o site exportado, o tutorial e o proxy PHP. O backend e o PostgreSQL continuam no Render; nenhum dado de produção foi alterado.

Pacote entregue: **2.839.670 bytes (2,71 MiB), 69 arquivos**, com `index.html` na raiz e integridade CRC aprovada. SHA-256: `f3ca927437c34c3228d08fefb2a99780eca1f969d77e37e9524d5fa719262d10`.

## Instalação

1. Ative o certificado HTTPS/AutoSSL do domínio no cPanel.
2. No Gerenciador de Arquivos, habilite **Mostrar arquivos ocultos**.
3. Envie o ZIP e extraia **diretamente dentro de `public_html`**, raiz do domínio. Não crie uma pasta adicional. O pacote é para a raiz do domínio, não para um subdiretório.
4. Confira `public_html/index.html`, `public_html/.htaccess`, `public_html/.user.ini`, `public_html/_next/` e `public_html/api/index.php`. Em um domínio adicional, use a raiz documental indicada pelo cPanel para esse domínio.
5. Abra o domínio por HTTPS. Não é necessário executar Node.js, instalar Python ou importar um banco.

O ZIP não contém credenciais, banco, ambientes virtuais, dependências de desenvolvimento ou fontes TypeScript/Python. Mantenha o ZIP fora da pasta pública depois de extrair. Arquivos antigos de outra aplicação na mesma raiz precisam ser tratados pelo responsável pela hospedagem antes da publicação; a extração não remove esses arquivos.

## Requisitos da hospedagem

- Apache 2.4 com `mod_rewrite`, autorização `Require all denied` e permissão para `.htaccess` com regras de reescrita, `Options` e `DirectoryIndex`.
- PHP **8.1 ou superior** (validado com 8.5.11), extensão **cURL**, HTTPS de saída com certificados CA válidos e resolução DNS do Render. Prefira uma versão PHP ainda suportada pelo provedor.
- Uploads PHP habilitados, diretório temporário gravável, `upload_max_filesize >= 5M`, `post_max_size >= 6M` e tempo de execução de pelo menos 30 segundos. `.user.ini` solicita esses limites para PHP CGI/FPM; limites administrativos ou ModSecurity do provedor podem prevalecer. Não são necessários drivers PostgreSQL no cPanel.
- `mod_headers` habilita os cabeçalhos de cache e proteção do conteúdo estático; o proxy sempre define `no-store` por PHP.

O proxy já aponta para **https://sistemachamadosti.onrender.com**, endereço confirmado pelo responsável e validado por consultas de leitura. Não é necessário configurar outra URL. Se o serviço mudar, o endereço fixo está em `api/config.php`, protegido contra acesso HTTP. O proxy aceita apenas HTTPS em um hostname `*.onrender.com`; outro domínio exige atualizar também a validação. Nunca coloque senhas, chaves ou a conexão do banco nesse arquivo.

## Funcionamento e preservação

O build cPanel ativa `output: "export"`, `trailingSlash: true`, API relativa `/api` e polling. Páginas inicial, abertura, TI, tutorial e acompanhamento são HTML estático com consultas ao FastAPI em tempo de execução. A TI continua sendo validada por `/auth/me`; a proteção dos dados e das ações permanece nos endpoints do backend.

O acompanhamento usa `/acompanhar/?protocol=GV-000001#CHAVE`. Nenhum HTML é gerado por chamado. A chave continua no fragmento e segue ao backend somente pelo cabeçalho `X-Ticket-Key`. O Apache redireciona links antigos `/chamado/GV-000001#CHAVE` preservando o fragmento no navegador. Isso preserva o caminho dentro do domínio publicado; links que apontam para o antigo domínio Vercel continuam abrindo aquele domínio. Os novos chamados geram o novo formato. Sem chave, o backend recusa a consulta; protocolo não é uma credencial pública de recuperação.

`/painel` redireciona para `/ti/`. Rotas existentes têm HTML próprio e suportam acesso direto/atualização; caminhos desconhecidos retornam 404 real. Arquivos internos e configurações têm acesso bloqueado. HTML, payloads de navegação e service worker revalidam o cache; bundles em `_next` têm cache de um ano. O vídeo tutorial necessário, com aproximadamente 2,64 MiB, foi preservado.

O proxy usa uma lista de endpoints/métodos, valida a origem HTTPS nas escritas, rejeita origens externas e encaminha apenas o cookie `givova_session` e a chave do chamado. Após validar a origem localmente, não encaminha `Origin` ao Render: a requisição de saída é servidor-servidor. Não é preciso ampliar CORS do Render nem trocar `SameSite=Strict` por `None`. O cookie recebido é restrito ao domínio cPanel, `Secure`, `HttpOnly`, `SameSite=Strict`, com expiração preservada; logout revoga a sessão no FastAPI e expira o cookie.

Uploads multipart são reconstruídos com os campos e o arquivo temporário PHP. O limite total é 6 MiB, a imagem até 5 MiB, e a validação/recodificação WEBP continua no FastAPI. Não há armazenamento permanente de anexos no cPanel. Respostas são limitadas a 12 MiB; conexão de saída até 10 segundos e requisição até 18 segundos, com verificação TLS, sem seguir redirecionamentos e sem aceitar URLs arbitrárias. Erros de transporte retornam 502/504 sem detalhes internos.

SSE fica desativado neste pacote para evitar ocupar processos PHP com conexões longas. Fila, avisos de novos chamados e acompanhamento atualizam a cada **15 segundos**; o detalhe selecionado no painel mantém sua consulta a cada 3 segundos. Web Push e som existentes são preservados. No novo domínio, cada computador precisa clicar novamente em **Ativar no computador** e permitir notificações: permissões e assinaturas pertencem à origem do navegador.

## Validação realizada

- Build cPanel de produção: todas as seis rotas exportadas, incluindo `/painel`, sem servidor Next.js.
- Build normal para Vercel/Node também aprovado; servidor de produção Next.js respondeu 200 tanto no acompanhamento novo quanto no caminho antigo `/chamado/GV-000001` com rewrite.
- Frontend: ESLint, TypeScript, três testes automatizados e verificação de sintaxe do service worker aprovados.
- Backend: 42 testes de fluxo aprovados, mais o teste de migrations aprovado a partir da pasta `backend`; um teste de concorrência PostgreSQL foi pulado por usar SQLite descartável. Nenhuma migration foi executada no banco real.
- PHP: sintaxe aprovada. Apache 2.4.69 + PHP 8.5.11 CGI, usando HTTPS local e uma **extração do ZIP**, validaram páginas, HTTPS, redirecionamentos, 404, bloqueio de configurações, restrição de origem, cookies, logout, rotas protegidas, uploads reais, rejeição de imagem inválida/grande, anexos WEBP, filtros, DBFrete, status, histórico e resolução.
- Render real: `/health` e `/catalog` passaram por PHP; `/auth/me` sem sessão retornou 401. Nenhuma escrita, tentativa de login ou criação de chamado foi feita no Render.
- Chrome automatizado: login, abertura de chamado Frete Brás, navegação e recarga do acompanhamento, chave preservada nos links antigos, aviso de novo chamado, atualização por polling ao assumir/resolver, logout e proteção após logout passaram. Página inicial, abertura, painel, tutorial e acompanhamento foram verificados em larguras 390 e 1366 px sem overflow horizontal; capturas do painel e do formulário móvel foram inspecionadas. O vídeo carregou metadados e duração. Nenhum erro JavaScript de página.
- ZIP: integridade CRC, arquivos obrigatórios, ausência de diretório externo e exclusão de fontes/segredos/dependências verificadas pelo empacotador.

Os testes locais estão em `scripts/test_cpanel.py` e `scripts/test_cpanel_browser.cjs`; seus runtimes portáteis, certificados descartáveis, resultados e capturas ficam em `.local/cpanel-validation`, fora do Git e do ZIP. O empacotador `scripts/build_cpanel.py` executa o build com as opções corretas e valida o pacote; não é necessário ao responsável pelo upload compilar nada.

## Limites e alternativa Vercel

Não foi possível testar a conta cPanel real, seu domínio/certificado, regras ModSecurity, limites de PHP nem a conectividade de saída daquele provedor. O pacote passou em Apache/PHP local, mas exige os requisitos acima. A entrega de notificações Web Push do Windows com a aba fechada não foi enviada/testada em produção: depende das chaves VAPID atuais do Render, da permissão e do serviço push do navegador. Os testes existentes do backend cobrem cadastro e disparo com transporte simulado; o aviso dentro do painel e polling foram testados no navegador.

O limite de login atual do backend usa o IP da conexão. Pelo proxy, vários usuários podem compartilhar o IP de saída do cPanel e o limite de **10 tentativas em cinco minutos**, incluindo tentativas bem-sucedidas. Isso pode bloquear temporariamente logins legítimos. Não foram adicionados cabeçalhos de IP confiável sem configuração explícita de confiança no backend. Se esse limite compartilhado for inadequado para a equipe, será necessário um ajuste específico no backend/proxy administrado, ou manter Vercel com o acesso à API já configurado.

Serviços Render que hibernam podem demorar além do timeout na primeira consulta; o sistema apresenta erro e permite tentar novamente. Disponibilidade da API e do banco continua sendo responsabilidade do serviço externo.

O modo normal `npm run build` continua disponível para Vercel/Node sem `CPANEL_EXPORT=1`, com SSE e a configuração de API já utilizada. Nesse modo, um rewrite compatibiliza `/chamado/:protocol` com a nova página. O proxy PHP não é necessário na Vercel. Se o cPanel não permitir PHP/cURL com HTTPS de saída ou as regras Apache necessárias, mantenha o frontend na Vercel.
