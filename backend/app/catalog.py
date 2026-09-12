DEPARTMENTS = ["Faturamento", "Financeiro", "Logística", "Juridico", "Departamento Pessoal", "Monitoramento"]
CATEGORIES = ["Computador", "Internet", "Impressora", "Sistema", "E-mail", "Acesso / Senha", "WhatsApp", "Telefone / Celular", "Equipamento", "DBFrete", "Fretebrás", "Outro"]
SYSTEMS = ["DBFrete", "Frete Brás", "E-mail / Outlook", "WhatsApp", "Sistema interno", "Outro sistema"]
STATUSES = ["NOVO", "EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO", "RESOLVIDO", "CANCELADO"]
PRIORITIES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"]
TRANSITIONS = {
    "NOVO": {"CANCELADO"},
    "EM_ATENDIMENTO": {"AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO", "CANCELADO"},
    "AGUARDANDO_USUARIO": {"EM_ATENDIMENTO", "AGUARDANDO_TERCEIRO", "CANCELADO"},
    "AGUARDANDO_TERCEIRO": {"EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "CANCELADO"},
    "RESOLVIDO": set(), "CANCELADO": set(),
}
