import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <p className="text-lg font-medium">Страница не найдена</p>
      <Link href="/" className="text-sm underline">
        На обзор
      </Link>
    </main>
  );
}
