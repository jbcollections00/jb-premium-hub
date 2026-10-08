import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  searchUsers,
} from "../../services/chatService";

import ReportMessageModal from "./ReportMessageModal";

const REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
];

function formatFileSize(
  bytes
) {
  const size =
    Number(bytes || 0);

  if (size < 1024) {
    return `${size} B`;
  }

  if (
    size <
    1024 * 1024
  ) {
    return `${(
      size / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    size /
    1024 /
    1024
  ).toFixed(1)} MB`;
}


function getAttachmentIcon(
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

export default function MessageBubble({
  message,
  currentUserId,
  conversationType = "direct",

  isPinned = false,
  isMentioned = false,
  groupedWithPrevious = false,
  groupedWithNext = false,
  density = "comfortable",
  reduceMotion = false,
  showReadReceipts = true,
  messageFontSize = "medium",
  messageLineSpacing = "normal",
  showMessageTimestamps = true,
  bubbleColor = "blue",
  bubbleShape = "rounded",
  showSenderNames = true,
  showReactionCounts = true,
  showReactionBadges = true,
  showPinnedIndicators = true,
  showSenderAvatars = true,
  showEditedLabels = true,
  showReplyPreviews = true,
  showAttachmentPreviews = true,
  showAttachmentFileSizes = true,
  highlightMentions = true,
  messageTimeFormat = "system",

  /*
    NEW:
    ChatWindow -> MessageList -> MessageBubble
  */
  canPin = true,

  onReply,
  onJumpToMessage,
  onDelete,
  onReact,
  onPin,
  onOpenDirectChat,
}) {
  const isMine =
    message.sender_id ===
    currentUserId;

  const isDirect =
    conversationType ===
    "direct";

  const showSenderName =
    showSenderNames &&
    !isDirect &&
    !isMine &&
    !groupedWithPrevious;

  const [
    showQuickActions,
    setShowQuickActions,
  ] = useState(false);

  const [
    showReactionPicker,
    setShowReactionPicker,
  ] = useState(false);

  const [
    showActions,
    setShowActions,
  ] = useState(false);

  const [
    showReportModal,
    setShowReportModal,
  ] = useState(false);

  const [
    previewAttachment,
    setPreviewAttachment,
  ] = useState(null);

  const [
    downloadingAttachmentId,
    setDownloadingAttachmentId,
  ] = useState(null);

  const [
    reactionPosition,
    setReactionPosition,
  ] = useState({
    top: 0,
    left: 0,
  });

  const [
    menuPosition,
    setMenuPosition,
  ] = useState({
    top: 0,
    left: 0,
  });

  const wrapperRef =
    useRef(null);

  const bubbleRef =
    useRef(null);

  const reactionButtonRef =
    useRef(null);

  const moreButtonRef =
    useRef(null);

  const reactionPickerRef =
    useRef(null);

  const menuRef =
    useRef(null);

  const pressTimerRef =
    useRef(null);

  const longPressTriggeredRef =
    useRef(false);

  const startPointRef =
    useRef({
      x: 0,
      y: 0,
    });

  const time =
    new Date(
      message.created_at
    ).toLocaleTimeString(
      [],
      {
        hour:
          "2-digit",

        minute:
          "2-digit",
        ...(messageTimeFormat === "12h" ? { hour12: true } : messageTimeFormat === "24h" ? { hour12: false } : {}),
      }
    );

  const isSeen =
    Number(
      message.read_count ||
        0
    ) > 0;

  const reply =
    message.reply_message;

  const attachments =
    message.attachments ||
    [];

  const reactions =
    message.reactions ||
    [];

  /*
    =========================================================
    GROUP REACTIONS
    =========================================================
  */
  const groupedReactions =
    reactions.reduce(
      (
        groups,
        reaction
      ) => {
        const emoji =
          reaction.emoji;

        if (!emoji) {
          return groups;
        }

        if (
          !groups[
            emoji
          ]
        ) {
          groups[
            emoji
          ] = {
            count:
              0,

            mine:
              false,
          };
        }

        groups[
          emoji
        ].count += 1;

        if (
          reaction.user_id ===
          currentUserId
        ) {
          groups[
            emoji
          ].mine =
            true;
        }

        return groups;
      },
      {}
    );

  const replySender =
    reply?.sender_id ===
    currentUserId
      ? "You"
      : reply?.sender
          ?.full_name
          ?.trim() ||
        reply?.sender
          ?.username
          ?.trim() ||
        "User";

  /*
    =========================================================
    CLOSE MENUS
    =========================================================
  */
  const closeAllMenus =
    () => {
      setShowActions(
        false
      );

      setShowReactionPicker(
        false
      );

      setShowQuickActions(
        false
      );
    };

  /*
    =========================================================
    OUTSIDE CLICK
    =========================================================
  */
  useEffect(() => {
    if (
      !showActions &&
      !showReactionPicker &&
      !showQuickActions
    ) {
      return;
    }

    const handleOutside =
      (
        event
      ) => {
        const target =
          event.target;

        if (
          wrapperRef.current?.contains(
            target
          )
        ) {
          return;
        }

        if (
          reactionPickerRef.current?.contains(
            target
          )
        ) {
          return;
        }

        if (
          menuRef.current?.contains(
            target
          )
        ) {
          return;
        }

        closeAllMenus();
      };

    document.addEventListener(
      "pointerdown",
      handleOutside
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutside
      );
    };
  }, [
    showActions,
    showReactionPicker,
    showQuickActions,
  ]);

  /*
    =========================================================
    CLEAN LONG PRESS TIMER
    =========================================================
  */
  useEffect(() => {
    return () => {
      if (
        pressTimerRef.current
      ) {
        clearTimeout(
          pressTimerRef.current
        );
      }
    };
  }, []);

  /*
    =========================================================
    ESCAPE CLOSE
    =========================================================
  */
  useEffect(() => {
    const handleKeyDown =
      (
        event
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          closeAllMenus();

          setPreviewAttachment(
            null
          );
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
  }, []);

  /*
    =========================================================
    POSITION REACTION PICKER
    =========================================================
  */
  const updateReactionPosition =
    () => {
      const anchor =
        reactionButtonRef
          .current ||
        bubbleRef.current;

      if (!anchor) {
        return;
      }

      const rect =
        anchor.getBoundingClientRect();

      const pickerWidth =
        220;

      const pickerHeight =
        58;

      let left =
        isMine
          ? rect.right -
            pickerWidth
          : rect.left;

      left =
        Math.max(
          8,
          Math.min(
            left,
            window.innerWidth -
              pickerWidth -
              8
          )
        );

      let top =
        rect.top -
        pickerHeight -
        8;

      if (
        top < 8
      ) {
        top =
          rect.bottom +
          8;
      }

      setReactionPosition({
        top,
        left,
      });
    };

  /*
    =========================================================
    POSITION MORE MENU
    =========================================================
  */
  const updateMenuPosition =
    () => {
      const anchor =
        moreButtonRef
          .current ||
        bubbleRef.current;

      if (!anchor) {
        return;
      }

      const rect =
        anchor.getBoundingClientRect();

      const menuWidth =
        180;

      const estimatedHeight =
        145;

      let left =
        isMine
          ? rect.right -
            menuWidth
          : rect.left;

      left =
        Math.max(
          8,
          Math.min(
            left,
            window.innerWidth -
              menuWidth -
              8
          )
        );

      let top =
        rect.bottom +
        8;

      if (
        top +
          estimatedHeight >
        window.innerHeight -
          8
      ) {
        top =
          rect.top -
          estimatedHeight -
          8;
      }

      setMenuPosition({
        top:
          Math.max(
            8,
            top
          ),

        left,
      });
    };

  /*
    =========================================================
    RESIZE / SCROLL
    =========================================================
  */
  useEffect(() => {
    if (
      !showReactionPicker &&
      !showActions
    ) {
      return;
    }

    const handlePosition =
      () => {
        if (
          showReactionPicker
        ) {
          updateReactionPosition();
        }

        if (
          showActions
        ) {
          updateMenuPosition();
        }
      };

    window.addEventListener(
      "resize",
      handlePosition
    );

    window.addEventListener(
      "scroll",
      handlePosition,
      true
    );

    return () => {
      window.removeEventListener(
        "resize",
        handlePosition
      );

      window.removeEventListener(
        "scroll",
        handlePosition,
        true
      );
    };
  }, [
    showReactionPicker,
    showActions,
  ]);

  /*
    =========================================================
    LONG PRESS
    =========================================================
  */
  const clearPressTimer =
    () => {
      if (
        pressTimerRef.current
      ) {
        clearTimeout(
          pressTimerRef.current
        );

        pressTimerRef.current =
          null;
      }
    };

  const handlePointerDown =
    (
      event
    ) => {
      if (
        message.deleted_at
      ) {
        return;
      }

      if (
        event.pointerType ===
        "mouse"
      ) {
        return;
      }

      startPointRef.current = {
        x:
          event.clientX,

        y:
          event.clientY,
      };

      longPressTriggeredRef.current =
        false;

      clearPressTimer();

      pressTimerRef.current =
        setTimeout(
          () => {
            longPressTriggeredRef.current =
              true;

            updateReactionPosition();

            setShowReactionPicker(
              true
            );

            setShowActions(
              false
            );

            setShowQuickActions(
              true
            );

            navigator.vibrate?.(
              25
            );
          },
          450
        );
    };

  const handlePointerMove =
    (
      event
    ) => {
      const dx =
        Math.abs(
          event.clientX -
            startPointRef
              .current.x
        );

      const dy =
        Math.abs(
          event.clientY -
            startPointRef
              .current.y
        );

      if (
        dx > 10 ||
        dy > 10
      ) {
        clearPressTimer();
      }
    };

  const handlePointerUp =
    (
      event
    ) => {
      clearPressTimer();

      if (
        event.pointerType ===
        "mouse"
      ) {
        return;
      }

      if (
        longPressTriggeredRef
          .current
      ) {
        longPressTriggeredRef.current =
          false;

        return;
      }
    };

  /*
    =========================================================
    BUBBLE CLICK
    =========================================================
  */
  const handleBubbleClick =
    (
      event
    ) => {
      if (
        message.deleted_at
      ) {
        return;
      }

      /*
        Don't toggle actions when user clicks
        an interactive child.
      */
      if (
        event.target.closest(
          "button, a, video"
        )
      ) {
        return;
      }

      setShowQuickActions(
        (
          value
        ) =>
          !value
      );

      setShowActions(
        false
      );

      setShowReactionPicker(
        false
      );
    };

  /*
    =========================================================
    REACTION
    =========================================================
  */
  const handleReaction =
    async (
      emoji
    ) => {
      setShowReactionPicker(
        false
      );

      setShowActions(
        false
      );

      setShowQuickActions(
        false
      );

      await onReact?.(
        message,
        emoji
      );
    };

  /*
    =========================================================
    PIN
    =========================================================
  */
  const handlePin =
    async () => {
      if (!canPin) {
        return;
      }

      closeAllMenus();

      await onPin?.(
        message
      );
    };

  /*
    =========================================================
    OPEN SENDER DIRECT CHAT
    =========================================================
  */
  const handleSenderClick =
    async (
      event
    ) => {
      event.stopPropagation();

      if (
        !onOpenDirectChat ||
        !message.sender_id
      ) {
        return;
      }

      const sender =
        message.sender ||
        {};

      await onOpenDirectChat({
        id:
          message.sender_id,

        full_name:
          sender.full_name ||
          null,

        username:
          sender.username ||
          null,

        avatar_url:
          sender.avatar_url ||
          null,

        last_seen_at:
          sender.last_seen_at ||
          null,
      });
    };

  /*
    =========================================================
    OPEN @MENTION DIRECT CHAT
    =========================================================
  */
  const handleMentionClick =
    async (
      username,
      event
    ) => {
      event.stopPropagation();

      if (
        !username ||
        !onOpenDirectChat
      ) {
        return;
      }

      const cleanUsername =
        username.replace(
          /^@/,
          ""
        );

      try {
        const users =
          await searchUsers(
            cleanUsername
          );

        const exactUser =
          (
            users || []
          ).find(
            (
              user
            ) =>
              user.username &&
              user.username.toLowerCase() ===
                cleanUsername.toLowerCase()
          );

        if (
          !exactUser
        ) {
          console.warn(
            "Mentioned username not found:",
            cleanUsername
          );

          return;
        }

        await onOpenDirectChat(
          exactUser
        );
      } catch (error) {
        console.error(
          "Open mentioned user error:",
          error
        );
      }
    };

  /*
    =========================================================
    MESSAGE TEXT WITH CLICKABLE @MENTIONS
    =========================================================
  */
  const renderMessageText = (text) => {
    if (!text) return null;

    // Only http(s) web links are clickable. Keep @mentions intact.
    const tokenRegex = /(https?:\/\/[^\s<>"']+|@[A-Za-z0-9._-]{3,30})/gi;
    const parts = String(text).split(tokenRegex);

    return parts.flatMap((part, index) => {
      if (/^https?:\/\//i.test(part)) {
        // Exclude punctuation normally placed after links in sentences.
        const match = part.match(/^(.*?)([.,!?;:]+)$/);
        const urlText = match ? match[1] : part;
        const trailing = match ? match[2] : "";
        try {
          const url = new URL(urlText);
          if (url.protocol === "http:" || url.protocol === "https:") {
            return [
              <a
                key={`link-${index}`}
                href={url.href}
                target="_blank"
                rel="noopener noreferrer"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className={`underline underline-offset-2 break-all ${isMine ? "text-white" : "text-blue-700"}`}
              >
                {urlText}
              </a>,
              ...(trailing ? [<span key={`suffix-${index}`}>{trailing}</span>] : []),
            ];
          }
        } catch {
          // Invalid URL: show it as text instead of creating a broken link.
        }
      }
      if (/^@[A-Za-z0-9._-]{3,30}$/.test(part)) {
        return [
          <button
            key={`mention-${index}`}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => handleMentionClick(part, event)}
            className={`font-semibold underline-offset-2 hover:underline ${isMine ? "text-white" : "text-blue-600"}`}
          >
            {part}
          </button>,
        ];
      }
      return [<span key={`text-${index}`}>{part}</span>];
    });
  };

  const copyMessageText = async () => {
    const text = String(message.message || "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      closeAllMenus();
    } catch (error) {
      console.error("Copy message failed:", error);
      // Text remains selectable for manual copy if clipboard permission is denied.
      closeAllMenus();
    }
  };

  /*
    =========================================================
    ATTACHMENT ACTIONS
    =========================================================
  */

  const handleOpenAttachment =
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

        closeAllMenus();

        return;
      }

      window.open(
        attachment.file_url,
        "_blank",
        "noopener,noreferrer"
      );
    };

  const handleDownloadAttachment =
    async (
      attachment
    ) => {
      if (
        !attachment?.file_url
      ) {
        return;
      }

      try {
        setDownloadingAttachmentId(
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
      } catch (error) {
        console.error(
          "Download attachment error:",
          error
        );

        window.open(
          attachment.file_url,
          "_blank",
          "noopener,noreferrer"
        );
      } finally {
        setDownloadingAttachmentId(
          null
        );
      }
    };

  /*
    =========================================================
    DELETED
    =========================================================
  */
  if (
    message.deleted_at
  ) {
    return (
      <div
        className={`mb-3 flex ${
          isMine
            ? "justify-end"
            : "justify-start"
        }`}
      >
        <div className="rounded-2xl bg-gray-100 px-4 py-2 text-sm italic text-gray-400">
          Message deleted
        </div>
      </div>
    );
  }

  /*
    =========================================================
    PORTAL — REACTION PICKER
    =========================================================
  */
  const reactionPortal =
    showReactionPicker &&
    typeof document !==
      "undefined"
      ? createPortal(
          <div
            ref={
              reactionPickerRef
            }
            onPointerDown={(
              event
            ) =>
              event.stopPropagation()
            }
            style={{
              position:
                "fixed",

              top:
                reactionPosition.top,

              left:
                reactionPosition.left,

              zIndex:
                9999,
            }}
            role="group"
            aria-label="Message reactions"
            className="flex items-center gap-0.5 rounded-full border bg-white px-2 py-1.5 shadow-2xl"
          >
            {REACTIONS.map(
              (
                emoji
              ) => (
                <button
                  key={
                    emoji
                  }
                  type="button"
                  onClick={() =>
                    handleReaction(
                      emoji
                    )
                  }
                  aria-label={`React with ${emoji}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:scale-125 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {
                    emoji
                  }
                </button>
              )
            )}
          </div>,

          document.body
        )
      : null;

  /*
    =========================================================
    PORTAL — MORE MENU
    =========================================================
  */
  const menuPortal =
    showActions &&
    typeof document !==
      "undefined"
      ? createPortal(
          <div
            ref={
              menuRef
            }
            onPointerDown={(
              event
            ) =>
              event.stopPropagation()
            }
            style={{
              position:
                "fixed",

              top:
                menuPosition.top,

              left:
                menuPosition.left,

              zIndex:
                10000,

              width:
                180,
            }}
            role="menu"
            aria-label="Message actions"
            className="overflow-hidden rounded-xl border bg-white py-1 text-sm text-gray-700 shadow-2xl"
          >
            {/* COPY MESSAGE */}
            {!message.deleted_at && Boolean(message.message) && (
              <button
                type="button"
                onClick={copyMessageText}
                className="block w-full px-4 py-2.5 text-left hover:bg-gray-100"
              >
                Copy message
              </button>
            )}

            {/* REPLY */}
            <button
              type="button"
              onClick={() => {
                closeAllMenus();

                onReply?.(
                  message
                );
              }}
              className="block w-full px-4 py-2.5 text-left hover:bg-gray-100"
            >
              ↩ Reply
            </button>

            {/* PIN / UNPIN
                ONLY IF USER HAS PERMISSION
            */}
            {canPin && (
              <button
                type="button"
                onClick={
                  handlePin
                }
                className="block w-full px-4 py-2.5 text-left hover:bg-gray-100"
              >
                {isPinned
                  ? "📌 Unpin"
                  : "📌 Pin message"}
              </button>
            )}

            {/* REPORT OTHER USER'S MESSAGE */}
            {!isMine &&
              !message.deleted_at && (
              <button
                type="button"
                onClick={() => {
                  closeAllMenus();

                  setShowReportModal(
                    true
                  );
                }}
                className="block w-full px-4 py-2.5 text-left text-orange-600 hover:bg-orange-50"
              >
                ⚑ Report message
              </button>
            )}

            {/* DELETE ONLY OWN MESSAGE */}
            {isMine && (
              <button
                type="button"
                onClick={() => {
                  closeAllMenus();

                  onDelete?.(
                    message
                  );
                }}
                className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>,

          document.body
        )
      : null;

  /*
    =========================================================
    PORTAL — IMAGE PREVIEW
    =========================================================
  */

  const imagePreviewPortal =
    previewAttachment &&
    typeof document !==
      "undefined"
      ? createPortal(
          <div
            onPointerDown={(
              event
            ) => {
              event.stopPropagation();

              if (
                event.target ===
                event.currentTarget
              ) {
                setPreviewAttachment(
                  null
                );
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90 p-3"
          >
            <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-black shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {previewAttachment.file_name ||
                      "Image"}
                  </div>

                  {showAttachmentFileSizes && <div className="text-[11px] text-white/60">
                    {formatFileSize(
                      previewAttachment.file_size
                    )}
                  </div>}
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadAttachment(
                        previewAttachment
                      )
                    }
                    disabled={
                      downloadingAttachmentId ===
                      previewAttachment.id
                    }
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50"
                  >
                    {downloadingAttachmentId ===
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
                    aria-label="Close image preview"
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
          </div>,

          document.body
        )
      : null;

  /*
    =========================================================
    MAIN UI
    =========================================================
  */
  return (
    <>
      <div
        ref={
          wrapperRef
        }
        className={`group relative flex ${
          density === "compact"
            ? groupedWithNext
              ? "mb-0.5"
              : "mb-1.5"
            : groupedWithNext
            ? "mb-1"
            : "mb-3"
        } ${
          isMine
            ? "justify-end"
            : "justify-start"
        }`}
      >
        {showSenderAvatars && !isDirect && !isMine && (
          <div className="mr-2 mt-auto flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs font-bold text-gray-600" aria-hidden="true">
            {!groupedWithNext && (
              message.sender?.avatar_url ? (
                <img src={message.sender.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                (message.sender?.full_name?.trim() || message.sender?.username?.trim() || "?").charAt(0).toUpperCase()
              )
            )}
          </div>
        )}
        <div className="relative max-w-[82%] sm:max-w-[70%]">

          {/* =================================================
              QUICK ACTIONS

              Desktop:
              hover anywhere on same message row.

              Mobile:
              tap bubble / long press.
          ================================================= */}
          <div
            className={`absolute top-1/2 z-30 -translate-y-1/2 items-center gap-1 ${reduceMotion ? "" : "transition-opacity duration-100"} md:flex ${
              showQuickActions
                ? "pointer-events-auto flex opacity-100"
                : "pointer-events-none flex opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
            } ${
              isMine
                ? "right-full mr-2 flex-row-reverse"
                : "left-full ml-2"
            }`}
          >
            {/* REACTION */}
            <button
              ref={
                reactionButtonRef
              }
              type="button"
              onPointerDown={(
                event
              ) =>
                event.stopPropagation()
              }
              onClick={(
                event
              ) => {
                event.stopPropagation();

                if (
                  showReactionPicker
                ) {
                  setShowReactionPicker(
                    false
                  );

                  return;
                }

                updateReactionPosition();

                setShowReactionPicker(
                  true
                );

                setShowActions(
                  false
                );
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              title="React"
              aria-label="React to message"
            >
              😊
            </button>

            {/* REPLY */}
            <button
              type="button"
              onPointerDown={(
                event
              ) =>
                event.stopPropagation()
              }
              onClick={(
                event
              ) => {
                event.stopPropagation();

                closeAllMenus();

                onReply?.(
                  message
                );
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              title="Reply"
              aria-label="Reply to message"
            >
              ↩
            </button>

            {/* MORE */}
            <button
              ref={
                moreButtonRef
              }
              type="button"
              onPointerDown={(
                event
              ) =>
                event.stopPropagation()
              }
              onClick={(
                event
              ) => {
                event.stopPropagation();

                if (
                  showActions
                ) {
                  setShowActions(
                    false
                  );

                  return;
                }

                updateMenuPosition();

                setShowActions(
                  true
                );

                setShowReactionPicker(
                  false
                );
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg shadow ring-1 ring-black/5 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              title="More"
              aria-label="More message actions"
              aria-haspopup="menu"
              aria-expanded={showActions}
            >
              ⋯
            </button>
          </div>

          {/* =================================================
              SENDER NAME
          ================================================= */}
          {showSenderName && (
            <div className="mb-1 px-1">
              <button
                type="button"
                onClick={
                  handleSenderClick
                }
                aria-label={`Open chat with ${
                  message.sender?.full_name ||
                  message.sender?.username ||
                  "sender"
                }`}
                className="truncate text-xs font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {message.sender
                  ?.full_name
                  ?.trim() ||
                  message.sender
                    ?.username
                    ?.trim() ||
                  "User"}
              </button>
            </div>
          )}

          {/* =================================================
              MESSAGE BUBBLE
          ================================================= */}
          <div
            ref={
              bubbleRef
            }
            onPointerDown={
              handlePointerDown
            }
            onPointerUp={
              handlePointerUp
            }
            onPointerCancel={
              clearPressTimer
            }
            onPointerLeave={
              clearPressTimer
            }
            onPointerMove={
              handlePointerMove
            }
            onClick={
              handleBubbleClick
            }
            onContextMenu={(
              event
            ) => {
              event.preventDefault();

              updateMenuPosition();

              setShowActions(
                true
              );

              setShowReactionPicker(
                false
              );

              setShowQuickActions(
                true
              );
            }}
            aria-label={
              isMine
                ? "Your message"
                : `Message from ${
                    message.sender?.full_name ||
                    message.sender?.username ||
                    "user"
                  }`
            }
            className={`select-text overflow-hidden ${bubbleShape === "square" ? "rounded-md" : bubbleShape === "soft" ? "rounded-xl" : "rounded-2xl"} ${
              reduceMotion ? "" : "transition"
            } ${
              isMine
                ? `${
                    bubbleShape !== "square" && groupedWithPrevious
                      ? "rounded-tr-md"
                      : ""
                  } ${
                    bubbleShape !== "square" && groupedWithNext
                      ? "rounded-br-md"
                      : "rounded-br-md"
                  } ${({ blue: "bg-blue-600", emerald: "bg-emerald-700", violet: "bg-violet-700", slate: "bg-slate-700" })[bubbleColor] || "bg-blue-600"} text-white`
                : `${
                    bubbleShape !== "square" && groupedWithPrevious
                      ? "rounded-tl-md"
                      : ""
                  } ${
                    bubbleShape !== "square" && groupedWithNext
                      ? "rounded-bl-md"
                      : "rounded-bl-md"
                  } bg-gray-200 text-gray-900`
            } ${
              (isMentioned && highlightMentions)
                ? isMine
                  ? "ring-2 ring-purple-300 ring-offset-2"
                  : "ring-2 ring-purple-500 ring-offset-2"
                : ""
            }`}
          >
            {/* MENTIONED YOU BADGE */}
            {isMentioned && highlightMentions &&
              !isMine && (
                <div className="px-4 pt-2">
                  <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                    @ Mentioned you
                  </span>
                </div>
              )}

            {/* =================================================
                REPLY PREVIEW
            ================================================= */}
            {showReplyPreviews && reply && (
              <div className="px-3 pt-2">
                <button
                  type="button"
                  onPointerDown={(
                    event
                  ) =>
                    event.stopPropagation()
                  }
                  onClick={(
                    event
                  ) => {
                    event.stopPropagation();

                    onJumpToMessage?.(
                      reply.id
                    );
                  }}
                  className={`block w-full rounded-lg border-l-4 px-3 py-2 text-left ${
                    isMine
                      ? "border-blue-200 bg-blue-500/40"
                      : "border-blue-500 bg-white/70"
                  }`}
                >
                  <div
                    className={`text-[11px] font-semibold ${
                      isMine
                        ? "text-blue-100"
                        : "text-blue-600"
                    }`}
                  >
                    {
                      replySender
                    }
                  </div>

                  <div
                    className={`line-clamp-2 text-xs ${
                      isMine
                        ? "text-blue-50"
                        : "text-gray-600"
                    }`}
                  >
                    {reply.deleted_at
                      ? "Message deleted"
                      : reply.message ||
                        "Attachment"}
                  </div>
                </button>
              </div>
            )}

            {/* =================================================
                ATTACHMENTS
            ================================================= */}
            {attachments.map(
              (
                attachment
              ) => {
                const mime =
                  attachment.mime_type ||
                  "";

                const fileName =
                  attachment.file_name ||
                  "Attachment";

                const fileSize =
                  formatFileSize(
                    attachment.file_size
                  );

                // Hide large inline previews without removing access to the attachment.
                if (!showAttachmentPreviews && (
                  mime.startsWith("image/") || mime.startsWith("video/")
                )) {
                  return (
                    <div key={attachment.id} className="mt-2 flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                      <span aria-hidden="true">{mime.startsWith("image/") ? "🖼️" : "🎬"}</span>
                      <span className="min-w-0 flex-1 truncate" title={fileName}>{fileName}{showAttachmentFileSizes ? ` · ${showAttachmentFileSizes ? fileSize : null}` : ""}</span>
                      <button type="button" onClick={() => handleOpenAttachment(attachment)} className="rounded-full border border-current/30 px-2 py-1 font-semibold">Open</button>
                      <button type="button" onClick={() => handleDownloadAttachment(attachment)} disabled={downloadingAttachmentId === attachment.id} className="rounded-full border border-current/30 px-2 py-1 font-semibold disabled:opacity-50">{downloadingAttachmentId === attachment.id ? "..." : "Download"}</button>
                    </div>
                  );
                }

                /*
                  IMAGE
                */
                if (
                  mime.startsWith(
                    "image/"
                  )
                ) {
                  return (
                    <div
                      key={
                        attachment.id
                      }
                      className="mt-2 overflow-hidden"
                      onPointerDown={(
                        event
                      ) =>
                        event.stopPropagation()
                      }
                      onClick={(
                        event
                      ) =>
                        event.stopPropagation()
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenAttachment(
                            attachment
                          )
                        }
                        className="block w-full bg-black/5"
                        title="Open image"
                      >
                        <img
                          src={
                            attachment.file_url
                          }
                          alt={
                            fileName
                          }
                          loading="lazy"
                          draggable={
                            false
                          }
                          className="max-h-[440px] w-full object-contain"
                        />
                      </button>

                      <div
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-[11px] ${
                          isMine
                            ? "bg-blue-500/40 text-blue-50"
                            : "bg-white/70 text-gray-600"
                        }`}
                      >
                        <div className="min-w-0 flex-1 truncate">
                          {fileName}
                          {" · "}
                          {showAttachmentFileSizes ? fileSize : null}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadAttachment(
                              attachment
                            )
                          }
                          disabled={
                            downloadingAttachmentId ===
                            attachment.id
                          }
                          className={`flex-shrink-0 rounded-full px-2 py-1 font-semibold ${
                            isMine
                              ? "bg-blue-400/40 hover:bg-blue-400/60"
                              : "bg-gray-100 hover:bg-gray-200"
                          } disabled:opacity-50`}
                        >
                          {downloadingAttachmentId ===
                          attachment.id
                            ? "..."
                            : "Download"}
                        </button>
                      </div>
                    </div>
                  );
                }

                /*
                  VIDEO
                */
                if (
                  mime.startsWith(
                    "video/"
                  )
                ) {
                  return (
                    <div
                      key={
                        attachment.id
                      }
                      className="mt-2 overflow-hidden bg-black"
                      onPointerDown={(
                        event
                      ) =>
                        event.stopPropagation()
                      }
                      onClick={(
                        event
                      ) =>
                        event.stopPropagation()
                      }
                    >
                      <video
                        src={
                          attachment.file_url
                        }
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-[440px] w-full bg-black object-contain"
                      />

                      <div
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-[11px] ${
                          isMine
                            ? "bg-blue-500 text-blue-50"
                            : "bg-white text-gray-600"
                        }`}
                      >
                        <div className="min-w-0 flex-1 truncate">
                          {fileName}
                          {" · "}
                          {showAttachmentFileSizes ? fileSize : null}
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenAttachment(
                                attachment
                              )
                            }
                            className={`rounded-full px-2 py-1 font-semibold ${
                              isMine
                                ? "bg-blue-400/40 hover:bg-blue-400/60"
                                : "bg-gray-100 hover:bg-gray-200"
                            }`}
                          >
                            Open
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadAttachment(
                                attachment
                              )
                            }
                            disabled={
                              downloadingAttachmentId ===
                              attachment.id
                            }
                            className={`rounded-full px-2 py-1 font-semibold ${
                              isMine
                                ? "bg-blue-400/40 hover:bg-blue-400/60"
                                : "bg-gray-100 hover:bg-gray-200"
                            } disabled:opacity-50`}
                          >
                            {downloadingAttachmentId ===
                            attachment.id
                              ? "..."
                              : "Download"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                /*
                  FILE
                */
                return (
                  <div
                    key={
                      attachment.id
                    }
                    onPointerDown={(
                      event
                    ) =>
                      event.stopPropagation()
                    }
                    onClick={(
                      event
                    ) =>
                      event.stopPropagation()
                    }
                    className={`mx-3 mt-2 overflow-hidden rounded-xl ${
                      isMine
                        ? "bg-blue-500/50"
                        : "bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenAttachment(
                          attachment
                        )
                      }
                      className="flex w-full items-center gap-3 p-3 text-left"
                    >
                      <span className="text-2xl">
                        {getAttachmentIcon(
                          attachment
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {fileName}
                        </div>

                        <div className="text-[11px] opacity-70">
                          {showAttachmentFileSizes ? fileSize : null}
                        </div>
                      </div>

                      <span className="text-sm opacity-60">
                        ↗
                      </span>
                    </button>

                    <div
                      className={`flex justify-end border-t px-3 py-2 ${
                        isMine
                          ? "border-blue-300/30"
                          : "border-gray-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadAttachment(
                            attachment
                          )
                        }
                        disabled={
                          downloadingAttachmentId ===
                          attachment.id
                        }
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          isMine
                            ? "bg-blue-400/40 hover:bg-blue-400/60"
                            : "bg-gray-100 hover:bg-gray-200"
                        } disabled:opacity-50`}
                      >
                        {downloadingAttachmentId ===
                        attachment.id
                          ? "Downloading..."
                          : "Download"}
                      </button>
                    </div>
                  </div>
                );
              }
            )}

            {/* =================================================
                MESSAGE TEXT
            ================================================= */}
            {message.message && (
              <div className="px-4 pb-1 pt-2">
                <div className={`whitespace-pre-wrap break-words ${messageFontSize === "small" ? "text-xs" : messageFontSize === "large" ? "text-base" : "text-sm"} ${messageLineSpacing === "tight" ? "leading-tight" : messageLineSpacing === "relaxed" ? "leading-relaxed" : "leading-normal"}`}>
                  {renderMessageText(
                    message.message
                  )}
                </div>
              </div>
            )}

            {/* =================================================
                TIME / PIN
            ================================================= */}
            <div
              className={`px-3 pb-1.5 text-right text-[10px] ${
                isMine
                  ? "text-blue-100"
                  : "text-gray-500"
              }`}
            >
              {isPinned && showPinnedIndicators && (
                <span className="mr-1">
                  📌
                </span>
              )}

              {showEditedLabels && message.edited_at && !message.deleted_at && (
                <span className="mr-1" title="Message edited">(Edited)</span>
              )}
              {showMessageTimestamps ? time : null}
            </div>
          </div>

          {/* =================================================
              REACTION BADGES
          ================================================= */}
          {showReactionBadges && Object.keys(
            groupedReactions
          ).length >
            0 && (
            <div
              className={`relative z-20 -mt-2 flex ${
                isMine
                  ? "justify-end pr-2"
                  : "justify-start pl-2"
              }`}
            >
              <div className="flex items-center rounded-full border bg-white px-1.5 py-0.5 shadow-sm">
                {Object.entries(
                  groupedReactions
                ).map(
                  ([
                    emoji,
                    info,
                  ]) => (
                    <button
                      key={
                        emoji
                      }
                      type="button"
                      onPointerDown={(
                        event
                      ) =>
                        event.stopPropagation()
                      }
                      onClick={() =>
                        handleReaction(
                          emoji
                        )
                      }
                      className={`flex items-center gap-0.5 rounded-full px-1 ${
                        info.mine
                          ? "bg-blue-50"
                          : ""
                      }`}
                    >
                      <span className="text-sm">
                        {
                          emoji
                        }
                      </span>

                      {showReactionCounts && info.count >
                        1 && (
                        <span className="text-[10px] text-gray-500">
                          {
                            info.count
                          }
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* =================================================
              SENT / SEEN
          ================================================= */}
          {isMine && showReadReceipts && (
            <div className="mt-0.5 text-right text-[10px] text-gray-400">
              {isSeen
                ? "Seen"
                : "Sent"}
            </div>
          )}
        </div>
      </div>

      <ReportMessageModal
        isOpen={
          showReportModal
        }

        onClose={() =>
          setShowReportModal(
            false
          )
        }

        message={
          message
        }
      />

      {reactionPortal}

      {menuPortal}

      {imagePreviewPortal}
    </>
  );
}