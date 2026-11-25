import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  supabase,
} from "../../services/supabaseClient";

import {
  createR2UploadUrl,
  uploadFileToR2,
} from "../../services/r2Client";

import { FREE_PREVIEW_UI_ENABLED } from "../../services/freePreview";
import { DEFAULT_THUMBNAIL_URL, getThumbnailDisplayUrl, handleThumbnailLoadError } from "../../services/thumbnailDisplay";
import AdminPrivateAlbumUpload from "../../components/admin/AdminPrivateAlbumUpload";
import AdminPublishingReview from "../../components/admin/AdminPublishingReview";
import AdminR2OrphanAudit from "../../components/admin/AdminR2OrphanAudit";
import AdminR2CleanupQueue from "../../components/admin/AdminR2CleanupQueue";

export default function AdminMediaTab() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("upload");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  const [
    mediaList,
    setMediaList,
  ] = useState([]);

  const [
    totalMediaCount,
    setTotalMediaCount,
  ] = useState(0);

  const [freePreviewUpdatingId, setFreePreviewUpdatingId] = useState(null);
  const [freePreviewMessage, setFreePreviewMessage] = useState("");
  const selectedFreeCount = mediaList.filter((item) => item.is_free_preview === true).length;
  const FREE_PREVIEW_MAX = 20;

  const [
    thumbnailUploadingId,
    setThumbnailUploadingId,
  ] = useState(null);

  /* =========================================================
     SEARCH / EDIT / PAGINATION
  ========================================================= */

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    editingId,
    setEditingId,
  ] = useState(null);

  const [
    editTitle,
    setEditTitle,
  ] = useState("");

  const [
    copiedId,
    setCopiedId,
  ] = useState(null);

  const [
    showDuplicatesOnly,
    setShowDuplicatesOnly,
  ] = useState(false);

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  // 50 member-library records per admin page; selection is restricted to the visible page.
  const itemsPerPage = 50;
  const [selectedMediaIds, setSelectedMediaIds] = useState([]);
  const [deletingPublishedMedia, setDeletingPublishedMedia] = useState(false);
  const [deleteResultMessage, setDeleteResultMessage] = useState("");

  /* =========================================================
     IGNORED DUPLICATES
  ========================================================= */

  const [
    ignoredDuplicates,
    setIgnoredDuplicates,
  ] = useState(() => {
    try {
      const saved =
        localStorage.getItem(
          "vault_ignored_duplicates"
        );

      return saved
        ? JSON.parse(saved)
        : [];
    } catch {
      return [];
    }
  });

  /* =========================================================
     CDN URL HELPER
  ========================================================= */

  const getCdnUrl = (url) => {
    if (!url) {
      return "";
    }

    return url.replace(
      /pub-[a-f0-9]+\.r2\.dev/g,
      "cdn.jb-premium-hub.vip"
    );
  };

  /* =========================================================
     LOAD
  ========================================================= */

  useEffect(() => {
    fetchMedia();
    if (activeTab !== "files") setMaintenanceOpen(false);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(
      "vault_ignored_duplicates",
      JSON.stringify(
        ignoredDuplicates
      )
    );
  }, [
    ignoredDuplicates,
  ]);

  useEffect(() => {
    setCurrentPage(
      1
    );
  }, [
    searchQuery,
    showDuplicatesOnly,
  ]);

  // Never keep invisible selected items when changing page, filters or tabs.
  useEffect(() => {
    setSelectedMediaIds([]);
    setDeleteResultMessage("");
  }, [currentPage, searchQuery, showDuplicatesOnly, activeTab]);

  /* =========================================================
     FETCH MEDIA
  ========================================================= */

  const fetchMedia =
    async () => {
      const batchSize = 1000;
      try {
        const allMedia = [];
        let total = null;
        let offset = 0;

        // Supabase's default PostgREST row cap is 1,000. Fetch the complete
        // library in pages so filters, duplicate review, and cover counts
        // are based on all records rather than only the first page.
        for (;;) {
          const { data, count, error } = await supabase
            .from("media")
            .select("*", { count: offset === 0 ? "exact" : undefined })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + batchSize - 1);

          if (error) throw error;
          if (offset === 0) total = count;

          const rows = data || [];
          allMedia.push(...rows);
          offset += rows.length;

          if (rows.length < batchSize || (total !== null && offset >= total)) {
            break;
          }
        }

        setMediaList(allMedia);
        setTotalMediaCount(total ?? allMedia.length);
      } catch (error) {
        console.error("Failed to load complete media library:", error);
        // Do not imply that a partial load represents the complete catalog.
        setMediaList([]);
        setTotalMediaCount(0);
        window.alert("Could not load the media library. Please refresh and try again.");
      }
    };

  // Admin-controlled free videos. Database RPC + trigger enforce the
  // 20-video maximum atomically, even across multiple concurrent admins.
  const handleToggleFreePreview = async (item) => {
    if (!FREE_PREVIEW_UI_ENABLED || !item?.id || freePreviewUpdatingId) return;
    const enabled = item.is_free_preview !== true;
    setFreePreviewUpdatingId(item.id);
    setFreePreviewMessage("");
    try {
      const { data, error } = await supabase.rpc("jb_set_media_free_preview_v1", {
        p_media_id: item.id, p_enabled: enabled,
      });
      if (error) throw error;
      if (!data || data.id !== item.id || data.is_free_preview !== enabled) {
        throw new Error("Unable to confirm Free to Watch selection");
      }
      setMediaList((prev) => prev.map((row) =>
        row.id === item.id ? { ...row, is_free_preview: enabled } : row
      ));
      setFreePreviewMessage(
        enabled ? `Added "${item.title}" to Free to Watch.` : `Removed "${item.title}" from Free to Watch.`
      );
    } catch (error) {
      console.error("Free-preview selection unavailable:", error?.code || "ERROR");
      setFreePreviewMessage(error?.message?.includes("Maximum of 20")
        ? "The maximum of 20 free videos has been reached. Remove one before adding another."
        : "Could not change Free to Watch selection. Please check administrator permissions and setup.");
    } finally {
      setFreePreviewUpdatingId(null);
    }
  };

  /* =========================================================
     DUPLICATES
  ========================================================= */

  const normalizeTitle = (
    title
  ) => {
    if (!title) {
      return "";
    }

    return title
      .toLowerCase()
      .replace(
        /\.[^/.]+$/,
        ""
      )
      .replace(
        /\(\d+\)/g,
        ""
      )
      .replace(
        /_\d+/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  };

  const duplicateGroups =
    useMemo(
      () => {
        const groups =
          {};

        mediaList.forEach(
          (item) => {
            const cleanKey =
              normalizeTitle(
                item.title
              );

            if (
              !cleanKey
            ) {
              return;
            }

            if (
              searchQuery &&
              !item.title
                ?.toLowerCase()
                .includes(
                  searchQuery.toLowerCase()
                )
            ) {
              return;
            }

            if (
              !groups[
                cleanKey
              ]
            ) {
              groups[
                cleanKey
              ] =
                [];
            }

            groups[
              cleanKey
            ].push(
              item
            );
          }
        );

        return Object.entries(
          groups
        )
          .filter(
            ([
              cleanTitle,
              items,
            ]) =>
              items.length >
                1 &&
              !ignoredDuplicates.includes(
                cleanTitle
              )
          )
          .map(
            ([
              cleanTitle,
              items,
            ]) => ({
              cleanTitle,
              items,
            })
          );
      },
      [
        mediaList,
        ignoredDuplicates,
        searchQuery,
      ]
    );

  const totalDuplicatesCount =
    useMemo(
      () =>
        duplicateGroups.reduce(
          (
            acc,
            group
          ) =>
            acc +
            (
              group.items
                .length -
              1
            ),
          0
        ),
      [
        duplicateGroups,
      ]
    );

  const handleMarkGroupAsOk = (
    cleanTitle
  ) => {
    setIgnoredDuplicates(
      (previous) =>
        Array.from(
          new Set([
            ...previous,
            cleanTitle,
          ])
        )
    );
  };

  const handleResetIgnored =
    () => {
      if (
        window.confirm(
          "Gusto mo bang ibalik sa duplicates list ang lahat ng marked as OK?"
        )
      ) {
        setIgnoredDuplicates(
          []
        );
      }
    };

  /* =========================================================
     SECURE THUMBNAIL UPLOAD

     Browser asks server for signed URL.
     Browser then uploads directly to R2.
     No AWS credentials in frontend.
  ========================================================= */

  const uploadThumbnailToR2 =
    async (
      file,
      baseName = "thumbnail"
    ) => {
      if (!file) {
        return null;
      }

      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase() ||
        "jpg";

      const safeBaseName =
        String(
          baseName ||
            "thumbnail"
        ).replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        );

      const uploadInfo =
        await createR2UploadUrl({
          fileName:
            `${safeBaseName}.${extension}`,

          contentType:
            file.type ||
            "image/jpeg",

          fileSize:
            file.size,

          folder:
            "thumbnails",
        });

      await uploadFileToR2({
        file,

        uploadUrl:
          uploadInfo.uploadUrl,
      });

      return uploadInfo.publicUrl;
    };

  /* =========================================================
     MISSING THUMBNAILS
  ========================================================= */

  const missingThumbnailCount =
    useMemo(
      () =>
        mediaList.filter(
          (item) =>
            !item.thumbnail_url
        ).length,
      [
        mediaList,
      ]
    );

  /* =========================================================
     EXISTING THUMBNAIL UPLOAD
  ========================================================= */

  const handleExistingThumbnailUpload =
    async (
      item,
      file
    ) => {
      if (
        !item?.id ||
        !file
      ) {
        return;
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

      const maxSize =
        5 *
        1024 *
        1024;

      if (
        !allowedTypes.includes(
          file.type
        )
      ) {
        alert(
          "Thumbnail must be JPEG, PNG, or WEBP."
        );

        return;
      }

      if (
        file.size >
        maxSize
      ) {
        alert(
          "Thumbnail must be 5 MB or smaller."
        );

        return;
      }

      setThumbnailUploadingId(
        item.id
      );

      try {
        const thumbnailUrl =
          await uploadThumbnailToR2(
            file,
            "vault"
          );

        const {
          error,
        } =
          await supabase
            .from(
              "media"
            )
            .update({
              thumbnail_url:
                thumbnailUrl,
            })
            .eq(
              "id",
              item.id
            );

        if (error) {
          throw error;
        }

        await fetchMedia();
      } catch (error) {
        console.error(
          "Thumbnail upload failed:",
          error
        );

        alert(
          "Failed to update thumbnail: " +
            (
              error?.message ||
              "Unknown error"
            )
        );
      } finally {
        setThumbnailUploadingId(
          null
        );
      }
    };

  /* =========================================================
     DEFAULT COVER
  ========================================================= */

  const handleUseDefaultCover =
    async (
      item
    ) => {
      if (!item?.id) {
        return;
      }

      setThumbnailUploadingId(
        item.id
      );

      try {
        const {
          error,
        } =
          await supabase
            .from(
              "media"
            )
            .update({
              thumbnail_url: null,
            })
            .eq(
              "id",
              item.id
            );

        if (error) {
          throw error;
        }

        await fetchMedia();
      } catch (error) {
        console.error(
          "Default cover update failed:",
          error
        );

        alert(
          "Failed to apply default cover: " +
            (
              error?.message ||
              "Unknown error"
            )
        );
      } finally {
        setThumbnailUploadingId(
          null
        );
      }
    };

  /* =========================================================
     EDIT TITLE
  ========================================================= */

  const handleStartEdit =
    (
      item
    ) => {
      setEditingId(
        item.id
      );

      setEditTitle(
        item.title
      );
    };

  const handleSaveTitle =
    async (
      id
    ) => {
      if (
        !editTitle.trim()
      ) {
        return;
      }

      const {
        error,
      } =
        await supabase
          .from(
            "media"
          )
          .update({
            title:
              editTitle.trim(),
          })
          .eq(
            "id",
            id
          );

      if (error) {
        alert(
          "Failed to update title: " +
            error.message
        );
      } else {
        setEditingId(
          null
        );

        fetchMedia();
      }
    };

  /* =========================================================
     ADMIN-ONLY MEDIA DELETION (SINGLE / BULK)
     Atomic database deletion + trusted private-R2 cleanup.
     Never delete a media row directly: published videos have
     ON DELETE RESTRICT publication links.
  ========================================================= */

  const handleDeleteMediaBatch = async (mediaIds, bulk = false) => {
    if (deletingPublishedMedia || !Array.isArray(mediaIds) || !mediaIds.length) return;
    const visibleIds = new Set(
      showDuplicatesOnly
        ? duplicateGroups.flatMap((group) => group.items).map((item) => item.id)
        : paginatedMedia.map((item) => item.id)
    );
    const uniqueIds = [...new Set(mediaIds)];
    if (uniqueIds.some((id) => !visibleIds.has(id))) {
      setDeleteResultMessage("Selection changed. Refresh or select videos on the current page.");
      return;
    }

    if (!window.confirm(
      "Permanently delete " + uniqueIds.length + " SELECTED published video(s) from the member library? " +
      "This removes their publication, comments, reactions and view history. " +
      "Linked private R2 files will be cleaned up. THIS CANNOT BE UNDONE."
    )) return;

    if (bulk && window.prompt(
      "To confirm BULK deletion, type DELETE " + uniqueIds.length + " exactly:"
    ) !== "DELETE " + uniqueIds.length) return;

    setDeletingPublishedMedia(true);
    setDeleteResultMessage("");
    let deletedCount = 0;
    const warnings = [];
    try {
      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionResult?.session?.access_token) {
        throw new Error("Admin session expired. Sign in again.");
      }
      const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
      const endpoint = (base ? base : "") + "/api/jb-admin-staging-upload";
      // Keep the synchronous R2 cleanup requests below serverless time limits.
      for (let i = 0; i < uniqueIds.length; i += 10) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + sessionResult.session.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "delete-published-media",
            mediaIds: uniqueIds.slice(i, i + 10),
            confirmDeletion: true,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Media deletion rejected.");
        const deleted = Array.isArray(result.deleted) ? result.deleted : [];
        deletedCount += deleted.length;
        if (Array.isArray(result.cleanupPending) && result.cleanupPending.length) {
          warnings.push(result.cleanupPending.length + " R2 cleanup(s) queued for automatic retry");
        }
        if (Array.isArray(result.legacyStorageUnchanged) && result.legacyStorageUnchanged.length) {
          warnings.push(result.legacyStorageUnchanged.length + " legacy/external storage object(s) untouched");
        }
      }
      setDeleteResultMessage(
        deletedCount + " selected video(s) removed from the member library." +
        (warnings.length ? " Note: " + warnings.join("; ") + "." : "")
      );
    } catch (error) {
      setDeleteResultMessage(
        "Deletion stopped after " + deletedCount + " video(s): " +
        (error.message || "Unknown error") + ". Refresh the library before trying again."
      );
    } finally {
      setSelectedMediaIds([]);
      setDeletingPublishedMedia(false);
      await fetchMedia();
    }
  };

  const handleDeleteMedia = async (id) => handleDeleteMediaBatch([id], false);

  /* =========================================================
     AUTO CLEAN DUPLICATES
  ========================================================= */

  const handleAutoCleanDuplicates = async () => {
    if (deletingPublishedMedia || !duplicateGroups.length) return;
    const ids = [];
    for (const group of duplicateGroups) {
      // Preserve the most recently created item in each duplicate group.
      const copies = [...group.items].sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      ids.push(...copies.slice(1).map((item) => item.id));
    }
    if (ids.length) await handleDeleteMediaBatch(ids, true);
  };

  /* =========================================================
     COPY LINK
  ========================================================= */

  const handleCopyLink = (
    url,
    id
  ) => {
    navigator.clipboard.writeText(
      url
    );

    setCopiedId(
      id
    );

    setTimeout(
      () =>
        setCopiedId(
          null
        ),
      2000
    );
  };

  /* =========================================================
     FILTERED ITEMS
  ========================================================= */

  const filteredMedia =
    useMemo(
      () =>
        mediaList.filter(
          (media) =>
            media.title
              ?.toLowerCase()
              .includes(
                searchQuery.toLowerCase()
              ) ||
            media.media_url
              ?.toLowerCase()
              .includes(
                searchQuery.toLowerCase()
              )
        ),
      [
        mediaList,
        searchQuery,
      ]
    );

  const totalPages =
    Math.ceil(
      filteredMedia.length /
        itemsPerPage
    );

  useEffect(() => {
    // If deletion removes the last page, stay on the final existing page.
    setCurrentPage((page) => Math.min(Math.max(totalPages, 1), page));
  }, [totalPages]);

  const paginatedMedia =
    useMemo(
      () => {
        const start =
          (
            currentPage -
            1
          ) *
          itemsPerPage;

        return filteredMedia.slice(
          start,
          start +
            itemsPerPage
        );
      },
      [
        filteredMedia,
        currentPage,
      ]
    );

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="jbh-admin-page mx-auto max-w-7xl space-y-6">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="jbh-admin-page-head flex flex-col justify-between gap-5 xl:flex-row xl:items-center">

        <div>

          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">

            <span>
              Media manager
            </span>



          </h1>

          <p className="text-xs text-slate-400 mt-1">
            Secure browser-to-R2 upload, media library management,
            duplicate review, and thumbnail automation.
          </p>

        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

          <div className="jbh-admin-stat flex items-center gap-4 p-4">

            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">

              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>

            </div>

            <div>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total Media
              </p>

              <p className="text-2xl font-black text-white font-mono mt-0.5">
                {totalMediaCount}
              </p>

            </div>

          </div>

          <div className="jbh-admin-stat flex items-center gap-4 p-4">

            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-violet-400">
              <span className="text-xl">
                ✨
              </span>
            </div>

            <div>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Using Default Cover
              </p>

              <p className="text-2xl font-black text-white font-mono mt-0.5">
                {missingThumbnailCount}
              </p>

            </div>

          </div>

          <div className="jbh-admin-stat col-span-2 flex items-center gap-4 p-4 sm:col-span-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 text-xl text-emerald-200">▶</div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Free to Watch</p>
              <p className="mt-0.5 text-2xl font-black text-white">{selectedFreeCount} <span className="text-sm font-semibold text-slate-300">/ 20</span></p>
            </div>
          </div>
        </div>

      </header>
      {freePreviewMessage && <div role="status" className="jbh-admin-panel rounded-xl p-4 text-sm text-sky-100">{freePreviewMessage}</div>}

      {/* =====================================================
          NAVIGATION
      ===================================================== */}

      <div className="jbh-admin-subtabs flex flex-wrap gap-2">

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "files"
            )
          }
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab ===
            "files"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >

          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>

          Media library ({filteredMedia.length.toLocaleString()} of {totalMediaCount.toLocaleString()})

        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab(
              "upload"
            )
          }
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab ===
            "upload"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >

          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>

          Upload

        </button>

      </div>

      {/* =====================================================
          UPLOAD TAB
      ===================================================== */}

      {activeTab === "upload" && (
        <div className="jbh-admin-panel space-y-3 p-4 sm:p-7">
          <AdminPrivateAlbumUpload mode="upload" />
        </div>
      )}

      {/* =====================================================
          FILES TAB
      ===================================================== */}

      {activeTab ===
        "files" && (
        <div className="space-y-6">

          <details className="jbh-admin-panel rounded-xl p-4" onToggle={(event) => setMaintenanceOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">Publication review & maintenance</summary>
            {maintenanceOpen && (
              <div className="mt-4 space-y-5">
                <AdminPrivateAlbumUpload mode="queue" />
                <AdminPublishingReview />
                <AdminR2OrphanAudit />
                <AdminR2CleanupQueue />
                <button type="button" onClick={fetchMedia} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200">Refresh media library</button>
              </div>
            )}
          </details>

          {/* TOOLBAR */}

          <div className="jbh-admin-panel flex flex-col items-stretch justify-between gap-3 p-4 md:flex-row md:items-center">

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto flex-1">

              <div className="relative w-full sm:w-80">

                <svg
                  className="w-4 h-4 absolute left-3.5 top-3 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>

                <input
                  type="text"
                  value={
                    searchQuery
                  }
                  onChange={(
                    event
                  ) =>
                    setSearchQuery(
                      event.target
                        .value
                    )
                  }
                  placeholder="Search video title..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() =>
                      setSearchQuery(
                        ""
                      )
                    }
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    ✕
                  </button>
                )}

              </div>

              <button
                type="button"
                onClick={() =>
                  setShowDuplicatesOnly(
                    !showDuplicatesOnly
                  )
                }
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
                  showDuplicatesOnly
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10"
                    : "bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white"
                }`}
              >

                <span>
                  ⚠️ Duplicates Filter
                </span>

                <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-md text-[10px] font-mono">
                  {totalDuplicatesCount}
                </span>

              </button>

              {totalDuplicatesCount >
                0 &&
                showDuplicatesOnly && (
                  <button
                    type="button"
                    onClick={
                      handleAutoCleanDuplicates
                    }
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    Clean Extra Copies ({totalDuplicatesCount})
                  </button>
                )}

              {ignoredDuplicates.length >
                0 && (
                <button
                  type="button"
                  onClick={
                    handleResetIgnored
                  }
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Reset OK Marks ({ignoredDuplicates.length})
                </button>
              )}

            </div>

          </div>

          {/* DUPLICATES */}

          {showDuplicatesOnly ? (

            <div className="space-y-4">

              {duplicateGroups.length ===
              0 ? (

                <div className="jbh-admin-empty text-sm">
                  No duplicate media found.
                </div>

              ) : (

                duplicateGroups.map(
                  (
                    group
                  ) => (
                    <div
                      key={
                        group.cleanTitle
                      }
                      className="jbh-admin-feature-card space-y-4 p-5"
                    >

                      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">

                        <div className="flex items-center gap-2">

                          <span className="text-amber-400 text-xs font-bold">
                            📂 Match Group:
                          </span>

                          <span className="text-white text-xs font-semibold capitalize">
                            {group.cleanTitle}
                          </span>

                        </div>

                        <div className="flex items-center gap-2">

                          <span className="bg-amber-500/10 text-amber-300 text-[10px] px-2.5 py-1 rounded-full font-mono font-bold border border-amber-500/20">
                            {group.items.length} Copies
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleMarkGroupAsOk(
                                group.cleanTitle
                              )
                            }
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            ✓ Mark as OK
                          </button>

                        </div>

                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                        {group.items.map(
                          (
                            item
                          ) => (
                            <div
                              key={
                                item.id
                              }
                              className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2"
                            >

                              <div className="min-w-0 flex-1">

                                <p className="text-xs font-bold text-white truncate">
                                  {item.title}
                                </p>

                                <p className="text-[9px] text-slate-500 mt-1">
                                  Uploaded:{" "}
                                  {item.created_at
                                    ? new Date(
                                        item.created_at
                                      ).toLocaleString()
                                    : "N/A"}
                                </p>

                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyLink(
                                      getCdnUrl(
                                        item.media_url
                                      ),
                                      item.id
                                    )
                                  }
                                  className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/50 text-xs"
                                >
                                  {copiedId ===
                                  item.id
                                    ? "✓"
                                    : "🔗"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteMedia(
                                      item.id
                                    )
                                  }
                                  className="p-2 bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer border border-slate-700/50 text-xs"
                                >
                                  🗑
                                </button>

                              </div>

                            </div>
                          )
                        )}

                      </div>

                    </div>
                  )
                )

              )}

            </div>

          ) : (

            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200">
                  <label className="inline-flex items-center gap-2 font-semibold">
                    <input type="checkbox" aria-label="Select all 50 or fewer videos on this page"
                      checked={paginatedMedia.length > 0 && paginatedMedia.every((item) => selectedMediaIds.includes(item.id))}
                      disabled={deletingPublishedMedia || paginatedMedia.length === 0}
                      onChange={(event) => setSelectedMediaIds(event.target.checked ? paginatedMedia.map((item) => item.id) : [])}
                      className="h-4 w-4 accent-indigo-500"
                    />
                    Select current page ({paginatedMedia.length})
                  </label>
                  <span className="text-slate-400">{selectedMediaIds.length} selected · 50 per page</span>
                </div>
                <button type="button"
                  disabled={deletingPublishedMedia || selectedMediaIds.length === 0}
                  onClick={() => handleDeleteMediaBatch(selectedMediaIds, true)}
                  className="min-h-10 rounded-lg border border-rose-400/50 bg-rose-900/20 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-800/30 disabled:cursor-not-allowed disabled:opacity-40">
                  {deletingPublishedMedia ? "Deleting…" : "Delete selected (" + selectedMediaIds.length + ")"}
                </button>
              </div>
              {deleteResultMessage && (
                <p role="status" className="rounded-lg border border-amber-400/30 p-3 text-xs text-amber-100">{deleteResultMessage}</p>
              )}
              {paginatedMedia.length ===
              0 ? (

                <div className="jbh-admin-empty text-sm">
                  {searchQuery
                    ? "No media matched your search."
                    : "No media uploaded yet."}
                </div>

              ) : (

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">

                  {paginatedMedia.map(
                    (
                      item
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="jbh-admin-feature-card group flex flex-col justify-between overflow-hidden transition-all"
                      >

                        {/* THUMBNAIL */}

                        <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800/80">

                          <img
                            src={getThumbnailDisplayUrl(item.thumbnail_url, item.id)}
                            onError={handleThumbnailLoadError}
                            alt={item.title ? `Thumbnail for ${item.title}` : "Media thumbnail"}
                            className="h-full w-full object-contain p-2"
                            loading="lazy"
                          />

                          {item.is_free_preview && (
                            <span className="absolute right-2 top-2 rounded-lg border border-emerald-300/30 bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold text-white">
                              FREE TO WATCH
                            </span>
                          )}
                          <label className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-slate-950/90 px-2 py-1.5 text-[10px] font-bold text-white">
                            <input type="checkbox" className="h-4 w-4 accent-indigo-500"
                              aria-label={"Select media " + (item.title || item.id)}
                              checked={selectedMediaIds.includes(item.id)}
                              disabled={deletingPublishedMedia}
                              onChange={(event) => setSelectedMediaIds((ids) => event.target.checked
                                ? [...ids.filter((id) => id !== item.id), item.id]
                                : ids.filter((id) => id !== item.id))}
                            />
                            Select
                          </label>
                          <div className="absolute top-2 left-2">

                            <span className="px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-700/70 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                              {item.thumbnail_url
                                ? "Existing Thumbnail"
                                : "Default JB Logo"}
                            </span>

                          </div>

                        </div>

                        {/* DETAILS */}

                        <div className="p-2.5 flex flex-col flex-1 gap-2">

                          {editingId ===
                          item.id ? (

                            <div className="space-y-2">

                              <input
                                type="text"
                                value={
                                  editTitle
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditTitle(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                className="bg-slate-950 border border-indigo-500 rounded-lg px-2 py-1 text-xs text-white focus:outline-none w-full"
                              />

                              <div className="flex gap-1.5">

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveTitle(
                                      item.id
                                    )
                                  }
                                  className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-colors"
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingId(
                                      null
                                    )
                                  }
                                  className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-[10px] transition-colors"
                                >
                                  Cancel
                                </button>

                              </div>

                            </div>

                          ) : (

                            <div>

                              <div className="flex items-start justify-between gap-1.5">

                                <h3
                                  className="font-bold text-slate-100 text-xs line-clamp-2 leading-tight"
                                  title={
                                    item.title
                                  }
                                >
                                  {item.title}
                                </h3>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartEdit(
                                      item
                                    )
                                  }
                                  className="text-slate-500 hover:text-indigo-400 transition-colors shrink-0 p-0.5"
                                  title="Edit Title"
                                >
                                  ✏️
                                </button>

                              </div>

                            </div>

                          )}

                          {/* Free preview action */}
                          <div className="flex justify-end">
                            <button
                              type="button"
                              title={!FREE_PREVIEW_UI_ENABLED ? "Secure playback activation pending" : item.is_free_preview ? "Remove from Free to Watch" : "Add to Free to Watch (maximum 20)"}
                              aria-pressed={item.is_free_preview === true}
                              onClick={() => handleToggleFreePreview(item)}
                              disabled={!FREE_PREVIEW_UI_ENABLED || Boolean(freePreviewUpdatingId) || (selectedFreeCount >= FREE_PREVIEW_MAX && !item.is_free_preview)}
                              className={`min-h-8 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                item.is_free_preview
                                  ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
                                  : "border-indigo-300/40 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25"
                              }`}
                            >
                              {freePreviewUpdatingId === item.id ? "Saving…" : item.is_free_preview ? "✓ Free · Remove" : "Make Free"}
                            </button>
                          </div>

                          {/* Compact thumbnail and media actions */}
                          <div className="space-y-1 border-t border-slate-800/60 pt-1.5">
                            <div className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="font-bold uppercase tracking-wide text-slate-400">Thumbnail</span>
                              <span className={item.thumbnail_url ? "font-semibold text-emerald-400" : "font-semibold text-amber-400"}>
                                {item.thumbnail_url ? "Saved" : "Using Default"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <label className="flex min-h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-1 text-center text-[10px] font-bold leading-tight text-indigo-300 transition-colors hover:bg-indigo-500/20 cursor-pointer">
                                {thumbnailUploadingId === item.id ? "Uploading..." : "Change Thumbnail"}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                  disabled={thumbnailUploadingId === item.id}
                                  onChange={(event) => handleExistingThumbnailUpload(item, event.target.files?.[0])}
                                />
                              </label>
                              <button type="button" onClick={() => handleUseDefaultCover(item)}
                                disabled={thumbnailUploadingId === item.id}
                                className="min-h-8 shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-40">
                                Use Default
                              </button>
                              <button type="button" onClick={() => handleCopyLink(getCdnUrl(item.media_url), item.id)}
                                title={copiedId === item.id ? "Copied" : "Copy Link"}
                                aria-label={copiedId === item.id ? "Link copied" : "Copy Link"}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700">
                                {copiedId === item.id ? "✓" : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></svg>}
                              </button>
                              <button type="button" onClick={() => handleDeleteMedia(item.id)}
                                title="Delete Video" aria-label="Delete Video"
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-400 hover:bg-rose-900/40 hover:text-rose-400">
                                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6m4-6v6"/></svg>
                              </button>
                            </div>
                          </div>

                        </div>

                      </div>
                    )
                  )}

                </div>

              )}

              {/* PAGINATION */}

              {totalPages >
                1 && (
                <div className="jbh-admin-panel flex flex-wrap items-center justify-between gap-3 p-4">

                  <span className="text-xs text-slate-400 font-mono">
                    Page{" "}
                    <strong className="text-white">
                      {currentPage}
                    </strong>{" "}
                    of{" "}
                    <strong className="text-white">
                      {totalPages}
                    </strong>{" "}
                    ({filteredMedia.length.toLocaleString()} matching · {totalMediaCount.toLocaleString()} in library)
                  </span>

                  <div className="flex items-center gap-2">

                    <button
                      type="button"
                      disabled={
                        currentPage ===
                        1
                      }
                      onClick={() =>
                        setCurrentPage(
                          (
                            previous
                          ) =>
                            Math.max(
                              previous -
                                1,
                              1
                            )
                        )
                      }
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all"
                    >
                      Previous
                    </button>

                    <button
                      type="button"
                      disabled={
                        currentPage ===
                        totalPages
                      }
                      onClick={() =>
                        setCurrentPage(
                          (
                            previous
                          ) =>
                            Math.min(
                              previous +
                                1,
                              totalPages
                            )
                        )
                      }
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all"
                    >
                      Next
                    </button>

                  </div>

                </div>
              )}

            </>

          )}

        </div>
      )}

    </div>
  );
}