"use client";

import type { Game } from "@/lib/games";
import { GameStats } from "./GameStats";
import { SqlQueryPanel } from "./SqlQueryPanel";

type StatsTabProps = {
  games: Game[];
};

export function StatsTab({ games }: StatsTabProps) {
  return (
    <div className="space-y-12 pb-24">
      {/* ─── Library overview ─── */}
      <section>
        <h2 className="text-base font-semibold text-emphasis mb-6">Library Overview</h2>
        <GameStats games={games} />
      </section>

      <hr className="border-divider" />

      {/* ─── SQL query interface ─── */}
      <section>
        <h2 className="text-base font-semibold text-emphasis mb-1">SQL Query</h2>
        <p className="text-sm text-muted mb-6">
          Query your game library with SQL. The{" "}
          <code className="font-mono text-xs bg-divider px-1 py-0.5 rounded">games</code> table
          is loaded in-browser from your CSV — no server round-trip.
        </p>
        <SqlQueryPanel games={games} />
      </section>
    </div>
  );
}
