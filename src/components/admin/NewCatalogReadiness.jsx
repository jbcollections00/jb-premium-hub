import React from "react";
import {
  DEFAULT_THUMBNAIL_URL,
  handleThumbnailLoadError,
} from "../../services/thumbnailDisplay";

/**
 * Read-only intake summary for a fresh media catalog.
 *
 * IMPORTANT:
 * This component does not inspect video bytes, generate frames, authorize
 * content, upload assets, delete legacy records, or grant public access.
 * Independent content review and server-side authorization remain required.
 */
export default function NewCatalogReadiness({
  existingCount = 0,
  queuedFiles = [],
}) {
  const queue = Array.isArray(queuedFiles) ? queuedFiles : [];
  const coverSelectedCount = queue.filter((item) => Boolean(item?.thumbnailFile)).length;
  const neutralCoverCount = queue.length - coverSelectedCount;

  return (
    <section
      aria-label="New catalog upload readiness"
      className="rounded-2xl border border-sky-400/20 bg-slate-950/60 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <img
          src={DEFAULT_THUMBNAIL_URL}
          onError={handleThumbnailLoadError}
          alt="JB Collections neutral default cover"
          className="aspect-video w-full rounded-lg border border-slate-700 object-cover sm:w-32"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-100">
            Fresh catalog — new upload summary
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            Files without a selected cover show the JB Collections logo.
            Choosing an image does not automatically grant publication approval.
            Automatic video-frame extraction is not enabled.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-amber-200">
            Keep unreviewed media restricted. Suspected exploitative material
            must be handled through authorized child-protection reporting and
            evidence-preservation procedures before permanent deletion.
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-slate-900 p-2">
          <dt className="text-slate-400">Records currently indexed</dt>
          <dd className="mt-1 font-bold text-white">{Number(existingCount).toLocaleString()}</dd>
        </div>
        <div className="rounded-lg bg-slate-900 p-2">
          <dt className="text-slate-400">Selected uploads</dt>
          <dd className="mt-1 font-bold text-white">{queue.length}</dd>
        </div>
        <div className="rounded-lg bg-slate-900 p-2">
          <dt className="text-slate-400">Images selected</dt>
          <dd className="mt-1 font-bold text-white">{coverSelectedCount}</dd>
        </div>
        <div className="rounded-lg bg-slate-900 p-2">
          <dt className="text-slate-400">Default covers expected</dt>
          <dd className="mt-1 font-bold text-white">{neutralCoverCount}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-slate-400">
        Status is informational only. The existing upload endpoint is not
        a verified content-safety approval gate.
      </p>
    </section>
  );
}
