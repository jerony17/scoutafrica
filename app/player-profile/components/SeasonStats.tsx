import {
  FaFutbol,
  FaHandsHelping,
  FaStopwatch,
  FaShieldAlt,
} from "react-icons/fa";
import { MdSportsSoccer } from "react-icons/md";
import { BsFillSquareFill } from "react-icons/bs";

type Props = {
  player: any;
};

export default function SeasonStats({ player }: Props) {
  const stats = [
    {
      title: "Matches",
      value: player.matches ?? 0,
      icon: <MdSportsSoccer className="text-3xl text-green-600" />,
      color: "bg-green-50",
    },
    {
      title: "Goals",
      value: player.goals ?? 0,
      icon: <FaFutbol className="text-3xl text-blue-600" />,
      color: "bg-blue-50",
    },
    {
      title: "Assists",
      value: player.assists ?? 0,
      icon: <FaHandsHelping className="text-3xl text-yellow-600" />,
      color: "bg-yellow-50",
    },
    {
      title: "Minutes Played",
      value: player.minutes_played ?? 0,
      icon: <FaStopwatch className="text-3xl text-purple-600" />,
      color: "bg-purple-50",
    },
    {
      title: "Clean Sheets",
      value: player.clean_sheets ?? 0,
      icon: <FaShieldAlt className="text-3xl text-cyan-600" />,
      color: "bg-cyan-50",
    },
    {
      title: "Yellow Cards",
      value: player.yellow_cards ?? 0,
      icon: <BsFillSquareFill className="text-2xl text-yellow-500" />,
      color: "bg-orange-50",
    },
    {
      title: "Red Cards",
      value: player.red_card ?? 0,
      icon: <BsFillSquareFill className="text-2xl text-red-600" />,
      color: "bg-red-50",
    },
  ];

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Season Statistics</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className={`${stat.color} rounded-2xl shadow-md p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-700">
                {stat.title}
              </h3>

              {stat.icon}
            </div>

            <p className="text-4xl font-bold text-gray-900">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}