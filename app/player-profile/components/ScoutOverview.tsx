import type { Player } from "../../lib/types";

type Props = {
  player: Player;
};

// This component previously showed hardcoded placeholder numbers (a fake
// "8.7/10 Scout Rating", an unconditional "Verified", a fixed "92%") for
// every player regardless of real data. Rebuilt to show only real fields.
export default function ScoutOverview({ player }: Props) {
  const hasBioContent =
    player.bio ||
    player.playing_style ||
    (player.strengths && player.strengths.length > 0) ||
    player.position ||
    player.secondary_position ||
    (player.languages_spoken && player.languages_spoken.length > 0);

  if (!hasBioContent) {
    return (
      <div className="mt-10 bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-2">Player Bio</h2>
        <p className="text-gray-500">This player hasn&apos;t added a bio yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-10 bg-white rounded-2xl shadow-lg p-8">
      <h2 className="text-2xl font-bold mb-6">Player Bio</h2>

      {player.bio && (
        <p className="text-gray-700 leading-relaxed mb-6">{player.bio}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Preferred Position</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {player.position || "—"}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Secondary Position</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {player.secondary_position || "—"}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Playing Style</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {player.playing_style || "—"}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Contract</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {player.contract_expiry || "—"}
          </p>
        </div>
      </div>

      {player.strengths && player.strengths.length > 0 && (
        <div className="mt-6">
          <p className="text-gray-500 text-sm mb-2">Strengths</p>
          <div className="flex flex-wrap gap-2">
            {player.strengths.map((strength) => (
              <span
                key={strength}
                className="bg-green-50 text-green-800 text-sm font-medium px-3 py-1 rounded-full"
              >
                {strength}
              </span>
            ))}
          </div>
        </div>
      )}

      {player.languages_spoken && player.languages_spoken.length > 0 && (
        <div className="mt-6">
          <p className="text-gray-500 text-sm mb-2">Languages Spoken</p>
          <div className="flex flex-wrap gap-2">
            {player.languages_spoken.map((language) => (
              <span
                key={language}
                className="bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full"
              >
                {language}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
