export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md p-6 sm:p-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: [DATE]</p>

        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg p-4 mb-8 text-sm">
          <strong>Draft placeholder.</strong> This is standard starter content,
          not legal advice, and has not been reviewed by a lawyer. Please have
          qualified legal counsel review and finalize this policy before
          launch - particularly given that ScoutAfrica may collect data from
          users under 18.
        </div>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-2">1. Information We Collect</h2>
            <p>
              When you create an account, we collect information you provide
              directly, such as your name, email address, date of birth,
              nationality, physical attributes, career history, photos, and
              video content. We also collect information generated through
              your use of the platform, such as messages, contact requests,
              and watchlist activity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">2. How We Use Information</h2>
            <p>
              We use your information to operate the platform: to create and
              display player profiles, connect players with scouts, clubs,
              and agents, facilitate messaging between users, and improve the
              service. We do not sell your personal information to third
              parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">3. Minors</h2>
            <p>
              ScoutAfrica may be used by players under the age of 18. Where a
              user is a minor, we require appropriate parental or guardian
              consent as required by applicable law before collecting
              personal information. [This section requires specific legal
              guidance for each jurisdiction ScoutAfrica operates in.]
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">4. Information Sharing</h2>
            <p>
              Player profile information you choose to make visible (such as
              your name, position, stats, and highlight videos) is visible to
              other registered users of the platform, consistent with the
              purpose of a scouting and recruitment service. We do not share
              your information with third parties for their own marketing
              purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">5. Data Security</h2>
            <p>
              We use industry-standard measures, including database-level
              access controls, to protect your information. No system is
              completely secure, and we encourage you to use a strong,
              unique password for your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">6. Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your
              personal information by contacting us at [CONTACT EMAIL].
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">7. Contact</h2>
            <p>
              Questions about this policy can be directed to
              [CONTACT EMAIL].
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
