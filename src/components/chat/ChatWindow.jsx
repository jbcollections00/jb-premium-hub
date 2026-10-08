import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../../services/supabaseClient";

import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import GroupInfoModal from "./GroupInfoModal";
import ChannelInfoModal from "./ChannelInfoModal";
import CommunityInfoModal from "./CommunityInfoModal";
import SharedMediaModal from "./SharedMediaModal";
import MessageSearchModal from "./MessageSearchModal";
import PinnedMessageBar from "./PinnedMessageBar";
import ChatPreferencesPanel from "./ChatPreferencesPanel";

import {
  canSendChatMessage,
  canSendCommunityMessage,
  getChatPreferences,
  deleteChatMessage,
  deleteSystemEvent,
  getConversationMembers,
  getConversationMentions,
  getMessageById,
  getMessageReadCounts,
  getMessagesPage,
  getPinnedMessages,
  getSystemEventById,
  getSystemEvents,
  getSystemEventsAfter,
  markConversationMentionsRead,
  markConversationRead,
  sendAttachmentMessage,
  sendMessage,
  sendTypingStatus,
  subscribeToAttachments,
  subscribeToMentions,
  subscribeToMessages,
  subscribeToPinnedMessages,
  subscribeToReadReceipts,
  subscribeToReactions,
  subscribeToSystemEvents,
  subscribeToTyping,
  toggleChatReaction,
  togglePinnedMessage,
  unsubscribeFromMessages,
  updateMyLastSeen,
} from "../../services/chatService";

