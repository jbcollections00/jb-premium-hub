import React from 'react';
import { FileText } from 'lucide-react';

// Review draft: verify content rules, payment terms and contact process before production.
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-500" /> Terms of Service
          </h1>
          <p className="text-amber-300 text-sm mt-3">Draft for review — not yet approved for publication.</p>
        </header>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">1. Using JB Premium Hub</h2>
            <p>JB Premium Hub provides account-based access to media and community features. Follow applicable laws and these rules when using the service.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">2. Accounts and access</h2>
            <p>Keep your login credentials secure. Do not impersonate other users, bypass access controls, or share access to accounts without authorization.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">3. Media and community conduct</h2>
            <p>Do not post illegal content, content that exploits or endangers children, harassment, privacy-violating material, malware, or media you do not have the right to share. Content may be reviewed or restricted to protect users and comply with applicable requirements.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">4. Membership and payments</h2>
            <p>Available plans and their benefits are described at checkout. Pricing, renewal or expiration behavior, cancellation and refund rules must be confirmed and displayed clearly before paid membership is offered.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">5. Support and reporting</h2>
            <p>Use the website's Support page to report account concerns, unsafe content, copyright issues or other problems.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
