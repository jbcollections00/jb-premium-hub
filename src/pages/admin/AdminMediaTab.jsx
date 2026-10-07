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

export default function AdminMediaTab() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("files");

  const [
    mediaList,
    setMediaList,
  ] = useState([]);

  const [
    totalMediaCount,
    setTotalMediaCount,
  ] = useState(0);

  /* =========================================================
     FILE UPLOAD STATES
  ========================================================= */

  const [
    uploadFiles,
    setUploadFiles,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    notifyUsers,
    setNotifyUsers,
  ] = useState(true);

  const [
    thumbnailBackfillLoading,
    setThumbnailBackfillLoading,
  ] = useState(false);

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

  const itemsPerPage = 30;

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
     NEUTRAL THUMBNAIL
  ========================================================= */

  const createNeutralThumbnailDataUrl = (
    category = "Vault Content"
  ) => {
    const cleanCategory =
      String(
        category ||
          "Vault Content"
      )
        .replace(
          /[<>&"'`]/g,
          ""
        )
        .slice(
          0,
          28
        );

    const svg = `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1280"
        height="720"
        viewBox="0 0 1280 720"
      >
        <defs>
          <linearGradient
            id="bg"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop
              offset="0%"
              stop-color="#020617"
            />
            <stop
              offset="55%"
              stop-color="#0f172a"
            />
            <stop
              offset="100%"
              stop-color="#2e1065"
            />
          </linearGradient>

          <radialGradient
            id="glow"
            cx="50%"
            cy="42%"
            r="55%"
          >
            <stop
              offset="0%"
              stop-color="#7c3aed"
              stop-opacity="0.34"
            />
            <stop
              offset="100%"
              stop-color="#7c3aed"
              stop-opacity="0"
            />
          </radialGradient>
        </defs>

        <rect
          width="1280"
          height="720"
          fill="url(#bg)"
        />

        <rect
          width="1280"
          height="720"
          fill="url(#glow)"
        />

        <g transform="translate(640 300)">
          <rect
            x="-78"
            y="-78"
            width="156"
            height="156"
            rx="34"
            fill="#8b5cf6"
            fill-opacity="0.12"
            stroke="#a78bfa"
            stroke-opacity="0.45"
            stroke-width="3"
          />

          <path
            d="M0 -44L12 -10L46 2L12 14L0 48L-12 14L-46 2L-12 -10Z"
            fill="none"
            stroke="#c4b5fd"
            stroke-width="7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>

        <text
          x="640"
          y="430"
          text-anchor="middle"
          fill="#f8fafc"
          font-family="Arial, Helvetica, sans-serif"
          font-size="46"
          font-weight="800"
          letter-spacing="5"
        >
          JB PREMIUM HUB
        </text>

        <text
          x="640"
          y="486"
          text-anchor="middle"
          fill="#a78bfa"
          font-family="Arial, Helvetica, sans-serif"
          font-size="24"
          font-weight="700"
          letter-spacing="7"
        >
          ${cleanCategory.toUpperCase()}
        </text>

        <text
          x="640"
          y="545"
          text-anchor="middle"
          fill="#64748b"
          font-family="Arial, Helvetica, sans-serif"
          font-size="18"
          font-weight="600"
          letter-spacing="3"
        >
          PRIVATE MEDIA LIBRARY
        </text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      svg
    )}`;
  };

  /* =========================================================
     LOAD
  ========================================================= */

  useEffect(() => {
    fetchMedia();
  }, []);

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

  /* =========================================================
     FETCH MEDIA
  ========================================================= */

  const fetchMedia =
    async () => {
      try {
        const {
          data: mediaData,
          count: mediaCount,
          error,
        } =
          await supabase
            .from("media")
            .select(
              "*",
              {
                count:
                  "exact",
              }
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            );

        if (error) {
          throw error;
        }

        setMediaList(
          mediaData ||
            []
        );

        setTotalMediaCount(
          mediaCount ||
            0
        );
      } catch (error) {
        console.error(
          "Failed to fetch media:",
          error
        );

        setMediaList(
          []
        );

        setTotalMediaCount(
          0
        );
      }
    };

  /* =========================================================
     FORMAT BYTES
  ========================================================= */

  const formatBytes = (
    bytes,
    decimals = 2
  ) => {
    if (
      !bytes ||
      bytes === 0
    ) {
      return "0 Bytes";
    }

    const k = 1024;

    const dm =
      decimals < 0
        ? 0
        : decimals;

    const sizes = [
      "Bytes",
      "KB",
      "MB",
      "GB",
      "TB",
    ];

    const i =
      Math.floor(
        Math.log(
          bytes
        ) /
          Math.log(
            k
          )
      );

    return (
      parseFloat(
        (
          bytes /
          Math.pow(
            k,
            i
          )
        ).toFixed(
          dm
        )
      ) +
      " " +
      sizes[i]
    );
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
     UPDATE FILE STATE
  ========================================================= */

  const updateFileState = (
    id,
    updates
  ) => {
    setUploadFiles(
      (previous) =>
        previous.map(
          (item) =>
            item.id ===
            id
              ? {
                  ...item,
                  ...updates,
                }
              : item
        )
    );
  };

  /* =========================================================
     FILE SELECT
  ========================================================= */

  const handleFileSelect =
    (event) => {
      const selected =
        Array.from(
          event.target
            .files ||
            []
        );

      const validVideoFiles =
        selected.filter(
          (file) => {
            const fileExt =
              file.name
                .split(
                  "."
                )
                .pop()
                .toLowerCase();

            const isVideoMime =
              file.type.startsWith(
                "video/"
              );

            const isVideoExt =
              [
                "mp4",
                "mkv",
                "mov",
                "avi",
                "webm",
                "m4v",
                "flv",
                "wmv",
                "3gp",
                "ts",
              ].includes(
                fileExt
              );

            return (
              isVideoMime ||
              isVideoExt
            );
          }
        );

      if (
        validVideoFiles.length <
        selected.length
      ) {
        alert(
          `⚠️ ${
            selected.length -
            validVideoFiles.length
          } non-video file(s) ignored.`
        );
      }

      const formattedFiles =
        validVideoFiles.map(
          (
            file,
            index
          ) => ({
            id:
              `${Date.now()}-${index}-${Math.random()
                .toString(
                  36
                )
                .substring(
                  2,
                  6
                )}`,

            file,

            name:
              file.name,

            size:
              file.size,

            progress:
              0,

            status:
              "pending",

            errorMsg:
              "",

            thumbnailFile:
              null,

            thumbnailPreview:
              "",
          })
        );

      setUploadFiles(
        formattedFiles
      );
    };

  /* =========================================================
     THUMBNAIL SELECT
  ========================================================= */

  const handleThumbnailSelect = (
    fileId,
    file
  ) => {
    if (!file) {
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

    const previewUrl =
      URL.createObjectURL(
        file
      );

    setUploadFiles(
      (previous) =>
        previous.map(
          (item) => {
            if (
              item.id !==
              fileId
            ) {
              return item;
            }

            if (
              item.thumbnailPreview?.startsWith(
                "blob:"
              )
            ) {
              URL.revokeObjectURL(
                item.thumbnailPreview
              );
            }

            return {
              ...item,

              thumbnailFile:
                file,

              thumbnailPreview:
                previewUrl,
            };
          }
        )
    );
  };

  const removeSelectedThumbnail =
    (
      fileId
    ) => {
      setUploadFiles(
        (previous) =>
          previous.map(
            (item) => {
              if (
                item.id !==
                fileId
              ) {
                return item;
              }

              if (
                item.thumbnailPreview?.startsWith(
                  "blob:"
                )
              ) {
                URL.revokeObjectURL(
                  item.thumbnailPreview
                );
              }

              return {
                ...item,

                thumbnailFile:
                  null,

                thumbnailPreview:
                  "",
              };
            }
          )
      );
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

  const handleGenerateMissingThumbnails =
    async () => {
      const missingItems =
        mediaList.filter(
          (item) =>
            !item.thumbnail_url
        );

      if (
        missingItems.length ===
        0
      ) {
        alert(
          "All media already have a thumbnail."
        );

        return;
      }

      if (
        !window.confirm(
          `Generate neutral covers for ${missingItems.length} media item(s) with missing thumbnails?`
        )
      ) {
        return;
      }

      setThumbnailBackfillLoading(
        true
      );

      try {
        const updates =
          missingItems.map(
            async (
              item
            ) => {
              const thumbnailUrl =
                createNeutralThumbnailDataUrl(
                  item.category ||
                    "Vault Content"
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
            }
          );

        await Promise.all(
          updates
        );

        await fetchMedia();

        alert(
          `Generated ${missingItems.length} neutral thumbnail cover(s).`
        );
      } catch (error) {
        console.error(
          "Thumbnail backfill failed:",
          error
        );

        alert(
          "Failed to generate missing thumbnail covers: " +
            (
              error?.message ||
              "Unknown error"
            )
        );
      } finally {
        setThumbnailBackfillLoading(
          false
        );
      }
    };

  /* =========================================================
     BULK R2 UPLOAD
  ========================================================= */

  const handleBulkUploadToCloudflare =
    async (
      event
    ) => {
      event.preventDefault();

      if (
        uploadFiles.length ===
        0
      ) {
        return;
      }

      setLoading(
        true
      );

      const successfulTitles =
        [];

      const uploadPromises =
        uploadFiles.map(
          async (
            fileObj
          ) => {
            const file =
              fileObj.file;

            updateFileState(
              fileObj.id,
              {
                status:
                  "uploading",

                progress:
                  0,

                errorMsg:
                  "",
              }
            );

            const fileExt =
              file.name
                .split(
                  "."
                )
                .pop()
                ?.toLowerCase() ||
              "mp4";

            const generatedFileName =
              `${Date.now()}-${Math.random()
                .toString(
                  36
                )
                .substring(
                  2
                )}.${fileExt}`;

            try {
              /* =============================================
                 1. REQUEST SIGNED R2 PUT URL
              ============================================= */

              const uploadInfo =
                await createR2UploadUrl({
                  fileName:
                    generatedFileName,

                  contentType:
                    file.type ||
                    "video/mp4",

                  fileSize:
                    file.size,

                  folder:
                    "videos",
                });

              /* =============================================
                 2. DIRECT BROWSER -> R2
              ============================================= */

              await uploadFileToR2({
                file,

                uploadUrl:
                  uploadInfo.uploadUrl,

                onProgress:
                  (
                    percentage
                  ) => {
                    updateFileState(
                      fileObj.id,
                      {
                        status:
                          "uploading",

                        progress:
                          percentage,
                      }
                    );
                  },
              });

              updateFileState(
                fileObj.id,
                {
                  status:
                    "saving",

                  progress:
                    100,
                }
              );

              const videoPublicUrl =
                uploadInfo.publicUrl;

              const cleanTitle =
                file.name.replace(
                  /\.[^/.]+$/,
                  ""
                );

              let thumbnailUrl =
                createNeutralThumbnailDataUrl(
                  "Vault Content"
                );

              /* =============================================
                 3. OPTIONAL THUMBNAIL
              ============================================= */

              if (
                fileObj.thumbnailFile
              ) {
                updateFileState(
                  fileObj.id,
                  {
                    status:
                      "thumbnail",

                    progress:
                      100,
                  }
                );

                thumbnailUrl =
                  await uploadThumbnailToR2(
                    fileObj.thumbnailFile,
                    "vault"
                  );
              }

              /* =============================================
                 4. SAVE DATABASE ROW
              ============================================= */

              const {
                error: dbError,
              } =
                await supabase
                  .from(
                    "media"
                  )
                  .insert([
                    {
                      title:
                        cleanTitle,

                      media_url:
                        videoPublicUrl,

                      thumbnail_url:
                        thumbnailUrl,

                      category:
                        "Vault Content",

                      type:
                        "video",
                    },
                  ]);

              if (dbError) {
                throw new Error(
                  dbError.message
                );
              }

              updateFileState(
                fileObj.id,
                {
                  status:
                    "completed",

                  progress:
                    100,
                }
              );

              successfulTitles.push(
                cleanTitle
              );
            } catch (error) {
              console.error(
                "Upload failed:",
                error
              );

              updateFileState(
                fileObj.id,
                {
                  status:
                    "error",

                  progress:
                    0,

                  errorMsg:
                    error?.message ||
                    "Upload failed",
                }
              );
            }
          }
        );

      await Promise.all(
        uploadPromises
      );

      setLoading(
        false
      );

      /* =====================================================
         SEND ANNOUNCEMENT
      ===================================================== */

      if (
        successfulTitles.length >
        0
      ) {
        if (
          notifyUsers
        ) {
          const titleListFormatted =
            successfulTitles
              .map(
                (title) =>
                  `• ${title}`
              )
              .join(
                "\n"
              );

          const announcementTitle =
            `🎬 New Vault Video Update (${successfulTitles.length} File${
              successfulTitles.length >
              1
                ? "s"
                : ""
            })`;

          const announcementBody =
            `Hi! New videos have just been added to the JB Premium Vault:\n\n${titleListFormatted}\n\nCheck them out in your media library now!`;

          try {
            const {
              error:
                announcementError,
            } =
              await supabase
                .from(
                  "admin_messages"
                )
                .insert([
                  {
                    user_id:
                      null,

                    title:
                      announcementTitle,

                    content:
                      announcementBody,

                    message:
                      announcementBody,

                    send_to_all:
                      true,

                    is_read:
                      false,
                  },
                ]);

            if (
              announcementError
            ) {
              throw announcementError;
            }
          } catch (error) {
            console.error(
              "Admin messages notification error:",
              error
            );
          }
        }

        alert(
          `Uploaded ${successfulTitles.length} video(s)!`
        );

        setUploadFiles(
          []
        );

        await fetchMedia();

        setActiveTab(
          "files"
        );
      }
    };

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
              thumbnail_url:
                createNeutralThumbnailDataUrl(
                  item.category ||
                    "Vault Content"
                ),
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
     DELETE ONE
  ========================================================= */

  const handleDeleteMedia =
    async (
      id
    ) => {
      if (
        !window.confirm(
          "Sigurado ka bang gusto mong burahin ang video na ito?"
        )
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
          .delete()
          .eq(
            "id",
            id
          );

      if (!error) {
        fetchMedia();
      }
    };

  /* =========================================================
     AUTO CLEAN DUPLICATES
  ========================================================= */

  const handleAutoCleanDuplicates =
    async () => {
      if (
        !window.confirm(
          `Sigurado ka bang gusto mong burahin ang ${totalDuplicatesCount} duplicate copies?`
        )
      ) {
        return;
      }

      let deletedCount =
        0;

      for (
        const group of
        duplicateGroups
      ) {
        const sorted =
          [
            ...group.items,
          ].sort(
            (a, b) =>
              new Date(
                b.created_at ||
                  0
              ) -
              new Date(
                a.created_at ||
                  0
              )
          );

        const itemsToDelete =
          sorted.slice(
            1
          );

        for (
          const item of
          itemsToDelete
        ) {
          const {
            error,
          } =
            await supabase
              .from(
                "media"
              )
              .delete()
              .eq(
                "id",
                item.id
              );

          if (!error) {
            deletedCount++;
          }
        }
      }

      alert(
        `🎉 Matagumpay na nabura ang ${deletedCount} duplicate video(s)!`
      );

      fetchMedia();
    };

  /* =========================================================
     DELETE ALL
  ========================================================= */

  const handleDeleteAllMedia =
    async () => {
      if (
        !window.confirm(
          "⚠️ BABALA: Sigurado ka bang gusto mong burahin ang LAHAT ng videos?"
        )
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
          .delete()
          .not(
            "id",
            "is",
            null
          );

      if (!error) {
        fetchMedia();
      }
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
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">

        <div>

          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">

            <span>
              Vault Media Uploader
            </span>

            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-semibold">
              v4.0
            </span>

          </h1>

          <p className="text-xs text-slate-400 mt-1">
            Secure browser-to-R2 upload, media library management,
            duplicate review, and thumbnail automation.
          </p>

        </div>

        <div className="grid grid-cols-2 gap-3">

          <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-xl">

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

          <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-xl">

            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-violet-400">
              <span className="text-xl">
                ✨
              </span>
            </div>

            <div>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Missing Covers
              </p>

              <p className="text-2xl font-black text-white font-mono mt-0.5">
                {missingThumbnailCount}
              </p>

            </div>

          </div>

        </div>

      </div>

      {/* =====================================================
          NAVIGATION
      ===================================================== */}

      <div className="flex border-b border-slate-800 gap-2">

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

          Uploaded Files Grid ({filteredMedia.length})

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

          Upload New Media

        </button>

      </div>

      {/* =====================================================
          UPLOAD TAB
      ===================================================== */}

      {activeTab ===
        "upload" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-5">

          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span>
              Bulk Upload Center
            </span>
          </h2>

          <form
            onSubmit={
              handleBulkUploadToCloudflare
            }
            className="space-y-5"
          >

            <div className="relative group border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 bg-slate-950/40 hover:bg-indigo-950/10 rounded-2xl p-12 transition-all duration-300 text-center cursor-pointer flex flex-col items-center justify-center">

              <input
                type="file"
                multiple
                accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.m4v"
                id="file-upload"
                onChange={
                  handleFileSelect
                }
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />

              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center"
              >

                <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-full group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300 mb-3 border border-indigo-500/20">

                  <svg
                    className="w-10 h-10"
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

                </div>

                <span className="text-base font-bold text-white tracking-wide">
                  Click or drag video files here to upload
                </span>

                <span className="text-xs text-slate-500 mt-1">
                  Video files only • optional reviewed thumbnail •
                  neutral cover used when no image is chosen
                </span>

              </label>

            </div>

            {/* SELECTED QUEUE */}

            {uploadFiles.length >
              0 && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">

                <div className="flex justify-between items-center text-xs">

                  <span className="font-bold text-slate-200">
                    Selected Queue ({uploadFiles.length})
                  </span>

                  {!loading && (
                    <button
                      type="button"
                      onClick={() =>
                        setUploadFiles(
                          []
                        )
                      }
                      className="text-slate-400 hover:text-rose-400 font-semibold transition-colors cursor-pointer"
                    >
                      Clear queue
                    </button>
                  )}

                </div>

                <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">

                  {uploadFiles.map(
                    (
                      item
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="bg-slate-900 p-3 rounded-xl border border-slate-800/80 space-y-2"
                      >

                        <div className="flex items-center justify-between text-xs">

                          <div className="min-w-0 flex-1 pr-3">

                            <p className="truncate font-semibold text-white">
                              {item.name}
                            </p>

                            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                              Size:{" "}
                              <span className="text-indigo-400 font-bold">
                                {formatBytes(
                                  item.size
                                )}
                              </span>
                            </p>

                          </div>

                          <div className="text-right shrink-0">

                            <span
                              className={`text-xs font-bold ${
                                item.status ===
                                "error"
                                  ? "text-rose-400"
                                  : item.status ===
                                    "completed"
                                  ? "text-emerald-400"
                                  : "text-indigo-400"
                              }`}
                            >
                              {item.status ===
                              "error"
                                ? "Failed"
                                : item.status ===
                                  "thumbnail"
                                ? "Saving thumbnail..."
                                : item.status ===
                                  "saving"
                                ? "Saving..."
                                : `${item.progress}%`}
                            </span>

                          </div>

                        </div>

                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">

                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              item.status ===
                              "error"
                                ? "bg-rose-500"
                                : item.status ===
                                  "completed"
                                ? "bg-emerald-500"
                                : "bg-gradient-to-r from-indigo-500 to-blue-500"
                            }`}
                            style={{
                              width:
                                `${item.progress}%`,
                            }}
                          />

                        </div>

                        {item.errorMsg && (
                          <p className="text-[10px] text-rose-400 font-medium">
                            {item.errorMsg}
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-800/70">

                          <div className="flex items-center justify-between gap-3 mb-2">

                            <div>

                              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                                Thumbnail
                              </p>

                              <p className="text-[9px] text-slate-500 mt-0.5">
                                Optional. JPEG, PNG or WEBP up to 5 MB.
                              </p>

                            </div>

                            {item.thumbnailFile && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeSelectedThumbnail(
                                    item.id
                                  )
                                }
                                className="text-[10px] font-bold text-rose-400 hover:text-rose-300"
                              >
                                Remove
                              </button>
                            )}

                          </div>

                          <div className="flex flex-col sm:flex-row gap-3 items-start">

                            <div className="w-full sm:w-44 aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800">

                              {item.thumbnailPreview ? (
                                <img
                                  src={
                                    item.thumbnailPreview
                                  }
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={
                                    createNeutralThumbnailDataUrl(
                                      "Vault Content"
                                    )
                                  }
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              )}

                            </div>

                            <label className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-slate-200 cursor-pointer transition-colors">

                              Choose Thumbnail

                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(
                                  event
                                ) =>
                                  handleThumbnailSelect(
                                    item.id,
                                    event
                                      .target
                                      .files?.[0]
                                  )
                                }
                                disabled={
                                  loading
                                }
                              />

                            </label>

                          </div>

                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>
            )}

            {/* NOTIFY */}

            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 p-4 rounded-xl">

              <label
                htmlFor="notify-toggle"
                className="flex items-center gap-3 cursor-pointer select-none"
              >

                <input
                  type="checkbox"
                  id="notify-toggle"
                  checked={
                    notifyUsers
                  }
                  onChange={(
                    event
                  ) =>
                    setNotifyUsers(
                      event.target
                        .checked
                    )
                  }
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                />

                <span className="text-xs font-semibold text-slate-200">
                  Send announcement message to user inbox with list of
                  uploaded files
                </span>

              </label>

            </div>

            <button
              type="submit"
              disabled={
                loading ||
                uploadFiles.length ===
                  0
              }
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
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

              {loading
                ? "Uploading Videos..."
                : `Upload ${uploadFiles.length} Video(s)`}

            </button>

          </form>

        </div>
      )}

      {/* =====================================================
          FILES TAB
      ===================================================== */}

      {activeTab ===
        "files" && (
        <div className="space-y-6">

          {/* TOOLBAR */}

          <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-slate-900/40 border border-slate-800 p-3 rounded-2xl">

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

            <button
              type="button"
              onClick={
                handleGenerateMissingThumbnails
              }
              disabled={
                thumbnailBackfillLoading ||
                missingThumbnailCount ===
                  0
              }
              className="px-3 py-2 bg-violet-500/10 hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-violet-300 border border-violet-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              ✨{" "}
              {thumbnailBackfillLoading
                ? "Generating Covers..."
                : `Generate Covers (${missingThumbnailCount})`}
            </button>

            {mediaList.length >
              0 && (
              <button
                type="button"
                onClick={
                  handleDeleteAllMedia
                }
                className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                Delete All Videos
              </button>
            )}

          </div>

          {/* DUPLICATES */}

          {showDuplicatesOnly ? (

            <div className="space-y-4">

              {duplicateGroups.length ===
              0 ? (

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                  ✨ Walang natagpuang duplicate na video sa iyong Vault!
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
                      className="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xl"
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

                                <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                                  {getCdnUrl(
                                    item.media_url
                                  )}
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
              {paginatedMedia.length ===
              0 ? (

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
                  {searchQuery
                    ? "Walang nahanap na video sa search."
                    : "Wala pang nakaupload na videos."}
                </div>

              ) : (

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

                  {paginatedMedia.map(
                    (
                      item
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden flex flex-col justify-between transition-all group shadow-lg hover:shadow-indigo-500/10"
                      >

                        {/* THUMBNAIL */}

                        <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800/80">

                          <img
                            src={
                              item.thumbnail_url ||
                              createNeutralThumbnailDataUrl(
                                item.category ||
                                  "Vault Content"
                              )
                            }
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />

                          <div className="absolute top-2 left-2">

                            <span className="px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-700/70 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                              {item.thumbnail_url
                                ? "Thumbnail Ready"
                                : "Fallback Cover"}
                            </span>

                          </div>

                        </div>

                        {/* DETAILS */}

                        <div className="p-3.5 flex flex-col justify-between flex-1 space-y-3">

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

                              <p
                                className="text-[10px] font-mono text-slate-500 truncate mt-1"
                                title={
                                  getCdnUrl(
                                    item.media_url
                                  )
                                }
                              >
                                {getCdnUrl(
                                  item.media_url
                                )}
                              </p>

                            </div>

                          )}

                          {/* THUMBNAIL ACTIONS */}

                          <div className="pt-2 border-t border-slate-800/60 space-y-2">

                            <div className="flex items-center justify-between gap-2">

                              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                                Thumbnail
                              </span>

                              <span
                                className={`text-[9px] font-bold ${
                                  item.thumbnail_url
                                    ? "text-emerald-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {item.thumbnail_url
                                  ? "Approved"
                                  : "Missing"}
                              </span>

                            </div>

                            <div className="grid grid-cols-2 gap-1.5">

                              <label className="py-1.5 px-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-[10px] font-bold cursor-pointer text-center transition-all">

                                {thumbnailUploadingId ===
                                item.id
                                  ? "Uploading..."
                                  : "Change Thumbnail"}

                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  disabled={
                                    thumbnailUploadingId ===
                                    item.id
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    handleExistingThumbnailUpload(
                                      item,
                                      event
                                        .target
                                        .files?.[0]
                                    )
                                  }
                                />

                              </label>

                              <button
                                type="button"
                                onClick={() =>
                                  handleUseDefaultCover(
                                    item
                                  )
                                }
                                disabled={
                                  thumbnailUploadingId ===
                                  item.id
                                }
                                className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 rounded-xl text-[10px] font-bold transition-all"
                              >
                                Use Default
                              </button>

                            </div>

                          </div>

                          {/* ACTIONS */}

                          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/60">

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
                              className="flex-1 py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/50 text-[10px] font-semibold flex items-center justify-center gap-1"
                            >
                              {copiedId ===
                              item.id
                                ? "✓ Copied"
                                : "🔗 Copy Link"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteMedia(
                                  item.id
                                )
                              }
                              className="p-1.5 bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer border border-slate-700/50 text-[10px]"
                              title="Delete Video"
                            >
                              🗑
                            </button>

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
                <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">

                  <span className="text-xs text-slate-400 font-mono">
                    Page{" "}
                    <strong className="text-white">
                      {currentPage}
                    </strong>{" "}
                    of{" "}
                    <strong className="text-white">
                      {totalPages}
                    </strong>{" "}
                    ({filteredMedia.length} Total Items)
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