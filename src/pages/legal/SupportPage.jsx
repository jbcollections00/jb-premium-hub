import React, { useState } from 'react';
import { Headset, Send, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      // 📥 I-save ang ticket sa Supabase database
      const { error } = await supabase
        .from('support_tickets')
        .insert([
          {
            name: formData.name,
            email: formData.email,
            subject: formData.subject,
            message: formData.message,
          },
        ]);

      if (error) throw error;

      // Kung matagumpay:
      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      console.error('Error submitting ticket:', err);
      setErrorMsg('Nagkaroon ng problema sa pagpapadala ng mensahe. Pakisubukan muli.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-800 pb-6 text-center sm:text-left">
          <h1 className="text-3xl font-extrabold text-white flex items-center justify-center sm:justify-start gap-3">
            <Headset className="w-8 h-8 text-emerald-500" /> Contact Support
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            May tanong o teknikal na usapin? Magpadala ng mensahe sa aming team.
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          {submitted ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
              <h2 className="text-xl font-bold text-white">Naisumite na ang iyong Mensahe!</h2>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                Salamat sa pag-contact sa JB Support Team. Naitabi na ang iyong mensahe at tutugunan ito ng Admin sa lalong madaling panahon.
              </p>
              <button 
                onClick={() => setSubmitted(false)}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors cursor-pointer"
              >
                Magpadala ng panibagong mensahe
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Error Message Alert */}
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Pangalan</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Juan Dela Cruz"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    required
                    placeholder="juan@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Paksa / Concern</label>
                <input 
                  type="text" 
                  required
                  placeholder="Vault Access / Account Issue / Inquiries"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mensahe</label>
                <textarea 
                  required
                  rows={5}
                  placeholder="Isulat ang detalye ng iyong mensahe rito..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium text-sm py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/30"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Ipinapadala...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Ipadala ang Mensahe
                  </>
                )}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}