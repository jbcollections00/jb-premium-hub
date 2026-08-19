import React from 'react';
import { AlertTriangle, Mail, Scale } from 'lucide-react';

export default function DmcaPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <Scale className="w-8 h-8 text-amber-500" /> DMCA Policy
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Digital Millennium Copyright Act Compliance & Takedown Notices
          </p>
        </div>

        {/* Content Box */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <p>
            Iinirerespeto ng **JB Collections** ang intellectual property rights ng iba. Kung naniniwala ka na ang iyong copyrighted material ay naisama o naisulat sa aming gallery o vault nang walang kaukulang pahintulot, agad magpadala ng notisya sa aming copyright team.
          </p>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-300 space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" /> Requirements para sa DMCA Takedown Notice:
            </h3>
            <ul className="list-disc list-inside text-xs space-y-1 text-amber-200/90 pl-2">
              <li>Lider o patunay na ikaw ang authorized owner ng copyrighted content.</li>
              <li>Tiyak na URL o kinalalagyan ng sinasabing infringing material.</li>
              <li>Kumpletong contact info (Pangalan, Email, at Contact Number).</li>
              <li>Isang pahayag na nagpapatunay na tama at bukal sa loob ang iyong kahilingan.</li>
            </ul>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <p className="font-medium text-white mb-1">Maaaring ipadala ang notisya sa:</p>
            <p className="text-blue-400 flex items-center gap-2 font-mono text-xs">
              <Mail className="w-4 h-4" /> jbcollecetions00@gmail.com
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}