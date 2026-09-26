import { FiUserPlus, FiUploadCloud, FiTarget, FiChevronRight } from "react-icons/fi";

// Pure marketing copy, no data involved - safe to match the reference
// text exactly. Layout matches the reference: heading + description in a
// left column, the 3 numbered steps in a row to the right with small
// chevron connectors between them.
const STEPS = [
  {
    icon: FiUserPlus,
    title: "Create Your Profile",
    description: "Show your skills, statistics and career journey.",
  },
  {
    icon: FiUploadCloud,
    title: "Upload Highlight Videos",
    description: "Let scouts and clubs see your talent.",
  },
  {
    icon: FiTarget,
    title: "Get Discovered",
    description: "Connect with clubs, academies, scouts and agents globally.",
  },
];

export default function HowItWorks() {
  return (
    // py reduced (14 -> 10) and the heading/cards gap tightened (8 -> 6),
    // per follow-up feedback that this section sat too low with too much
    // surrounding space - the heading and the 3 cards were always in the
    // same side-by-side row (items-start already top-aligns them), so the
    // fix is less padding around the section as a whole, not a structural
    // change to that relationship.
    <section className="bg-white py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          <div className="border-l-4 border-amber-500 pl-4">
            <h2 className="text-2xl font-bold text-gray-900">How ScoutAfrica Works</h2>
            <p className="text-gray-500 mt-1">
              A simple way for African football talent to connect with global opportunities.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex items-center gap-3 flex-1">
                <div className="bg-gray-50 rounded-2xl p-5 relative flex-1 h-full">
                  <span className="absolute -top-3 left-6 w-7 h-7 rounded-full bg-amber-500 text-white text-sm font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <step.icon className="w-6 h-6 text-green-700 mb-2.5" />
                  <p className="font-semibold text-gray-900">{step.title}</p>
                  <p className="text-sm text-gray-500 mt-1">{step.description}</p>
                </div>

                {/* Visible at every width now, not just sm+ - the
                    approved mobile reference shows this same small
                    connector between the stacked cards too, not just
                    between side-by-side desktop ones. */}
                {i < STEPS.length - 1 && (
                  <FiChevronRight className="w-5 h-5 text-gray-300 shrink-0" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
