import React from "react";
import { DEFAULT_THUMBNAIL_URL, handleThumbnailLoadError } from "../../services/thumbnailDisplay";
import { getAlbumCoverStyle, getApprovedAlbumCoverUrl } from "../../services/albumArtwork";

/**
 * Album artwork is separate from private video thumbnails.
 * Only separately cleared static assets on public-assets/album-covers are
 * accepted; otherwise show the JB Collections neutral logo.
 */
export default function AlbumCover({ album, className = "", imageClassName = "" }) {
  const style = getAlbumCoverStyle(album?.cover_style);
  const approvedArtwork = getApprovedAlbumCoverUrl(album?.cover_image_url);

  return (
    <div className={\`relative aspect-video overflow-hidden bg-gradient-to-br \${style.gradient} \${className}\`}>
      {approvedArtwork ? (
        <img
          src={approvedArtwork}
          onError={handleThumbnailLoadError}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={\`absolute inset-0 h-full w-full object-cover \${imageClassName}\`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-7">
          <img
            src={DEFAULT_THUMBNAIL_URL}
            onError={handleThumbnailLoadError}
            alt=""
            loading="lazy"
            className="h-full max-h-28 w-full object-contain opacity-85"
          />
        </div>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}
