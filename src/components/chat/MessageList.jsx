import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import MessageBubble from "./MessageBubble";

/* =========================================================
   HELPERS
========================================================= */

function getDisplayName(profile) {
  if (!profile) {
    return "Someone";
  }

  return (
    profile.full_name?.trim() ||
    profile.username?.trim() ||
    "Someone"
  );
}

function formatSystemEvent(event) {
  const actorName =
    getDisplayName(
      event.actor
    );

  const targetName =
    getDisplayName(
      event.target
    );

  const metadata =
    event.metadata ||
    {};

  switch (
    event.event_type
  ) {
    /* =====================================================
       GROUP EVENTS
    ===================================================== */

    case "member_added":
      return `${actorName} added ${targetName}`;

    case "member_removed":
      return `${actorName} removed ${targetName}`;

    case "member_joined_invite":
      return `${actorName} joined through an invite link`;

    case "member_left":
      return `${actorName} left the group`;

    case "member_promoted_admin":
      return `${actorName} made ${targetName} an admin`;

    case "member_demoted_admin":
      return `${actorName} removed ${targetName} as admin`;

    case "ownership_transferred":
      return `${actorName} transferred group ownership to ${targetName}`;

    case "group_name_changed":
      return `${actorName} changed the group name to "${
        metadata.new_title ||
        "New Group Name"
      }"`;

    case "group_photo_changed":
      return `${actorName} changed the group picture`;

    case "group_photo_removed":
      return `${actorName} removed the group picture`;

    /* =====================================================
       CHANNEL MEMBER EVENTS
    ===================================================== */

    case "channel_member_added":
      return `${actorName} added ${targetName} to the channel`;

    case "channel_member_removed":
      return `${actorName} removed ${targetName} from the channel`;

    case "channel_member_joined_invite":
      return `${actorName} joined the channel through an invite link`;

    case "channel_member_joined_public":
      return `${actorName} joined the channel`;

    case "channel_member_left":
      return `${actorName} left the channel`;

    /* =====================================================
       CHANNEL ROLE EVENTS
    ===================================================== */

    case "channel_member_promoted_admin":
      return `${actorName} made ${targetName} an admin`;

    case "channel_member_promoted_moderator":
      return `${actorName} made ${targetName} a moderator`;

    case "channel_member_demoted": {
      const newRole =
        metadata.new_role;

      if (
        newRole ===
        "moderator"
      ) {
        return `${actorName} changed ${targetName} to moderator`;
      }

      return `${actorName} changed ${targetName} to member`;
    }

    case "channel_ownership_transferred":
      return `${actorName} transferred channel ownership to ${targetName}`;

    /* =====================================================
       CHANNEL SETTINGS EVENTS
    ===================================================== */

    case "channel_name_changed":
      return `${actorName} changed the channel name to "${
        metadata.new_title ||
        "New Channel Name"
      }"`;

    case "channel_description_changed":
      return `${actorName} changed the channel description`;

    case "channel_privacy_changed":
      return metadata.is_private
        ? `${actorName} made the channel private`
        : `${actorName} made the channel public`;

    case "channel_username_changed":
      if (
        metadata.new_slug
      ) {
        return `${actorName} changed the channel username to @${metadata.new_slug}`;
      }

      return `${actorName} removed the channel username`;

    case "channel_photo_changed":
      return `${actorName} changed the channel picture`;

    case "channel_photo_removed":
      return `${actorName} removed the channel picture`;

    /* =====================================================
       FALLBACK
    ===================================================== */

    default:
      return (
        event.message ||
        "Chat activity"
      );
  }
}

function getMessageTimestamp(
  item
) {
  return (
    item?.created_at ||
    item?.timestamp ||
    item?.inserted_at ||
    null
  );
}

function getDateKey(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function formatDateSeparator(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const now =
    new Date();

  const startOfToday =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const startOfMessageDay =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  const diffDays =
    Math.round(
      (
        startOfToday -
        startOfMessageDay
      ) /
      86400000
    );

  if (
    diffDays ===
    0
  ) {
    return "Today";
  }

  if (
    diffDays ===
    1
  ) {
    return "Yesterday";
  }

  const sameYear =
    date.getFullYear() ===
    now.getFullYear();

  return date.toLocaleDateString(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      ...(sameYear
        ? {}
        : {
            year:
              "numeric",
          }),
    }
  );
}

