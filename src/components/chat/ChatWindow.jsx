import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../../services/supabaseClient";

import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import GroupInfoModal from "./GroupInfoModal";
import ChannelInfoModal from "./ChannelInfoModal";
import PinnedMessageBar from "./PinnedMessageBar";

import {
  canSendChatMessage,
  deleteChatMessage,
  getConversationMembers,
  getConversationMentions,
  getMessageById,
  getMessageReadCount,
  getMessages,
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
    localConversation,
    setLocalConversation,
  ] = useState(
    conversation
  );

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

  const typingChannelRef =
    useRef(null);

  const typingClearTimerRef =
    useRef(null);

  /*
    Cursor used by fallback polling.
  */
  const systemEventCursorRef =
    useRef(null);

  /*
    Prevent overlapping polling requests.
  */
  const systemEventPollingRef =
    useRef(false);

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

    setCurrentMemberRole(
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
  }, [
    conversation?.id,
  ]);

  /* =========================================================
     CHANNEL POST PERMISSION
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
        if (!isChannel) {
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

          const allowed =
            await canSendChatMessage(
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
            "Check channel posting permission error:",
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
  ]);

  /* =========================================================
     READ COUNTS
  ========================================================= */

  const hydrateReadCounts =
    async (
      messageList
    ) => {
      return Promise.all(
        (
          messageList || []
        ).map(
          async (
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

            const readCount =
              await getMessageReadCount(
                message.id
              );

            return {
              ...message,

              read_count:
                readCount,
            };
          }
        )
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
    if (!currentUser?.id) {
      return;
    }

    updateMyLastSeen();

    const heartbeat =
      setInterval(
        () => {
          updateMyLastSeen();
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
      !currentUser?.id
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
            await getConversationMembers(
              activeConversation.id
            );

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
        refreshMembers,
        30000
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
      !currentUser?.id
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
            await getConversationMembers(
              activeConversation.id
            );

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

            /*
              Backup only.
              Polling + direct system realtime are primary.
            */
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
  ]);

  /* =========================================================
     TYPING
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id
    ) {
      return;
    }

    if (
      isSelfChat ||
      (
        isChannel &&
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
    canPost,
  ]);

  /* =========================================================
     PIN REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id
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

        /* -------------------------------------------------
           MESSAGE REALTIME
        ------------------------------------------------- */

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

              let prepared =
                newMessage;

              if (
                newMessage.sender_id ===
                currentUser.id
              ) {
                const readCount =
                  await getMessageReadCount(
                    newMessage.id
                  );

                prepared = {
                  ...newMessage,

                  read_count:
                    readCount,
                };
              }

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

        /* -------------------------------------------------
           READ RECEIPTS
        ------------------------------------------------- */

        readChannel =
          subscribeToReadReceipts(
            activeConversation.id,

            () => {
              if (cancelled) {
                return;
              }

              setMessages(
                (
                  currentMessages
                ) => {
                  hydrateReadCounts(
                    currentMessages
                  ).then(
                    (
                      refreshed
                    ) => {
                      if (
                        !cancelled
                      ) {
                        setMessages(
                          refreshed
                        );
                      }
                    }
                  );

                  return currentMessages;
                }
              );
            }
          );

        /* -------------------------------------------------
           ATTACHMENTS
        ------------------------------------------------- */

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

              try {
                const refreshed =
                  await getMessageById(
                    attachment.message_id
                  );

                if (
                  refreshed
                    ?.conversation_id ===
                  activeConversation.id
                ) {
                  upsertLocalMessage(
                    refreshed
                  );
                }
              } catch (error) {
                console.error(
                  "Attachment refresh error:",
                  error
                );
              }
            }
          );

        /* -------------------------------------------------
           REACTIONS
        ------------------------------------------------- */

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

              try {
                const refreshed =
                  await getMessageById(
                    messageId
                  );

                if (
                  refreshed
                    ?.conversation_id ===
                  activeConversation.id
                ) {
                  upsertLocalMessage(
                    refreshed
                  );
                }
              } catch (error) {
                console.error(
                  "Reaction refresh error:",
                  error
                );
              }
            }
          );

        /* -------------------------------------------------
           SYSTEM EVENT REALTIME

           If realtime is quick, event appears immediately.
        ------------------------------------------------- */

        systemEventChannel =
          subscribeToSystemEvents(
            activeConversation.id,

            async (
              payload
            ) => {
              if (cancelled) {
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

        /* -------------------------------------------------
           INITIAL LOAD
        ------------------------------------------------- */

        const [
          events,
          result,
        ] =
          await Promise.all([
            getSystemEvents(
              activeConversation.id
            ),

            getMessages(
              activeConversation.id
            ),
          ]);

        const hydrated =
          await hydrateReadCounts(
            result || []
          );

        if (!cancelled) {
          setMessages(
            hydrated
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

          /*
            If no system event exists yet,
            start a little behind current time.
          */
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
  ]);

  /* =========================================================
     SYSTEM EVENT 1-SECOND FALLBACK POLLING

     Realtime = primary.
     Polling = backup when Supabase postgres_changes is slow.
  ========================================================= */

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUser?.id
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
          systemEventPollingRef.current
        ) {
          return;
        }

        /*
          Initial load normally sets this.
          This fallback protects the tiny startup window.
        */
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

    /*
      Don't wait one second for first backup check.
    */
    poll();

    const interval =
      setInterval(
        poll,
        1000
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
  ]);

  /* =========================================================
     TYPING SEND
  ========================================================= */

  const handleTypingChange =
    (
      isTyping
    ) => {
      if (
        isSelfChat ||
        !currentUser?.id ||
        (
          isChannel &&
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
      file
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
    new Set(
      pinnedMessages.map(
        (pin) =>
          pin.message_id
      )
    );

  const mentionedMessageIds =
    new Set(
      conversationMentions
        .filter(
          (mention) =>
            mention.mentioned_user_id ===
            currentUser.id
        )
        .map(
          (mention) =>
            mention.message_id
        )
    );

  /* =========================================================
     MERGED TIMELINE
  ========================================================= */

  const timelineItems =
    [
      ...(messages || []).map(
        (message) => ({
          ...message,

          timeline_type:
            "message",
        })
      ),

      ...(systemEvents || []).map(
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
                  : isGroup ||
                    isCommunity
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

          </div>

          <div className="truncate text-xs text-gray-400">

            {!isSelfChat &&
            !isChannel &&
            otherIsTyping

              ? isGroup ||
                isCommunity
                ? "Someone is typing..."
                : "typing..."

              : presenceText}

          </div>

        </div>

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

      </header>

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

          onReply={
            isChannel &&
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

          onReact={
            handleReaction
          }

          onPin={
            handlePinMessage
          }

          onOpenDirectChat={
            onOpenDirectChat
          }
        />
      )}

      {/* COMPOSER */}

      {checkingPostPermission &&
      isChannel ? (

        <div className="flex flex-shrink-0 items-center justify-center border-t bg-white px-4 py-4 text-sm text-gray-400">
          Checking channel permissions...
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

    </main>
  );
}