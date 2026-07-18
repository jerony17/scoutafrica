type Props = {
  player: any;
};

export default function PlayerIDCard({ player }: Props) {
  return (
    <div className="mt-10">

      <h2 className="text-2xl font-bold mb-4">
        ScoutAfrica Digital ID
      </h2>

      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white rounded-2xl p-6 max-w-md shadow-xl">

        <h3 className="text-xl font-bold">
          {player.full_name}
        </h3>

        <p className="mt-2">
          ID: {player.scoutafrica_id}
        </p>

        <p>
          Position: {player.position}
        </p>

        <p>
          Nationality: {player.nationality}
        </p>

      </div>

    </div>
  );
}