type Props = {
  player: any;
};

export default function CareerHistory({ player }: Props) {
  return (
    <div className="mt-10">

      <h2 className="text-2xl font-bold mb-4">
        Career History
      </h2>

      <div className="bg-gray-50 rounded-xl p-6">

        <p className="text-gray-600">
          Current Club
        </p>

        <p className="text-xl font-bold">
          {player.current_club || "No club added"}
        </p>

        <div className="mt-6 border-t pt-4">

          <p className="text-gray-600">
            Career Timeline
          </p>

          <p className="text-gray-500 mt-2">
            Career history will appear here as the player updates
            previous clubs and seasons.
          </p>

        </div>

      </div>

    </div>
  );
}