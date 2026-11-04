<?php
// Configuração do proxy /api do cPanel. Somente endereços PÚBLICOS: nunca
// coloque aqui senhas, chaves, tokens ou a conexão do banco de dados.
//
// backend_url: endereço HTTPS da API (sem caminho). Padrão: API atual em
// produção (FastAPI no Render). Após publicar e validar a API NestJS, troque
// pelo endereço do novo serviço (ex.: https://givova-ti-api.onrender.com).
//
// allowed_host_suffixes: o host de backend_url precisa terminar com um destes
// sufixos (defesa extra contra configuração indevida).
return [
    'backend_url' => 'https://sistemachamadosti.onrender.com',
    'allowed_host_suffixes' => ['.onrender.com', '.givovatransportes.com.br'],
    // Tempo máximo (s) de espera pela API. O Render gratuito pode levar ~30 s
    // para "acordar"; mantenha abaixo do max_execution_time do PHP.
    'timeout' => 28,
];
