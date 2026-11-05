"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createTabClient } from "@/lib/supabase/client";

// Arena is a fixed logical size; the canvas is scaled with CSS.
const W = 800;
const H = 500;
const PLAYER_R = 12;
const COIN_R = 9;
const SPEED = 240; // px per second
const MAX_COINS = 5;
const SPAWN_MS = 1200;
const SEND_MS = 66; // ~15 position updates per second
const IDLE_SEND_MS = 1000; // heartbeat while standing still
const COINS_RESYNC_MS = 1500; // host rebroadcasts coins so late joiners catch up
const CLAIM_RETRY_MS = 1000;
const TOPIC = "coin-rush:arena";

type Me = { id: string; name: string };
type Coin = { id: string; x: number; y: number };
type Remote = { name: string; x: number; y: number; tx: number; ty: number; seen: number };
type Row = { user_id: string; name: string; score: number };

export function CoinRush() {
  const [me, setMe] = useState<Me | null>(null);
  return me ? <Arena me={me} /> : <JoinForm onJoined={setMe} />;
}

function JoinForm({ onJoined }: { onJoined: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createTabClient();
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      if (!session) throw new Error("No session after anonymous sign-in");
      // Creates the row on first join; on later joins only the name changes, score is kept.
      const { error: upsertError } = await supabase
        .from("scores")
        .upsert({ user_id: session.user.id, name: trimmed }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;
      onJoined({ id: session.user.id, name: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={join} className="flex max-w-sm flex-col gap-3">
      <label className="text-sm text-zinc-600 dark:text-zinc-400" htmlFor="player-name">
        Pick a name
      </label>
      <input
        id="player-name"
        autoFocus
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="e.g. Speedy"
      />
      <button
        disabled={busy || !name.trim()}
        className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Joining…" : "Join game"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function Arena({ me }: { me: Me }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [online, setOnline] = useState<{ id: string; name: string }[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [board, setBoard] = useState<Row[]>([]);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [status, setStatus] = useState("connecting");

  const loadBoard = useCallback(async (supabase: SupabaseClient) => {
    const { data, error } = await supabase
      .from("scores")
      .select("user_id, name, score")
      .order("score", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(10);
    if (error) {
      console.warn("leaderboard load failed:", error.message);
      return;
    }
    setBoard(data);
    const mine = data.find((r) => r.user_id === me.id);
    if (mine) setMyScore(mine.score);
  }, [me.id]);

  useEffect(() => {
    const supabase = createTabClient();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Mutable game state lives outside React; React state is only for the side panel.
    const self = { x: 40 + Math.random() * (W - 80), y: 40 + Math.random() * (H - 80) };
    const remotes = new Map<string, Remote>();
    let coins: Coin[] = [];
    const pendingClaims = new Map<string, number>();
    const keys = new Set<string>();
    const flashes: { text: string; x: number; y: number; t: number }[] = [];
    let isHost = false;
    let currentHost: string | null = null;
    let channel: RealtimeChannel | null = null;
    let subscribed = false;
    let raf = 0;
    let lastFrame = performance.now();
    let lastSend = 0;
    let lastSent = { x: -1, y: -1 };
    let lastSpawn = 0;
    let lastCoinsBroadcast = 0;

    const send = (event: string, payload: Record<string, unknown>) => {
      if (subscribed) void channel?.send({ type: "broadcast", event, payload });
    };

    const broadcastCoins = () => {
      lastCoinsBroadcast = performance.now();
      send("coins", { from: me.id, coins });
    };

    const onCollected = async (coinId: string, by: string, name: string) => {
      coins = coins.filter((c) => c.id !== coinId);
      pendingClaims.delete(coinId);
      const holder = by === me.id ? self : remotes.get(by);
      flashes.push({ text: `+1 ${name}`, x: holder?.x ?? W / 2, y: holder?.y ?? H / 2, t: performance.now() });
      if (by !== me.id) return;
      const { data, error } = await supabase.rpc("bump_score");
      if (error) {
        console.warn("score write failed:", error.message);
        return;
      }
      setMyScore(data as number);
      send("score", {});
      void loadBoard(supabase);
    };

    // Host only: first claim for a coin wins, everyone hears the result once.
    const hostHandleClaim = (coinId: string, by: string, name: string) => {
      if (!coins.some((c) => c.id === coinId)) return;
      send("collected", { coinId, by, name });
      void onCollected(coinId, by, name);
      broadcastCoins();
    };

    const recomputeHost = () => {
      const state = channel!.presenceState<{ name: string }>();
      const ids = Object.keys(state).sort();
      currentHost = ids[0] ?? null;
      const wasHost = isHost;
      isHost = currentHost === me.id;
      if (isHost && !wasHost) broadcastCoins();
      setHostId(currentHost);
      setOnline(ids.map((id) => ({ id, name: state[id][0]?.name ?? "?" })));
      for (const id of remotes.keys()) if (!state[id]) remotes.delete(id);
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(k)) return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      if (e.type === "keydown") keys.add(k);
      else keys.delete(k);
    };
    const clearKeys = () => keys.clear();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      // Move self.
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
      if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        self.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, self.x + (dx / len) * SPEED * dt));
        self.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, self.y + (dy / len) * SPEED * dt));
      }

      // Send position at ~15 Hz when moving, plus an idle heartbeat.
      const moved = self.x !== lastSent.x || self.y !== lastSent.y;
      if ((moved && now - lastSend >= SEND_MS) || now - lastSend >= IDLE_SEND_MS) {
        lastSend = now;
        lastSent = { ...self };
        send("pos", { id: me.id, name: me.name, x: Math.round(self.x), y: Math.round(self.y) });
      }

      // Smoothly interpolate remote players toward their latest reported position.
      const k = 1 - Math.exp(-dt * 15);
      for (const r of remotes.values()) {
        r.x += (r.tx - r.x) * k;
        r.y += (r.ty - r.y) * k;
      }

      // Touching a coin: claim it (host decides).
      for (const c of coins) {
        if (Math.hypot(c.x - self.x, c.y - self.y) > PLAYER_R + COIN_R) continue;
        const pending = pendingClaims.get(c.id);
        if (pending && now - pending < CLAIM_RETRY_MS) continue;
        pendingClaims.set(c.id, now);
        if (isHost) hostHandleClaim(c.id, me.id, me.name);
        else send("claim", { coinId: c.id, by: me.id, name: me.name });
      }

      // Host: spawn coins and periodically resync.
      if (isHost) {
        if (coins.length < MAX_COINS && now - lastSpawn >= SPAWN_MS) {
          lastSpawn = now;
          coins = [...coins, {
            id: crypto.randomUUID(),
            x: Math.round(30 + Math.random() * (W - 60)),
            y: Math.round(30 + Math.random() * (H - 60)),
          }];
          broadcastCoins();
        } else if (now - lastCoinsBroadcast >= COINS_RESYNC_MS) {
          broadcastCoins();
        }
      }

      draw(ctx, now, self, me, remotes, coins, flashes);
      raf = requestAnimationFrame(frame);
    };

    // Deferred so React StrictMode's mount/unmount/mount doesn't race on the same topic.
    const startTimer = setTimeout(() => {
      channel = supabase.channel(TOPIC, {
        config: { broadcast: { self: false }, presence: { key: me.id } },
      });
      channel
        .on("broadcast", { event: "pos" }, ({ payload }) => {
          const r = remotes.get(payload.id);
          if (r) Object.assign(r, { tx: payload.x, ty: payload.y, name: payload.name, seen: performance.now() });
          else remotes.set(payload.id, { name: payload.name, x: payload.x, y: payload.y, tx: payload.x, ty: payload.y, seen: performance.now() });
        })
        .on("broadcast", { event: "coins" }, ({ payload }) => {
          if (!isHost && payload.from === currentHost) coins = payload.coins;
        })
        .on("broadcast", { event: "claim" }, ({ payload }) => {
          if (isHost) hostHandleClaim(payload.coinId, payload.by, payload.name);
        })
        .on("broadcast", { event: "collected" }, ({ payload }) => {
          void onCollected(payload.coinId, payload.by, payload.name);
        })
        .on("broadcast", { event: "score" }, () => void loadBoard(supabase))
        .on("presence", { event: "sync" }, recomputeHost)
        .subscribe(async (s, err) => {
          if (err) console.warn("realtime:", err.message);
          setStatus(s.toLowerCase());
          if (s === "SUBSCRIBED") {
            subscribed = true;
            await channel!.track({ name: me.name });
          } else {
            subscribed = false;
          }
        });
    }, 0);

    void loadBoard(supabase);
    const boardTimer = setInterval(() => void loadBoard(supabase), 10_000);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clearKeys);
    raf = requestAnimationFrame(frame);

    return () => {
      clearTimeout(startTimer);
      clearInterval(boardTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clearKeys);
      subscribed = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [me, loadBoard]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg border border-zinc-300 bg-zinc-950 dark:border-zinc-700"
        />
        <p className="mt-2 text-sm text-zinc-500">
          Arrow keys or WASD to move. Touch a coin first to score. Status: {status}
          {hostId === me.id && " · you are the host"}
        </p>
      </div>
      <aside className="flex w-full flex-col gap-6 lg:w-64">
        <section>
          <h2 className="mb-2 font-semibold">You</h2>
          <p>
            <span style={{ color: colorFor(me.id) }}>●</span> {me.name}: <strong>{myScore ?? 0}</strong>
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Online ({online.length})</h2>
          <ul className="space-y-1 text-sm">
            {online.map((p) => (
              <li key={p.id}>
                <span style={{ color: colorFor(p.id) }}>●</span> {p.name}
                {p.id === me.id && " (you)"}
                {p.id === hostId && " ★ host"}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Leaderboard</h2>
          <ol className="space-y-1 text-sm" data-testid="leaderboard">
            {board.map((r, i) => (
              <li key={r.user_id} className={r.user_id === me.id ? "font-semibold" : undefined}>
                {i + 1}. {r.name} — {r.score}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 80% 60%)`;
}

function draw(
  ctx: CanvasRenderingContext2D,
  now: number,
  self: { x: number; y: number },
  me: Me,
  remotes: Map<string, Remote>,
  coins: Coin[],
  flashes: { text: string; x: number; y: number; t: number }[],
) {
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

  for (const c of coins) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, COIN_R, 0, Math.PI * 2);
    ctx.fillStyle = "#facc15";
    ctx.fill();
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const dot = (x: number, y: number, id: string, name: string, isMe: boolean) => {
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_R, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(id);
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name, x, y - PLAYER_R - 6);
  };
  for (const [id, r] of remotes) dot(r.x, r.y, id, r.name, false);
  dot(self.x, self.y, me.id, me.name, true);

  // Floating "+1 name" for ~800 ms.
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    const age = (now - f.t) / 800;
    if (age >= 1) {
      flashes.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y - 24 - age * 20);
    ctx.globalAlpha = 1;
  }
}