/* =========================================================
   HELPERS
========================================================= */

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) {
    return "Offline";
  }

  const lastSeen =
    new Date(lastSeenAt);

  const diffMinutes =
    Math.floor(
      (
        Date.now() -
        lastSeen.getTime()
      ) / 60000
    );

  if (diffMinutes <= 2) {
    return "Active now";
  }

  if (diffMinutes < 60) {
    return `Active ${diffMinutes}m ago`;
  }

  const diffHours =
    Math.floor(
      diffMinutes / 60
    );

  if (diffHours < 24) {
    return `Active ${diffHours}h ago`;
  }

  const diffDays =
    Math.floor(
      diffHours / 24
    );

  if (diffDays === 1) {
    return "Active yesterday";
  }

  if (diffDays < 7) {
    return `Active ${diffDays}d ago`;
  }

  return `Last seen ${lastSeen.toLocaleDateString()}`;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ChatWindow({
  conversation,
  currentUser,
  onBack,
  onOpenDirectChat,
  onOpenConversation,
  onConversationLeft,
}) {
  const [
    messages,
    setMessages,
  ] = useState([]);

  const [
    systemEvents,
    setSystemEvents,
  ] = useState([]);

  const [
    pinnedMessages,
    setPinnedMessages,
  ] = useState([]);

  const [
    conversationMentions,
    setConversationMentions,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    hasOlderMessages,
    setHasOlderMessages,
  ] = useState(false);

  const [
    loadingOlderMessages,
    setLoadingOlderMessages,
  ] = useState(false);

  const [
    oldestMessageCursor,
    setOldestMessageCursor,
  ] = useState(null);

  const [
    replyingTo,
    setReplyingTo,
  ] = useState(null);

  const [
    otherLastSeen,
    setOtherLastSeen,
  ] = useState(
    conversation?.lastSeenAt ||
      null
  );

  const [
    otherIsTyping,
    setOtherIsTyping,
  ] = useState(false);

  const [
    showGroupInfo,
    setShowGroupInfo,
  ] = useState(false);

  const [
    showChannelInfo,
    setShowChannelInfo,
  ] = useState(false);

  const [
    showCommunityInfo,
    setShowCommunityInfo,
  ] = useState(false);

  const [
    showSharedMedia,
    setShowSharedMedia,
  ] = useState(false);

  const [
    showMessageSearch,
    setShowMessageSearch,
  ] = useState(false);

  const [
    showChatPreferences,
    setShowChatPreferences,
  ] = useState(false);

  const [
    chatPreferences,
    setChatPreferences,
  ] = useState({
    chat_density: "comfortable",
    enter_to_send: true,
    show_read_receipts: true,
    show_typing_indicator: true,
    reduce_motion: false,
    message_font_size: "medium",
    message_line_spacing: "normal",
    show_message_timestamps: true,
    bubble_color: "blue",
    bubble_shape: "rounded",
    show_sender_names: true,
    show_date_separators: true,
    show_reaction_counts: true,
    show_reaction_badges: true,
    show_pinned_indicators: true,
    show_sender_avatars: true,
    show_edited_labels: true,
    show_reply_previews: true,
    show_attachment_previews: true,
    show_attachment_file_sizes: true,
    highlight_mentions: true,
    message_time_format: "system",
  });

  const [
    localConversation,
    setLocalConversation,
  ] = useState(
    conversation
  );

  const [
    parentCommunity,
    setParentCommunity,
  ] = useState(null);

  const [
    groupMemberCount,
    setGroupMemberCount,
  ] = useState(0);

  const [
    currentMemberRole,
    setCurrentMemberRole,
  ] = useState(null);

  const [
    hasLeftConversation,
    setHasLeftConversation,
  ] = useState(false);

  const [
    canPost,
    setCanPost,
  ] = useState(true);

  const [
    checkingPostPermission,
    setCheckingPostPermission,
  ] = useState(false);

  const [
    isOnline,
    setIsOnline,
  ] = useState(
    typeof navigator !==
      "undefined"
      ? navigator.onLine
      : true
  );

  const [
    reconnectGeneration,
    setReconnectGeneration,
  ] = useState(0);

  const [
    showReconnected,
    setShowReconnected,
  ] = useState(false);

  const typingChannelRef =
    useRef(null);

  const typingClearTimerRef =
    useRef(null);

  const systemEventCursorRef =
    useRef(null);

  const systemEventPollingRef =
    useRef(false);

  const messagesRef =
    useRef([]);

  const readCountRefreshTimerRef =
    useRef(null);

  const readCountRefreshRunningRef =
    useRef(false);

  const permissionRefreshRunningRef =
    useRef(false);

  const reconnectNoticeTimerRef =
    useRef(null);

  const recoveryTimerRef =
    useRef(null);

  const lastRecoveryAtRef =
    useRef(0);

  const hiddenAtRef =
    useRef(null);

  const pendingMessageRefreshIdsRef =
    useRef(
      new Set()
    );

  const messageRefreshTimersRef =
    useRef(
      new Map()
    );

  const memberSnapshotRef =
    useRef({
      conversationId:
        null,
      fetchedAt:
        0,
      data:
        null,
      promise:
        null,
    });

  /* =========================================================
     ONLINE / OFFLINE + RECONNECT RECOVERY
  ========================================================= */

  const scheduleReconnectRecovery =
    (
      delay = 250
    ) => {
      if (
        typeof navigator !==
          "undefined" &&
        !navigator.onLine
      ) {
        return;
      }

      if (
        recoveryTimerRef.current
      ) {
        clearTimeout(
          recoveryTimerRef.current
        );
      }

      recoveryTimerRef.current =
        setTimeout(
          () => {
            recoveryTimerRef.current =
              null;

            const now =
              Date.now();

            if (
              now -
                lastRecoveryAtRef.current <
              1200
            ) {
              return;
            }

            lastRecoveryAtRef.current =
              now;

            setReconnectGeneration(
              (
                current
              ) =>
                current +
                1
            );
          },
          delay
        );
    };

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    const handleOffline =
      () => {
        setIsOnline(
          false
        );

        setShowReconnected(
          false
        );

        if (
          recoveryTimerRef.current
        ) {
          clearTimeout(
            recoveryTimerRef.current
          );

          recoveryTimerRef.current =
            null;
        }
      };

    const handleOnline =
      () => {
        setIsOnline(
          true
        );

        setShowReconnected(
          true
        );

        scheduleReconnectRecovery(
          200
        );

        if (
          reconnectNoticeTimerRef.current
        ) {
          clearTimeout(
            reconnectNoticeTimerRef.current
          );
        }

        reconnectNoticeTimerRef.current =
          setTimeout(
            () => {
              setShowReconnected(
                false
              );

              reconnectNoticeTimerRef.current =
                null;
            },
            2500
          );
      };

    const handleVisibilityChange =
      () => {
        if (
          document.hidden
        ) {
          hiddenAtRef.current =
            Date.now();

          return;
        }

        const hiddenFor =
          hiddenAtRef.current
            ? Date.now() -
              hiddenAtRef.current
            : 0;

        hiddenAtRef.current =
          null;

        if (
          navigator.onLine &&
          hiddenFor >=
            10000
        ) {
          scheduleReconnectRecovery(
            150
          );
        }
      };

    const handleFocus =
      () => {
        if (
          navigator.onLine &&
          Date.now() -
            lastRecoveryAtRef.current >=
            30000
        ) {
          scheduleReconnectRecovery(
            150
          );
        }
      };

    const handlePageShow =
      (
        event
      ) => {
        if (
          event.persisted &&
          navigator.onLine
        ) {
          scheduleReconnectRecovery(
            100
          );
        }
      };

    setIsOnline(
      navigator.onLine
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "focus",
      handleFocus
    );

    window.addEventListener(
      "pageshow",
      handlePageShow
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.removeEventListener(
        "offline",
        handleOffline
      );

      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "focus",
        handleFocus
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      if (
        recoveryTimerRef.current
      ) {
        clearTimeout(
          recoveryTimerRef.current
        );

        recoveryTimerRef.current =
          null;
      }

      if (
        reconnectNoticeTimerRef.current
      ) {
        clearTimeout(
          reconnectNoticeTimerRef.current
        );

        reconnectNoticeTimerRef.current =
          null;
      }
    };
  }, []);

  useEffect(() => {
    messagesRef.current =
      messages;
  }, [
    messages,
  ]);

  const activeConversation =
    hasLeftConversation
      ? null
      : localConversation ||
        conversation;

  const conversationType =
    activeConversation?.type ||
    "direct";

  const isDirect =
    conversationType ===
    "direct";

  const isGroup =
    conversationType ===
    "group";

  const isChannel =
    conversationType ===
    "channel";

  const isCommunity =
    conversationType ===
    "community";

  const isSelfChat =
    Boolean(
      activeConversation?.isSelfChat
    ) ||
    (
      isDirect &&
      activeConversation
        ?.otherUserId ===
        currentUser?.id
    );

  const canPin =
    isDirect ||
    [
      "owner",
      "admin",
      "moderator",
    ].includes(
      currentMemberRole
    );

  const canDeleteSystemEvents = !isDirect && ["owner", "admin"].includes(currentMemberRole);

  const handleDeleteSystemEvent = async (event) => {
    if (!canDeleteSystemEvents || !event?.id) return;
    if (!window.confirm("Delete this system message for everyone? This will not undo the membership or role change.")) return;
    try {
      await deleteSystemEvent(event.id);
      setSystemEvents((current) => current.filter((item) => String(item.id) !== String(event.id)));
    } catch (error) {
      console.error("Delete system event failed:", error);
      window.alert(error?.message || "Unable to delete system message.");
    }
  };

  /* =========================================================
     SYNC CONVERSATION
  ========================================================= */

  useEffect(() => {
    setLocalConversation(
      conversation
    );

    setShowGroupInfo(
      false
    );

    setShowChannelInfo(
      false
    );

    setShowCommunityInfo(
      false
    );

    setShowSharedMedia(
      false
    );

    setShowMessageSearch(
      false
    );

    setCurrentMemberRole(
      null
    );

    setParentCommunity(
      null
    );

    setHasLeftConversation(
      false
    );

    setCanPost(
      true
    );

    setMessages(
      []
    );

    setHasOlderMessages(
      false
    );

    setLoadingOlderMessages(
      false
    );

    setOldestMessageCursor(
      null
    );

    setSystemEvents(
      []
    );

    setReplyingTo(
      null
    );

    systemEventCursorRef.current =
      null;

    systemEventPollingRef.current =
      false;

    permissionRefreshRunningRef.current =
      false;

    memberSnapshotRef.current = {
      conversationId:
        conversation?.id ||
        null,
      fetchedAt:
        0,
      data:
        null,
      promise:
        null,
    };

    pendingMessageRefreshIdsRef.current.clear();

    for (
      const timer of
      messageRefreshTimersRef.current.values()
    ) {
      clearTimeout(
        timer
      );
    }

    messageRefreshTimersRef.current.clear();

    if (
      readCountRefreshTimerRef.current
    ) {
      clearTimeout(
        readCountRefreshTimerRef.current
      );

      readCountRefreshTimerRef.current =
        null;
    }
  }, [
    conversation?.id,
  ]);

  /* =========================================================
     MEMBER SNAPSHOT CACHE
  ========================================================= */

  const getMemberSnapshot =
    async ({
      force = false,
    } = {}) => {
      const conversationId =
        activeConversation?.id;

      if (!conversationId) {
        return [];
      }

      const now =
        Date.now();

      const cached =
        memberSnapshotRef.current;

      if (
        !force &&
        cached.conversationId ===
          conversationId &&
        Array.isArray(
          cached.data
        ) &&
        now -
          cached.fetchedAt <
          5000
      ) {
        return cached.data;
      }

      if (
        cached.conversationId ===
          conversationId &&
        cached.promise
      ) {
        return cached.promise;
      }

      const promise =
        getConversationMembers(
          conversationId
        )
          .then(
            (
              rows
            ) => {
              const data =
                rows ||
                [];

              memberSnapshotRef.current = {
                conversationId,
                fetchedAt:
                  Date.now(),
                data,
                promise:
                  null,
              };

              return data;
            }
          )
          .catch(
            (
              error
            ) => {
              memberSnapshotRef.current = {
                conversationId,
                fetchedAt:
                  0,
                data:
                  null,
                promise:
                  null,
              };

              throw error;
            }
          );

      memberSnapshotRef.current = {
        conversationId,
        fetchedAt:
          cached.fetchedAt ||
          0,
        data:
          cached.data,
        promise,
      };

      return promise;
    };

  /* =========================================================
     PARENT COMMUNITY CONTEXT
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id ||
      (
        activeConversation.type !==
          "group" &&
        activeConversation.type !==
          "channel"
      )
    ) {
      setParentCommunity(
        null
      );

      return;
    }

    let cancelled =
      false;

    const loadParentCommunity =
      async () => {
        try {
          const {
            data: linkRow,
            error: linkError,
          } =
            await supabase
              .from(
                "community_conversations"
              )
              .select(
                "community_id"
              )
              .eq(
                "conversation_id",
                activeConversation.id
              )
              .limit(1)
              .maybeSingle();

          if (linkError) {
            throw linkError;
          }

          if (
            !linkRow?.community_id
          ) {
            if (!cancelled) {
              setParentCommunity(
                null
              );
            }

            return;
          }

          const {
            data: membershipRow,
            error: membershipError,
          } =
            await supabase
              .from(
                "chat_members"
              )
              .select(
                "role"
              )
              .eq(
                "conversation_id",
                linkRow.community_id
              )
              .eq(
                "user_id",
                currentUser.id
              )
              .maybeSingle();

          if (membershipError) {
            throw membershipError;
          }

          if (!membershipRow) {
            if (!cancelled) {
              setParentCommunity(
                null
              );
            }

            return;
          }

          const {
            data: communityRow,
            error: communityError,
          } =
            await supabase
              .from(
                "chat_conversations"
              )
              .select(`
                id,
                type,
                title,
                description,
                avatar_url,
                created_by,
                is_private,
                slug,
                created_at,
                updated_at
              `)
              .eq(
                "id",
                linkRow.community_id
              )
              .eq(
                "type",
                "community"
              )
              .maybeSingle();

          if (communityError) {
            throw communityError;
          }

          if (
            cancelled ||
            !communityRow
          ) {
            return;
          }

          setParentCommunity({
            ...communityRow,

            displayName:
              communityRow.title ||
              "Community",

            currentMemberRole:
              membershipRow.role ||
              "member",
          });
        } catch (error) {
          console.error(
            "Load parent community context error:",
            error
          );

          if (!cancelled) {
            setParentCommunity(
              null
            );
          }
        }
      };

    loadParentCommunity();

    return () => {
      cancelled =
        true;
    };
  }, [
    activeConversation?.id,
    activeConversation?.type,
    currentUser?.id,
  ]);

  /* =========================================================
     POST PERMISSION
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id
    ) {
      setCanPost(
        false
      );

      return;
    }

    let cancelled =
      false;

    const checkPermission =
      async () => {
        if (
          !isChannel &&
          !isCommunity
        ) {
          if (!cancelled) {
            setCanPost(
              true
            );

            setCheckingPostPermission(
              false
            );
          }

          return;
        }

        try {
          setCheckingPostPermission(
            true
          );

          let allowed =
            true;

          if (
            isChannel
          ) {
            allowed =
              await canSendChatMessage(
                activeConversation.id
              );
          }

          if (
            isCommunity
          ) {
            allowed =
              await canSendCommunityMessage(
                activeConversation.id
              );
          }

          if (!cancelled) {
            setCanPost(
              Boolean(
                allowed
              )
            );
          }
        } catch (error) {
          console.error(
            "Check posting permission error:",
            error
          );

          if (!cancelled) {
            setCanPost(
              false
            );
          }
        } finally {
          if (!cancelled) {
            setCheckingPostPermission(
              false
            );
          }
        }
      };

    checkPermission();

    return () => {
      cancelled =
        true;
    };
  }, [
    activeConversation?.id,
    isChannel,
    isCommunity,
    currentMemberRole,
  ]);

  /* =========================================================
     COMMUNITY MODERATION PERMISSION WATCH
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id ||
      !isCommunity
    ) {
      return;
    }

    let cancelled =
      false;

    const refreshCommunityPostPermission =
      async () => {
        if (
          permissionRefreshRunningRef.current
        ) {
          return;
        }

        permissionRefreshRunningRef.current =
          true;

        try {
          const allowed =
            await canSendCommunityMessage(
              activeConversation.id
            );

          if (!cancelled) {
            setCanPost(
              Boolean(
                allowed
              )
            );
          }
        } catch (error) {
          console.error(
            "Refresh community post permission error:",
            error
          );

          if (!cancelled) {
            setCanPost(
              false
            );
          }
        } finally {
          permissionRefreshRunningRef.current =
            false;
        }
      };

    const permissionChannel =
      supabase
        .channel(
          `community-post-permission-${activeConversation.id}-${currentUser.id}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "community_mutes",
          },
          () => {
            refreshCommunityPostPermission();
          }
        )
        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "community_bans",
          },
          () => {
            refreshCommunityPostPermission();
          }
        )
        .subscribe();

    const permissionRefresh =
      setInterval(
        () => {
          if (
            typeof document !==
              "undefined" &&
            document.hidden
          ) {
            return;
          }

          refreshCommunityPostPermission();
        },
        60000
      );

    return () => {
      cancelled =
        true;

      clearInterval(
        permissionRefresh
      );

      supabase.removeChannel(
        permissionChannel
      );
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isCommunity,
  ]);

  /* =========================================================
     READ COUNTS
  ========================================================= */

  const hydrateReadCounts =
    async (
      messageList
    ) => {
      const rows =
        messageList ||
        [];

      const myMessageIds =
        rows
          .filter(
            (
              message
            ) =>
              message.sender_id ===
                currentUser?.id &&
              message.id
          )
          .map(
            (
              message
            ) =>
              message.id
          );

      if (
        myMessageIds.length ===
        0
      ) {
        return rows.map(
          (
            message
          ) => ({
            ...message,

            read_count:
              message.sender_id ===
                currentUser?.id
                ? Number(
                    message.read_count ||
                      0
                  )
                : 0,
          })
        );
      }

      const readCounts =
        await getMessageReadCounts(
          myMessageIds
        );

      return rows.map(
        (
          message
        ) => {
          if (
            message.sender_id !==
            currentUser?.id
          ) {
            return {
              ...message,

              read_count:
                0,
            };
          }

          return {
            ...message,

            read_count:
              Number(
                readCounts.get(
                  message.id
                ) ||
                0
              ),
          };
        }
      );
    };

  /* =========================================================
     UPSERT MESSAGE
  ========================================================= */

  const upsertLocalMessage =
    (
      newMessage
    ) => {
      if (!newMessage?.id) {
        return;
      }

      setMessages(
        (
          previous
        ) => {
          const exists =
            previous.some(
              (item) =>
                item.id ===
                newMessage.id
            );

          if (exists) {
            return previous.map(
              (item) =>
                item.id ===
                newMessage.id
                  ? {
                      ...item,
                      ...newMessage,

                      read_count:
                        newMessage.read_count ??
                        item.read_count ??
                        0,
                    }
                  : item
            );
          }

          const lastMessage =
            previous[
              previous.length -
              1
            ];

          if (
            !lastMessage ||
            new Date(
              newMessage.created_at
            ).getTime() >=
              new Date(
                lastMessage.created_at
              ).getTime()
          ) {
            return [
              ...previous,
              newMessage,
            ];
          }

          return [
            ...previous,
            newMessage,
          ].sort(
            (a, b) =>
              new Date(
                a.created_at
              ).getTime() -
              new Date(
                b.created_at
              ).getTime()
          );
        }
      );
    };

  /* =========================================================
     UPSERT SYSTEM EVENT
  ========================================================= */

  const upsertLocalSystemEvent =
    (
      newEvent
    ) => {
      if (!newEvent?.id) {
        return;
      }

      setSystemEvents(
        (
          previous
        ) => {
          const exists =
            previous.some(
              (item) =>
                item.id ===
                newEvent.id
            );

          if (exists) {
            return previous.map(
              (item) =>
                item.id ===
                newEvent.id
                  ? {
                      ...item,
                      ...newEvent,
                    }
                  : item
            );
          }

          const lastEvent =
            previous[
              previous.length -
              1
            ];

          if (
            !lastEvent ||
            new Date(
              newEvent.created_at
            ).getTime() >=
              new Date(
                lastEvent.created_at
              ).getTime()
          ) {
            return [
              ...previous,
              newEvent,
            ];
          }

          return [
            ...previous,
            newEvent,
          ].sort(
            (a, b) =>
              new Date(
                a.created_at
              ).getTime() -
              new Date(
                b.created_at
              ).getTime()
          );
        }
      );
    };

  /* =========================================================
     SCROLL TO MESSAGE
  ========================================================= */

  const scrollToMessage =
    (
      messageId
    ) => {
      if (!messageId) {
        return;
      }

      const element =
        document.getElementById(
          `message-${messageId}`
        );

      if (!element) {
        return;
      }

      element.scrollIntoView({
        behavior:
          "smooth",

        block:
          "center",
      });

      element.classList.add(
        "rounded-xl",
        "ring-2",
        "ring-blue-400",
        "ring-offset-2"
      );

      setTimeout(
        () => {
          element.classList.remove(
            "rounded-xl",
            "ring-2",
            "ring-blue-400",
            "ring-offset-2"
          );
        },
        1400
      );
    };

  /* =========================================================
     SEARCH RESULT NAVIGATION
  ========================================================= */

  const scrollToSearchResultWithRetry =
    (
      messageId,
      attempt = 0
    ) => {
      if (
        !messageId
      ) {
        return;
      }

      const element =
        document.getElementById(
          `message-${messageId}`
        );

      if (
        element
      ) {
        scrollToMessage(
          messageId
        );

        return;
      }

      if (
        attempt >=
        5
      ) {
        return;
      }

      setTimeout(
        () => {
          scrollToSearchResultWithRetry(
            messageId,
            attempt +
              1
          );
        },
        120
      );
    };

  const loadAndJumpToMessage =
    async (
      messageId
    ) => {
      if (
        !messageId
      ) {
        return;
      }

      const existingElement =
        document.getElementById(
          `message-${messageId}`
        );

      if (
        existingElement
      ) {
        scrollToMessage(
          messageId
        );

        return;
      }

      try {
        const foundMessage =
          await getMessageById(
            messageId
          );

        if (
          !foundMessage ||
          foundMessage.conversation_id !==
            activeConversation?.id
        ) {
          return;
        }

        upsertLocalMessage(
          foundMessage
        );

        scrollToSearchResultWithRetry(
          messageId
        );
      } catch (
        error
      ) {
        console.error(
          "Search result jump error:",
          error
        );
      }
    };

  const handleSearchResultOpen =
    async (
      result
    ) => {
      if (
        !result?.id ||
        !result?.conversation_id
      ) {
        return;
      }

      setShowMessageSearch(
        false
      );

      if (
        result.conversation_id ===
        activeConversation?.id
      ) {
        await loadAndJumpToMessage(
          result.id
        );

        return;
      }

      try {
        sessionStorage.setItem(
          "chatPendingMessageJump",
          JSON.stringify({
            conversationId:
              result.conversation_id,

            messageId:
              result.id,

            createdAt:
              Date.now(),
          })
        );
      } catch (
        error
      ) {
        console.warn(
          "Unable to save pending search jump:",
          error
        );
      }

      const targetConversation =
        result.conversation
          ? {
              ...result.conversation,

              displayName:
                result.conversation
                  .title ||
                "Chat",
            }
          : {
              id:
                result.conversation_id,

              displayName:
                "Chat",
            };

      onOpenConversation?.(
        targetConversation
      );
    };

  useEffect(() => {
    if (
      !activeConversation?.id
    ) {
      return;
    }

    let pending =
      null;

    try {
      const raw =
        sessionStorage.getItem(
          "chatPendingMessageJump"
        );

      if (
        raw
      ) {
        pending =
          JSON.parse(
            raw
          );
      }
    } catch (
      error
    ) {
      console.warn(
        "Read pending search jump error:",
        error
      );
    }

    const pendingAge =
      pending?.createdAt
        ? Date.now() -
          Number(
            pending.createdAt
          )
        : 0;

    if (
      !pending?.messageId ||
      pending.conversationId !==
        activeConversation.id ||
      (
        pendingAge >
        2 * 60 * 1000
      )
    ) {
      if (
        pendingAge >
        2 * 60 * 1000
      ) {
        try {
          sessionStorage.removeItem(
            "chatPendingMessageJump"
          );
        } catch {
          // Ignore storage cleanup failure.
        }
      }

      return;
    }

    try {
      sessionStorage.removeItem(
        "chatPendingMessageJump"
      );
    } catch {
      // Ignore storage cleanup failure.
    }

    const timer =
      setTimeout(
        () => {
          loadAndJumpToMessage(
            pending.messageId
          );
        },
        220
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    activeConversation?.id,
  ]);

  /* =========================================================
     READ COUNT REFRESH SCHEDULER
  ========================================================= */

  const scheduleReadCountRefresh =
    (
      delay = 220
    ) => {
      if (
        readCountRefreshTimerRef.current
      ) {
        clearTimeout(
          readCountRefreshTimerRef.current
        );
      }

      readCountRefreshTimerRef.current =
        setTimeout(
          async () => {
            readCountRefreshTimerRef.current =
              null;

            if (
              readCountRefreshRunningRef.current
            ) {
              scheduleReadCountRefresh(
                250
              );

              return;
            }

            const snapshot =
              messagesRef.current;

            if (
              !snapshot?.length
            ) {
              return;
            }

            readCountRefreshRunningRef.current =
              true;

            try {
              const refreshed =
                await hydrateReadCounts(
                  snapshot
                );

              setMessages(
                refreshed
              );
            } catch (error) {
              console.error(
                "Refresh read counts error:",
                error
              );
            } finally {
              readCountRefreshRunningRef.current =
                false;
            }
          },
          delay
        );
    };

  const scheduleMessageRefresh =
    (
      messageId,
      delay = 120
    ) => {
      if (!messageId) {
        return;
      }

      pendingMessageRefreshIdsRef.current.add(
        messageId
      );

      const existingTimer =
        messageRefreshTimersRef.current.get(
          messageId
        );

      if (existingTimer) {
        clearTimeout(
          existingTimer
        );
      }

      const timer =
        setTimeout(
          async () => {
            messageRefreshTimersRef.current.delete(
              messageId
            );

            if (
              !pendingMessageRefreshIdsRef.current.has(
                messageId
              )
            ) {
              return;
            }

            pendingMessageRefreshIdsRef.current.delete(
              messageId
            );

            try {
              const refreshed =
                await getMessageById(
                  messageId
                );

              if (
                refreshed
                  ?.conversation_id ===
                activeConversation?.id
              ) {
                upsertLocalMessage(
                  refreshed
                );
              }
            } catch (error) {
              console.error(
                "Message refresh error:",
                error
              );
            }
          },
          delay
        );

      messageRefreshTimersRef.current.set(
        messageId,
        timer
      );
    };

  /* =========================================================
     PINNED
  ========================================================= */

  const refreshPinnedMessages =
    async () => {
      if (
        !activeConversation?.id
      ) {
        setPinnedMessages(
          []
        );

        return;
      }

      try {
        const pins =
          await getPinnedMessages(
            activeConversation.id
          );

        setPinnedMessages(
          pins || []
        );
      } catch (error) {
        console.error(
          "Load pinned messages error:",
          error
        );
      }
    };

  /* =========================================================
     MENTIONS
  ========================================================= */

  const refreshConversationMentions =
    async () => {
      if (
        !activeConversation?.id ||
        !currentUser?.id
      ) {
        setConversationMentions(
          []
        );

        return;
      }

      try {
        const rows =
          await getConversationMentions(
            activeConversation.id
          );

        const mine =
          (
            rows ||
            []
          ).filter(
            (mention) =>
              mention.mentioned_user_id ===
              currentUser.id
          );

        setConversationMentions(
          mine
        );
      } catch (error) {
        console.error(
          "Load conversation mentions error:",
          error
        );

        setConversationMentions(
          []
        );
      }
    };

  /* =========================================================
     FULL SYSTEM EVENT REFRESH
  ========================================================= */

  const refreshSystemEvents =
    async () => {
      if (
        !activeConversation?.id
      ) {
        setSystemEvents(
          []
        );

        return;
      }

      try {
        const rows =
          await getSystemEvents(
            activeConversation.id
          );

        setSystemEvents(
          rows || []
        );

        const newest =
          [...(rows || [])]
            .sort(
              (a, b) =>
                new Date(
                  b.created_at
                ).getTime() -
                new Date(
                  a.created_at
                ).getTime()
            )[0];

        if (
          newest?.created_at
        ) {
          systemEventCursorRef.current =
            newest.created_at;
        }
      } catch (error) {
        console.error(
          "Refresh system events error:",
          error
        );
      }
    };

  /* =========================================================
     CHAT PREFERENCES
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadPreferences = async () => {
      // Reset immediately so settings from the previous account are not shown.
      setChatPreferences({
        chat_density: "comfortable",
        enter_to_send: true,
        show_read_receipts: true,
        show_typing_indicator: true,
        reduce_motion: false,
    message_font_size: "medium",
    message_line_spacing: "normal",
    show_message_timestamps: true,
    bubble_color: "blue",
    bubble_shape: "rounded",
    show_sender_names: true,
    show_date_separators: true,
    show_reaction_counts: true,
    show_reaction_badges: true,
    show_pinned_indicators: true,
    show_sender_avatars: true,
    show_edited_labels: true,
    show_reply_previews: true,
    show_attachment_previews: true,
    show_attachment_file_sizes: true,
    highlight_mentions: true,
    message_time_format: "system",
      });
      setShowChatPreferences(false);
      if (!currentUser?.id) return;

      try {
        const preferences = await getChatPreferences();

        if (!cancelled && preferences) {
          setChatPreferences((current) => ({
            ...current,
            ...preferences,
          }));
        }
      } catch (error) {
        console.error("Load chat preferences error:", error);
      }
    };

    loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  /* =========================================================
     MARK READ
  ========================================================= */

  const markConversationAsRead =
    async () => {
      if (
        !activeConversation?.id
      ) {
        return;
      }

      try {
        await Promise.all([
          markConversationRead(
            activeConversation.id
          ),

          markConversationMentionsRead(
            activeConversation.id
          ),
        ]);
      } catch (error) {
        console.error(
          "Mark conversation read error:",
          error
        );
      }
    };

  /* =========================================================
     HEARTBEAT
  ========================================================= */

  useEffect(() => {
    if (
      !currentUser?.id ||
      !isOnline
    ) {
      return;
    }

    updateMyLastSeen();

    const heartbeat =
      setInterval(
        () => {
          if (
            navigator.onLine
          ) {
            updateMyLastSeen();
          }
        },
        60000
      );

    return () => {
      clearInterval(
        heartbeat
      );
    };
  }, [
    currentUser?.id,
    isOnline,
    reconnectGeneration,
  ]);

  /* =========================================================
     READ ON OPEN
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id
    ) {
      return;
    }

    markConversationAsRead();
  }, [
    activeConversation?.id,
  ]);

  /* =========================================================
     MENTIONS REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id ||
      !isOnline
    ) {
      setConversationMentions(
        []
      );

      return;
    }

    refreshConversationMentions();

    const channel =
      subscribeToMentions(
        currentUser.id,

        async (
          payload
        ) => {
          const conversationId =
            payload?.new
              ?.conversation_id ||
            payload?.old
              ?.conversation_id;

          if (
            conversationId !==
            activeConversation.id
          ) {
            return;
          }

          await refreshConversationMentions();

          try {
            await markConversationMentionsRead(
              activeConversation.id
            );
          } catch (error) {
            console.error(
              "Realtime mention read error:",
              error
            );
          }
        }
      );

    return () => {
      if (channel) {
        unsubscribeFromMessages(
          channel
        );
      }
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isOnline,
    reconnectGeneration,
  ]);

  /* =========================================================
     MEMBERS / ROLE / COUNT
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id
    ) {
      return;
    }

    let cancelled =
      false;

    const refreshMembers =
      async () => {
        try {
          const members =
            await getMemberSnapshot();

          if (cancelled) {
            return;
          }

          const myMembership =
            members.find(
              (member) =>
                member.user_id ===
                currentUser.id
            );

          setCurrentMemberRole(
            myMembership?.role ||
              null
          );

          if (
            (
              isGroup ||
              isChannel ||
              isCommunity
            ) &&
            !myMembership
          ) {
            setHasLeftConversation(
              true
            );

            setShowGroupInfo(
              false
            );

            setShowChannelInfo(
              false
            );

            setShowCommunityInfo(
              false
            );

            setShowSharedMedia(
              false
            );

            setShowMessageSearch(
              false
            );

            setMessages([]);
            setSystemEvents([]);
            setPinnedMessages([]);
            setConversationMentions([]);

            onConversationLeft?.(
              activeConversation.id
            );

            return;
          }

          if (
            isGroup ||
            isChannel ||
            isCommunity
          ) {
            setGroupMemberCount(
              members.length
            );

            if (isChannel) {
              setCanPost(
                [
                  "owner",
                  "admin",
                  "moderator",
                ].includes(
                  myMembership?.role
                )
              );
            }

            return;
          }

          if (isSelfChat) {
            setOtherLastSeen(
              null
            );

            return;
          }

          const otherMember =
            members.find(
              (member) =>
                member.user_id !==
                currentUser.id
            );

          setOtherLastSeen(
            otherMember
              ?.profiles
              ?.last_seen_at ||
              null
          );
        } catch (error) {
          console.error(
            "Refresh members error:",
            error
          );
        }
      };

    refreshMembers();

    const interval =
      setInterval(
        () => {
          if (
            typeof document !==
              "undefined" &&
            document.hidden
          ) {
            return;
          }

          refreshMembers();
        },
        60000
      );

    return () => {
      cancelled =
        true;

      clearInterval(
        interval
      );
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isGroup,
    isChannel,
    isCommunity,
    isSelfChat,
  ]);

  /* =========================================================
     MEMBER / CONVERSATION REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id ||
      !isOnline
    ) {
      return;
    }

    if (
      !isGroup &&
      !isChannel &&
      !isCommunity
    ) {
      return;
    }

    let cancelled =
      false;

    const refreshMembership =
      async () => {
        try {
          const members =
            await getMemberSnapshot({
              force:
                true,
            });

          if (cancelled) {
            return;
          }

          const myMembership =
            members.find(
              (member) =>
                member.user_id ===
                currentUser.id
            );

          if (!myMembership) {
            setHasLeftConversation(
              true
            );

            setShowGroupInfo(
              false
            );

            setShowChannelInfo(
              false
            );

            setShowCommunityInfo(
              false
            );

            setShowSharedMedia(
              false
            );

            setShowMessageSearch(
              false
            );

            setMessages([]);
            setSystemEvents([]);
            setPinnedMessages([]);
            setConversationMentions([]);

            onConversationLeft?.(
              activeConversation.id
            );

            return;
          }

          setCurrentMemberRole(
            myMembership.role
          );

          setGroupMemberCount(
            members.length
          );

          if (isChannel) {
            setCanPost(
              [
                "owner",
                "admin",
                "moderator",
              ].includes(
                myMembership.role
              )
            );
          }
        } catch (error) {
          console.error(
            "Realtime membership refresh error:",
            error
          );
        }
      };

    const memberChannel =
      supabase
        .channel(
          `chat-member-role-${activeConversation.id}-${currentUser.id}`
        )

        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "chat_members",

            filter:
              `conversation_id=eq.${activeConversation.id}`,
          },

          async () => {
            await refreshMembership();

            await refreshSystemEvents();
          }
        )

        .on(
          "postgres_changes",
          {
            event:
              "UPDATE",

            schema:
              "public",

            table:
              "chat_conversations",

            filter:
              `id=eq.${activeConversation.id}`,
          },

          async (
            payload
          ) => {
            const updated =
              payload?.new;

            if (
              updated &&
              !cancelled
            ) {
              setLocalConversation(
                (previous) => ({
                  ...previous,
                  ...updated,

                  displayName:
                    updated.title ||
                    previous?.displayName,
                })
              );
            }

            await refreshSystemEvents();
          }
        )

        .subscribe();

    return () => {
      cancelled =
        true;

      supabase.removeChannel(
        memberChannel
      );
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isGroup,
    isChannel,
    isCommunity,
    isOnline,
    reconnectGeneration,
  ]);

  /* =========================================================
     TYPING
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id ||
      !isOnline ||
      !chatPreferences.show_typing_indicator
    ) {
      typingChannelRef.current =
        null;

      setOtherIsTyping(
        false
      );

      return;
    }

    if (
      isSelfChat ||
      (
        (
          isChannel ||
          isCommunity
        ) &&
        !canPost
      )
    ) {
      setOtherIsTyping(
        false
      );

      typingChannelRef.current =
        null;

      return;
    }

    setOtherIsTyping(
      false
    );

    const channel =
      subscribeToTyping(
        activeConversation.id,
        currentUser.id,

        ({
          isTyping,
        }) => {
          if (
            typingClearTimerRef.current
          ) {
            clearTimeout(
              typingClearTimerRef.current
            );
          }

          setOtherIsTyping(
            isTyping
          );

          if (isTyping) {
            typingClearTimerRef.current =
              setTimeout(
                () => {
                  setOtherIsTyping(
                    false
                  );
                },
                2500
              );
          }
        }
      );

    typingChannelRef.current =
      channel;

    return () => {
      if (
        typingClearTimerRef.current
      ) {
        clearTimeout(
          typingClearTimerRef.current
        );
      }

      if (channel) {
        unsubscribeFromMessages(
          channel
        );
      }

      typingChannelRef.current =
        null;
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isSelfChat,
    isChannel,
    isCommunity,
    canPost,
    isOnline,
    reconnectGeneration,
    chatPreferences.show_typing_indicator,
  ]);

  /* =========================================================
     PIN REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !isOnline
    ) {
      return;
    }

    refreshPinnedMessages();

    const channel =
      subscribeToPinnedMessages(
        (payload) => {
          const conversationId =
            payload?.new
              ?.conversation_id ||
            payload?.old
              ?.conversation_id;

          if (
            conversationId ===
            activeConversation.id
          ) {
            refreshPinnedMessages();
          }
        }
      );

    return () => {
      if (channel) {
        unsubscribeFromMessages(
          channel
        );
      }
    };
  }, [
    activeConversation?.id,
    isOnline,
    reconnectGeneration,
  ]);

  /* =========================================================
     MESSAGES + SYSTEM EVENTS + REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id
    ) {
      setMessages(
        []
      );

      setSystemEvents(
        []
      );

      return;
    }

    if (
      !isOnline
    ) {
      setLoading(
        false
      );

      return;
    }

    let messageChannel =
      null;

    let readChannel =
      null;

    let attachmentChannel =
      null;

    let reactionChannel =
      null;

    let systemEventChannel =
      null;

    let cancelled =
      false;

    async function setupChat() {
      try {
        setLoading(
          true
        );

        messageChannel =
          subscribeToMessages(
            activeConversation.id,

            async (
              newMessage,
              eventType
            ) => {
              if (cancelled) {
                return;
              }

              const prepared =
                newMessage.sender_id ===
                  currentUser.id
                  ? {
                      ...newMessage,

                      read_count:
                        Number(
                          newMessage.read_count ||
                            0
                        ),
                    }
                  : newMessage;

              if (cancelled) {
                return;
              }

              upsertLocalMessage(
                prepared
              );

              if (
                eventType ===
                  "INSERT" &&
                newMessage.sender_id !==
                  currentUser.id
              ) {
                setOtherIsTyping(
                  false
                );

                try {
                  await Promise.all([
                    markConversationRead(
                      activeConversation.id
                    ),

                    markConversationMentionsRead(
                      activeConversation.id
                    ),
                  ]);
                } catch (error) {
                  console.error(
                    "Mark incoming message read error:",
                    error
                  );
                }

                await refreshConversationMentions();
              }
            }
          );

        readChannel =
          subscribeToReadReceipts(
            activeConversation.id,

            () => {
              if (cancelled) {
                return;
              }

              scheduleReadCountRefresh();
            }
          );

        attachmentChannel =
          subscribeToAttachments(
            async (
              attachment
            ) => {
              if (
                cancelled ||
                !attachment
                  ?.message_id
              ) {
                return;
              }

              scheduleMessageRefresh(
                attachment.message_id,
                80
              );
            }
          );

        reactionChannel =
          subscribeToReactions(
            async (
              payload
            ) => {
              if (cancelled) {
                return;
              }

              const messageId =
                payload?.new
                  ?.message_id ||
                payload?.old
                  ?.message_id;

              if (!messageId) {
                return;
              }

              scheduleMessageRefresh(
                messageId,
                100
              );
            }
          );

        systemEventChannel =
          subscribeToSystemEvents(
            activeConversation.id,

            async (
              payload
            ) => {
              if (cancelled) {
                return;
              }

              if (payload?.eventType === "DELETE") {
                const deletedId = payload?.old?.id;
                if (deletedId) {
                  setSystemEvents((rows) => rows.filter((item) => String(item.id) !== String(deletedId)));
                } else {
                  refreshSystemEvents();
                }
                return;
              }
              const eventId =
                payload?.new
                  ?.id;

              if (!eventId) {
                return;
              }

              try {
                const newEvent =
                  await getSystemEventById(
                    eventId
                  );

                if (
                  newEvent &&
                  !cancelled
                ) {
                  upsertLocalSystemEvent(
                    newEvent
                  );

                  if (
                    newEvent.created_at
                  ) {
                    const current =
                      systemEventCursorRef.current;

                    if (
                      !current ||
                      new Date(
                        newEvent.created_at
                      ).getTime() >
                        new Date(
                          current
                        ).getTime()
                    ) {
                      systemEventCursorRef.current =
                        newEvent.created_at;
                    }
                  }
                }
              } catch (error) {
                console.error(
                  "Fast system event hydration error:",
                  error
                );
              }
            }
          );

        const [
          events,
          messagePage,
        ] =
          await Promise.all([
            getSystemEvents(
              activeConversation.id
            ),

            getMessagesPage({
              conversationId:
                activeConversation.id,

              limit:
                50,
            }),
          ]);

        const hydrated =
          await hydrateReadCounts(
            messagePage.messages ||
            []
          );

        if (!cancelled) {
          setMessages(
            (
              previous
            ) => {
              const combined =
                [
                  ...hydrated,
                  ...previous,
                ];

              const byId =
                new Map();

              for (
                const item of combined
              ) {
                if (
                  item?.id
                ) {
                  byId.set(
                    item.id,
                    item
                  );
                }
              }

              return [
                ...byId.values(),
              ].sort(
                (
                  a,
                  b
                ) =>
                  new Date(
                    a.created_at
                  ).getTime() -
                  new Date(
                    b.created_at
                  ).getTime()
              );
            }
          );

          setHasOlderMessages(
            Boolean(
              messagePage.hasMore
            )
          );

          setOldestMessageCursor(
            messagePage.nextCursor ||
            null
          );

          setSystemEvents(
            events || []
          );

          const newestSystemEvent =
            [...(events || [])]
              .sort(
                (a, b) =>
                  new Date(
                    b.created_at
                  ).getTime() -
                  new Date(
                    a.created_at
                  ).getTime()
              )[0];

          systemEventCursorRef.current =
            newestSystemEvent?.created_at ||
            new Date(
              Date.now() -
                5000
            ).toISOString();

          await Promise.all([
            markConversationRead(
              activeConversation.id
            ),

            markConversationMentionsRead(
              activeConversation.id
            ),

            refreshConversationMentions(),
          ]);
        }
      } catch (error) {
        console.error(
          "Load chat error:",
          error
        );
      } finally {
        if (!cancelled) {
          setLoading(
            false
          );
        }
      }
    }

    setupChat();

    return () => {
      cancelled =
        true;

      if (
        readCountRefreshTimerRef.current
      ) {
        clearTimeout(
          readCountRefreshTimerRef.current
        );

        readCountRefreshTimerRef.current =
          null;
      }

      for (
        const timer of
        messageRefreshTimersRef.current.values()
      ) {
        clearTimeout(
          timer
        );
      }

      messageRefreshTimersRef.current.clear();
      pendingMessageRefreshIdsRef.current.clear();

      [
        messageChannel,
        readChannel,
        attachmentChannel,
        reactionChannel,
        systemEventChannel,
      ].forEach(
        (channel) => {
          if (channel) {
            unsubscribeFromMessages(
              channel
            );
          }
        }
      );
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isOnline,
    reconnectGeneration,
  ]);

  /* =========================================================
     SYSTEM EVENT 1-SECOND FALLBACK POLLING
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id ||
      !isOnline
    ) {
      systemEventCursorRef.current =
        null;

      return;
    }

    if (
      !isGroup &&
      !isChannel &&
      !isCommunity
    ) {
      systemEventCursorRef.current =
        null;

      return;
    }

    let cancelled =
      false;

    const poll =
      async () => {
        if (
          cancelled ||
          systemEventPollingRef.current ||
          (
            typeof document !==
              "undefined" &&
            document.hidden
          )
        ) {
          return;
        }

        if (
          !systemEventCursorRef.current
        ) {
          systemEventCursorRef.current =
            new Date(
              Date.now() -
                5000
            ).toISOString();
        }

        systemEventPollingRef.current =
          true;

        try {
          const rows =
            await getSystemEventsAfter(
              activeConversation.id,
              systemEventCursorRef.current
            );

          if (
            cancelled ||
            !rows?.length
          ) {
            return;
          }

          for (
            const event of rows
          ) {
            upsertLocalSystemEvent(
              event
            );
          }

          const newest =
            [...rows]
              .sort(
                (a, b) =>
                  new Date(
                    b.created_at
                  ).getTime() -
                  new Date(
                    a.created_at
                  ).getTime()
              )[0];

          if (
            newest?.created_at
          ) {
            systemEventCursorRef.current =
              newest.created_at;
          }
        } catch (error) {
          console.error(
            "System event polling error:",
            error
          );
        } finally {
          systemEventPollingRef.current =
            false;
        }
      };

    poll();

    const interval =
      setInterval(
        poll,
        10000
      );

    return () => {
      cancelled =
        true;

      clearInterval(
        interval
      );

      systemEventPollingRef.current =
        false;
    };
  }, [
    activeConversation?.id,
    currentUser?.id,
    isGroup,
    isChannel,
    isCommunity,
    isOnline,
    reconnectGeneration,
  ]);

  /* =========================================================
     TYPING SEND
  ========================================================= */

  const handleTypingChange =
    (
      isTyping
    ) => {
      if (
        !chatPreferences.show_typing_indicator ||
        !isOnline ||
        isSelfChat ||
        !currentUser?.id ||
        (
          (
            isChannel ||
            isCommunity
          ) &&
          !canPost
        )
      ) {
        return;
      }

      sendTypingStatus(
        typingChannelRef.current,
        currentUser.id,
        isTyping
      );
    };

  /* =========================================================
     SEND MESSAGE
  ========================================================= */

  const handleSend =
    async (
      text,
      file,
      clientRequestId = null
    ) => {
      if (
        !activeConversation?.id ||
        !currentUser?.id
      ) {
        return;
      }

      if (
        isChannel &&
        !canPost
      ) {
        window.alert(
          "Only channel administrators can post."
        );

        return;
      }

      if (
        isCommunity &&
        !canPost
      ) {
        window.alert(
          "You cannot post in this community right now."
        );

        return;
      }

      if (!isSelfChat) {
        await sendTypingStatus(
          typingChannelRef.current,
          currentUser.id,
          false
        );
      }

      await updateMyLastSeen();

      let sentMessage =
        null;

      if (file) {
        sentMessage =
          await sendAttachmentMessage({
            conversationId:
              activeConversation.id,

            senderId:
              currentUser.id,

            file,

            caption:
              text,

            replyTo:
              replyingTo?.id ||
              null,

            clientRequestId:
              clientRequestId ||
              null,
          });
      } else {
        sentMessage =
          await sendMessage({
            conversationId:
              activeConversation.id,

            senderId:
              currentUser.id,

            message:
              text,

            replyTo:
              replyingTo?.id ||
              null,

            clientRequestId:
              clientRequestId ||
              null,
          });
      }

      if (sentMessage) {
        upsertLocalMessage({
          ...sentMessage,

          read_count:
            0,
        });

        setReplyingTo(
          null
        );
      }
    };

  /* =========================================================
     LOAD OLDER MESSAGES
  ========================================================= */

  const handleLoadOlderMessages =
    async () => {
      if (
        !activeConversation?.id ||
        !hasOlderMessages ||
        loadingOlderMessages
      ) {
        return;
      }

      const before =
        oldestMessageCursor ||
        messagesRef.current?.[0]
          ?.created_at ||
        null;

      if (!before) {
        setHasOlderMessages(
          false
        );

        return;
      }

      try {
        setLoadingOlderMessages(
          true
        );

        const page =
          await getMessagesPage({
            conversationId:
              activeConversation.id,

            before,

            limit:
              50,
          });

        const older =
          await hydrateReadCounts(
            page.messages ||
            []
          );

        if (
          older.length >
          0
        ) {
          setMessages(
            (
              previous
            ) => {
              const existingIds =
                new Set(
                  previous.map(
                    (
                      item
                    ) =>
                      item.id
                  )
                );

              const uniqueOlder =
                older.filter(
                  (
                    item
                  ) =>
                    !existingIds.has(
                      item.id
                    )
                );

              return [
                ...uniqueOlder,
                ...previous,
              ];
            }
          );
        }

        setHasOlderMessages(
          Boolean(
            page.hasMore
          )
        );

        setOldestMessageCursor(
          page.nextCursor ||
          null
        );
      } catch (error) {
        console.error(
          "Load older messages error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to load older messages."
        );
      } finally {
        setLoadingOlderMessages(
          false
        );
      }
    };

  /* =========================================================
     DELETE
  ========================================================= */

  const handleDelete =
    async (
      message
    ) => {
      if (
        message.sender_id !==
        currentUser.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Delete this message?"
        );

      if (!confirmed) {
        return;
      }

      try {
        await deleteChatMessage(
          message.id
        );

        const deletedAt =
          new Date().toISOString();

        setMessages(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                message.id
                  ? {
                      ...item,
                      message:
                        "",
                      deleted_at:
                        deletedAt,
                    }
                  : item
            )
        );

        if (
          replyingTo?.id ===
          message.id
        ) {
          setReplyingTo(
            null
          );
        }

        await refreshPinnedMessages();
        await refreshConversationMentions();
      } catch (error) {
        console.error(
          "Delete error:",
          error
        );
      }
    };

  /* =========================================================
     REACTION
  ========================================================= */

  const handleReaction =
    async (
      message,
      emoji
    ) => {
      if (
        !message?.id ||
        !emoji
      ) {
        return;
      }

      try {
        const reactions =
          await toggleChatReaction(
            message.id,
            emoji
          );

        setMessages(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                message.id
                  ? {
                      ...item,

                      reactions:
                        reactions ||
                        [],
                    }
                  : item
            )
        );
      } catch (error) {
        console.error(
          "Reaction error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to add reaction."
        );
      }
    };

  /* =========================================================
     PIN
  ========================================================= */

  const handlePinMessage =
    async (
      message
    ) => {
      if (
        !message?.id ||
        !canPin
      ) {
        return;
      }

      try {
        await togglePinnedMessage(
          message.id
        );

        await refreshPinnedMessages();
      } catch (error) {
        console.error(
          "Pin message error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to pin this message."
        );
      }
    };

  /* =========================================================
     GROUP LEFT
  ========================================================= */

  const handleGroupLeft =
    (
      conversationId
    ) => {
      const leftId =
        conversationId ||
        activeConversation?.id;

      setHasLeftConversation(
        true
      );

      setShowGroupInfo(
        false
      );

      setLocalConversation(
        null
      );

      setMessages(
        []
      );

      setSystemEvents(
        []
      );

      setPinnedMessages(
        []
      );

      setConversationMentions(
        []
      );

      setReplyingTo(
        null
      );

      systemEventCursorRef.current =
        null;

      onConversationLeft?.(
        leftId
      );

      onBack?.();
    };

  /* =========================================================
     CHANNEL LEFT
  ========================================================= */

  const handleChannelLeft =
    (
      conversationId
    ) => {
      const leftId =
        conversationId ||
        activeConversation?.id;

      setHasLeftConversation(
        true
      );

      setShowChannelInfo(
        false
      );

      setLocalConversation(
        null
      );

      setMessages(
        []
      );

      setSystemEvents(
        []
      );

      setPinnedMessages(
        []
      );

      setConversationMentions(
        []
      );

      setReplyingTo(
        null
      );

      systemEventCursorRef.current =
        null;

      onConversationLeft?.(
        leftId
      );

      onBack?.();
    };

  /* =========================================================
     COMMUNITY LEFT
  ========================================================= */

  const handleCommunityLeft =
    (
      conversationId
    ) => {
      const leftId =
        conversationId ||
        activeConversation?.id;

      setHasLeftConversation(
        true
      );

      setShowCommunityInfo(
        false
      );

      setLocalConversation(
        null
      );

      setMessages(
        []
      );

      setSystemEvents(
        []
      );

      setPinnedMessages(
        []
      );

      setConversationMentions(
        []
      );

      setReplyingTo(
        null
      );

      systemEventCursorRef.current =
        null;

      onConversationLeft?.(
        leftId
      );

      onBack?.();
    };

  /* =========================================================
     OPEN PARENT COMMUNITY
  ========================================================= */

  const handleOpenParentCommunity =
    () => {
      if (
        !parentCommunity
      ) {
        return;
      }

      setShowGroupInfo(
        false
      );

      setShowChannelInfo(
        false
      );

      onOpenConversation?.(
        parentCommunity
      );
    };

  /* =========================================================
     DISPLAY
  ========================================================= */

  const displayName =
    isSelfChat
      ? "You"
      : activeConversation
          ?.displayName
          ?.trim() ||
        activeConversation
          ?.title
          ?.trim() ||
        activeConversation
          ?.full_name
          ?.trim() ||
        activeConversation
          ?.username
          ?.trim() ||
        "User";

  const presenceText =
    isSelfChat
      ? "Message yourself"

      : isChannel
      ? `${groupMemberCount} ${
          groupMemberCount === 1
            ? "subscriber"
            : "subscribers"
        }`

      : isGroup ||
        isCommunity
      ? groupMemberCount > 0
        ? `${groupMemberCount} ${
            groupMemberCount === 1
              ? "member"
              : "members"
          }`
        : isCommunity
        ? "Community"
        : "Group chat"

      : formatLastSeen(
          otherLastSeen
        );

  const pinnedMessageIds =
    useMemo(
      () =>
        new Set(
          pinnedMessages.map(
            (pin) =>
              pin.message_id
          )
        ),
      [
        pinnedMessages,
      ]
    );

  const mentionedMessageIds =
    useMemo(
      () =>
        new Set(
          conversationMentions
            .filter(
              (mention) =>
                mention.mentioned_user_id ===
                currentUser?.id
            )
            .map(
              (mention) =>
                mention.message_id
            )
        ),
      [
        conversationMentions,
        currentUser?.id,
      ]
    );

  /* =========================================================
     MERGED TIMELINE
  ========================================================= */

  const timelineItems =
    useMemo(
      () => {
        const oldestLoadedMessageAt =
          messages?.[0]
            ?.created_at ||
          null;

        const visibleSystemEvents =
          hasOlderMessages &&
          oldestLoadedMessageAt
            ? (
                systemEvents ||
                []
              ).filter(
                (
                  event
                ) =>
                  new Date(
                    event.created_at
                  ).getTime() >=
                  new Date(
                    oldestLoadedMessageAt
                  ).getTime()
              )
            : (
                systemEvents ||
                []
              );

        return [
          ...(messages || []).map(
            (message) => ({
              ...message,

              timeline_type:
                "message",
            })
          ),

          ...visibleSystemEvents.map(
            (event) => ({
              ...event,

              timeline_type:
                "system",
            })
          ),
        ].sort(
          (a, b) =>
            new Date(
              a.created_at
            ).getTime() -
            new Date(
              b.created_at
            ).getTime()
        );
      },
      [
        messages,
        systemEvents,
        hasOlderMessages,
      ]
    );

  /* =========================================================
     EMPTY STATE
  ========================================================= */

  if (!activeConversation) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">

        <div className="text-center text-gray-400">

          <div className="text-5xl">
            💬
          </div>

          <div className="mt-2">
            Select a chat
          </div>

        </div>

      </main>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">

      {/* HEADER */}

      <header className="flex h-16 flex-shrink-0 items-center border-b bg-white px-3">

        {onBack && (
          <button
            type="button"
            onClick={
              onBack
            }
            className="mr-2 flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-gray-100"
            aria-label="Back"
          >
            ←
          </button>
        )}

        <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center">

          <div className="h-11 w-11 overflow-hidden rounded-full bg-gray-200">

            {activeConversation.avatar_url ? (
              <img
                src={
                  activeConversation.avatar_url
                }
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl">

                {isChannel
                  ? "📢"
                  : isCommunity
                  ? "🌐"
                  : isGroup
                  ? "👥"
                  : "👤"}

              </div>
            )}

          </div>

          {!isSelfChat &&
            isDirect &&
            presenceText ===
              "Active now" && (
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
            )}

        </div>

        <div className="ml-3 min-w-0 flex-1">

          <div className="flex items-center gap-1.5 truncate font-semibold text-gray-900">

            <span className="truncate">
              {displayName}
            </span>

            {isChannel && (
              <span
                className="flex-shrink-0 text-xs text-blue-500"
                title="Channel"
              >
                📢
              </span>
            )}

            {isCommunity && (
              <span
                className="flex-shrink-0 text-xs text-purple-500"
                title="Community"
              >
                🌐
              </span>
            )}

          </div>

          <div className="truncate text-xs text-gray-400">

            {!isSelfChat &&
            !isChannel &&
            chatPreferences.show_typing_indicator &&
            otherIsTyping

              ? isGroup ||
                isCommunity
                ? "Someone is typing..."
                : "typing..."

              : presenceText}

          </div>

        </div>

        <button
          type="button"
          onClick={() =>
            setShowChatPreferences(
              true
            )
          }
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg text-blue-600 hover:bg-blue-50"
          aria-label="Chat preferences"
          title="Chat preferences"
        >
          ⚙️
        </button>

        <button
          type="button"
          onClick={() =>
            setShowMessageSearch(
              true
            )
          }
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg text-blue-600 hover:bg-blue-50"
          aria-label="Search messages"
          title="Search messages"
        >
          🔎
        </button>

        <button
          type="button"
          onClick={() =>
            setShowSharedMedia(
              true
            )
          }
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg text-blue-600 hover:bg-blue-50"
          aria-label="Shared media and files"
          title="Shared media and files"
        >
          🖼️
        </button>

        {isGroup && (
          <button
            type="button"
            onClick={() =>
              setShowGroupInfo(
                true
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-blue-600 hover:bg-blue-50"
            aria-label="Group info"
          >
            ⓘ
          </button>
        )}

        {isChannel && (
          <button
            type="button"
            onClick={() =>
              setShowChannelInfo(
                true
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-blue-600 hover:bg-blue-50"
            aria-label="Channel info"
          >
            ⓘ
          </button>
        )}

        {isCommunity && (
          <button
            type="button"
            onClick={() =>
              setShowCommunityInfo(
                true
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-purple-600 hover:bg-purple-50"
            aria-label="Community info"
          >
            ⓘ
          </button>
        )}

      </header>

      {!isOnline && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          <span>
            ⚠
          </span>

          <span>
            You’re offline. Messages cannot be sent until your connection returns.
          </span>
        </div>
      )}

      {isOnline &&
        showReconnected && (
          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            <span>
              ✓
            </span>

            <span>
              Back online. Chat has been refreshed.
            </span>
          </div>
        )}

      {parentCommunity && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-purple-100 bg-purple-50/70 px-3 py-2">

          <button
            type="button"
            onClick={
              handleOpenParentCommunity
            }
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-purple-100"
            title="Open parent community"
          >

            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-100">

              {parentCommunity.avatar_url ? (
                <img
                  src={
                    parentCommunity.avatar_url
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm">
                  🌐
                </span>
              )}

            </div>

            <div className="min-w-0 flex-1">

              <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">
                Inside Community
              </div>

              <div className="truncate text-xs font-semibold text-purple-800">
                {parentCommunity.displayName ||
                  parentCommunity.title ||
                  "Community"}
              </div>

            </div>

            <span className="flex-shrink-0 text-sm text-purple-500">
              ›
            </span>

          </button>

        </div>
      )}

      {/* PINNED */}

      <PinnedMessageBar
        pinnedMessages={
          pinnedMessages
        }
        onJump={
          scrollToMessage
        }
      />

      {/* MESSAGES */}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Loading messages...
        </div>
      ) : (
        <MessageList
          messages={
            timelineItems
          }

          currentUserId={
            currentUser.id
          }

          conversationType={
            conversationType
          }

          pinnedMessageIds={
            pinnedMessageIds
          }

          mentionedMessageIds={
            mentionedMessageIds
          }

          canPin={
            canPin
          }

          hasOlderMessages={
            hasOlderMessages
          }

          loadingOlderMessages={
            loadingOlderMessages
          }

          onLoadOlderMessages={
            handleLoadOlderMessages
          }

          onReply={
            (
              isChannel ||
              isCommunity
            ) &&
            !canPost
              ? undefined
              : setReplyingTo
          }

          onJumpToMessage={
            scrollToMessage
          }

          onDelete={
            handleDelete
          }
          canDeleteSystemEvents={canDeleteSystemEvents}
          onDeleteSystemEvent={handleDeleteSystemEvent}

          onReact={
            handleReaction
          }

          onPin={
            handlePinMessage
          }

          onOpenDirectChat={
            onOpenDirectChat
          }

          density={
            chatPreferences.chat_density
          }

          reduceMotion={
            chatPreferences.reduce_motion
          }

          showReadReceipts={
            chatPreferences.show_read_receipts
          }
          messageFontSize={chatPreferences.message_font_size}
          messageLineSpacing={chatPreferences.message_line_spacing}
          showMessageTimestamps={chatPreferences.show_message_timestamps}
          bubbleColor={chatPreferences.bubble_color}
          bubbleShape={chatPreferences.bubble_shape}
          showSenderNames={chatPreferences.show_sender_names}
          showDateSeparators={chatPreferences.show_date_separators}
          showReactionCounts={chatPreferences.show_reaction_counts}
          showReactionBadges={chatPreferences.show_reaction_badges}
          showPinnedIndicators={chatPreferences.show_pinned_indicators}
          showSenderAvatars={chatPreferences.show_sender_avatars}
          showEditedLabels={chatPreferences.show_edited_labels}
          showReplyPreviews={chatPreferences.show_reply_previews}
          showAttachmentPreviews={chatPreferences.show_attachment_previews}
          showAttachmentFileSizes={chatPreferences.show_attachment_file_sizes}
          highlightMentions={chatPreferences.highlight_mentions}
          messageTimeFormat={chatPreferences.message_time_format}
        />
      )}

      {/* COMPOSER */}

      {!isOnline ? (

        <div className="flex flex-shrink-0 items-center justify-center border-t bg-gray-50 px-4 py-4">
          <div className="text-center">
            <div className="text-sm font-medium text-gray-600">
              📡 Waiting for connection...
            </div>

            <div className="mt-0.5 text-xs text-gray-400">
              Sending is temporarily disabled while offline.
            </div>
          </div>
        </div>

      ) : checkingPostPermission &&
      (
        isChannel ||
        isCommunity
      ) ? (

        <div className="flex flex-shrink-0 items-center justify-center border-t bg-white px-4 py-4 text-sm text-gray-400">
          Checking posting permissions...
        </div>

      ) : isChannel &&
        !canPost ? (

        <div className="flex flex-shrink-0 items-center justify-center border-t bg-gray-50 px-4 py-4">

          <div className="text-center">

            <div className="text-sm font-medium text-gray-600">
              📢 This is a broadcast channel
            </div>

            <div className="mt-0.5 text-xs text-gray-400">
              Only administrators can post.
            </div>

          </div>

        </div>

      ) : isCommunity &&
        !canPost ? (

        <div className="flex flex-shrink-0 items-center justify-center border-t bg-gray-50 px-4 py-4">

          <div className="text-center">

            <div className="text-sm font-medium text-gray-600">
              🔇 You cannot post right now
            </div>

            <div className="mt-0.5 text-xs text-gray-400">
              You may be muted in this community.
            </div>

          </div>

        </div>

      ) : (

        <MessageComposer
          conversationId={
            activeConversation.id
          }

          conversationType={
            conversationType
          }

          onSend={
            handleSend
          }

          onTypingChange={
            handleTypingChange
          }

          replyingTo={
            replyingTo
          }

          onCancelReply={() =>
            setReplyingTo(
              null
            )
          }

          enterToSend={
            chatPreferences.enter_to_send
          }
        />

      )}

      <ChatPreferencesPanel
        isOpen={showChatPreferences}
        onClose={() => setShowChatPreferences(false)}
        preferences={chatPreferences}
        onPreferencesChange={setChatPreferences}
      />

      {/* MESSAGE SEARCH */}

      {showMessageSearch &&
        activeConversation?.id && (
          <MessageSearchModal
            isOpen={
              showMessageSearch
            }

            onClose={() =>
              setShowMessageSearch(
                false
              )
            }

            conversationId={
              activeConversation.id
            }

            conversationTitle={
              displayName ||
              activeConversation.title ||
              "Chat"
            }

            onOpenResult={
              handleSearchResultOpen
            }
          />
        )}

      {/* SHARED MEDIA / FILES */}

      {showSharedMedia &&
        activeConversation?.id && (
          <SharedMediaModal
            isOpen={
              showSharedMedia
            }

            onClose={() =>
              setShowSharedMedia(
                false
              )
            }

            conversationId={
              activeConversation.id
            }

            conversationTitle={
              displayName ||
              activeConversation.title ||
              "Chat"
            }
          />
        )}

      {/* GROUP INFO */}

      {isGroup &&
        showGroupInfo && (
          <GroupInfoModal
            conversation={
              activeConversation
            }

            currentUser={
              currentUser
            }

            onClose={() =>
              setShowGroupInfo(
                false
              )
            }

            onGroupUpdated={(
              updated
            ) => {
              setLocalConversation(
                (previous) => ({
                  ...previous,
                  ...updated,
                })
              );
            }}

            onLeftGroup={
              handleGroupLeft
            }
          />
        )}

      {/* CHANNEL INFO */}

      {isChannel &&
        showChannelInfo && (
          <ChannelInfoModal
            conversation={
              activeConversation
            }

            currentUser={
              currentUser
            }

            onClose={() =>
              setShowChannelInfo(
                false
              )
            }

            onChannelUpdated={(
              updated
            ) => {
              setLocalConversation(
                (previous) => ({
                  ...previous,
                  ...updated,
                })
              );

              if (
                updated?.memberCount !==
                undefined
              ) {
                setGroupMemberCount(
                  updated.memberCount
                );
              }

              if (
                updated?.currentMemberRole
              ) {
                setCurrentMemberRole(
                  updated.currentMemberRole
                );

                setCanPost(
                  [
                    "owner",
                    "admin",
                    "moderator",
                  ].includes(
                    updated.currentMemberRole
                  )
                );
              }
            }}

            onLeftChannel={
              handleChannelLeft
            }
          />
        )}

      {/* COMMUNITY INFO */}

      {isCommunity &&
        showCommunityInfo && (
          <CommunityInfoModal
            conversation={
              activeConversation
            }

            currentUser={
              currentUser
            }

            onClose={() =>
              setShowCommunityInfo(
                false
              )
            }

            onUpdated={(
              updated
            ) => {
              setLocalConversation(
                (
                  previous
                ) => ({
                  ...previous,
                  ...updated,
                })
              );

              if (
                updated?.memberCount !==
                undefined
              ) {
                setGroupMemberCount(
                  updated.memberCount
                );
              }

              if (
                updated?.currentMemberRole
              ) {
                setCurrentMemberRole(
                  updated.currentMemberRole
                );

                setCheckingPostPermission(
                  true
                );
              }
            }}

            onOpenConversation={
              onOpenConversation
            }

            onLeft={
              handleCommunityLeft
            }
          />
        )}

    </main>
  );
}