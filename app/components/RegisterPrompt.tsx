import { REGISTER_PATH, REGISTER_PROMPT_MESSAGE, SIGN_IN_PATH } from "../lib/registration";

// Registration prompt for signed-out visitors (Find Players, member-only
// actions). A product gate, not a security boundary - private data is
// protected by the database itself.
export default function RegisterPrompt() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-8 text-center">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Join ScoutAfrica</h2>
      <p className="text-gray-500 mb-6 max-w-md mx-auto">{REGISTER_PROMPT_MESSAGE}</p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={REGISTER_PATH}
          className="inline-block bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
        >
          Register
        </a>
        <a
          href={SIGN_IN_PATH}
          className="inline-block bg-white border border-gray-200 hover:border-green-600 hover:text-green-700 text-gray-700 font-semibold px-6 py-3 rounded-xl shadow-sm transition"
        >
          Sign in
        </a>
      </div>
    </div>
  );
}
