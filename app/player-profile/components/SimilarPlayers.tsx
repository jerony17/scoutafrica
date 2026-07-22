import Link from "next/link";
import Image from "next/image";
import type { Player } from "../../lib/types";

type Props = {
  players: Player[];
};

export default function SimilarPlayers({ players }: Props) {
  if (players.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-6">Similar Players</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {players.map((player) => (
          <Link
            key={player.id}
            href={player.slug ? `/player-profile/${player.slug}` : "#"}
            className="bg-white rounded-xl shadow hover:shadow-lg transition p-4 flex items-center gap-4"
          >
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-gray-100 shrink-0">
              <Image
                src={
                  player.photo_url ||
                  "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400"
                }
                alt={player.full_name || "Player"}
                fill
                className="object-cover"
              />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{player.full_name || "Unnamed Player"}</p>
              <p className="text-sm text-gray-500">
                {player.position || "—"} · {player.nationality || "—"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
