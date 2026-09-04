export default function Painel() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">

        {/* Menu lateral */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900 p-6">
          <div className="mb-10">
            <h1 className="text-2xl font-bold">Givova TI</h1>
            <p className="text-sm text-slate-400">Central de suporte</p>
          </div>

          <nav className="space-y-2">
            <button className="w-full rounded-lg bg-blue-600 px-4 py-3 text-left font-medium">
              Dashboard
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
              Chamados
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
              Histórico
            </button>
          </nav>
        </aside>

        {/* Conteúdo */}
        <section className="flex-1 p-8">

          <header className="mb-8">
            <p className="text-sm text-slate-400">Painel administrativo</p>
            <h2 className="text-3xl font-bold">Olá, equipe de TI</h2>
          </header>

          {/* Cards */}
          <div className="grid gap-5 md:grid-cols-3">

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Chamados novos</p>
              <p className="mt-2 text-3xl font-bold">12</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Em atendimento</p>
              <p className="mt-2 text-3xl font-bold">5</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Finalizados</p>
              <p className="mt-2 text-3xl font-bold">7</p>
            </div>

          </div>

          {/* Chamados recentes */}
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900">

            <div className="border-b border-slate-800 p-6">
              <h3 className="text-xl font-semibold">Chamados recentes</h3>
              <p className="text-sm text-slate-400">
                Últimas solicitações recebidas pela equipe
              </p>
            </div>

            <div className="divide-y divide-slate-800">

              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">Computador não liga</p>
                  <p className="text-sm text-slate-400">
                    Setor Financeiro • Sala 02
                  </p>
                </div>

                <span className="rounded-full bg-red-500/10 px-3 py-1 text-sm text-red-400">
                  Novo
                </span>
              </div>

              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">Problema com impressora</p>
                  <p className="text-sm text-slate-400">
                    Recursos Humanos • Sala 05
                  </p>
                </div>

                <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-sm text-yellow-400">
                  Em atendimento
                </span>
              </div>

              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">Internet instável</p>
                  <p className="text-sm text-slate-400">
                    Expedição • Galpão
                  </p>
                </div>

                <span className="rounded-full bg-red-500/10 px-3 py-1 text-sm text-red-400">
                  Novo
                </span>
              </div>

            </div>
          </div>

        </section>
      </div>
    </main>
  );
}