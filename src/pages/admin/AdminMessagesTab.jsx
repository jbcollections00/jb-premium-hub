import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AdminMessagesTab({ users = [] }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentType, setAttachmentType] = useState('image');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // Preset Automated Message Templates
  const MESSAGE_TEMPLATES = [
    {
      id: 'custom',
      label: 'Custom Message (Blank)',
      title: '',
      content: ''
    },
    {
      id: 'new_content',
      label: 'New Content Release',
      title: 'New Content Available in Vault',
      content: 'Exclusive new media has just been added to the Vault. Log in to explore the latest updates.'
    },
    {
      id: 'new_code',
      label: 'VIP Access Code Delivery',
      title: 'Your VIP Access Code',
      content: 'Thank you for your purchase. Below is your VIP Access Code:\n\n[INSERT_CODE_HERE]\n\nYou can redeem this code directly in your Account Profile settings.'
    },
    {
      id: 'support_update',
      label: 'Support Ticket Resolution',
      title: 'Support Ticket Status Update',
      content: 'Your support inquiry has been reviewed and resolved. Please let us know if you require any further assistance.'
    }
  ];

  const handleSelectTemplate = (e) => {
    const selectedId = e.target.value;
    const template = MESSAGE_TEMPLATES.find((t) => t.id === selectedId);

    if (template) {
      setTitle(template.title);
      setContent(template.content);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setStatusMsg({ type: '', text: '' });

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `msg_attach_${Date.now()}.${fileExt}`;
      const filePath = `messages/${fileName}`;

      const isVideo = file.type.startsWith('video/');
      setAttachmentType(isVideo ? 'video' : 'image');

      const { error } = await supabase.storage
        .from('vault_media')
        .upload(filePath, file);

      if (error) throw error;

      const { data } = supabase.storage.from('vault_media').getPublicUrl(filePath);
      setAttachmentUrl(data.publicUrl);
      setStatusMsg({ type: 'success', text: 'Attachment uploaded successfully.' });
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'Upload failed: ' + error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });

    if (!selectedUser) {
      setStatusMsg({ type: 'error', text: 'Please select a recipient or broadcast option.' });
      return;
    }
    if (!title.trim() || !content.trim()) {
      setStatusMsg({ type: 'error', text: 'Message title and content fields are required.' });
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase.from('admin_messages').insert([
        {
          user_id: selectedUser === 'ALL' ? null : selectedUser,
          send_to_all: selectedUser === 'ALL',
          title: title.trim(),
          message: content.trim(),
          attachment_url: attachmentUrl.trim() || null,
          attachment_type: attachmentUrl.trim() ? attachmentType : null,
          is_read: false
        }
      ]);

      if (error) throw error;

      setStatusMsg({ type: 'success', text: 'Message dispatched successfully!' });
      setTitle('');
      setContent('');
      setAttachmentUrl('');
      setSelectedUser('');
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'Failed to send message: ' + error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl font-sans">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Compose Admin Message</h1>
        <p className="text-xs text-slate-400 mt-1">
          Dispatch direct messages, account updates, or system-wide announcements to registered users.
        </p>
      </div>

      <form onSubmit={handleSendMessage} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
        
        {/* Status Alert Banner */}
        {statusMsg.text && (
          <div
            className={`p-4 rounded-xl text-xs font-semibold border transition-all ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Recipient Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Target Recipient <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs font-medium focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
          >
            <option value="">-- Select Target User --</option>
            <option value="ALL" className="font-bold text-amber-400">
              📢 BROADCAST TO ALL USERS
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email || 'Unnamed User'} ({u.account_type || 'STANDARD'})
              </option>
            ))}
          </select>
        </div>

        {/* Template Selector */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
          <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider">
            ⚡ Quick Load Preset Template
          </label>
          <select
            onChange={handleSelectTemplate}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
          >
            {MESSAGE_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.label}
              </option>
            ))}
          </select>
        </div>

        {/* Title Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Message Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. VIP Subscription Code Delivery"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>

        {/* Message Body */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Message Content <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write message details or paste code specifications..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-xs focus:outline-none focus:border-red-500 transition-colors resize-none"
          />
        </div>

        {/* Media Attachments */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
          <label className="block text-xs font-semibold text-sky-400 uppercase tracking-wider">
            📎 Media Attachment (Optional)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-8">
              <input
                type="text"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="Paste direct media URL or upload file below"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={attachmentType}
                onChange={(e) => setAttachmentType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                <option value="image">🖼️ Image File</option>
                <option value="video">🎥 Video File</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl border border-slate-700 cursor-pointer transition-all inline-flex items-center gap-2">
              {uploading ? (
                <>
                  <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>
                  Uploading...
                </>
              ) : (
                '📁 Upload Local File'
              )}
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            {attachmentUrl && (
              <button
                type="button"
                onClick={() => setAttachmentUrl('')}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Remove Attachment
              </button>
            )}
          </div>

          {/* Media Preview Box */}
          {attachmentUrl && (
            <div className="mt-3 p-3 bg-slate-900 rounded-xl border border-slate-800">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Attachment Preview</p>
              {attachmentType === 'image' ? (
                <img
                  src={attachmentUrl}
                  alt="Attachment Preview"
                  className="max-h-48 rounded-lg object-contain bg-slate-950"
                />
              ) : (
                <video src={attachmentUrl} controls className="max-h-48 rounded-lg bg-slate-950 w-full" />
              )}
            </div>
          )}
        </div>

        {/* Submit Action Button */}
        <button
          type="submit"
          disabled={sending || uploading}
          className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-bold py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-950/50 text-xs uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
              Dispatching Message...
            </>
          ) : (
            'Dispatch Admin Message ✉️'
          )}
        </button>
      </form>
    </div>
  );
}