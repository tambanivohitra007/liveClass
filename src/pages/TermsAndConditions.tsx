import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsAndConditions() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-gray-600 dark:text-white/80">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 mb-8 no-underline">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-2">Terms and Conditions</h1>
      <p className="text-gray-400 dark:text-white/40 text-sm mb-10">Last updated: February 2026</p>

      <div className="prose max-w-none space-y-8 text-gray-600 dark:text-white/80 leading-relaxed text-[15px]">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Welcome to LiveClass</h2>
          <p>
            These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of the LiveClass platform,
            including our website, web application, and related services (collectively, the &quot;Service&quot;).
            By accessing or using the Service, you agree to be bound by these Terms.
          </p>
          <p>
            Please also review our <Link to="/privacy" className="text-brand hover:underline">Privacy Notice</Link>,
            which describes how we handle your personal information.
          </p>
          <p>
            If you do not agree to these Terms, you must stop using the Service immediately.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Responsible Use and Conduct</h2>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">2.1 General Principles</h3>
          <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You must:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide accurate and complete information when creating an account.</li>
            <li>Maintain the confidentiality of your account credentials.</li>
            <li>Not impersonate any person or misrepresent your affiliation with any entity.</li>
            <li>Not use the Service to distribute harmful, offensive, or inappropriate content.</li>
            <li>Not attempt to interfere with, disrupt, or compromise the integrity of the Service.</li>
          </ul>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">2.2 Educational Context</h3>
          <p>
            LiveClass is designed for educational and training purposes. Teachers and hosts are responsible for
            ensuring that the content they create and the sessions they host are appropriate for their audience,
            particularly when students include minors.
          </p>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">2.3 Fair Play</h3>
          <p>
            During live game sessions, participants must engage honestly. The following are prohibited:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Using automated tools, bots, or scripts to answer questions.</li>
            <li>Sharing answers with other participants during a live session.</li>
            <li>Attempting to bypass anti-cheat mechanisms (tab-switch detection, session tokens, pattern verification).</li>
            <li>Joining sessions with multiple accounts simultaneously.</li>
          </ul>
          <p className="mt-2">
            Violations may result in removal from the session and/or suspension of your account.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Accounts and Registration</h2>
          <p>
            Certain features of the Service require you to create an account. You may register using an email
            address and password, or through Google Sign-In. You are responsible for all activity that occurs
            under your account.
          </p>
          <p>
            Students may participate in live game sessions without creating an account by entering a game PIN
            and choosing a nickname. No persistent account is created for anonymous participants.
          </p>
          <p>
            You must notify us immediately if you suspect unauthorized access to your account.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Service Plans</h2>
          <p>
            LiveClass is currently offered free of charge for all users. We reserve the right to introduce paid
            plans or premium features in the future. If we do, we will provide advance notice and clearly
            communicate pricing, billing terms, and cancellation procedures.
          </p>
          <p>
            Free access does not guarantee perpetual availability. We may modify, suspend, or discontinue
            features at any time with reasonable notice.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. User Content</h2>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">5.1 Your Content</h3>
          <p>
            You retain ownership of all content you create or upload to the Service, including quizzes, questions,
            images, and other educational materials (&quot;User Content&quot;). By uploading User Content, you grant
            LiveClass a limited license to store, process, and display it as necessary to provide the Service.
          </p>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">5.2 Content Responsibility</h3>
          <p>
            You represent and warrant that you have the necessary rights and permissions to upload any User Content,
            and that your content does not infringe upon the intellectual property rights of any third party.
          </p>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">5.3 Content Moderation</h3>
          <p>
            We reserve the right to review, remove, or disable access to any User Content that violates these Terms
            or is otherwise objectionable, without prior notice.
          </p>

          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-4 mb-2">5.4 Public Content</h3>
          <p>
            If you set a quiz to &quot;public&quot; visibility, it becomes discoverable and cloneable by other users on
            the platform. You grant other users a non-exclusive license to clone and use public quizzes for
            educational purposes. You may change visibility back to &quot;private&quot; at any time, which will prevent
            further discovery but will not affect copies already made.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Intellectual Property</h2>
          <p>
            The Service, including its design, code, features, branding, and documentation, is owned by LiveClass
            and protected by intellectual property laws. These Terms do not grant you any right, title, or interest
            in the Service except for the limited right to use it in accordance with these Terms.
          </p>
          <p>
            You may not copy, modify, distribute, reverse-engineer, or create derivative works of the Service
            without our prior written consent.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. Third-Party Services</h2>
          <p>
            The Service integrates with third-party services including Firebase (Google Cloud), Google
            Authentication, and YouTube for embedded video content. Your use of these integrations is subject
            to the respective third party&apos;s terms of service and privacy policies.
          </p>
          <p>
            We are not responsible for the availability, accuracy, or content of third-party services. Any
            issues arising from third-party integrations should be directed to the respective provider.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">8. Account Security</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for
            restricting access to your account. You accept responsibility for all activities that occur
            under your account, whether or not authorized by you.
          </p>
          <p>
            We implement server-authoritative scoring, session tokens, and other security measures to
            maintain the integrity of live sessions. Attempting to circumvent these measures is a
            violation of these Terms.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">9. Data Protection</h2>
          <p>
            Our collection and use of personal information is governed by our{' '}
            <Link to="/privacy" className="text-brand hover:underline">Privacy Notice</Link>.
            By using the Service, you acknowledge that you have read and understood the Privacy Notice.
          </p>
          <p>
            If you are an educational institution using LiveClass with students, you are responsible for
            ensuring compliance with applicable data protection regulations, including obtaining any
            necessary parental consent for students under the applicable age of consent.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">10. Termination</h2>
          <p>
            You may stop using the Service and delete your account at any time. We may suspend or terminate
            your access to the Service at our discretion if you violate these Terms or engage in conduct
            that we determine is harmful to other users or the Service.
          </p>
          <p>
            Upon termination, your right to use the Service ceases immediately. Your User Content may be
            deleted after account closure, subject to our data retention practices described in our
            Privacy Notice.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">11. Disclaimer of Warranties</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or
            implied, including but not limited to implied warranties of merchantability, fitness for a particular
            purpose, and non-infringement.
          </p>
          <p>
            We do not warrant that the Service will be uninterrupted, error-free, secure, or free from viruses or
            other harmful components. We do not guarantee the accuracy, completeness, or usefulness of any
            content generated by AI features (such as the AI Question Generator), and users should review
            all generated content before use.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">12. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, LiveClass and its creators shall not be liable
            for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits,
            data, use, or goodwill, arising out of or in connection with your use of the Service.
          </p>
          <p>
            Our total aggregate liability for any claims arising from or related to the Service shall not
            exceed the amount you paid us (if any) in the twelve (12) months preceding the claim.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">13. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless LiveClass, its creators, and affiliates from any claims,
            damages, losses, or expenses (including reasonable legal fees) arising out of:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your violation of these Terms.</li>
            <li>Your User Content.</li>
            <li>Your misuse of the Service.</li>
            <li>Your violation of any applicable law or regulation.</li>
          </ul>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">14. Changes to These Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify you of material changes by
            posting the updated Terms on the Service and updating the &quot;Last updated&quot; date. Your continued use
            of the Service after any changes constitutes acceptance of the updated Terms.
          </p>
          <p>
            If you do not agree with the updated Terms, you should stop using the Service and delete your account.
          </p>
        </section>

        {/* 15 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">15. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the Republic of
            Madagascar, without regard to its conflict of law provisions. Any disputes arising from or
            relating to these Terms or the Service shall be resolved in the courts of Antananarivo, Madagascar.
          </p>
        </section>

        {/* 16 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">16. Miscellaneous</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Entire Agreement:</strong> These Terms, together with the Privacy Notice, constitute the
              entire agreement between you and LiveClass regarding the Service.
            </li>
            <li>
              <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable,
              the remaining provisions shall continue in full force and effect.
            </li>
            <li>
              <strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms shall not
              constitute a waiver of such right or provision.
            </li>
            <li>
              <strong>Assignment:</strong> You may not assign or transfer your rights under these Terms without
              our prior written consent. We may assign our rights and obligations without restriction.
            </li>
          </ul>
        </section>

        {/* 17 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">17. Contact Us</h2>
          <p>
            If you have any questions or concerns about these Terms, please contact us at:
          </p>
          <p className="mt-2 font-medium text-gray-800 dark:text-white/90">
            Email: rindra.it@gmail.com
          </p>
        </section>
      </div>
    </div>
  );
}
