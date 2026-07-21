import type { Player } from "../../lib/types";

type Props = {
  player: Player;
};

export default function ScoutOverview({ player }: Props) {
  return (
    <div className="mt-10 bg-white rounded-2xl shadow-lg p-8">

      <h2 className="text-2xl font-bold mb-6">
        ⭐ ScoutAfrica Overview
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Scout Rating</p>
          <p className="text-3xl font-bold text-green-600">
            8.7
          </p>
          <p className="text-gray-500 text-sm">/ 10</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Availability</p>
          <p className="text-xl font-bold text-green-600">
            Available
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Verification</p>
          <p className="text-xl font-bold text-green-600">
            Verified
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Profile Complete</p>
          <p className="text-xl font-bold">
            92%
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5">
          <p className="text-gray-500 text-sm">Contract</p>
          <p className="text-xl font-bold">
            {player.contract_expiry || "-"}
          </p>
        </div>

      </div>

    </div>
  );
}