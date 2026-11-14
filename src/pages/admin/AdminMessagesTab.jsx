import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AdminMessagesTab({ users = [] }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
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
      label: 'New content release',
      title: 'New media available',
      content: 'New media is available on JB Premium Hub. Sign in to explore the latest uploads.'
    },
    {
      id: 'new_code',
      label: 'Access code delivery',
      title: 'Your VIP Access Code',
      content: 'Here is your access code:\n\n[INSERT_CODE_HERE]\n\nYou can redeem your code from My account. If you paid with PayMongo, your membership activates automatically after payment confirmation.'
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

      const { error: uploadError } = await supabase.storage
        .from('vault_media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Store only the private Storage object path in the database.
      setAttachmentUrl(filePath);

      // Generate a short-lived signed URL only for the admin preview.
      const { data: signedData, error: signedError } = await supabase.storage
        .from('vault_media')
        .createSignedUrl(filePath, 600);

      if (signedError) throw signedError;

      setAttachmentPreviewUrl(signedData?.signedUrl || '');
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
      setAttachmentPreviewUrl('');
      setSelectedUser('');
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'Failed to send message: ' + error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="jbh-admin-page space-y-6">
      <header className="jbh-admin-page-head">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-100">Communication</p>
        <h1 className="mt-2">Messages & announcements</h1>
        <p className="mt-2 text-sm">Send announcements, updates and direct messages to members.</p>
      </header>

      <form onSubmit={handleSendMessage} className="jbh-admin-panel space-y-6 p-5 sm:p-7">
        
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
            className="jbh-admin-input w-full px-4 py-3 text-sm"
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
        <div className="jbh-admin-muted-panel space-y-3 p-4">
          <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider">
            ⚡ Quick Load Preset Template
          </label>
          <select
            onChange={handleSelectTemplate}
            className="jbh-admin-input w-full px-4 py-2.5 text-sm"
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
            placeholder="e.g. New media update"
            className="jbh-admin-input w-full px-4 py-3 text-sm"
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
            placeholder="Write your announcement or member message..."
            className="jbh-admin-input w-full p-4 text-sm resize-y"
          />
        </div>

        {/* Media Attachments */}
        <div className="jbh-admin-muted-panel space-y-3 p-4">
          <label className="block text-xs font-semibold text-sky-400 uppercase tracking-wider">
            📎 Media Attachment (Optional)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-8">
              <input
                type="text"
                value={attachmentUrl}
                onChange={(e) => {
                  const value = e.target.value;
                  setAttachmentUrl(value);

                  // Direct external URLs can preview directly.
                  // Private Storage paths should be created through the upload button.
                  setAttachmentPreviewUrl(
                    /^https?:\/\//i.test(value.trim()) ? value.trim() : ''
                  );
                }}
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
                onClick={() => {
                  setAttachmentUrl('');
                  setAttachmentPreviewUrl('');
                }}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Remove Attachment
              </button>
            )}
          </div>

          {/* Media Preview Box */}
          {attachmentUrl && (
            <div className="mt-3 p-3 bg-slate-900 rounded-xl border border-slate-800">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">
                Attachment Preview
              </p>

              {attachmentPreviewUrl ? (
                attachmentType === 'image' ? (
                  <img
                    src={attachmentPreviewUrl}
                    alt="Attachment Preview"
                    className="max-h-48 rounded-lg object-contain bg-slate-950"
                  />
                ) : (
                  <video
                    src={attachmentPreviewUrl}
                    controls
                    className="max-h-48 rounded-lg bg-slate-950 w-full"
                  />
                )
              ) : (
                <p className="text-[11px] text-slate-500">
                  Private Storage path saved. Upload a file here to generate a secure preview,
                  or paste a direct external URL.
                </p>
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
