import React from 'react';
import { Lock, Eye, Database, ShieldAlert } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <Lock className="w-8 h-8 text-purple-500" /> Privacy Policy
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Paano namin pinoprotektahan at pinapangalagaan ang iyong impormasyon.
          </p>
        </div>

        {/* Content Box */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" /> Impormasyong Aming Kinokolekta
            </h2>
            <p>
              Kinokolekta lamang namin ang mga batayang impormasyon tulad ng iyong account username, email address, at website usage telemetry (visitor analytics) upang mapahusay ang kalidad ng serbisyo.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-purple-400" /> Pagprotekta sa Datos
            </h2>
            <p>
              Ang lahat ng authentication data ay secure na nakaimbak gamit ang Supabase Encryption standard. Hindi kailanman ibinebenta o ibinabahagi ng JB Collections ang iyong personal na data sa anumang third-party advertisers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-purple-400" /> Cookies at Analytics Tracking
            </h2>
            <p>
              Gumagamit kami ng session tokens at anonymized analytics counters para malaman ang bilang ng aktibong users sa site nang hindi kinukuha ang iyong personal identity.
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}