function buildTimelineWithDateSeparators(
  messages
) {
  const rows = [];

  let lastDateKey =
    null;

  for (
    const item of messages ||
    []
  ) {
    const timestamp =
      getMessageTimestamp(
        item
      );

    const dateKey =
      getDateKey(
        timestamp
      );

    if (
      dateKey &&
      dateKey !==
        lastDateKey
    ) {
      rows.push({
        timeline_type:
          "date-separator",

        id:
          `date-${dateKey}`,

        dateKey,

        created_at:
          timestamp,

        label:
          formatDateSeparator(
            timestamp
          ),
      });

      lastDateKey =
        dateKey;
    }

    rows.push(
      item
    );
  }

  return rows;
}

/* =========================================================
   SYSTEM EVENT
========================================================= */

const SystemEvent =
  memo(function SystemEvent({ event, canDelete = false, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const holdTimer = useRef(null);
    useEffect(() => () => clearTimeout(holdTimer.current), []);
    const openMenu = () => { if (canDelete) setMenuOpen(true); };
    const onLongPressStart = () => {
      if (canDelete) holdTimer.current = setTimeout(openMenu, 550);
    };
    const cancelLongPress = () => clearTimeout(holdTimer.current);
  const text =
    formatSystemEvent(
      event
    );

  return (
    <div
      className="relative flex w-full justify-center px-4 py-2"
      onContextMenu={(e) => { if (canDelete) { e.preventDefault(); openMenu(); } }}
      onTouchStart={onLongPressStart}
      onTouchMove={cancelLongPress}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
    >
      <div
        className="
          max-w-[90%]
          rounded-full
          bg-gray-200/70
          px-3
          py-1.5
          text-center
          text-xs
          leading-relaxed
          text-gray-500
        "
      >
        {text}
      </div>
      {canDelete && (
        <button type="button" aria-label="System event actions" title="System event actions"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-2 rounded-full px-2 text-xs text-gray-500 hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500">
          ⋯
        </button>
      )}
      {canDelete && menuOpen && (
        <div className="absolute top-full z-40 mt-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button type="button" className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={() => { setMenuOpen(false); onDelete?.(event); }}>
            Delete system message
          </button>
          <button type="button" className="ml-1 rounded-md px-2 py-2 text-sm text-gray-600 hover:bg-gray-100"
            onClick={() => setMenuOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
});

const DateSeparator =
  memo(function DateSeparator({
    label,
  }) {
    return (
      <div
        role="separator"
        aria-label={label}
        className="sticky top-2 z-20 my-3 flex justify-center pointer-events-none"
      >
        <div className="rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm backdrop-blur">
          {label}
        </div>
      </div>
    );
  });

/* =========================================================
   MEMOIZED MESSAGE ROW
========================================================= */

const MessageRow =
  memo(function MessageRow({
    message,
    currentUserId,
    conversationType,
    isPinned,
    isMentioned,
    groupedWithPrevious,
    groupedWithNext,
    density,
    reduceMotion,
    showReadReceipts,
    messageFontSize,
    messageLineSpacing,
    showMessageTimestamps,
    bubbleColor,
    bubbleShape,
    showSenderNames,
    showReactionCounts,
    showReactionBadges,
    showPinnedIndicators,
    showSenderAvatars,
    showEditedLabels,
    showReplyPreviews,
    showAttachmentPreviews,
    showAttachmentFileSizes,
    highlightMentions,
    messageTimeFormat,
    canPin,
    onLoadOlderMessages,
    onReply,
    onJumpToMessage,
    onDelete,
    onReact,
    onPin,
    onOpenDirectChat,
  }) {
    return (
      <div
        id={
          `message-${message.id}`
        }
        className={reduceMotion ? "" : "transition-all duration-300"}
      >
        <MessageBubble
          message={
            message
          }

          currentUserId={
            currentUserId
          }

          conversationType={
            conversationType
          }

          isPinned={
            isPinned
          }

          isMentioned={
            isMentioned
          }

          groupedWithPrevious={
            groupedWithPrevious
          }

          groupedWithNext={
            groupedWithNext
          }

          density={density}
          reduceMotion={reduceMotion}
          showReadReceipts={showReadReceipts}
          messageFontSize={messageFontSize}
          messageLineSpacing={messageLineSpacing}
          showMessageTimestamps={showMessageTimestamps}
          bubbleColor={bubbleColor}
          bubbleShape={bubbleShape}
          showSenderNames={showSenderNames}
          showReactionCounts={showReactionCounts}
          showReactionBadges={showReactionBadges}
          showPinnedIndicators={showPinnedIndicators}
          showSenderAvatars={showSenderAvatars}
          showEditedLabels={showEditedLabels}
          showReplyPreviews={showReplyPreviews}
          showAttachmentPreviews={showAttachmentPreviews}
          showAttachmentFileSizes={showAttachmentFileSizes}
          highlightMentions={highlightMentions}
          messageTimeFormat={messageTimeFormat}

          canPin={
            canPin
          }

          onReply={
            onReply
          }

          onJumpToMessage={
            onJumpToMessage
          }

          onDelete={
            onDelete
          }

          onReact={
            onReact
          }

          onPin={
            onPin
          }

          onOpenDirectChat={
            onOpenDirectChat
          }
        />
      </div>
    );
  });

function isRealMessage(
  item
) {
  return Boolean(
    item?.id
  ) &&
    item.timeline_type !==
      "system" &&
    item.timeline_type !==
      "date-separator" &&
    !item.event_type;
}

function canGroupMessages(
  previous,
  current
) {
  if (
    !isRealMessage(
      previous
    ) ||
    !isRealMessage(
      current
    )
  ) {
    return false;
  }

  if (
    previous.sender_id !==
    current.sender_id
  ) {
    return false;
  }

  const previousTimestamp =
    getMessageTimestamp(
      previous
    );

  const currentTimestamp =
    getMessageTimestamp(
      current
    );

  if (
    !previousTimestamp ||
    !currentTimestamp
  ) {
    return false;
  }

  if (
    getDateKey(
      previousTimestamp
    ) !==
    getDateKey(
      currentTimestamp
    )
  ) {
    return false;
  }

  const previousTime =
    new Date(
      previousTimestamp
    ).getTime();

  const currentTime =
    new Date(
      currentTimestamp
    ).getTime();

  if (
    Number.isNaN(
      previousTime
    ) ||
    Number.isNaN(
      currentTime
    )
  ) {
    return false;
  }

  return (
    currentTime -
      previousTime
  ) <=
    5 * 60 * 1000;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function MessageList({
  messages,
  currentUserId,
  conversationType = "direct",
  pinnedMessageIds = new Set(),
  mentionedMessageIds = new Set(),
  canPin = false,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages,
  onReply,
  onJumpToMessage,
  onDelete,
  onDeleteSystemEvent,
  canDeleteSystemEvents = false,
  onReact,
  onPin,
  onOpenDirectChat,
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
  showDateSeparators = true,
}) {
  const bottomRef =
    useRef(null);

  const scrollContainerRef =
    useRef(null);

  const wasNearBottomRef =
    useRef(true);

  const previousIdsRef =
    useRef(
      new Set()
    );

  const initializedRef =
    useRef(false);

  const preserveScrollRef =
    useRef(null);

  const [
    unseenCount,
    setUnseenCount,
  ] =
    useState(
      0
    );

  const [
    firstUnseenMessageId,
    setFirstUnseenMessageId,
  ] =
    useState(
      null
    );

  const callbackRefs =
    useRef({
      onLoadOlderMessages,
      onReply,
      onJumpToMessage,
      onDelete,
      onReact,
      onPin,
      onOpenDirectChat,
    });

  callbackRefs.current = {
    onLoadOlderMessages,
    onReply,
    onJumpToMessage,
    onDelete,
    onReact,
    onPin,
    onOpenDirectChat,
  };

  const clearUnseen =
    useCallback(
      () => {
        setUnseenCount(
          0
        );

        setFirstUnseenMessageId(
          null
        );
      },
      []
    );

  const scrollToLatest =
    useCallback(
      (
        behavior =
          "smooth"
      ) => {
        bottomRef.current?.scrollIntoView({
          behavior: reduceMotion ? "auto" : behavior,
          block: "end",
        });

        wasNearBottomRef.current =
          true;

        clearUnseen();
      },
      [
        clearUnseen,
        reduceMotion,
      ]
    );

  const jumpToFirstUnseen =
    useCallback(
      () => {
        if (
          firstUnseenMessageId
        ) {
          const element =
            document.getElementById(
              `message-${firstUnseenMessageId}`
            );

          if (element) {
            element.scrollIntoView({
              behavior: reduceMotion ? "auto" : "smooth",
              block: "center",
            });

            element.classList.add(
              "ring-2",
              "ring-blue-400",
              "rounded-xl"
            );

            setTimeout(
              () => {
                element.classList.remove(
                  "ring-2",
                  "ring-blue-400",
                  "rounded-xl"
                );
              },
              1200
            );

            clearUnseen();

            return;
          }
        }

        scrollToLatest();
      },
      [
        clearUnseen,
        firstUnseenMessageId,
        scrollToLatest,
        reduceMotion,
      ]
    );

  const stableOnLoadOlderMessages =
    useCallback(
      async () => {
        const element =
          scrollContainerRef.current;

        if (
          element
        ) {
          preserveScrollRef.current = {
            scrollHeight:
              element.scrollHeight,

            scrollTop:
              element.scrollTop,
          };
        }

        await callbackRefs.current
          .onLoadOlderMessages?.();
      },
      []
    );

  const stableOnReply =
    useCallback(
      (
        ...args
      ) =>
        callbackRefs.current
          .onReply?.(
            ...args
          ),
      []
    );

  const stableOnJumpToMessage =
    useCallback(
      (
        ...args
      ) =>
        callbackRefs.current
          .onJumpToMessage?.(
            ...args
          ),
      []
    );

  const stableOnDelete =
    useCallback(
      (
        ...args
      ) =>
        callbackRefs.current
          .onDelete?.(
            ...args
          ),
      []
    );

  const stableOnReact =
    useCallback(
      (
        ...args
      ) =>
        callbackRefs.current
          .onReact?.(
            ...args
          ),
      []
    );

  const stableOnPin =
    useCallback(
      (
        ...args
      ) =>
        callbackRefs.current
          .onPin?.(
            ...args
          ),
      []
    );

  const stableOnOpenDirectChat =
    useCallback(
      (
        ...args
      ) =>
        callbackRefs.current
          .onOpenDirectChat?.(
            ...args
          ),
      []
    );

  useEffect(() => {
    const rows =
      messages ||
      [];

    const currentIds =
      new Set(
        rows
          .map(
            (
              item
            ) =>
              item?.id
          )
          .filter(
            Boolean
          )
      );

    if (
      !initializedRef.current
    ) {
      initializedRef.current =
        true;

      previousIdsRef.current =
        currentIds;

      requestAnimationFrame(
        () => {
          scrollToLatest(
            "auto"
          );
        }
      );

      return;
    }

    const previousIds =
      previousIdsRef.current;

    const addedRows =
      rows.filter(
        (
          item
        ) =>
          item?.id &&
          !previousIds.has(
            item.id
          )
      );

    previousIdsRef.current =
      currentIds;

    const preserve =
      preserveScrollRef.current;

    if (
      addedRows.length >
        0 &&
      preserve &&
      scrollContainerRef.current
    ) {
      const element =
        scrollContainerRef.current;

      requestAnimationFrame(
        () => {
          const addedHeight =
            element.scrollHeight -
            preserve.scrollHeight;

          element.scrollTop =
            preserve.scrollTop +
            addedHeight;

          preserveScrollRef.current =
            null;
        }
      );

      return;
    }

    if (
      addedRows.length ===
      0
    ) {
      return;
    }

    const realAddedMessages =
      addedRows.filter(
        (
          item
        ) =>
          !(
            item.timeline_type ===
              "system" ||
            item.event_type
          )
      );

    const ownMessageAdded =
      realAddedMessages.some(
        (
          item
        ) =>
          item.sender_id ===
          currentUserId
      );

    if (
      wasNearBottomRef.current ||
      ownMessageAdded
    ) {
      requestAnimationFrame(
        () => {
          scrollToLatest(
            ownMessageAdded
              ? "smooth"
              : "smooth"
          );
        }
      );

      return;
    }

    const incoming =
      realAddedMessages.filter(
        (
          item
        ) =>
          item.sender_id !==
          currentUserId
      );

    if (
      incoming.length >
      0
    ) {
      setUnseenCount(
        (
          current
        ) =>
          current +
          incoming.length
      );

      setFirstUnseenMessageId(
        (
          current
        ) =>
          current ||
          incoming[0]?.id ||
          null
      );
    }
  }, [
    messages,
    currentUserId,
    scrollToLatest,
  ]);

  const handleScroll =
    useCallback(
      (
        event
      ) => {
        const element =
          event.currentTarget;

        const distanceFromBottom =
          element.scrollHeight -
          element.scrollTop -
          element.clientHeight;

        const nearBottom =
          distanceFromBottom <
          160;

        wasNearBottomRef.current =
          nearBottom;

        if (
          nearBottom
        ) {
          clearUnseen();
        }
      },
      [
        clearUnseen,
      ]
    );

  if (
    !messages?.length
  ) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-50 px-4">
        <div className="text-center text-sm text-gray-400">
          No messages yet.
          <br />
          Send the first message.
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 bg-gray-50">
      <div
        ref={
          scrollContainerRef
        }
        onScroll={
          handleScroll
        }
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions text"
        tabIndex={0}
        className="
          h-full
          overflow-y-auto
          bg-gray-50
          px-3
          pt-4
          pb-20
          sm:px-5
          [scrollbar-width:none]
          [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
        "
      >
        {hasOlderMessages && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              disabled={
                loadingOlderMessages
              }
              onClick={
                stableOnLoadOlderMessages
              }
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingOlderMessages
                ? "Loading older messages..."
                : "Load older messages"}
            </button>
          </div>
        )}

        {buildTimelineWithDateSeparators(
          messages
        ).map(
          (
            message,
            index,
            timeline
          ) => {
            if (
              message.timeline_type ===
              "date-separator"
            ) {
              if (!showDateSeparators) return null;
              return (
                <DateSeparator
                  key={
                    message.id
                  }
                  label={
                    message.label
                  }
                />
              );
            }

            const isSystem =
              message.timeline_type ===
                "system" ||
              Boolean(
                message.event_type
              );

            if (
              isSystem
            ) {
              return (
                <div
                  key={
                    `system-${message.id}`
                  }
                  className={reduceMotion ? "" : "transition-all duration-300"}
                >
                  <SystemEvent
                    event={message}
                    canDelete={canDeleteSystemEvents}
                    onDelete={onDeleteSystemEvent}
                  />
                </div>
              );
            }

            const previousItem =
              timeline[
                index -
                  1
              ];

            const nextItem =
              timeline[
                index +
                  1
              ];

            const groupedWithPrevious =
              canGroupMessages(
                previousItem,
                message
              );

            const groupedWithNext =
              canGroupMessages(
                message,
                nextItem
              );

            return (
              <MessageRow
                key={
                  message.id
                }
                message={
                  message
                }
                currentUserId={
                  currentUserId
                }
                conversationType={
                  conversationType
                }
                isPinned={
                  pinnedMessageIds.has(
                    message.id
                  )
                }
                isMentioned={
                  mentionedMessageIds.has(
                    message.id
                  )
                }
                groupedWithPrevious={
                  groupedWithPrevious
                }
                groupedWithNext={
                  groupedWithNext
                }
                density={density}
                reduceMotion={reduceMotion}
                showReadReceipts={showReadReceipts}
                messageFontSize={messageFontSize}
                messageLineSpacing={messageLineSpacing}
                showMessageTimestamps={showMessageTimestamps}
                bubbleColor={bubbleColor}
                bubbleShape={bubbleShape}
          showSenderNames={showSenderNames}
          showReactionCounts={showReactionCounts}
          showReactionBadges={showReactionBadges}
          showPinnedIndicators={showPinnedIndicators}
          showSenderAvatars={showSenderAvatars}
          showEditedLabels={showEditedLabels}
          showReplyPreviews={showReplyPreviews}
          showAttachmentPreviews={showAttachmentPreviews}
          showAttachmentFileSizes={showAttachmentFileSizes}
          highlightMentions={highlightMentions}
          messageTimeFormat={messageTimeFormat}
                canPin={
                  canPin
                }
                onReply={
                  stableOnReply
                }
                onJumpToMessage={
                  stableOnJumpToMessage
                }
                onDelete={
                  stableOnDelete
                }
                onReact={
                  stableOnReact
                }
                onPin={
                  stableOnPin
                }
                onOpenDirectChat={
                  stableOnOpenDirectChat
                }
              />
            );
          }
        )}

        <div
          ref={
            bottomRef
          }
          className="h-px"
        />
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {unseenCount > 0
          ? `${unseenCount} new ${unseenCount === 1 ? "message" : "messages"}`
          : ""}
      </div>

      {!wasNearBottomRef.current && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
          {unseenCount >
            0 && (
            <button
              type="button"
              onClick={
                jumpToFirstUnseen
              }
              aria-label={
                unseenCount === 1
                  ? "Jump to 1 new message"
                  : `Jump to ${unseenCount} new messages`
              }
              className="pointer-events-auto rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              ↓{" "}
              {unseenCount ===
              1
                ? "1 new message"
                : `${unseenCount} new messages`}
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              scrollToLatest()
            }
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-lg font-bold text-gray-700 shadow-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            aria-label="Jump to latest message"
            title="Jump to latest"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}
