import { Monitor, Wifi, Printer, AppWindow, Mail, KeyRound, MessageCircle, Smartphone, Cable, HelpCircle } from "lucide-react";

// Presentation hints only. Available categories and departments come from the API.
export const problemOptions: Record<string, { icon: typeof Monitor; examples: string[] }> = {
  Computador: { icon: Monitor, examples: ["Computador não liga", "Computador está lento", "Computador travou"] },
  Internet: { icon: Wifi, examples: ["Estou sem internet", "Internet está lenta"] },
  Impressora: { icon: Printer, examples: ["Impressora não imprime", "Papel preso na impressora"] },
  Sistema: { icon: AppWindow, examples: ["Não consigo abrir o sistema", "O sistema está com erro"] },
  "E-mail": { icon: Mail, examples: ["Não consigo enviar e-mail", "Não estou recebendo e-mails"] },
  "Acesso / Senha": { icon: KeyRound, examples: ["Esqueci minha senha", "Meu acesso está bloqueado"] },
  WhatsApp: { icon: MessageCircle, examples: ["WhatsApp não conecta", "Não consigo enviar mensagens"] },
  "Telefone / Celular": { icon: Smartphone, examples: ["Telefone não funciona", "Celular não liga"] },
  Equipamento: { icon: Cable, examples: ["Mouse não funciona", "Teclado não funciona", "Monitor sem imagem"] },
  Outro: { icon: HelpCircle, examples: ["Preciso de ajuda da TI"] },
};
