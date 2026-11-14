import React, { useState } from 'react';
import { Headset, Send, CheckCircle2, Loader2, AlertCircle, Paperclip } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [attachment, setAttachment] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      let attachmentUrl = null;

      // 📤 1. Upload Attachment to Supabase Storage (if exists)
      if (attachment) {
        const fileExt = attachment.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `tickets/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('support_attachments') // Make sure this bucket exists in Supabase
          .upload(filePath, attachment);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('support_attachments')
          .getPublicUrl(filePath);
          
        attachmentUrl = publicUrlData.publicUrl;
      }

      // 📥 2. Save ticket to Supabase database
      const { error } = await supabase
        .from('support_tickets')
        .insert([
          {
            name: formData.name,
            email: formData.email,
            subject: formData.subject,
            message: formData.message,
            attachment_url: attachmentUrl, // Ensure this column exists in your table
          },
        ]);

      if (error) throw error;

      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      setAttachment(null);
    } catch (err) {
      console.error('Error submitting ticket:', err);
      setErrorMsg('There was a problem submitting your request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jbh-page min-h-screen text-slate-200">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="border-b border-white/10 pb-6 text-center sm:text-left">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-extrabold tracking-tight text-white sm:justify-start">
            <Headset className="h-8 w-8 text-indigo-300" /> Contact Support
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Have a question or technical issue? Send a message to our team.
          </p>
        </div>

        {/* Form Container */}
        <div className="jbh-surface p-6 sm:p-8">
          {submitted ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
              <h2 className="text-xl font-bold text-white">Message Submitted!</h2>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                Thanks for contacting JB Premium Hub. Your message has been received and will be reviewed by our support team.
              </p>
              <button 
                onClick={() => setSubmitted(false)}
                className="jbh-btn-quiet mt-4 text-sm"
              >
                Send another message
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="jbh-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    required
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="jbh-field text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Subject / Concern</label>
                <input 
                  type="text" 
                  required
                  placeholder="Membership, account or payment question"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="jbh-field text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Message</label>
                <textarea 
                  required
                  rows={5}
                  placeholder="Provide the details of your issue here..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="jbh-field resize-y text-sm"
                />
              </div>

              {/* Attachment Field */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" /> Attachment (Optional)
                </label>
                <input 
                  type="file" 
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="jbh-field cursor-pointer text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-200"
                />
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="jbh-btn mt-2 w-full text-sm disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Send Message
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