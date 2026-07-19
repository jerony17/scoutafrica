export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md p-6 sm:p-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: [DATE]</p>

        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg p-4 mb-8 text-sm">
          <strong>Draft placeholder.</strong> This is standard starter content,
          not legal advice, and has not been reviewed by a lawyer. Please have
          qualified legal counsel review and finalize these terms before
          launch.
        </div>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-2">1. Acceptance of Terms</h2>
            <p>
              By creating an account on ScoutAfrica, you agree to these Terms
              of Service and our Privacy Policy. If you are under 18, you
              confirm that a parent or legal guardian has reviewed and
              consented to these terms on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">2. Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your
              account credentials. Information you provide (player profile
              details, career history, club affiliations, verification
              documents, etc.) must be accurate to the best of your
              knowledge.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">3. Acceptable Use</h2>
            <p>
              You agree not to misuse the platform - including impersonating
              another person, sending harassing or abusive messages,
              submitting false player or organization information, or using
              the platform for any unlawful purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">4. Content You Submit</h2>
            <p>
              You retain ownership of photos, videos, and other content you
              upload. By uploading content, you grant ScoutAfrica a license
              to display it on the platform for the purpose of your profile
              being discoverable by scouts, clubs, and agents.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">5. No Guarantee of Outcomes</h2>
            <p>
              ScoutAfrica is a discovery and communication platform. We do
              not guarantee trials, contracts, representation, or any
              particular outcome from using the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">6. Termination</h2>
            <p>
              We may suspend or terminate accounts that violate these terms,
              including submitting fraudulent information or misusing the
              messaging system.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">7. Changes to These Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of
              the platform after changes take effect constitutes acceptance
              of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">8. Contact</h2>
            <p>Questions can be directed to [CONTACT EMAIL].</p>
          </section>
        </div>
      </div>
    </main>
  );
}
