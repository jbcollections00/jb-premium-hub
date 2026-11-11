import React from 'react';
import { Lock } from 'lucide-react';

// Review draft: reconcile with actual logging, R2, ads, messaging and payment data flows.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <Lock className="w-8 h-8 text-purple-500" /> Privacy Policy
          </h1>
          <p className="text-amber-300 text-sm mt-3">Draft for review — data practices must be verified before publication.</p>
        </header>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">1. Information handled by the service</h2>
            <p>Depending on the features used, information may include account registration details, profile information, media activity, comments, messages, membership status, technical logs and support requests. The final list must be checked against the deployed system.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">2. Why information is used</h2>
            <p>Information may be needed to sign users in, deliver website features, protect accounts, handle support requests, and manage membership access. Additional uses, including analytics or advertising, require specific review and disclosure.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">3. Service providers and cookies</h2>
            <p>Authentication, hosting, storage, media delivery and payment services can involve external providers. Cookies and similar technologies may support sessions and website features. Any advertising or measurement partners must be disclosed after verification.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">4. Retention and choices</h2>
            <p>Specific retention periods, account deletion procedures, privacy request contact details and applicable user rights must be verified and added before this draft replaces the published policy.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">5. Contact</h2>
            <p>For questions or reports, use the website's Support page while the dedicated privacy contact process is being finalized.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
