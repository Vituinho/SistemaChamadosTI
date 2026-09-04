"use client";

import { FormEvent, useState } from "react";

export default function Chamado() {
  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("");

  async function enviarChamado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const resposta = await fetch("http://127.0.0.1:5000/chamados", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        setor,
        localizacao,
        tipo,
        descricao,
        prioridade,
      }),
    });

    const resultado = await resposta.json();

    console.log(resultado);

    alert(resultado.mensagem);
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm text-blue-400">Givova TI</p>

          <h1 className="text-3xl font-bold">Abrir chamado</h1>

          <p className="mt-2 text-slate-400">
            Informe os dados do problema para que a equipe de TI possa ajudar.
          </p>
        </div>

        <form
          onSubmit={enviarChamado}
          className="space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Nome</label>

            <input
              type="text"
              placeholder="Digite seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Setor</label>

              <input
                type="text"
                placeholder="Ex: Financeiro"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Localização
              </label>

              <input
                type="text"
                placeholder="Ex: Sala 02"
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tipo do problema
            </label>

            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            >
              <option value="">Selecione uma opção</option>
              <option value="computador">Computador</option>
              <option value="impressora">Impressora</option>
              <option value="internet">Internet / Rede</option>
              <option value="sistema">Sistema</option>
              <option value="acesso">Acesso / Conta</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Descrição do problema
            </label>

            <textarea
              rows={5}
              placeholder="Explique o que está acontecendo..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Prioridade
            </label>

            <select
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            >
              <option value="">Selecione a prioridade</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500"
          >
            Abrir chamado
          </button>
        </form>
      </div>
    </main>
  );
}