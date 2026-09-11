export default function Loading() {
  return <main className="mx-auto max-w-7xl space-y-5 px-5 py-10" role="status" aria-label="Carregando página"><div className="skeleton h-5 w-40" /><div className="skeleton h-12 max-w-xl" /><div className="grid gap-4 pt-5 md:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="skeleton h-40" />)}</div></main>;
}
