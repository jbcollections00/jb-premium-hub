import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  supabase,
} from "../../services/supabaseClient";

import CreateGroupModal from "./CreateGroupModal";
import CreateChannelModal from "./CreateChannelModal";
import CreateCommunityModal from "./CreateCommunityModal";
import MessageSearchModal from "./MessageSearchModal";

import {
  createDirectConversation,
  getCommunityConversations,
  getConversationMembers,
  getLatestMessage,
  getUnreadCount,
  getUnreadMentionCount,
  getUserConversations,
  joinPublicChannel,
  joinPublicCommunity,
  searchPublicChannels,
  searchPublicCommunities,
  searchUsers,
  subscribeToChatList,
  unsubscribeFromMessages,
  updateMyLastSeen,
} from "../../services/chatService";

/* =========================================================
   HELPERS
========================================================= */

function isActiveNow(lastSeen) {
  if (!lastSeen) {
    return false;
  }

  return (
    Date.now() -
      new Date(
        lastSeen
      ).getTime() <=
    120000
  );
}

function getPreviewText(
  latest,
  currentUserId
) {
  if (!latest) {
    return null;
  }

  let text =
    "Attachment";

  if (latest.deleted_at) {
    text =
      "Message deleted";
  } else if (
    latest.message?.trim()
  ) {
    text =
      latest.message.trim();
  } else if (
    latest.message_type ===
    "image"
  ) {
    text =
      "📷 Photo";
  } else if (
    latest.message_type ===
    "video"
  ) {
    text =
      "🎥 Video";
  } else if (
    latest.message_type ===
    "file"
  ) {
    text =
      "📎 File";
  }

  if (
    latest.sender_id &&
    latest.sender_id ===
      currentUserId
  ) {
    return `You: ${text}`;
  }

  return text;
}

function formatConversationTime(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const now =
    new Date();

  const todayStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const messageDayStart =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  const differenceDays =
    Math.floor(
      (
        todayStart.getTime() -
        messageDayStart.getTime()
      ) /
        86400000
    );

  if (
    differenceDays ===
    0
  ) {
    return date.toLocaleTimeString(
      [],
      {
        hour:
          "numeric",

        minute:
          "2-digit",
      }
    );
  }

  if (
    differenceDays ===
    1
  ) {
    return "Yesterday";
  }

  if (
    differenceDays <
    7
  ) {
    return date.toLocaleDateString(
      [],
      {
        weekday:
          "short",
      }
    );
  }

  return date.toLocaleDateString(
    [],
    {
      month:
        "short",

      day:
        "numeric",
    }
  );
}

function getConversationActivityDate(
  conversation
) {
  return (
    conversation
      ?.rollupActivityDate ||
    conversation
      ?.latestMessage
      ?.created_at ||
    conversation
      ?.updated_at ||
    conversation
      ?.created_at ||
    null
  );
}

