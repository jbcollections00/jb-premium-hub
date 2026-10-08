import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getConversationSharedAttachments,
} from "../../services/chatService";

function formatFileSize(
  bytes
) {
  const size =
    Number(
      bytes ||
        0
    );

  if (
    size <
    1024
  ) {
    return `${size} B`;
  }

  if (
    size <
    1024 *
      1024
  ) {
    return `${(
      size /
      1024
    ).toFixed(
      1
    )} KB`;
  }

  return `${(
    size /
    1024 /
    1024
  ).toFixed(
    1
  )} MB`;
}

function formatDate(
  value
) {
  if (!value) {
    return "";
  }

  try {
    return new Date(
      value
    ).toLocaleString(
      [],
      {
        month:
          "short",

        day:
          "numeric",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit",
      }
    );
  } catch {
    return "";
  }
}

function getFileIcon(
  attachment
) {
  const mime =
    attachment?.mime_type ||
    "";

  const name =
    attachment?.file_name
      ?.toLowerCase() ||
    "";

  if (
    mime ===
      "application/pdf" ||
    name.endsWith(
      ".pdf"
    )
  ) {
    return "📕";
  }

  if (
    name.endsWith(
      ".zip"
    ) ||
    name.endsWith(
      ".rar"
    )
  ) {
    return "🗜️";
  }

  if (
    name.endsWith(
      ".doc"
    ) ||
    name.endsWith(
      ".docx"
    )
  ) {
    return "📝";
  }

  if (
    name.endsWith(
      ".xls"
    ) ||
    name.endsWith(
      ".xlsx"
    )
  ) {
    return "📊";
  }

  return "📄";
}

function getSenderName(
  attachment
) {
  return (
    attachment?.sender
      ?.full_name
      ?.trim() ||
    attachment?.sender
      ?.username
      ?.trim() ||
    "User"
  );
}

