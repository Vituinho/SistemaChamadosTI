import {
  AppWindow, Cable, HelpCircle, KeyRound, Mail, MessageCircle, Monitor, Printer, Smartphone, Truck, Wifi, type LucideIcon,
} from "lucide-react";

/** Presentation hints only. The valid categories always come from the API catalog. */
export const CATEGORY_HINTS: Record<string, { icon: LucideIcon; label?: string; hint: string; examples: string[] }> = {
  Computador: { icon: Monitor, hint: "Não liga, lento, travando", examples: ["Computador não liga", "Computador está lento", "Computador travou"] },
  Internet: { icon: Wifi, hint: "Sem conexão ou lenta", examples: ["Estou sem internet", "Internet está lenta", "Wi-Fi não conecta"] },
  Impressora: { icon: Printer, hint: "Não imprime, papel preso", examples: ["Impressora não imprime", "Papel preso na impressora", "Impressão saindo falhada"] },
  Sistema: { icon: AppWindow, hint: "Erro em algum sistema", examples: ["Não consigo abrir o sistema", "O sistema está com erro", "O sistema está lento"] },
  "E-mail": { icon: Mail, hint: "Enviar ou receber e-mails", examples: ["Não consigo enviar e-mail", "Não estou recebendo e-mails", "Caixa de e-mail cheia"] },
  "Acesso / Senha": { icon: KeyRound, hint: "Senha, bloqueio, permissão", examples: ["Esqueci minha senha", "Meu acesso está bloqueado", "Preciso de acesso a uma pasta"] },
  WhatsApp: { icon: MessageCircle, hint: "WhatsApp da empresa", examples: ["WhatsApp não conecta", "Não consigo enviar mensagens"] },
  "Telefone / Celular": { icon: Smartphone, hint: "Ramal ou celular", examples: ["Telefone não funciona", "Celular não liga", "Sem sinal no ramal"] },
  Equipamento: { icon: Cable, hint: "Mouse, teclado, monitor", examples: ["Mouse não funciona", "Teclado não funciona", "Monitor sem imagem"] },
  DBFrete: { icon: Truck, hint: "Sistema de fretes", examples: ["Erro ao acessar o DBFrete", "DBFrete está lento", "Problema no cálculo de frete"] },
  Fretebrás: { icon: Truck, hint: "Portal Fretebrás", examples: ["Erro ao acessar a Fretebrás", "Fretebrás fora do ar", "Dúvida no sistema Fretebrás"] },
  Outro: { icon: HelpCircle, label: "Outro / Não sei", hint: "Qualquer outro problema", examples: ["Preciso de ajuda da TI"] },
};

export function categoryHint(category: string) {
  return CATEGORY_HINTS[category] ?? { icon: HelpCircle, hint: "", examples: ["Preciso de ajuda da TI"] };
}

export function isSuggestion(title: string) {
  return Object.values(CATEGORY_HINTS).some(hint => hint.examples.includes(title));
}
