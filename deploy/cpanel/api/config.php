<?php
// Configuração do proxy /api do cPanel. Somente endereços PÚBLICOS: nunca
// coloque aqui senhas, chaves, tokens ou a conexão do banco de dados.
//
// Este arquivo é gerado pelo empacotador:
//   npm run build:cpanel -- --api-url https://<dominio-da-api-no-railway>
// que verifica a API antes de gravar os valores abaixo.
//
// backend_url   endereço HTTPS da API NestJS no Railway (sem caminho/porta).
//               VAZIO = pacote de STAGING: o proxy responde 503 em /api/*.
// allowed_hosts lista FIXA de hosts aceitos (comparação exata, sem curingas).
//               O host de backend_url precisa estar nesta lista.
// timeout       segundos de espera pela API (a API no Railway não "dorme").
return [
    'backend_url' => '',
    'allowed_hosts' => [],
    'timeout' => 20,
];
