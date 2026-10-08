import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CHAT_PREFERENCES,
  resetChatPreferences,
  updateChatPreferences,
} from "../../services/chatService";

function ToggleRow({ title, description, checked, onChange, disabled = false }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="mt-1 text-xs text-gray-500">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 accent-blue-600"
      />
    </label>
  );
}

export default function ChatPreferencesPanel({
  isOpen,
  onClose,
  preferences,
  onPreferencesChange,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const [draft, setDraft] = useState({
    ...DEFAULT_CHAT_PREFERENCES,
    ...preferences,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft({
      ...DEFAULT_CHAT_PREFERENCES,
      ...preferences,
    });
    setError("");
    setSaved(false);
  }, [isOpen, preferences]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement;
    closeButtonRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateField = (key, value) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      const updated = await updateChatPreferences(draft);
      setDraft(updated);
      onPreferencesChange?.(updated);
      setSaved(true);
    } catch (err) {
      setError(err?.message || "Unable to save chat preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      setError("");
      const reset = await resetChatPreferences();
      setDraft(reset);
      onPreferencesChange?.(reset);
      setSaved(true);
    } catch (err) {
      setError(err?.message || "Unable to reset chat preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      aria-label="Chat preferences"
      className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Chat preferences" className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-gray-50 shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Chat Preferences</h2>
            <p className="text-xs text-gray-500">Personalize chat for your account.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close chat preferences" className="h-9 w-9 rounded-full hover:bg-gray-100">✕</button>
        </div>

        <div className="space-y-4 p-5">
          {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {saved && <div role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Preferences saved.</div>}

          <section>
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Message density</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["comfortable", "Comfortable", "More space between messages"],
                ["compact", "Compact", "Fit more messages on screen"],
              ].map(([id, label, description]) => (
                <button
                  key={id}
                  type="button"
                  disabled={saving}
                  onClick={() => updateField("chat_density", id)}
                  className={`rounded-xl border p-3 text-left ${
                    draft.chat_density === id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="text-sm font-bold text-gray-900">{label}</div>
                  <div className="mt-1 text-[11px] text-gray-500">{description}</div>
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Message font size">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Message font size</div>
            <div className="grid grid-cols-3 gap-2">
              {[["small", "Small"], ["medium", "Medium"], ["large", "Large"]].map(([value, label]) => (
                <button key={value} type="button" disabled={saving}
                  aria-pressed={draft.message_font_size === value}
                  onClick={() => updateField("message_font_size", value)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${draft.message_font_size === value ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </section>
          <section aria-label="Message text line spacing">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Message text line spacing</div>
            <p className="mb-2 text-xs text-gray-500">Adjust spacing between lines inside a message, not between separate messages.</p>
            <div className="grid grid-cols-3 gap-2">
              {[["tight", "Tight"], ["normal", "Normal"], ["relaxed", "Relaxed"]].map(([value, label]) => (
                <button key={value} type="button" disabled={saving}
                  aria-pressed={draft.message_line_spacing === value}
                  onClick={() => updateField("message_line_spacing", value)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${draft.message_line_spacing === value ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </section>
          <section aria-label="Outgoing message color">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Your message bubble color</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["blue", "Blue", "bg-blue-600"],
                ["emerald", "Green", "bg-emerald-700"],
                ["violet", "Purple", "bg-violet-700"],
                ["slate", "Slate", "bg-slate-700"],
              ].map(([value, label, color]) => (
                <button key={value} type="button" disabled={saving}
                  aria-pressed={draft.bubble_color === value}
                  onClick={() => updateField("bubble_color", value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${draft.bubble_color === value ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                  <span aria-hidden="true" className={`h-7 w-7 rounded-full ${color}`} />
                  {label}
                </button>
              ))}
            </div>
          </section>
          <section aria-label="Message bubble shape">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Message bubble shape</div>
            <div className="grid grid-cols-3 gap-2">
              {[["rounded", "Rounded", "rounded-2xl"], ["soft", "Soft", "rounded-xl"], ["square", "Square", "rounded-md"]].map(([value, label, shape]) => (
                <button key={value} type="button" disabled={saving}
                  aria-pressed={draft.bubble_shape === value}
                  onClick={() => updateField("bubble_shape", value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${draft.bubble_shape === value ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                  <span aria-hidden="true" className={`h-7 w-12 bg-blue-600 ${shape}`} />
                  {label}
                </button>
              ))}
            </div>
          </section>
          <ToggleRow title="Show date separators" description="Show Today, Yesterday and calendar date labels between days. Messages remain in chronological order." checked={draft.show_date_separators} disabled={saving} onChange={(v) => updateField("show_date_separators", v)} />
          <ToggleRow title="Show pinned indicators" description="Display the small pin symbol on pinned messages. Pinning and the pinned-message bar remain available." checked={draft.show_pinned_indicators} disabled={saving} onChange={(v) => updateField("show_pinned_indicators", v)} />
          <ToggleRow title="Show reaction badges" description="Display emoji reactions beneath messages. Reactions remain available through the message actions menu." checked={draft.show_reaction_badges} disabled={saving} onChange={(v) => updateField("show_reaction_badges", v)} />
          <ToggleRow title="Show reaction counts" description="Display the total next to each reaction emoji. Reactions remain visible and interactive." checked={draft.show_reaction_counts} disabled={saving} onChange={(v) => updateField("show_reaction_counts", v)} />
          <ToggleRow title="Show attachment previews" description="Show inline image and video previews in messages. Files remain available to open or download." checked={draft.show_attachment_previews} disabled={saving} onChange={(v) => updateField("show_attachment_previews", v)} />
          <ToggleRow title="Highlight mentions" description="Highlight messages that mention you, including the mention badge. Mention notifications and search remain unchanged." checked={draft.highlight_mentions} disabled={saving} onChange={(v) => updateField("highlight_mentions", v)} />
          <ToggleRow title="Show attachment file sizes" description="Display file sizes beside attachments in chat and in image previews." checked={draft.show_attachment_file_sizes} disabled={saving} onChange={(v) => updateField("show_attachment_file_sizes", v)} />
          <ToggleRow title="Show reply previews" description="Display a preview of the original message above replies. Reply links and message history remain unchanged." checked={draft.show_reply_previews} disabled={saving} onChange={(v) => updateField("show_reply_previews", v)} />
          <ToggleRow title="Show edited labels" description="Display an Edited marker for messages that were changed after sending." checked={draft.show_edited_labels} disabled={saving} onChange={(v) => updateField("show_edited_labels", v)} />
          <ToggleRow title="Show sender avatars" description="Show profile pictures beside other people’s messages in groups, channels and communities. Direct chats are unchanged." checked={draft.show_sender_avatars} disabled={saving} onChange={(v) => updateField("show_sender_avatars", v)} />
          <ToggleRow title="Show sender names" description="Display sender names in group, channel and community chats. Direct chats are unchanged." checked={draft.show_sender_names} disabled={saving} onChange={(v) => updateField("show_sender_names", v)} />
          <section aria-label="Message time format">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Message time format</div>
            <div className="grid grid-cols-3 gap-2">
              {[["system", "System"], ["12h", "12-hour"], ["24h", "24-hour"]].map(([value, label]) => (
                <button key={value} type="button" disabled={saving} aria-pressed={draft.message_time_format === value}
                  onClick={() => updateField("message_time_format", value)}
                  className={`rounded-xl border px-2 py-3 text-sm font-semibold ${draft.message_time_format === value ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">Controls the clock format under messages, not stored timestamps or message order.</p>
          </section>
          <ToggleRow title="Show message times" description="Display a time beneath individual chat messages." checked={draft.show_message_timestamps} disabled={saving} onChange={(v) => updateField("show_message_timestamps", v)} />

          <ToggleRow title="Enter to send" description="Enter sends; Shift+Enter adds a new line." checked={draft.enter_to_send} disabled={saving} onChange={(v) => updateField("enter_to_send", v)} />
          <ToggleRow title="Show read receipts" description="Show Sent / Seen beneath your messages." checked={draft.show_read_receipts} disabled={saving} onChange={(v) => updateField("show_read_receipts", v)} />
          <ToggleRow title="Typing indicators" description="Show and publish typing activity." checked={draft.show_typing_indicator} disabled={saving} onChange={(v) => updateField("show_typing_indicator", v)} />
          <ToggleRow title="Reduce motion" description="Use instant jumps and fewer transitions." checked={draft.reduce_motion} disabled={saving} onChange={(v) => updateField("reduce_motion", v)} />

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
            <button type="button" disabled={saving} onClick={handleReset} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-bold">Reset defaults</button>
            <button type="button" disabled={saving} onClick={handleSave} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">
              {saving ? "Saving..." : "Save preferences"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
