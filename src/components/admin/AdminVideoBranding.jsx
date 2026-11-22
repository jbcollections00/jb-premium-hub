import { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const TYPES = {
  intro: { label: "Intro video (MP4)", mime: "video/mp4", max: 100 * 1024 * 1024 },
  watermark: { label: "Moving watermark (transparent PNG)", mime: "image/png", max: 5 * 1024 * 1024 },
  logo: { label: "Fixed lower-right logo (transparent PNG)", mime: "image/png", max: 5 * 1024 * 1024 },
};
const api = () => {
  const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
  return base ? base + "/api/jb-video-branding" : "/api/jb-video-branding";
};
async function request(action, rest = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Please sign in as administrator.");
  const response = await fetch(api(), {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + data.session.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...rest }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Branding service unavailable.");
  return body;
}
async function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve() : reject(new Error("Private asset upload failed (HTTP " + xhr.status + ")."));
    xhr.onerror = () => reject(new Error("R2 upload failed. Check private bucket CORS."));
    xhr.onabort = () => reject(new Error("Upload canceled."));
    xhr.send(file);
  });
}
export default function AdminVideoBranding() {
  const [settings, setSettings] = useState(null);
  const [assets, setAssets] = useState({});
  const [previews, setPreviews] = useState({});
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    setErrorText("");
    try {
      const result = await request("get");
      setSettings(result.settings);
      setAssets({
        intro: result.settings?.intro || "",
        watermark: result.settings?.watermark || "",
        logo: result.settings?.logo || "",
      });
      setPreviews(result.previews || {});
    } catch (error) {
      setErrorText(error.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  async function upload(kind, file) {
    if (!file || busy) return;
    const spec = TYPES[kind];
    const expectedExtension = kind === "intro" ? ".mp4" : ".png";
    if (!file.name.toLowerCase().endsWith(expectedExtension) ||
        file.type !== spec.mime || file.size < 1 || file.size > spec.max) {
      setErrorText("Use a valid " + spec.label + " under " + Math.round(spec.max / 1024 / 1024) + " MB.");
      return;
    }
    setBusy(kind); setProgress(0); setErrorText(""); setMessage("");
    try {
      const begin = await request("begin", { kind, fileSize: file.size });
      await putWithProgress(begin.uploadUrl, file, begin.contentType, setProgress);
      await request("complete", { kind, key: begin.key, fileSize: file.size });
      setAssets((prev) => ({ ...prev, [kind]: begin.key }));
      // Only locally selected files change until 'Save branding configuration'.
      // A browser object URL is not persisted as a stored asset.
      setMessage(spec.label + " uploaded privately. Save settings to activate it.");
    } catch (error) { setErrorText(error.message); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!settings || busy) return;
    if (Object.keys(TYPES).some((key) => !assets[key])) {
      setErrorText("Upload intro, watermark and logo before saving."); return;
    }
    setBusy("save"); setErrorText(""); setMessage("");
    try {
      await request("activate", { assets, expectedVersion: settings.version });
      setMessage("Branding settings saved in private R2. Video reprocessing and VIP download integration are not activated yet.");
      await refresh();
    } catch (error) { setErrorText(error.message); }
    finally { setBusy(""); }
  }
  return (
    <section className="space-y-5 p-3 sm:p-5 text-slate-100" aria-label="Video branding settings">
      <div>
        <h2 className="text-xl font-bold">Video Branding</h2>
        <p className="text-sm text-slate-300 mt-2">Upload one official intro, moving watermark, and fixed logo. Originals stay unchanged. Configure assets here before server-side video processing is enabled.</p>
      </div>
      {loading && <p role="status">Loading private branding configuration...</p>}
      {errorText && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-950/40 p-3 text-rose-200">{errorText}</p>}
      {message && <p role="status" className="rounded-lg border border-sky-400/30 p-3 text-sky-200">{message}</p>}
      {settings && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {Object.entries(TYPES).map(([kind, spec]) => (
              <div key={kind} className="rounded-xl border border-slate-600/50 bg-slate-800/60 p-4 space-y-3 min-w-0">
                <h3 className="font-bold text-sm">{spec.label}</h3>
                <p className="text-xs text-slate-400">{assets[kind] ? "Private asset selected" : "No asset uploaded"}</p>
                {previews[kind] && settings[kind] === assets[kind] && (
                  kind === "intro"
                    ? <video src={previews[kind]} controls preload="metadata" className="w-full max-h-48 rounded-md bg-black" />
                    : <img src={previews[kind]} alt={spec.label} className="max-h-40 mx-auto object-contain" />
                )}
                <label className="block text-sm font-semibold">
                  Select new {kind} file
                  <input
                    type="file" accept={kind === "intro" ? ".mp4,video/mp4" : ".png,image/png"}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) upload(kind, file);
                    }}
                    className="mt-2 block w-full min-w-0 text-xs file:rounded-md file:border-0 file:px-3 file:py-2 file:bg-sky-500 file:text-white"
                  />
                </label>
                {busy === kind && <div role="status" className="text-sm">Uploading: {progress}%<progress className="block w-full" max="100" value={progress}/></div>}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-600/50 p-4 space-y-3">
            <p className="text-sm">Rules: Intro first (no overlays); then moving watermark strictly inside portrait/landscape content and fixed logo lower-right. Clean thumbnail comes directly from the original main video.</p>
            <p className="text-xs text-slate-400">Current version: {settings.version} · Updated: {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : "Never"}</p>
            <button type="button" disabled={Boolean(busy)} onClick={save}
              className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">
              {busy === "save" ? "Saving..." : "Save branding configuration"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
