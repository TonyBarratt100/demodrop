import type { Metadata } from "next";
import { CoinRush } from "./coin-rush";

export const metadata: Metadata = { title: "Coin Rush" };

export default function PlayPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Coin Rush</h1>
      <CoinRush />
    </main>
  );
}
