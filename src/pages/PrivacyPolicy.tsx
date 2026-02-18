import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-8 no-underline">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2">Privacy Notice</h1>
      <p className="text-gray-400 text-sm mb-10">Last updated: February 2026</p>

      <div className="prose max-w-none space-y-8 text-gray-600 leading-relaxed text-[15px]">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">1. Introduction</h2>
          <p>
            LiveClass (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Notice explains how we collect,
            use, disclose, and safeguard your personal information when you use the LiveClass platform, including our website,
            web application, and related services (collectively, the &quot;Service&quot;).
          </p>
          <p>
            By using the Service, you agree to the collection and use of information in accordance with this notice. If you do
            not agree with the practices described here, please do not use the Service.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">2. Information We Collect</h2>

          <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">2.1 Information You Provide</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account information:</strong> Name, email address, and password when you register for an account.</li>
            <li><strong>Profile information:</strong> Display name and role (teacher or student).</li>
            <li><strong>Content you create:</strong> Quizzes, questions, images, and other educational materials you upload or create.</li>
            <li><strong>Game participation:</strong> Nicknames chosen when joining a live session and answers submitted during gameplay.</li>
          </ul>

          <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">2.2 Information Collected Automatically</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Usage data:</strong> Pages visited, features used, session duration, and interaction patterns.</li>
            <li><strong>Device information:</strong> Browser type, operating system, screen resolution, and language preferences.</li>
            <li><strong>Log data:</strong> IP address, access times, and referring URLs.</li>
            <li><strong>Local storage:</strong> We use browser localStorage and sessionStorage to maintain session state, preferences (e.g., sound mute, theme), and anti-cheat session tokens.</li>
          </ul>

          <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">2.3 Student Information</h3>
          <p>
            Students may join live game sessions without creating an account. In this case, we collect only the
            nickname provided and answers submitted during the session. No email, real name, or persistent identifier
            is required from student participants.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Authenticate users and manage accounts.</li>
            <li>Enable real-time quiz gameplay, scoring, and leaderboard functionality.</li>
            <li>Generate analytics for teachers (per-question accuracy, response times, CSV exports).</li>
            <li>Detect and prevent cheating, fraud, and abuse through anti-cheat measures.</li>
            <li>Send transactional communications (e.g., password resets).</li>
            <li>Respond to support requests and inquiries.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p className="mt-3 font-medium text-gray-800">
            We do not sell your personal information to third parties.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">4. Data Storage and Security</h2>
          <p>
            Your data is stored using Google Firebase infrastructure, with servers located in the Asia-Southeast 1
            (Singapore) region. We implement industry-standard security measures including:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Encryption in transit (TLS/HTTPS) and at rest.</li>
            <li>Firebase Authentication for secure user identity management.</li>
            <li>Firestore Security Rules restricting data access by role and ownership.</li>
            <li>Server-authoritative Cloud Functions for scoring and session management to prevent client-side manipulation.</li>
            <li>Session tokens and anti-cheat mechanisms to maintain game integrity.</li>
          </ul>
          <p className="mt-3">
            While we strive to use commercially acceptable means to protect your information, no method of electronic
            transmission or storage is 100% secure. We cannot guarantee absolute security.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">5. Sharing Your Information</h2>
          <p>We may share your information in the following circumstances:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>With other session participants:</strong> Nicknames and scores are visible to other players and the session host during live games.</li>
            <li><strong>With teachers/hosts:</strong> Answer data, response times, and analytics are accessible to the teacher who hosted the session.</li>
            <li><strong>Service providers:</strong> We use Firebase (Google Cloud) for hosting, authentication, and data storage.</li>
            <li><strong>Public quizzes:</strong> If you publish a quiz as &quot;public,&quot; its title, description, and questions are discoverable by other users.</li>
            <li><strong>Legal requirements:</strong> We may disclose information if required by law, regulation, or legal process.</li>
          </ul>
          <p className="mt-3">
            We do not share student gameplay data with third parties for advertising or marketing purposes.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">6. Cookies and Local Storage</h2>
          <p>
            LiveClass does not use traditional tracking cookies. Instead, we use browser localStorage and
            sessionStorage for essential functionality:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Authentication state:</strong> Firebase Auth tokens to maintain your login session.</li>
            <li><strong>User preferences:</strong> Theme (light/dark), sound mute setting.</li>
            <li><strong>Anti-cheat tokens:</strong> Session-specific tokens stored in sessionStorage to prevent duplicate or unauthorized game participation.</li>
            <li><strong>Offline data:</strong> Assignment answers cached in IndexedDB for offline mode, synced when connectivity is restored.</li>
          </ul>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">7. Data Retention</h2>
          <p>We retain your personal information as follows:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account data:</strong> Retained for as long as your account is active. You may request deletion at any time.</li>
            <li><strong>Quiz content:</strong> Retained until you delete it or your account is closed.</li>
            <li><strong>Session data:</strong> Game session data (answers, scores, analytics) is retained for the host to review. Expired sessions may be automatically cleaned up.</li>
            <li><strong>Student gameplay data:</strong> Nicknames and answers from anonymous participants are retained as part of session records and deleted when the session is removed.</li>
          </ul>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">8. Your Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information.</li>
            <li><strong>Deletion:</strong> Request deletion of your personal information and account.</li>
            <li><strong>Data portability:</strong> Request a machine-readable copy of your data.</li>
            <li><strong>Withdraw consent:</strong> Where processing is based on consent, you may withdraw it at any time.</li>
            <li><strong>Objection:</strong> Object to processing of your personal information in certain circumstances.</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, please contact us at the email address provided below.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">9. Children&apos;s Privacy</h2>
          <p>
            LiveClass is designed for educational use and may be used by children under the direction of a teacher or
            school. Children can participate in live quiz sessions by entering a game PIN and a nickname — no account
            creation, email address, or personal information is required.
          </p>
          <p>
            Teachers and schools are responsible for obtaining any necessary parental consent before allowing children
            to use the Service. We do not knowingly collect personal information from children without appropriate
            authorization.
          </p>
          <p>
            If you believe we have inadvertently collected personal information from a child without proper consent,
            please contact us and we will promptly delete it.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">10. Third-Party Services</h2>
          <p>
            The Service integrates with or relies on the following third-party services:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Firebase (Google Cloud):</strong> Authentication, database, cloud functions, file storage, and hosting.</li>
            <li><strong>Google Authentication:</strong> Optional sign-in via Google account (OAuth 2.0).</li>
            <li><strong>YouTube:</strong> Embedded video content in quiz questions (subject to YouTube&apos;s Terms of Service and Privacy Policy).</li>
          </ul>
          <p className="mt-3">
            These third-party services have their own privacy policies. We encourage you to review them.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">11. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other than your country of residence,
            including Singapore (where our Firebase infrastructure is hosted). These countries may have different data
            protection laws. By using the Service, you consent to such transfers.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">12. Changes to This Notice</h2>
          <p>
            We may update this Privacy Notice from time to time. We will notify you of material changes by posting the
            updated notice on the Service and updating the &quot;Last updated&quot; date. Your continued use of the Service
            after any changes constitutes acceptance of the updated notice.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">13. Contact Us</h2>
          <p>
            If you have any questions, concerns, or requests regarding this Privacy Notice or our data practices,
            please contact us at:
          </p>
          <p className="mt-2 font-medium text-gray-800">
            Email: privacy@liveclass.app
          </p>
        </section>
      </div>
    </div>
  );
}
