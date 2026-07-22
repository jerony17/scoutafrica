import type { Achievement } from "../../lib/types";

type Props = {
  achievements: Achievement[];
};

const CATEGORY_LABELS: Record<Achievement["category"], string> = {
  national_team: "National Team",
  championship: "Championships",
  individual_award: "Individual Awards",
  tournament_award: "Tournament Awards",
};

const CATEGORY_ICONS: Record<Achievement["category"], string> = {
  national_team: "🌍",
  championship: "🏆",
  individual_award: "⭐",
  tournament_award: "🏅",
};

export default function Achievements({ achievements }: Props) {
  if (achievements.length === 0) {
    return (
      <div className="mt-10 bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-2">Achievements</h2>
        <p className="text-gray-500">No achievements added yet.</p>
      </div>
    );
  }

  const grouped = achievements.reduce<Record<string, Achievement[]>>((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="mt-10 bg-white rounded-2xl shadow-lg p-8">
      <h2 className="text-2xl font-bold mb-6">Achievements</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {(Object.keys(grouped) as Achievement["category"][]).map((category) => (
          <div key={category} className="bg-gray-50 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-500 mb-3">
              {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
            </p>
            <ul className="space-y-2">
              {grouped[category].map((item) => (
                <li key={item.id} className="text-gray-800">
                  <span className="font-medium">{item.title}</span>
                  {item.year && <span className="text-gray-400 text-sm"> · {item.year}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
