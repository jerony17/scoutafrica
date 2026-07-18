type Props = {
  player: any;
};

export default function PlayerStats({ player }: Props) {
  return (
    <div className="mt-10">

      <h2 className="text-2xl font-bold mb-6">
        Player Information
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    ⚽ Position
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.position || "-"}
  </p>

</div>

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    🎂 Age
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.age || "-"} Years
  </p>

</div>

        <div className="bg-gray-50 rounded-xl p-4">
  <p className="text-gray-500 text-sm">Nationality</p>

  <div className="flex items-center gap-2">

    <span className="text-2xl">
      {player.nationality === "Japan" && "🇯🇵"}
      {player.nationality === "Nigeria" && "🇳🇬"}
      {player.nationality === "Ghana" && "🇬🇭"}
      {player.nationality === "Cameroon" && "🇨🇲"}
      {player.nationality === "South Africa" && "🇿🇦"}
      {player.nationality === "Kenya" && "🇰🇪"}
      {player.nationality === "Morocco" && "🇲🇦"}
      {player.nationality === "Egypt" && "🇪🇬"}
      {player.nationality === "Brazil" && "🇧🇷"}
      {player.nationality === "England" && "🏴"}
      {player.nationality === "France" && "🇫🇷"}
      {player.nationality === "Germany" && "🇩🇪"}
      {player.nationality === "Spain" && "🇪🇸"}
      {player.nationality === "Italy" && "🇮🇹"}
      {player.nationality === "Portugal" && "🇵🇹"}
    </span>

    <p className="font-bold text-lg">
      {player.nationality || "-"}
    </p>

  </div>
</div>

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    🏟 Current Club
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.current_club || "-"}
  </p>

</div>

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    📏 Height
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.height || "-"} cm
  </p>

</div>

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    ⚖ Weight
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.weight || "-"} kg
  </p>

</div>

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    👟 Preferred Foot
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.preferred_foot || "-"}
  </p>

</div>

        <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">

  <p className="text-gray-500 flex items-center gap-2 text-sm">
    🔢 Jersey Number
  </p>

  <p className="text-2xl font-bold mt-2">
    {player.jersey_number || "-"}
  </p>

</div>

      </div>

    </div>
  );
}