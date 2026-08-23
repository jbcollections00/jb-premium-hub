import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AdminMessagesTab({ users = [] }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentType, setAttachmentType] = useState('image'); // 'image' or 'video'
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  // 📝 PRESET AUTOMATED TEMPLATES (Manual Broadcasts / Updates Only)
  const MESSAGE_TEMPLATES = [
    {
      id: 'custom',
      label: '✍️ Custom Message (Blank)',
      title: '',
      content: ''
    },
    {
      id: 'new_content',
      label: '🍿 New Content Drop Alert',
      title: '🍿 New Exclusive Content Available in Vault!',
      content: 'Fresh high-quality content has just been uploaded to the Vault! Check it out now while it is hot.'
    },
    {
      id: 'new_code',
      label: '🔑 Monthly Code Distribution',
      title: '🔑 Your New Monthly VIP Access Code',
      content: 'Here is your new VIP Access Code for this month. Please copy and redeem it in your profile settings to extend your membership:'
    },
    {
      id: 'support_update',
      label: '🛠️ Support Ticket Resolution',
      title: '🛠️ Support Ticket Update',
      content: 'We have reviewed and resolved your submitted support ticket. Thank you for your patience and cooperation.'
    }
  ];

  // Template Selector Handler
  const handleSelectTemplate = (e) => {
    const selectedId = e.target.value;
    const template = MESSAGE_TEMPLATES.find((t) => t.id === selectedId);

    if (template) {
      setTitle(template.title);
      setContent(template.content);
    }
  };

  // File Upload Handler (Supabase Storage)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `msg_attach_${Date.now()}.${fileExt}`;
    const filePath = `messages/${fileName}`;

    if (file.type.startsWith('video/')) {
      setAttachmentType('video');
    } else {
      setAttachmentType('image');
    }

    const { error } = await supabase.storage
      .from('vault_media')
      .upload(filePath, file);

    if (error) {
      alert('Upload Error: ' + error.message);
    } else {
      const { data } = supabase.storage.from('vault_media').getPublicUrl(filePath);
      setAttachmentUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedUser) {
      alert('Please select a recipient first.');
      return;
    }
    if (!title.trim() || !content.trim()) {
      alert('Please enter both Title and Message content.');
      return;
    }

    setSending(true);

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

    if (error) {
      alert('Error sending message: ' + error.message);
    } else {
      alert('✅ Message sent successfully!');
      setTitle('');
      setContent('');
      setAttachmentUrl('');
      setSelectedUser('');
    }

    setSending(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Compose Admin Message</h1>
        <p className="text-xs text-gray-400 mt-1">
          Send announcements, warnings, or direct updates with automated templates and media attachments.
        </p>
      </div>

      <form onSubmit={handleSendMessage} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-5">
        {/* RECIPIENT SELECTOR */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Send To (Select User):
          </label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs font-medium focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="">-- Select Recipient --</option>
            <option value="ALL">📢 BROADCAST TO ALL USERS</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email || 'Unnamed User'} ({u.account_type || 'STANDARD'})
              </option>
            ))}
          </select>
        </div>

        {/* AUTOMATED TEMPLATE SELECTOR */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800">
          <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
            ⚡ Quick Load Preset Template:
          </label>
          <select
            onChange={handleSelectTemplate}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-xs font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {MESSAGE_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.label}
              </option>
            ))}
          </select>
        </div>

        {/* TITLE */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Message Title:</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. You have been upgraded to VIP!"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-red-500"
          />
        </div>

        {/* MESSAGE CONTENT */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Message Content:
          </label>
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your message here..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-white text-xs focus:outline-none focus:border-red-500 resize-none"
          />
        </div>

        {/* ATTACHMENT SECTION */}
        <div className="space-y-3 bg-gray-800/30 p-4 rounded-xl border border-gray-800">
          <label className="block text-xs font-bold text-sky-400 uppercase tracking-wider">
            📎 Media Attachment (Optional)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-8">
              <input
                type="text"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="Paste Direct Image/Video URL or Upload File below"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={attachmentType}
                onChange={(e) => setAttachmentType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none cursor-pointer"
              >
                <option value="image">🖼️ Image</option>
                <option value="video">🎥 Video</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-2 rounded-xl border border-gray-700 cursor-pointer transition-all">
              {uploading ? 'Uploading...' : '📁 Choose File to Upload'}
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
                className="text-xs text-rose-400 hover:underline cursor-pointer"
              >
                Remove Attachment
              </button>
            )}
          </div>

          {/* MEDIA PREVIEW */}
          {attachmentUrl && (
            <div className="mt-3 p-3 bg-gray-900 rounded-xl border border-gray-800">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Attachment Preview:</p>
              {attachmentType === 'image' ? (
                <img
                  src={attachmentUrl}
                  alt="Attachment Preview"
                  className="max-h-48 rounded-lg object-contain bg-black"
                />
              ) : (
                <video src={attachmentUrl} controls className="max-h-48 rounded-lg bg-black w-full" />
              )}
            </div>
          )}
        </div>

        {/* SUBMIT BUTTON */}
        <button
          type="submit"
          disabled={sending || uploading}
          className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white font-bold py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-600/20 text-sm"
        >
          {sending ? 'Sending Message...' : 'Send Message 📩'}
        </button>
      </form>
    </div>
  );
}