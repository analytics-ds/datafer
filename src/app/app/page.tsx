export default function AppHome() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Bienvenue sur Datafer</h1>
      <p className="text-neutral-600 mt-2">
        L&apos;outil d&apos;optimisation sémantique arrive ici. Le scaffold est en place,
        reste à câbler l&apos;éditeur, l&apos;analyse SERP et les dossiers clients.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="border border-neutral-200 rounded-xl p-5 bg-white">
          <h2 className="font-medium">Dossiers clients</h2>
          <p className="text-sm text-neutral-500 mt-1">À venir.</p>
        </div>
        <div className="border border-neutral-200 rounded-xl p-5 bg-white">
          <h2 className="font-medium">Briefs</h2>
          <p className="text-sm text-neutral-500 mt-1">À venir.</p>
        </div>
      </section>
    </main>
  );
}
