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

export default function MessageBubble({
  message,
  currentUserId,
  conversationType = "direct",

  isPinned = false,
  isMentioned = false,

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
    !isDirect &&
    !isMine;

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
  const renderMessageText =
    (
      text
    ) => {
      if (!text) {
        return null;
      }

      const mentionRegex =
        /(@[A-Za-z0-9._-]{3,30})/g;

      const parts =
        text.split(
          mentionRegex
        );

      return parts.map(
        (
          part,
          index
        ) => {
          if (
            mentionRegex.test(
              part
            )
          ) {
            mentionRegex.lastIndex =
              0;

            return (
              <button
                key={`${part}-${index}`}
                type="button"
                onPointerDown={(
                  event
                ) =>
                  event.stopPropagation()
                }
                onClick={(
                  event
                ) =>
                  handleMentionClick(
                    part,
                    event
                  )
                }
                className={`font-semibold underline-offset-2 hover:underline ${
                  isMine
                    ? "text-white"
                    : "text-blue-600"
                }`}
              >
                {
                  part
                }
              </button>
            );
          }

          mentionRegex.lastIndex =
            0;

          return (
            <span
              key={`text-${index}`}
            >
              {
                part
              }
            </span>
          );
        }
      );
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
                  className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:scale-125 hover:bg-gray-100"
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
            className="overflow-hidden rounded-xl border bg-white py-1 text-sm text-gray-700 shadow-2xl"
          >
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
    MAIN UI
    =========================================================
  */
  return (
    <>
      <div
        ref={
          wrapperRef
        }
        className={`group relative mb-3 flex ${
          isMine
            ? "justify-end"
            : "justify-start"
        }`}
      >
        <div className="relative max-w-[82%] sm:max-w-[70%]">

          {/* =================================================
              QUICK ACTIONS

              Desktop:
              hover anywhere on same message row.

              Mobile:
              tap bubble / long press.
          ================================================= */}
          <div
            className={`absolute top-1/2 z-30 -translate-y-1/2 items-center gap-1 transition-opacity duration-100 md:flex ${
              showQuickActions
                ? "pointer-events-auto flex opacity-100"
                : "pointer-events-none hidden opacity-0 group-hover:pointer-events-auto group-hover:flex group-hover:opacity-100 md:flex"
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 hover:bg-gray-100"
              title="React"
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 hover:bg-gray-100"
              title="Reply"
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg shadow ring-1 ring-black/5 hover:bg-gray-100"
              title="More"
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
                className="truncate text-xs font-semibold text-blue-600 hover:underline"
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
            className={`select-none overflow-hidden rounded-2xl transition ${
              isMine
                ? "rounded-br-md bg-blue-600 text-white"
                : "rounded-bl-md bg-gray-200 text-gray-900"
            } ${
              isMentioned
                ? isMine
                  ? "ring-2 ring-purple-300 ring-offset-2"
                  : "ring-2 ring-purple-500 ring-offset-2"
                : ""
            }`}
          >
            {/* MENTIONED YOU BADGE */}
            {isMentioned &&
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
            {reply && (
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

                /*
                  IMAGE
                */
                if (
                  mime.startsWith(
                    "image/"
                  )
                ) {
                  return (
                    <a
                      key={
                        attachment.id
                      }
                      href={
                        attachment.file_url
                      }
                      target="_blank"
                      rel="noreferrer"
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
                      className="mt-2 block"
                    >
                      <img
                        src={
                          attachment.file_url
                        }
                        alt={
                          attachment.file_name ||
                          "Image"
                        }
                        draggable={
                          false
                        }
                        className="max-h-[420px] w-full object-contain"
                      />
                    </a>
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
                    <video
                      key={
                        attachment.id
                      }
                      src={
                        attachment.file_url
                      }
                      controls
                      playsInline
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
                      className="mt-2 max-h-[420px] w-full bg-black"
                    />
                  );
                }

                /*
                  FILE
                */
                return (
                  <a
                    key={
                      attachment.id
                    }
                    href={
                      attachment.file_url
                    }
                    target="_blank"
                    rel="noreferrer"
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
                    className={`mx-3 mt-2 flex items-center gap-3 rounded-xl p-3 ${
                      isMine
                        ? "bg-blue-500/50"
                        : "bg-white"
                    }`}
                  >
                    <span className="text-2xl">
                      📄
                    </span>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {
                          attachment.file_name
                        }
                      </div>

                      <div className="text-[11px] opacity-70">
                        {formatFileSize(
                          attachment.file_size
                        )}
                      </div>
                    </div>
                  </a>
                );
              }
            )}

            {/* =================================================
                MESSAGE TEXT
            ================================================= */}
            {message.message && (
              <div className="px-4 pb-1 pt-2">
                <div className="whitespace-pre-wrap break-words text-sm">
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
              {isPinned && (
                <span className="mr-1">
                  📌
                </span>
              )}

              {
                time
              }
            </div>
          </div>

          {/* =================================================
              REACTION BADGES
          ================================================= */}
          {Object.keys(
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

                      {info.count >
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
          {isMine && (
            <div className="mt-0.5 text-right text-[10px] text-gray-400">
              {isSeen
                ? "Seen"
                : "Sent"}
            </div>
          )}
        </div>
      </div>

      {reactionPortal}

      {menuPortal}
    </>
  );
}