export default function SharedMediaModal({
  isOpen,
  onClose,
  conversationId,
  conversationTitle = "Chat",
}) {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState(
      "media"
    );

  const [
    attachments,
    setAttachments,
  ] =
    useState(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );

  const [
    loadingMore,
    setLoadingMore,
  ] =
    useState(
      false
    );

  const [
    hasMore,
    setHasMore,
  ] =
    useState(
      false
    );

  const [
    cursor,
    setCursor,
  ] =
    useState(
      null
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    previewAttachment,
    setPreviewAttachment,
  ] =
    useState(
      null
    );

  const [
    downloadingId,
    setDownloadingId,
  ] =
    useState(
      null
    );

  const tabs =
    useMemo(
      () => [
        {
          id:
            "media",

          label:
            "Media",
        },
        {
          id:
            "files",

          label:
            "Files",
        },
        {
          id:
            "all",

          label:
            "All",
        },
      ],
      []
    );

  const loadPage =
    async ({
      reset = false,
    } = {}) => {
      if (
        !conversationId
      ) {
        return;
      }

      try {
        if (
          reset
        ) {
          setLoading(
            true
          );

          setError(
            ""
          );
        } else {
          setLoadingMore(
            true
          );
        }

        const result =
          await getConversationSharedAttachments({
            conversationId,

            kind:
              activeTab,

            limit:
              40,

            before:
              reset
                ? null
                : cursor,
          });

        if (
          reset
        ) {
          setAttachments(
            result.attachments ||
              []
          );
        } else {
          setAttachments(
            (
              previous
            ) => {
              const map =
                new Map(
                  previous.map(
                    (
                      item
                    ) => [
                      item.id,
                      item,
                    ]
                  )
                );

              for (
                const item of
                result.attachments ||
                []
              ) {
                map.set(
                  item.id,
                  item
                );
              }

              return [
                ...map.values(),
              ];
            }
          );
        }

        setHasMore(
          Boolean(
            result.hasMore
          )
        );

        setCursor(
          result.nextCursor ||
            null
        );
      } catch (loadError) {
        console.error(
          "Load shared media error:",
          loadError
        );

        setError(
          loadError?.message ||
            "Unable to load shared media."
        );
      } finally {
        setLoading(
          false
        );

        setLoadingMore(
          false
        );
      }
    };

  useEffect(() => {
    if (
      !isOpen ||
      !conversationId
    ) {
      return;
    }

    setAttachments(
      []
    );

    setCursor(
      null
    );

    setHasMore(
      false
    );

    setPreviewAttachment(
      null
    );

    loadPage({
      reset:
        true,
    });
  }, [
    isOpen,
    conversationId,
    activeTab,
  ]);

  useEffect(() => {
    if (
      !isOpen
    ) {
      return;
    }

    const handleKeyDown =
      (
        event
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          if (
            previewAttachment
          ) {
            setPreviewAttachment(
              null
            );

            return;
          }

          onClose?.();
        }
      };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [
    isOpen,
    previewAttachment,
    onClose,
  ]);

  const handleDownload =
    async (
      attachment
    ) => {
      if (
        !attachment?.file_url
      ) {
        return;
      }

      try {
        setDownloadingId(
          attachment.id
        );

        const response =
          await fetch(
            attachment.file_url
          );

        if (
          !response.ok
        ) {
          throw new Error(
            "Unable to download attachment."
          );
        }

        const blob =
          await response.blob();

        const objectUrl =
          URL.createObjectURL(
            blob
          );

        const link =
          document.createElement(
            "a"
          );

        link.href =
          objectUrl;

        link.download =
          attachment.file_name ||
          "attachment";

        document.body.appendChild(
          link
        );

        link.click();
        link.remove();

        URL.revokeObjectURL(
          objectUrl
        );
      } catch (downloadError) {
        console.error(
          "Shared media download error:",
          downloadError
        );

        window.open(
          attachment.file_url,
          "_blank",
          "noopener,noreferrer"
        );
      } finally {
        setDownloadingId(
          null
        );
      }
    };

  const openAttachment =
    (
      attachment
    ) => {
      if (
        !attachment?.file_url
      ) {
        return;
      }

      const mime =
        attachment.mime_type ||
        "";

      if (
        mime.startsWith(
          "image/"
        )
      ) {
        setPreviewAttachment(
          attachment
        );

        return;
      }

      window.open(
        attachment.file_url,
        "_blank",
        "noopener,noreferrer"
      );
    };

  if (
    !isOpen
  ) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-0 sm:p-4"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose?.();
        }
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[88vh] sm:max-w-5xl sm:rounded-2xl">

        {/* HEADER */}
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-base font-bold text-gray-900">
              Shared media
            </div>

            <div className="truncate text-xs text-gray-400">
              {conversationTitle}
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close shared media"
          >
            ✕
          </button>
        </div>

        {/* TABS */}
        <div className="flex border-b px-3 sm:px-5">
          {tabs.map(
            (
              tab
            ) => (
              <button
                key={
                  tab.id
                }
                type="button"
                onClick={() =>
                  setActiveTab(
                    tab.id
                  )
                }
                className={`relative px-4 py-3 text-sm font-semibold ${
                  activeTab ===
                  tab.id
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {
                  tab.label
                }

                {activeTab ===
                  tab.id && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            )
          )}
        </div>

        {/* CONTENT */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-5">

          {loading ? (
            <div className="flex h-full min-h-[280px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Loading shared media...
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-[280px] items-center justify-center px-4 text-center">
              <div>
                <div className="text-sm font-semibold text-red-600">
                  {error}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    loadPage({
                      reset:
                        true,
                    })
                  }
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : attachments.length ===
            0 ? (
            <div className="flex min-h-[280px] items-center justify-center px-4 text-center">
              <div className="text-sm text-gray-400">
                {activeTab ===
                "media"
                  ? "No shared images or videos yet."
                  : activeTab ===
                    "files"
                  ? "No shared files yet."
                  : "No shared attachments yet."}
              </div>
            </div>
          ) : (
            <>
              {activeTab ===
              "media" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {attachments.map(
                    (
                      attachment
                    ) => {
                      const mime =
                        attachment.mime_type ||
                        "";

                      const isImage =
                        mime.startsWith(
                          "image/"
                        );

                      const isVideo =
                        mime.startsWith(
                          "video/"
                        );

                      return (
                        <div
                          key={
                            attachment.id
                          }
                          className="group relative aspect-square overflow-hidden rounded-xl bg-gray-200"
                        >
                          {isImage ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewAttachment(
                                  attachment
                                )
                              }
                              className="h-full w-full"
                            >
                              <img
                                src={
                                  attachment.file_url
                                }
                                alt={
                                  attachment.file_name ||
                                  "Image"
                                }
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : isVideo ? (
                            <video
                              src={
                                attachment.file_url
                              }
                              preload="metadata"
                              muted
                              playsInline
                              className="h-full w-full object-cover"
                              onClick={() =>
                                openAttachment(
                                  attachment
                                )
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                openAttachment(
                                  attachment
                                )
                              }
                              className="flex h-full w-full items-center justify-center text-4xl"
                            >
                              {getFileIcon(
                                attachment
                              )}
                            </button>
                          )}

                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8 text-white">
                            <div className="truncate text-[11px] font-semibold">
                              {attachment.file_name ||
                                "Attachment"}
                            </div>

                            <div className="mt-0.5 truncate text-[10px] text-white/70">
                              {getSenderName(
                                attachment
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleDownload(
                                attachment
                              )
                            }
                            disabled={
                              downloadingId ===
                              attachment.id
                            }
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-xs text-white opacity-100 shadow hover:bg-black/70 sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label="Download attachment"
                            title="Download"
                          >
                            {downloadingId ===
                            attachment.id
                              ? "…"
                              : "↓"}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map(
                    (
                      attachment
                    ) => {
                      const mime =
                        attachment.mime_type ||
                        "";

                      const isImage =
                        mime.startsWith(
                          "image/"
                        );

                      const isVideo =
                        mime.startsWith(
                          "video/"
                        );

                      return (
                        <div
                          key={
                            attachment.id
                          }
                          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              openAttachment(
                                attachment
                              )
                            }
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100"
                          >
                            {isImage ? (
                              <img
                                src={
                                  attachment.file_url
                                }
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : isVideo ? (
                              <span className="text-xl">
                                🎬
                              </span>
                            ) : (
                              <span className="text-xl">
                                {getFileIcon(
                                  attachment
                                )}
                              </span>
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() =>
                                openAttachment(
                                  attachment
                                )
                              }
                              className="block max-w-full truncate text-left text-sm font-semibold text-gray-800 hover:underline"
                            >
                              {attachment.file_name ||
                                "Attachment"}
                            </button>

                            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                              <span>
                                {formatFileSize(
                                  attachment.file_size
                                )}
                              </span>

                              <span>
                                {getSenderName(
                                  attachment
                                )}
                              </span>

                              <span>
                                {formatDate(
                                  attachment.message_created_at ||
                                    attachment.created_at
                                )}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleDownload(
                                attachment
                              )
                            }
                            disabled={
                              downloadingId ===
                              attachment.id
                            }
                            className="flex-shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                          >
                            {downloadingId ===
                            attachment.id
                              ? "..."
                              : "Download"}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {hasMore && (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    disabled={
                      loadingMore
                    }
                    onClick={() =>
                      loadPage({
                        reset:
                          false,
                      })
                    }
                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-600 shadow-sm ring-1 ring-gray-200 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {loadingMore
                      ? "Loading..."
                      : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* IMAGE PREVIEW */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90 p-3"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setPreviewAttachment(
                null
              );
            }
          }}
        >
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-black">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {previewAttachment.file_name ||
                    "Image"}
                </div>

                <div className="text-[11px] text-white/60">
                  {formatFileSize(
                    previewAttachment.file_size
                  )}
                  {" · "}
                  {getSenderName(
                    previewAttachment
                  )}
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleDownload(
                      previewAttachment
                    )
                  }
                  disabled={
                    downloadingId ===
                    previewAttachment.id
                  }
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50"
                >
                  {downloadingId ===
                  previewAttachment.id
                    ? "Downloading..."
                    : "Download"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPreviewAttachment(
                      null
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
                  aria-label="Close preview"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
              <img
                src={
                  previewAttachment.file_url
                }
                alt={
                  previewAttachment.file_name ||
                  "Image"
                }
                draggable={
                  false
                }
                className="max-h-[calc(100vh-120px)] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
