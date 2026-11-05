import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold">DemoDrop</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Upload your hackathon demo pack. Claude writes the judge notes.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-md bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black">
          Sign in
        </Link>
        <Link href="/dashboard" className="rounded-md border border-zinc-300 px-4 py-2 font-medium dark:border-zinc-700">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