function sortConversationList(
  rows
) {
  return [
    ...(rows || []),
  ].sort(
    (
      a,
      b
    ) =>
      new Date(
        getConversationActivityDate(
          b
        ) || 0
      ).getTime() -
      new Date(
        getConversationActivityDate(
          a
        ) || 0
      ).getTime()
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ChatSidebar({
  currentUser,
  selectedConversation,
  onSelectConversation,
  onOpenDirectChat,
}) {
  const [
    conversations,
    setConversations,
  ] = useState([]);

  const [
    communityChildren,
    setCommunityChildren,
  ] = useState({});

  const [
    expandedCommunityIds,
    setExpandedCommunityIds,
  ] = useState({});

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    userResults,
    setUserResults,
  ] = useState([]);

  const [
    channelResults,
    setChannelResults,
  ] = useState([]);

  const [
    communityResults,
    setCommunityResults,
  ] = useState([]);

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    joiningChannelId,
    setJoiningChannelId,
  ] = useState(null);

  const [
    joiningCommunityId,
    setJoiningCommunityId,
  ] = useState(null);

  const [
    showGroupModal,
    setShowGroupModal,
  ] = useState(false);

  const [
    showChannelModal,
    setShowChannelModal,
  ] = useState(false);

  const [
    showCommunityModal,
    setShowCommunityModal,
  ] = useState(false);

  const [
    showMessageSearch,
    setShowMessageSearch,
  ] = useState(false);

  const [
    loadingChats,
    setLoadingChats,
  ] = useState(false);

  const reloadTimerRef =
    useRef(null);

  const loadingRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  const lastAutoExpandedChildRef =
    useRef(null);

  const communityExpandStorageKey =
    currentUser?.id
      ? `jb-chat-community-expanded:${currentUser.id}`
      : null;

  const expandStateHydratedRef =
    useRef(false);

  const memberCacheRef =
    useRef(
      new Map()
    );

  const communityChildrenCacheRef =
    useRef(
      new Map()
    );

  const conversationSummaryCacheRef =
    useRef(
      new Map()
    );

  const queuedReloadRef =
    useRef(false);

  const MEMBER_CACHE_TTL =
    60000;

  const COMMUNITY_CHILD_CACHE_TTL =
    60000;

  const CONVERSATION_SUMMARY_CACHE_TTL =
    15000;

  const SIDEBAR_LOAD_CONCURRENCY =
    8;

  /* =========================================================
     MOUNT
  ========================================================= */

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;

      if (
        reloadTimerRef.current
      ) {
        clearTimeout(
          reloadTimerRef.current
        );
      }
    };
  }, []);

  /* =========================================================
     LOAD PERSISTED COMMUNITY EXPAND STATE
  ========================================================= */

  useEffect(() => {
    expandStateHydratedRef.current =
      false;

    if (
      !communityExpandStorageKey
    ) {
      return;
    }

    try {
      const raw =
        window.localStorage.getItem(
          communityExpandStorageKey
        );

      if (raw) {
        const parsed =
          JSON.parse(
            raw
          );

        if (
          parsed &&
          typeof parsed ===
            "object" &&
          !Array.isArray(
            parsed
          )
        ) {
          setExpandedCommunityIds(
            parsed
          );
        }
      }
    } catch (error) {
      console.error(
        "Load community expand state error:",
        error
      );
    } finally {
      expandStateHydratedRef.current =
        true;
    }
  }, [
    communityExpandStorageKey,
  ]);

  /* =========================================================
     AUTO-EXPAND ACTIVE COMMUNITY CHILD
  ========================================================= */

  useEffect(() => {
    const selectedId =
      selectedConversation?.id;

    if (!selectedId) {
      lastAutoExpandedChildRef.current =
        null;

      return;
    }

    let parentCommunityId =
      null;

    for (
      const [
        communityId,
        children,
      ] of Object.entries(
        communityChildren
      )
    ) {
      const containsSelected =
        (
          children ||
          []
        ).some(
          (
            child
          ) =>
            child.id ===
            selectedId
        );

      if (containsSelected) {
        parentCommunityId =
          communityId;

        break;
      }
    }

    if (!parentCommunityId) {
      lastAutoExpandedChildRef.current =
        null;

      return;
    }

    const autoExpandKey =
      `${parentCommunityId}:${selectedId}`;

    if (
      lastAutoExpandedChildRef.current ===
      autoExpandKey
    ) {
      return;
    }

    lastAutoExpandedChildRef.current =
      autoExpandKey;

    setExpandedCommunityIds(
      (
        previous
      ) => {
        if (
          previous[
            parentCommunityId
          ] ===
          true
        ) {
          return previous;
        }

        return {
          ...previous,

          [parentCommunityId]:
            true,
        };
      }
    );
  }, [
    selectedConversation?.id,
    communityChildren,
  ]);

  /* =========================================================
     PERSIST COMMUNITY EXPAND STATE
  ========================================================= */

  useEffect(() => {
    if (
      !communityExpandStorageKey ||
      !expandStateHydratedRef.current
    ) {
      return;
    }

    try {
      window.localStorage.setItem(
        communityExpandStorageKey,
        JSON.stringify(
          expandedCommunityIds
        )
      );
    } catch (error) {
      console.error(
        "Persist community expand state error:",
        error
      );
    }
  }, [
    communityExpandStorageKey,
    expandedCommunityIds,
  ]);

  /* =========================================================
     CLEAR SEARCH
  ========================================================= */

  const clearSearch =
    () => {
      setQuery(
        ""
      );

      setUserResults(
        []
      );

      setChannelResults(
        []
      );

      setCommunityResults(
        []
      );
    };

  /* =========================================================
     SIDEBAR CACHE HELPERS
  ========================================================= */

  const getCachedConversationMembers =
    async (
      conversationId,
      {
        force = false,
      } = {}
    ) => {
      const cached =
        memberCacheRef.current.get(
          conversationId
        );

      const now =
        Date.now();

      if (
        !force &&
        cached &&
        now -
          cached.timestamp <
          MEMBER_CACHE_TTL
      ) {
        return cached.data;
      }

      const members =
        await getConversationMembers(
          conversationId
        );

      memberCacheRef.current.set(
        conversationId,
        {
          data:
            members ||
            [],
          timestamp:
            now,
        }
      );

      return members || [];
    };

  const getCachedCommunityChildren =
    async (
      communityId,
      {
        force = false,
      } = {}
    ) => {
      const cached =
        communityChildrenCacheRef.current.get(
          communityId
        );

      const now =
        Date.now();

      if (
        !force &&
        cached &&
        now -
          cached.timestamp <
          COMMUNITY_CHILD_CACHE_TTL
      ) {
        return cached.data;
      }

      const children =
        await getCommunityConversations(
          communityId
        );

      communityChildrenCacheRef.current.set(
        communityId,
        {
          data:
            children ||
            [],
          timestamp:
            now,
        }
      );

      return children || [];
    };

  const mapWithConcurrency =
    async (
      items,
      mapper,
      concurrency =
        SIDEBAR_LOAD_CONCURRENCY
    ) => {
      const source =
        items ||
        [];

      if (
        source.length ===
        0
      ) {
        return [];
      }

      const results =
        new Array(
          source.length
        );

      let index =
        0;

      const worker =
        async () => {
          while (
            index <
            source.length
          ) {
            const currentIndex =
              index++;

            results[
              currentIndex
            ] =
              await mapper(
                source[
                  currentIndex
                ],
                currentIndex
              );
          }
        };

      const workerCount =
        Math.min(
          concurrency,
          source.length
        );

      await Promise.all(
        Array.from(
          {
            length:
              workerCount,
          },
          () =>
            worker()
        )
      );

      return results;
    };

  const getCachedConversationSummary =
    async (
      conversationId,
      {
        force = false,
      } = {}
    ) => {
      const cached =
        conversationSummaryCacheRef.current.get(
          conversationId
        );

      const now =
        Date.now();

      if (
        !force &&
        cached &&
        now -
          cached.timestamp <
          CONVERSATION_SUMMARY_CACHE_TTL
      ) {
        return cached.data;
      }

      const [
        latest,
        unreadCount,
        unreadMentionCount,
      ] =
        await Promise.all([
          getLatestMessage(
            conversationId
          ),

          getUnreadCount(
            conversationId
          ),

          getUnreadMentionCount(
            conversationId
          ),
        ]);

      const data = {
        latest,

        unreadCount:
          Number(
            unreadCount ||
              0
          ),

        unreadMentionCount:
          Number(
            unreadMentionCount ||
              0
          ),
      };

      conversationSummaryCacheRef.current.set(
        conversationId,
        {
          data,
          timestamp:
            now,
        }
      );

      return data;
    };

  /* =========================================================
     NORMALIZE CONVERSATION
  ========================================================= */

  const normalizeConversation =
    async (
      row
    ) => {
      const conversation =
        row?.chat_conversations;

      if (!conversation) {
        return null;
      }

      let displayName =
        conversation.title ||
        "Conversation";

      let avatarUrl =
        conversation.avatar_url ||
        null;

      let username =
        null;

      let lastSeenAt =
        null;

      let isSelfChat =
        false;

      let memberCount =
        null;

      let currentMemberRole =
        row.role ||
        null;

      /* -----------------------------------------------------
         DIRECT
      ----------------------------------------------------- */

      if (
        conversation.type ===
        "direct"
      ) {
        try {
          const members =
            await getCachedConversationMembers(
              conversation.id
            );

          const otherMember =
            members.find(
              (
                member
              ) =>
                member.user_id !==
                currentUser.id
            );

          if (!otherMember) {
            const selfMember =
              members.find(
                (
                  member
                ) =>
                  member.user_id ===
                  currentUser.id
              );

            isSelfChat =
              true;

            displayName =
              "You";

            avatarUrl =
              selfMember
                ?.profiles
                ?.avatar_url ||
              null;

            username =
              selfMember
                ?.profiles
                ?.username ||
              null;
          } else {
            displayName =
              otherMember
                ?.profiles
                ?.full_name
                ?.trim() ||
              otherMember
                ?.profiles
                ?.username
                ?.trim() ||
              "User";

            avatarUrl =
              otherMember
                ?.profiles
                ?.avatar_url ||
              null;

            username =
              otherMember
                ?.profiles
                ?.username ||
              null;

            lastSeenAt =
              otherMember
                ?.profiles
                ?.last_seen_at ||
              null;
          }
        } catch (
          error
        ) {
          console.error(
            "Load direct conversation members error:",
            error
          );
        }
      }

      /* -----------------------------------------------------
         GROUP / CHANNEL / COMMUNITY
      ----------------------------------------------------- */

      if (
        [
          "group",
          "channel",
          "community",
        ].includes(
          conversation.type
        )
      ) {
        try {
          const members =
            await getCachedConversationMembers(
              conversation.id
            );

          memberCount =
            members.length;

          const myMembership =
            members.find(
              (
                member
              ) =>
                member.user_id ===
                currentUser.id
            );

          if (
            myMembership?.role
          ) {
            currentMemberRole =
              myMembership.role;
          }
        } catch (
          error
        ) {
          console.error(
            "Load member count error:",
            error
          );
        }
      }

      const summary =
        await getCachedConversationSummary(
          conversation.id
        );

      return {
        ...conversation,

        displayName,

        avatar_url:
          avatarUrl,

        username,

        lastSeenAt,

        isSelfChat,

        memberCount,

        currentMemberRole,

        latestMessage:
          summary.latest,

        unreadCount:
          summary.unreadCount,

        unreadMentionCount:
          summary.unreadMentionCount,
      };
    };

  /* =========================================================
     LOAD CONVERSATIONS
  ========================================================= */

  const loadConversations =
    async ({
      silent = false,
    } = {}) => {
      if (
        !currentUser?.id
      ) {
        return [];
      }

      if (
        loadingRef.current
      ) {
        queuedReloadRef.current =
          true;

        return conversations;
      }

      loadingRef.current =
        true;

      try {
        if (
          !silent &&
          conversations.length ===
            0
        ) {
          setLoadingChats(
            true
          );
        }

        const rows =
          await getUserConversations(
            currentUser.id
          );

        const normalized =
          await mapWithConcurrency(
            rows ||
              [],
            normalizeConversation
          );

        const sorted =
          sortConversationList(
            normalized.filter(
              Boolean
            )
          );

        const conversationById =
          new Map(
            sorted.map(
              (
                conversation
              ) => [
                conversation.id,
                conversation,
              ]
            )
          );

        const communities =
          sorted.filter(
            (
              conversation
            ) =>
              conversation.type ===
              "community"
          );

        const childEntries =
          await mapWithConcurrency(
            communities,
            async (
              community
            ) => {
              try {
                const attached =
                  await getCachedCommunityChildren(
                    community.id
                  );

                const joinedChildren =
                  sortConversationList(
                    (
                      attached ||
                      []
                    )
                      .map(
                        (
                          child
                        ) =>
                          conversationById.get(
                            child.id
                          ) ||
                          null
                      )
                      .filter(
                        Boolean
                      )
                  );

                return [
                  community.id,
                  joinedChildren,
                ];
              } catch (
                error
              ) {
                console.error(
                  "Load community sidebar children error:",
                  error
                );

                return [
                  community.id,
                  [],
                ];
              }
            }
          );

        const nextCommunityChildren =
          Object.fromEntries(
            childEntries
          );

        const rolledUpSorted =
          sorted.map(
            (
              conversation
            ) => {
              if (
                conversation.type !==
                "community"
              ) {
                return conversation;
              }

              const children =
                nextCommunityChildren[
                  conversation.id
                ] ||
                [];

              const activityDates =
                [
                  getConversationActivityDate(
                    conversation
                  ),

                  ...children.map(
                    (
                      child
                    ) =>
                      getConversationActivityDate(
                        child
                      )
                  ),
                ]
                  .filter(
                    Boolean
                  )
                  .map(
                    (
                      value
                    ) =>
                      new Date(
                        value
                      ).getTime()
                  )
                  .filter(
                    (
                      value
                    ) =>
                      !Number.isNaN(
                        value
                      )
                  );

              const latestActivityMs =
                activityDates.length >
                0
                  ? Math.max(
                      ...activityDates
                    )
                  : 0;

              return {
                ...conversation,

                rollupActivityDate:
                  latestActivityMs >
                  0
                    ? new Date(
                        latestActivityMs
                      ).toISOString()
                    : getConversationActivityDate(
                        conversation
                      ),
              };
            }
          );

        const nestedChildIds =
          new Set();

        Object.values(
          nextCommunityChildren
        ).forEach(
          (
            children
          ) => {
            children.forEach(
              (
                child
              ) => {
                nestedChildIds.add(
                  child.id
                );
              }
            );
          }
        );

        const topLevelConversations =
          sortConversationList(
            rolledUpSorted.filter(
              (
                conversation
              ) =>
                conversation.type ===
                  "community" ||
                !nestedChildIds.has(
                  conversation.id
                )
            )
          );

        if (
          mountedRef.current
        ) {
          setConversations(
            topLevelConversations
          );

          setCommunityChildren(
            nextCommunityChildren
          );

          setExpandedCommunityIds(
            (
              previous
            ) => {
              const next = {
                ...previous,
              };

              communities.forEach(
                (
                  community
                ) => {
                  if (
                    Object.prototype.hasOwnProperty.call(
                      next,
                      community.id
                    )
                  ) {
                    return;
                  }

                  next[
                    community.id
                  ] =
                    true;
                }
              );

              return next;
            }
          );
        }

        return rolledUpSorted;
      } catch (
        error
      ) {
        console.error(
          "Load conversations error:",
          error
        );

        return [];
      } finally {
        loadingRef.current =
          false;

        if (
          mountedRef.current
        ) {
          setLoadingChats(
            false
          );
        }

        if (
          queuedReloadRef.current &&
          mountedRef.current
        ) {
          queuedReloadRef.current =
            false;

          setTimeout(
            () => {
              loadConversations({
                silent:
                  true,
              });
            },
            100
          );
        }
      }
    };

  /* =========================================================
     RELOAD SCHEDULER
  ========================================================= */

  const scheduleConversationReload =
    (
      delay = 180
    ) => {
      if (
        reloadTimerRef.current
      ) {
        clearTimeout(
          reloadTimerRef.current
        );
      }

      reloadTimerRef.current =
        setTimeout(
          () => {
            loadConversations({
              silent:
                true,
            });
          },
          delay
        );
    };

  /* =========================================================
     INITIAL / REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !currentUser?.id
    ) {
      return;
    }

    memberCacheRef.current.clear();
    communityChildrenCacheRef.current.clear();
    conversationSummaryCacheRef.current.clear();

    updateMyLastSeen();

    loadConversations();

    const heartbeat =
      setInterval(
        () => {
          updateMyLastSeen();
        },
        60000
      );

    const statusRefresh =
      setInterval(
        () => {
          if (
            typeof document !==
              "undefined" &&
            document.hidden
          ) {
            return;
          }

          loadConversations({
            silent:
              true,
          });
        },
        60000
      );

    const channel =
      subscribeToChatList(
        currentUser.id,

        () => {
          conversationSummaryCacheRef.current.clear();

          scheduleConversationReload(
            120
          );
        },

        (
          error
        ) => {
          console.error(
            "Sidebar realtime error:",
            error
          );
        }
      );

    return () => {
      clearInterval(
        heartbeat
      );

      clearInterval(
        statusRefresh
      );

      if (
        reloadTimerRef.current
      ) {
        clearTimeout(
          reloadTimerRef.current
        );
      }

      if (channel) {
        unsubscribeFromMessages(
          channel
        );
      }
    };
  }, [
    currentUser?.id,
  ]);

  /* =========================================================
     SYSTEM EVENTS REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !currentUser?.id
    ) {
      return;
    }

    const channel =
      supabase
        .channel(
          `sidebar-system-events-${currentUser.id}`
        )

        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "chat_system_events",
          },

          () => {
            memberCacheRef.current.clear();
            communityChildrenCacheRef.current.clear();
            conversationSummaryCacheRef.current.clear();

            scheduleConversationReload(
              120
            );
          }
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    currentUser?.id,
  ]);

  /* =========================================================
     SEARCH
  ========================================================= */

  useEffect(() => {
    const timeout =
      setTimeout(
        async () => {
          const value =
            query.trim();

          if (!value) {
            setUserResults(
              []
            );

            setChannelResults(
              []
            );

            setCommunityResults(
              []
            );

            setSearching(
              false
            );

            return;
          }

          try {
            setSearching(
              true
            );

            const [
              users,
              publicChannels,
              publicCommunities,
            ] =
              await Promise.all([
                searchUsers(
                  value
                ),

                searchPublicChannels(
                  value
                ),

                searchPublicCommunities(
                  value
                ),
              ]);

            setUserResults(
              users ||
                []
            );

            setChannelResults(
              publicChannels ||
                []
            );

            setCommunityResults(
              publicCommunities ||
                []
            );
          } catch (
            error
          ) {
            console.error(
              "Chat search error:",
              error
            );

            setUserResults(
              []
            );

            setChannelResults(
              []
            );

            setCommunityResults(
              []
            );
          } finally {
            setSearching(
              false
            );
          }
        },
        300
      );

    return () =>
      clearTimeout(
        timeout
      );
  }, [
    query,
  ]);

  /* =========================================================
     OPEN DIRECT CHAT
  ========================================================= */

  const openUserChat =
    async (
      user
    ) => {
      try {
        if (
          onOpenDirectChat
        ) {
          await onOpenDirectChat(
            user
          );

          clearSearch();

          scheduleConversationReload(
            150
          );

          return;
        }

        const conversationId =
          await createDirectConversation(
            currentUser.id,
            user.id
          );

        const members =
          await getConversationMembers(
            conversationId
          );

        const isSelf =
          user.id ===
          currentUser.id;

        const selectedMember =
          members.find(
            (
              member
            ) =>
              member.user_id ===
              user.id
          );

        const profile =
          selectedMember
            ?.profiles ||
          user;

        const conversation = {
          id:
            conversationId,

          type:
            "direct",

          displayName:
            isSelf
              ? "You"
              : profile
                  ?.full_name
                  ?.trim() ||
                profile
                  ?.username
                  ?.trim() ||
                "User",

          title:
            isSelf
              ? "You"
              : profile
                  ?.full_name
                  ?.trim() ||
                profile
                  ?.username
                  ?.trim() ||
                "User",

          avatar_url:
            profile
              ?.avatar_url ||
            null,

          username:
            profile
              ?.username ||
            null,

          lastSeenAt:
            isSelf
              ? null
              : profile
                  ?.last_seen_at ||
                null,

          isSelfChat:
            isSelf,

          otherUserId:
            user.id,

          unreadCount:
            0,

          unreadMentionCount:
            0,
        };

        clearSearch();

        await loadConversations({
          silent:
            true,
        });

        onSelectConversation?.(
          conversation
        );
      } catch (
        error
      ) {
        console.error(
          "Open direct chat error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open chat."
        );
      }
    };

  /* =========================================================
     SELECT CONVERSATION
  ========================================================= */

  const selectConversation =
    (
      conversation
    ) => {
      conversationSummaryCacheRef.current.delete(
        conversation.id
      );

      setConversations(
        (
          previous
        ) =>
          previous.map(
            (
              item
            ) =>
              item.id ===
              conversation.id
                ? {
                    ...item,

                    unreadCount:
                      0,

                    unreadMentionCount:
                      0,
                  }
                : item
          )
      );

      setCommunityChildren(
        (
          previous
        ) => {
          let changed =
            false;

          const next = {};

          for (
            const [
              communityId,
              children,
            ] of Object.entries(
              previous
            )
          ) {
            next[
              communityId
            ] =
              (
                children ||
                []
              ).map(
                (
                  child
                ) => {
                  if (
                    child.id !==
                    conversation.id
                  ) {
                    return child;
                  }

                  changed =
                    true;

                  return {
                    ...child,

                    unreadCount:
                      0,

                    unreadMentionCount:
                      0,
                  };
                }
              );
          }

          return changed
            ? next
            : previous;
        }
      );

      onSelectConversation?.(
        conversation
      );

      scheduleConversationReload(
        700
      );
    };

  /* =========================================================
     OPEN PUBLIC CHANNEL
  ========================================================= */

  const openPublicChannel =
    async (
      publicChannel
    ) => {
      try {
        const refreshed =
          await loadConversations({
            silent:
              true,
          });

        const existing =
          refreshed.find(
            (
              conversation
            ) =>
              conversation.id ===
              publicChannel.id
          );

        if (existing) {
          clearSearch();

          selectConversation(
            existing
          );

          return;
        }

        const members =
          await getConversationMembers(
            publicChannel.id
          );

        const myMembership =
          members.find(
            (
              member
            ) =>
              member.user_id ===
              currentUser.id
          );

        clearSearch();

        onSelectConversation?.({
          id:
            publicChannel.id,

          type:
            "channel",

          title:
            publicChannel.title,

          displayName:
            publicChannel.title ||
            "Channel",

          description:
            publicChannel.description ||
            null,

          avatar_url:
            publicChannel.avatar_url ||
            null,

          slug:
            publicChannel.slug ||
            null,

          is_private:
            false,

          memberCount:
            Number(
              publicChannel.member_count ||
                members.length ||
                0
            ),

          currentMemberRole:
            myMembership
              ?.role ||
            "member",

          unreadCount:
            0,

          unreadMentionCount:
            0,
        });
      } catch (
        error
      ) {
        console.error(
          "Open public channel error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open channel."
        );
      }
    };

  /* =========================================================
     JOIN PUBLIC CHANNEL
  ========================================================= */

  const handleJoinPublicChannel =
    async (
      publicChannel
    ) => {
      try {
        setJoiningChannelId(
          publicChannel.id
        );

        await joinPublicChannel(
          publicChannel.id
        );

        memberCacheRef.current.delete(
          publicChannel.id
        );

        conversationSummaryCacheRef.current.delete(
          publicChannel.id
        );

        const refreshed =
          await loadConversations({
            silent:
              true,
          });

        const joined =
          refreshed.find(
            (
              item
            ) =>
              item.id ===
              publicChannel.id
          );

        clearSearch();

        if (joined) {
          onSelectConversation?.(
            joined
          );
        }

        scheduleConversationReload(
          200
        );
      } catch (
        error
      ) {
        console.error(
          "Join public channel error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to join channel."
        );
      } finally {
        setJoiningChannelId(
          null
        );
      }
    };

  /* =========================================================
     OPEN PUBLIC COMMUNITY
  ========================================================= */

  const openPublicCommunity =
    async (
      community
    ) => {
      try {
        const refreshed =
          await loadConversations({
            silent:
              true,
          });

        const existing =
          refreshed.find(
            (
              item
            ) =>
              item.id ===
              community.id
          );

        if (existing) {
          clearSearch();

          selectConversation(
            existing
          );

          return;
        }

        const members =
          await getConversationMembers(
            community.id
          );

        const myMembership =
          members.find(
            (
              member
            ) =>
              member.user_id ===
              currentUser.id
          );

        clearSearch();

        onSelectConversation?.({
          id:
            community.id,

          type:
            "community",

          title:
            community.title,

          displayName:
            community.title ||
            "Community",

          description:
            community.description ||
            null,

          avatar_url:
            community.avatar_url ||
            null,

          slug:
            community.slug ||
            null,

          is_private:
            false,

          memberCount:
            Number(
              community.member_count ||
                members.length ||
                0
            ),

          currentMemberRole:
            myMembership
              ?.role ||
            "member",

          unreadCount:
            0,

          unreadMentionCount:
            0,
        });
      } catch (
        error
      ) {
        console.error(
          "Open public community error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open community."
        );
      }
    };

  /* =========================================================
     JOIN PUBLIC COMMUNITY
  ========================================================= */

  const handleJoinPublicCommunity =
    async (
      community
    ) => {
      if (
        !community?.id
      ) {
        return;
      }

      try {
        setJoiningCommunityId(
          community.id
        );

        await joinPublicCommunity(
          community.id
        );

        memberCacheRef.current.delete(
          community.id
        );

        communityChildrenCacheRef.current.delete(
          community.id
        );

        conversationSummaryCacheRef.current.delete(
          community.id
        );

        const refreshed =
          await loadConversations({
            silent:
              true,
          });

        let joined =
          refreshed.find(
            (
              item
            ) =>
              item.id ===
              community.id
          );

        if (!joined) {
          const members =
            await getConversationMembers(
              community.id
            );

          const myMembership =
            members.find(
              (
                member
              ) =>
                member.user_id ===
                currentUser.id
            );

          joined = {
            id:
              community.id,

            type:
              "community",

            title:
              community.title,

            displayName:
              community.title ||
              "Community",

            description:
              community.description ||
              null,

            avatar_url:
              community.avatar_url ||
              null,

            slug:
              community.slug ||
              null,

            is_private:
              false,

            memberCount:
              members.length,

            currentMemberRole:
              myMembership
                ?.role ||
              "member",

            unreadCount:
              0,

            unreadMentionCount:
              0,
          };
        }

        clearSearch();

        onSelectConversation?.(
          joined
        );

        scheduleConversationReload(
          200
        );
      } catch (
        error
      ) {
        console.error(
          "Join public community error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to join community."
        );
      } finally {
        setJoiningCommunityId(
          null
        );
      }
    };

  /* =========================================================
     CREATED HANDLERS
  ========================================================= */

  const handleGroupCreated =
    async (
      conversation
    ) => {
      setShowGroupModal(
        false
      );

      await loadConversations({
        silent:
          true,
      });

      onSelectConversation?.(
        conversation
      );
    };

  const handleChannelCreated =
    async (
      conversation
    ) => {
      setShowChannelModal(
        false
      );

      const refreshed =
        await loadConversations({
          silent:
            true,
        });

      const loaded =
        refreshed.find(
          (
            item
          ) =>
            item.id ===
            conversation?.id
        );

      onSelectConversation?.(
        loaded ||
          conversation
      );
    };

  const handleCommunityCreated =
    async (
      conversation
    ) => {
      setShowCommunityModal(
        false
      );

      const refreshed =
        await loadConversations({
          silent:
            true,
        });

      const loaded =
        refreshed.find(
          (
            item
          ) =>
            item.id ===
            conversation?.id
        );

      onSelectConversation?.(
        loaded ||
          conversation
      );
    };

  const hasUserResults =
    userResults.length >
    0;

  const hasChannelResults =
    channelResults.length >
    0;

  const hasCommunityResults =
    communityResults.length >
    0;

  const hasAnyResults =
    hasUserResults ||
    hasChannelResults ||
    hasCommunityResults;

  /* =========================================================
     COMMUNITY SIDEBAR NESTING
  ========================================================= */

  const toggleCommunityExpanded =
    (
      communityId
    ) => {
      setExpandedCommunityIds(
        (
          previous
        ) => ({
          ...previous,

          [communityId]:
            previous[
              communityId
            ] ===
            false,
        })
      );
    };

  const renderConversationRow =
    (
      conversation,
      {
        nested = false,
      } = {}
    ) => {
      const active =
        selectedConversation
          ?.id ===
        conversation.id;

      const isGroup =
        conversation.type ===
        "group";

      const isChannel =
        conversation.type ===
        "channel";

      const isCommunity =
        conversation.type ===
        "community";

      const isDirect =
        conversation.type ===
        "direct";

      const online =
        isDirect &&
        !conversation.isSelfChat &&
        isActiveNow(
          conversation.lastSeenAt
        );

      const preview =
        getPreviewText(
          conversation.latestMessage,
          currentUser.id
        );

      let fallbackPreview =
        "No messages yet";

      if (
        conversation.isSelfChat
      ) {
        fallbackPreview =
          "Message yourself";
      } else if (
        isChannel
      ) {
        fallbackPreview =
          conversation.description?.trim() ||
          `${
            conversation.memberCount ||
            0
          } subscribers`;
      } else if (
        isCommunity
      ) {
        fallbackPreview =
          conversation.description?.trim() ||
          `${
            conversation.memberCount ||
            0
          } members`;
      } else if (
        isGroup
      ) {
        fallbackPreview =
          `${
            conversation.memberCount ||
            0
          } members`;
      }

      const unread =
        Number(
          conversation.unreadCount ||
            0
        );

      const mentions =
        Number(
          conversation.unreadMentionCount ||
            0
        );

      const activityTime =
        formatConversationTime(
          getConversationActivityDate(
            conversation
          )
        );

      const children =
        isCommunity
          ? communityChildren[
              conversation.id
            ] ||
            []
          : [];

      const childUnreadTotal =
        isCommunity
          ? children.reduce(
              (
                total,
                child
              ) =>
                total +
                Number(
                  child.unreadCount ||
                    0
                ),
              0
            )
          : 0;

      const childMentionTotal =
        isCommunity
          ? children.reduce(
              (
                total,
                child
              ) =>
                total +
                Number(
                  child.unreadMentionCount ||
                    0
                ),
              0
            )
          : 0;

      const hasChildActivity =
        childUnreadTotal > 0 ||
        childMentionTotal > 0;

      const expanded =
        isCommunity
          ? expandedCommunityIds[
              conversation.id
            ] !==
            false
          : false;

      const showChildRollup =
        isCommunity &&
        !expanded &&
        hasChildActivity;

      return (
        <div
          key={
            `${
              nested
                ? "nested"
                : "conversation"
            }-${conversation.id}`
          }
          className={
            nested
              ? active
                ? "border-l-4 border-purple-500 bg-purple-50/50"
                : "border-l-2 border-purple-100 bg-purple-50/20"
              : ""
          }
        >

          <div
            className={`flex items-stretch border-b border-gray-50 ${
              active
                ? isCommunity
                  ? "bg-purple-50"
                  : nested
                  ? "bg-purple-100/70"
                  : "bg-blue-50"
                : showChildRollup
                ? "bg-purple-50/50 hover:bg-purple-50/80"
                : unread >
                    0 ||
                  mentions >
                    0
                ? "bg-blue-50/30 hover:bg-blue-50/60"
                : "hover:bg-gray-50"
            }`}
          >

            <button
              type="button"
              onClick={() =>
                selectConversation(
                  conversation
                )
              }
              className={`flex min-w-0 flex-1 items-center gap-3 text-left transition-colors ${
                nested
                  ? "py-2.5 pl-6 pr-2 sm:pl-8"
                  : "px-4 py-3"
              }`}
            >

              <div
                className={`relative flex flex-shrink-0 items-center justify-center ${
                  nested
                    ? "h-10 w-10"
                    : "h-12 w-12"
                }`}
              >

                <div
                  className={`flex items-center justify-center overflow-hidden rounded-full bg-gray-200 ${
                    nested
                      ? "h-10 w-10"
                      : "h-12 w-12"
                  }`}
                >

                  {conversation.avatar_url ? (
                    <img
                      src={
                        conversation.avatar_url
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className={
                        nested
                          ? "text-base"
                          : "text-xl"
                      }
                    >
                      {isChannel
                        ? "📢"
                        : isCommunity
                        ? "🌐"
                        : isGroup
                        ? "👥"
                        : "👤"}
                    </span>
                  )}

                </div>

                {online && (
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                )}

              </div>

              <div className="min-w-0 flex-1">

                <div className="flex items-center justify-between gap-2">

                  <div
                    className={`min-w-0 flex-1 truncate ${
                      unread >
                        0 ||
                      mentions >
                        0 ||
                      showChildRollup
                        ? "font-bold"
                        : "font-medium"
                    }`}
                  >
                    {conversation.displayName}
                  </div>

                  {activityTime && (
                    <div className="flex-shrink-0 text-[10px] text-gray-400">
                      {activityTime}
                    </div>
                  )}

                </div>

                <div className="mt-0.5 flex items-center gap-2">

                  <div className="min-w-0 flex-1 truncate text-xs text-gray-400">
                    {nested && (
                      <span className="mr-1 font-medium text-purple-500">
                        {isChannel
                          ? "Channel ·"
                          : isGroup
                          ? "Group ·"
                          : ""}
                      </span>
                    )}

                    {showChildRollup
                      ? `${
                          childUnreadTotal >
                          0
                            ? `${childUnreadTotal} unread`
                            : ""
                        }${
                          childUnreadTotal >
                            0 &&
                          childMentionTotal >
                            0
                            ? " · "
                            : ""
                        }${
                          childMentionTotal >
                          0
                            ? `${childMentionTotal} ${
                                childMentionTotal ===
                                1
                                  ? "mention"
                                  : "mentions"
                              }`
                            : ""
                        } in community chats`
                      : preview ||
                        fallbackPreview}
                  </div>

                  <div className="flex items-center gap-1">

                    {showChildRollup &&
                      childMentionTotal >
                        0 && (
                      <div
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-100 px-1.5 text-[10px] font-bold text-purple-700"
                        title={`${childMentionTotal} unread ${
                          childMentionTotal ===
                          1
                            ? "mention"
                            : "mentions"
                        } in community chats`}
                      >
                        @
                      </div>
                    )}

                    {showChildRollup &&
                      childUnreadTotal >
                        0 && (
                      <div
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 text-[10px] font-bold text-white"
                        title={`${childUnreadTotal} unread ${
                          childUnreadTotal ===
                          1
                            ? "message"
                            : "messages"
                        } in community chats`}
                      >
                        {childUnreadTotal >
                        99
                          ? "99+"
                          : childUnreadTotal}
                      </div>
                    )}

                    {mentions >
                      0 && (
                      <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 text-[10px] font-bold text-white">
                        @
                      </div>
                    )}

                    {unread >
                      0 && (
                      <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                        {unread >
                        99
                          ? "99+"
                          : unread}
                      </div>
                    )}

                  </div>

                </div>

              </div>

            </button>

            {isCommunity &&
              children.length >
                0 && (
              <button
                type="button"
                onClick={() =>
                  toggleCommunityExpanded(
                    conversation.id
                  )
                }
                className="flex w-10 flex-shrink-0 items-center justify-center text-xs text-purple-500 hover:bg-purple-100/60"
                title={
                  expanded
                    ? "Hide community chats"
                    : "Show community chats"
                }
                aria-label={
                  expanded
                    ? "Collapse community chats"
                    : "Expand community chats"
                }
                aria-expanded={
                  expanded
                }
              >
                {expanded
                  ? "⌄"
                  : "›"}
              </button>
            )}

          </div>

          {isCommunity &&
            children.length >
              0 &&
            expanded && (
            <div>
              {children.map(
                (
                  child
                ) =>
                  renderConversationRow(
                    child,
                    {
                      nested:
                        true,
                    }
                  )
              )}
            </div>
          )}

        </div>
      );
    };

  /* =========================================================
     GLOBAL SEARCH SHORTCUT
  ========================================================= */

  useEffect(() => {
    const handleGlobalSearchShortcut =
      (
        event
      ) => {
        if (
          (
            event.ctrlKey ||
            event.metaKey
          ) &&
          event.key.toLowerCase() ===
            "k"
        ) {
          event.preventDefault();

          setShowMessageSearch(
            true
          );
        }
      };

    document.addEventListener(
      "keydown",
      handleGlobalSearchShortcut
    );

    return () =>
      document.removeEventListener(
        "keydown",
        handleGlobalSearchShortcut
      );
  }, []);

  /* =========================================================
     GLOBAL MESSAGE SEARCH RESULT
  ========================================================= */

  const handleGlobalMessageSearchResult =
    (
      result
    ) => {
      if (
        !result?.id ||
        !result?.conversation_id
      ) {
        return;
      }

      const targetConversation =
        conversations.find(
          (
            conversation
          ) =>
            conversation.id ===
            result.conversation_id
        ) ||
        (
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
              }
        );

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
          "Unable to save pending global search jump:",
          error
        );
      }

      setShowMessageSearch(
        false
      );

      clearSearch();

      onSelectConversation?.(
        targetConversation
      );
    };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <>
      <aside className="flex h-full min-h-0 w-full flex-shrink-0 flex-col border-r bg-white md:w-[340px]">

        {/* HEADER */}

        <div className="flex-shrink-0 border-b p-4">

          <div className="mb-4 flex items-center justify-between gap-2">

            <div className="text-xl font-bold">
              JB Chat
            </div>

            <div className="flex items-center gap-1">

              <button
                type="button"
                onClick={() =>
                  setShowGroupModal(
                    true
                  )
                }
                className="flex h-9 items-center gap-1 rounded-full bg-blue-600 px-2 text-[10px] font-semibold text-white hover:bg-blue-700"
              >
                + Group
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowChannelModal(
                    true
                  )
                }
                className="flex h-9 items-center gap-1 rounded-full bg-gray-900 px-2 text-[10px] font-semibold text-white hover:bg-gray-800"
              >
                + Channel
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowCommunityModal(
                    true
                  )
                }
                className="flex h-9 items-center gap-1 rounded-full bg-purple-600 px-2 text-[10px] font-semibold text-white hover:bg-purple-700"
              >
                + Community
              </button>

            </div>

          </div>

          <div className="relative">

            <input
              value={
                query
              }
              onChange={(
                event
              ) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Search users, channels, communities..."
              className="w-full rounded-xl bg-gray-100 px-4 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />

            {query && (
              <button
                type="button"
                onClick={
                  clearSearch
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            )}

          </div>

          <button
            type="button"
            onClick={() =>
              setShowMessageSearch(
                true
              )
            }
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            aria-label="Search messages in all chats"
            title="Search messages in all chats (Ctrl/Cmd+K)"
          >
            <span>
              🔎
            </span>

            <span>
              Search messages in all chats
              <span className="ml-1 hidden text-[10px] font-normal text-gray-400 sm:inline">
                Ctrl/Cmd+K
              </span>
            </span>
          </button>

        </div>

        {/* =================================================
            SEARCH RESULTS
        ================================================= */}

        {query.trim() ? (

          <div className="flex-1 overflow-y-auto">

            {searching && (
              <div className="px-4 py-5 text-sm text-gray-400">
                Searching...
              </div>
            )}

            {!searching &&
              !hasAnyResults && (
                <div className="px-4 py-5 text-sm text-gray-400">
                  No users, channels, or communities found.
                </div>
              )}

            {/* USERS */}

            {!searching &&
              hasUserResults && (
                <>

                  <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase text-gray-400">
                    Users
                  </div>

                  {userResults.map(
                    (
                      user
                    ) => {
                      const self =
                        user.id ===
                        currentUser.id;

                      return (
                        <button
                          key={
                            `user-${user.id}`
                          }
                          type="button"
                          onClick={() =>
                            openUserChat(
                              user
                            )
                          }
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                        >

                          <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">

                            {user.avatar_url ? (
                              <img
                                src={
                                  user.avatar_url
                                }
                                alt=""
                                className="h-11 w-11 rounded-full object-cover"
                              />
                            ) : (
                              "👤"
                            )}

                            {!self &&
                              isActiveNow(
                                user.last_seen_at
                              ) && (
                                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                              )}

                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="truncate font-medium">
                              {self
                                ? "You"
                                : user.full_name ||
                                  user.username ||
                                  "User"}
                            </div>

                            <div className="truncate text-xs text-gray-400">

                              {self
                                ? "Message yourself"
                                : user.username
                                ? `@${user.username}`
                                : "Start chat"}

                            </div>

                          </div>

                        </button>
                      );
                    }
                  )}

                </>
              )}

            {/* PUBLIC CHANNELS */}

            {!searching &&
              hasChannelResults && (
                <>

                  <div className="border-t px-4 pb-2 pt-4 text-xs font-semibold uppercase text-gray-400">
                    Public Channels
                  </div>

                  {channelResults.map(
                    (
                      channel
                    ) => {
                      const member =
                        Boolean(
                          channel.is_member
                        );

                      const joining =
                        joiningChannelId ===
                        channel.id;

                      return (
                        <div
                          key={
                            `channel-${channel.id}`
                          }
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                        >

                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">

                            {channel.avatar_url ? (
                              <img
                                src={
                                  channel.avatar_url
                                }
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              "📢"
                            )}

                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="truncate text-sm font-semibold">
                              {channel.title ||
                                "Channel"}
                            </div>

                            {channel.slug && (
                              <div className="truncate text-xs text-blue-600">
                                @{channel.slug}
                              </div>
                            )}

                            <div className="text-[11px] text-gray-400">
                              {Number(
                                channel.member_count ||
                                  0
                              )} subscribers
                            </div>

                          </div>

                          {member ? (
                            <button
                              type="button"
                              onClick={() =>
                                openPublicChannel(
                                  channel
                                )
                              }
                              className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600"
                            >
                              Open
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={
                                joining
                              }
                              onClick={() =>
                                handleJoinPublicChannel(
                                  channel
                                )
                              }
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              {joining
                                ? "Joining..."
                                : "Join"}
                            </button>
                          )}

                        </div>
                      );
                    }
                  )}

                </>
              )}

            {/* PUBLIC COMMUNITIES */}

            {!searching &&
              hasCommunityResults && (
                <>

                  <div className="border-t px-4 pb-2 pt-4 text-xs font-semibold uppercase text-gray-400">
                    Public Communities
                  </div>

                  {communityResults.map(
                    (
                      community
                    ) => {
                      const member =
                        Boolean(
                          community.is_member
                        );

                      const joining =
                        joiningCommunityId ===
                        community.id;

                      return (
                        <div
                          key={
                            `community-${community.id}`
                          }
                          className="flex items-center gap-3 px-4 py-3 hover:bg-purple-50/40"
                        >

                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-100">

                            {community.avatar_url ? (
                              <img
                                src={
                                  community.avatar_url
                                }
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xl">
                                🌐
                              </span>
                            )}

                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="truncate text-sm font-semibold text-gray-900">
                              {community.title ||
                                "Community"}
                            </div>

                            {community.slug && (
                              <div className="truncate text-xs font-medium text-purple-600">
                                @{community.slug}
                              </div>
                            )}

                            <div className="text-[11px] text-gray-400">

                              {Number(
                                community.member_count ||
                                  0
                              )}{" "}

                              {Number(
                                community.member_count ||
                                  0
                              ) === 1
                                ? "member"
                                : "members"}

                            </div>

                          </div>

                          {member ? (
                            <button
                              type="button"
                              onClick={() =>
                                openPublicCommunity(
                                  community
                                )
                              }
                              className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 hover:bg-purple-100"
                            >
                              Open
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={
                                joining
                              }
                              onClick={() =>
                                handleJoinPublicCommunity(
                                  community
                                )
                              }
                              className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
                            >
                              {joining
                                ? "Joining..."
                                : "Join"}
                            </button>
                          )}

                        </div>
                      );
                    }
                  )}

                </>
              )}

          </div>

        ) : (

          /* =================================================
             CHAT LIST
          ================================================= */

          <div className="flex-1 overflow-y-auto">

            <div className="flex items-center justify-between px-4 py-3">

              <div className="text-xs font-semibold uppercase text-gray-400">
                Chats
              </div>

              {loadingChats &&
                conversations.length >
                  0 && (
                  <div className="text-[10px] text-gray-300">
                    Updating...
                  </div>
                )}

            </div>

            {loadingChats &&
              conversations.length ===
                0 && (
                <div className="px-4 py-4 text-sm text-gray-400">
                  Loading chats...
                </div>
              )}

            {!loadingChats &&
              conversations.length ===
                0 && (
                <div className="px-4 py-4 text-sm text-gray-400">
                  No conversations yet.
                </div>
              )}

            {conversations.map(
              (
                conversation
              ) =>
                renderConversationRow(
                  conversation
                )
            )}

          </div>

        )}

      </aside>

      {/* GLOBAL MESSAGE SEARCH */}

      {showMessageSearch && (
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
            null
          }

          conversationTitle="All chats"

          onOpenResult={
            handleGlobalMessageSearchResult
          }
        />
      )}

      {/* CREATE GROUP */}

      {showGroupModal && (
        <CreateGroupModal
          currentUser={
            currentUser
          }

          onClose={() =>
            setShowGroupModal(
              false
            )
          }

          onCreated={
            handleGroupCreated
          }
        />
      )}

      {/* CREATE CHANNEL */}

      {showChannelModal && (
        <CreateChannelModal
          currentUser={
            currentUser
          }

          onClose={() =>
            setShowChannelModal(
              false
            )
          }

          onCreated={
            handleChannelCreated
          }
        />
      )}

      {/* CREATE COMMUNITY */}

      {showCommunityModal && (
        <CreateCommunityModal
          currentUser={
            currentUser
          }

          onClose={() =>
            setShowCommunityModal(
              false
            )
          }

          onCreated={
            handleCommunityCreated
          }
        />
      )}

    </>
  );
}