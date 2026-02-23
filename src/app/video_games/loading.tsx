export default function Loading() {
  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mt-10">
          <div className="h-10 w-48 rounded bg-shelf-plank/30 animate-pulse" />
          <div className="mt-2 h-5 w-24 rounded bg-shelf-plank/20 animate-pulse" />
          <div className="mt-6 h-12 w-full rounded bg-shelf-plank/20 animate-pulse" />
          <div className="mt-8 flex flex-wrap gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-24 h-36 rounded bg-shelf-plank/30 animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
