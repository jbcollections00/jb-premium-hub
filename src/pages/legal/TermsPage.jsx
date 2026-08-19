import React from 'react';
import { ShieldCheck, FileText, Lock, AlertCircle } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-500" /> Terms of Service
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Huling na-update: Agosto 2026
          </p>
        </div>

        {/* Content Box */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">1. Pagtanggap sa mga Tuntunin</h2>
            <p>
              Sa pag-access at paggamit ng **JB Premium Hub & Public Media Gallery**, sumasang-ayon ka na sundin ang lahat ng nakasaad na mga tuntunin at kundisyon dito. Kung hindi ka sang-ayon sa alinman sa mga ito, pinapayuhan ka na huwag ipagpatuloy ang paggamit ng aming platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">2. User Vault Account at Access</h2>
            <p>
              Responsibilidad ng bawat user na panatilihing ligtas at hiwalay ang kanilang account details. Ang hindi awtorisadong pagbabahagi o pagbebenta ng iyong Vault Access credentials ay maaaring maging dahilan ng pagkaka-terminate ng iyong account nang walang refund.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">3. Tamang Paggamit (Acceptable Use)</h2>
            <p>
              Ipinagbabawal ang anumang uri ng automated scraping, pag-upload ng mapanirang software, o paggamit ng aming media gallery sa mga gawaing labag sa batas.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">4. Limitasyon ng Pananagutan</h2>
            <p>
              Ang JB Collections ay hindi mananagot sa anumang di-inaasahang pagkaantala ng serbisyo (downtime) na dulot ng maintenance o probema sa third-party server infrastructure.
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}