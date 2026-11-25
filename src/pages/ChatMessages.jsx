import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../services/supabaseClient";

import ChatSidebar from "../components/chat/ChatSidebar";
import ChatWindow from "../components/chat/ChatWindow";

import {
  createDirectConversation,
  clearChatConversationNotificationPreference,
  getChatNotifications,
  getChatNotificationPreference,
  getChatNotificationUnreadCount,
  getCommunityInvitePreview,
  getConversationMembers,
  getPublicChannelBySlug,
  getPublicCommunityBySlug,
  joinChannelByInvite,
  joinCommunityByInvite,
  joinGroupByInvite,
  joinPublicChannel,
  joinPublicCommunity,
  markAllChatNotificationsRead,
  markChatConversationNotificationsRead,
  markChatNotificationRead,
  setChatConversationNotificationPreference,
  setGlobalChatNotificationPreference,
  subscribeToChatNotificationPreferences,
  subscribeToChatNotifications,
  unsubscribeFromMessages,
} from "../services/chatService";

/* =========================================================
   NOTIFICATION HELPERS
========================================================= */

function formatNotificationTime(
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

  const diffMs =
    Date.now() -
    date.getTime();

  const diffMinutes =
    Math.floor(
      diffMs /
      60000
    );

  if (
    diffMinutes <
    1
  ) {
    return "Now";
  }

  if (
    diffMinutes <
    60
  ) {
    return `${diffMinutes}m`;
  }

  const diffHours =
    Math.floor(
      diffMinutes /
      60
    );

  if (
    diffHours <
    24
  ) {
    return `${diffHours}h`;
  }

  const diffDays =
    Math.floor(
      diffHours /
      24
    );

  if (
    diffDays <
    7
  ) {
    return `${diffDays}d`;
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

function getNotificationIcon(
  type
) {
  if (
    type ===
    "mention"
  ) {
    return "@";
  }

  if (
    type ===
    "reply"
  ) {
    return "↩";
  }

  if (
    type ===
    "system"
  ) {
    return "⚙";
  }

  return "💬";
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ChatMessages() {
  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    selectedConversation,
    setSelectedConversation,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    isMobile,
    setIsMobile,
  ] = useState(
    typeof window !== "undefined"
      ? window.innerWidth < 768
      : false
  );

  const [
    processingLink,
    setProcessingLink,
  ] = useState(false);

  /* =========================================================
     NOTIFICATIONS
  ========================================================= */

  const [
    showNotifications,
    setShowNotifications,
  ] = useState(false);

  const [
    notifications,
    setNotifications,
  ] = useState([]);

  const [
    notificationUnreadCount,
    setNotificationUnreadCount,
  ] = useState(0);

  const [
    loadingNotifications,
    setLoadingNotifications,
  ] = useState(false);

  const [
    loadingMoreNotifications,
    setLoadingMoreNotifications,
  ] = useState(false);

  const [
    notificationsHasMore,
    setNotificationsHasMore,
  ] = useState(false);

  const [
    notificationCursor,
    setNotificationCursor,
  ] = useState(null);

  const [
    markingAllNotificationsRead,
    setMarkingAllNotificationsRead,
  ] = useState(false);

  const [
    showNotificationSettings,
    setShowNotificationSettings,
  ] = useState(false);

  const [
    globalNotificationPreference,
    setGlobalNotificationPreference,
  ] = useState({
    notifications_enabled:
      true,
    message_enabled:
      true,
    mention_enabled:
      true,
    reply_enabled:
      true,
    system_enabled:
      true,
    mute_until:
      null,
  });

  const [
    conversationNotificationPreference,
    setConversationNotificationPreference,
  ] = useState(null);

  const [
    savingNotificationPreference,
    setSavingNotificationPreference,
  ] = useState(false);

  const [
    browserNotificationPermission,
    setBrowserNotificationPermission,
  ] = useState(
    typeof Notification !==
      "undefined"
      ? Notification.permission
      : "unsupported"
  );

  /* =========================================================
     PUBLIC CHANNEL PREVIEW
  ========================================================= */

  const [
    publicChannelPreview,
    setPublicChannelPreview,
  ] = useState(null);

  const [
    joiningPublicChannel,
    setJoiningPublicChannel,
  ] = useState(false);

  /* =========================================================
     PUBLIC COMMUNITY PREVIEW
  ========================================================= */

  const [
    publicCommunityPreview,
    setPublicCommunityPreview,
  ] = useState(null);

  const [
    joiningPublicCommunity,
    setJoiningPublicCommunity,
  ] = useState(false);

  /* =========================================================
     GROUP INVITE PREVIEW
  ========================================================= */

  const [
    groupInvitePreview,
    setGroupInvitePreview,
  ] = useState(null);

  const [
    joiningGroupInvite,
    setJoiningGroupInvite,
  ] = useState(false);

  /* =========================================================
     COMMUNITY INVITE PREVIEW
  ========================================================= */

  const [
    communityInvitePreview,
    setCommunityInvitePreview,
  ] = useState(null);

  const [
    joiningCommunityInvite,
    setJoiningCommunityInvite,
  ] = useState(false);

  const linkProcessedRef =
    useRef(false);

  /* =========================================================
     LOAD CURRENT USER
  ========================================================= */

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const {
          data: {
            user,
          },
          error,
        } =
          await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        if (mounted) {
          setCurrentUser(
            user || null
          );
        }
      } catch (error) {
        console.error(
          "Get current user error:",
          error
        );

        if (mounted) {
          setCurrentUser(
            null
          );
        }
      } finally {
        if (mounted) {
          setLoading(
            false
          );
        }
      }
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  /* =========================================================
     BROWSER NOTIFICATIONS
  ========================================================= */

  const registerChatNotificationServiceWorker =
    async () => {
      if (
        typeof navigator ===
          "undefined" ||
        !(
          "serviceWorker" in
          navigator
        )
      ) {
        return null;
      }

      try {
        const registration =
          await navigator.serviceWorker.register(
            "/chat-notification-sw.js"
          );

        return registration;
      } catch (error) {
        console.error(
          "Chat notification service worker registration error:",
          error
        );

        return null;
      }
    };

  const showBrowserChatNotification =
    async (
      notification
    ) => {
      if (
        !notification ||
        typeof Notification ===
          "undefined" ||
        Notification.permission !==
          "granted"
      ) {
        return;
      }

      if (
        typeof document !==
          "undefined" &&
        !document.hidden
      ) {
        return;
      }

      try {
        const registration =
          await registerChatNotificationServiceWorker();

        const title =
          notification.title ||
          "New chat notification";

        const options = {
          body:
            notification.body ||
            "You have a new chat notification.",

          tag:
            notification.id
              ? `chat-notification-${notification.id}`
              : undefined,

          renotify:
            false,

          data: {
            conversationId:
              notification.conversation_id ||
              null,

            url:
              notification.conversation_id
                ? `/chat?open=${encodeURIComponent(
                    notification.conversation_id
                  )}`
                : "/chat",
          },
        };

        if (
          notification.actor
            ?.avatar_url
        ) {
          options.icon =
            notification.actor.avatar_url;

          options.badge =
            notification.actor.avatar_url;
        }

        if (
          registration?.showNotification
        ) {
          await registration.showNotification(
            title,
            options
          );

          return;
        }

        new Notification(
          title,
          options
        );
      } catch (error) {
        console.error(
          "Show browser chat notification error:",
          error
        );
      }
    };

  const handleEnableBrowserNotifications =
    async () => {
      if (
        typeof Notification ===
        "undefined"
      ) {
        window.alert(
          "Browser notifications are not supported on this device."
        );

        return;
      }

      try {
        const permission =
          await Notification.requestPermission();

        setBrowserNotificationPermission(
          permission
        );

        if (
          permission ===
          "granted"
        ) {
          await registerChatNotificationServiceWorker();
        }
      } catch (error) {
        console.error(
          "Enable browser notifications error:",
          error
        );

        window.alert(
          "Unable to enable browser notifications."
        );
      }
    };

  useEffect(() => {
    if (
      !currentUser?.id
    ) {
      return;
    }

    if (
      typeof Notification !==
        "undefined"
    ) {
      setBrowserNotificationPermission(
        Notification.permission
      );

      if (
        Notification.permission ===
        "granted"
      ) {
        registerChatNotificationServiceWorker();
      }
    }
  }, [
    currentUser?.id,
  ]);

  /* =========================================================
     LOAD NOTIFICATIONS
  ========================================================= */

  const loadNotifications =
    async ({
      append = false,
    } = {}) => {
      if (
        !currentUser?.id
      ) {
        return;
      }

      try {
        if (append) {
          setLoadingMoreNotifications(
            true
          );
        } else {
          setLoadingNotifications(
            true
          );
        }

        const page =
          await getChatNotifications({
            limit:
              30,

            before:
              append
                ? notificationCursor
                : null,
          });

        setNotifications(
          (
            previous
          ) => {
            const incoming =
              page.notifications ||
              [];

            if (!append) {
              return incoming;
            }

            const existingIds =
              new Set(
                previous.map(
                  (
                    item
                  ) =>
                    item.id
                )
              );

            return [
              ...previous,
              ...incoming.filter(
                (
                  item
                ) =>
                  !existingIds.has(
                    item.id
                  )
              ),
            ];
          }
        );

        setNotificationsHasMore(
          Boolean(
            page.hasMore
          )
        );

        setNotificationCursor(
          page.nextCursor ||
          null
        );
      } catch (error) {
        console.error(
          "Load chat notifications error:",
          error
        );
      } finally {
        setLoadingNotifications(
          false
        );

        setLoadingMoreNotifications(
          false
        );
      }
    };

  const refreshNotificationUnreadCount =
    async () => {
      if (
        !currentUser?.id
      ) {
        setNotificationUnreadCount(
          0
        );

        return;
      }

      try {
        const count =
          await getChatNotificationUnreadCount();

        setNotificationUnreadCount(
          Number(
            count ||
              0
          )
        );
      } catch (error) {
        console.error(
          "Load notification unread count error:",
          error
        );
      }
    };

  useEffect(() => {
    if (
      !currentUser?.id
    ) {
      setNotifications(
        []
      );

      setNotificationUnreadCount(
        0
      );

      return;
    }

    let refreshTimer =
      null;

    loadNotifications();
    refreshNotificationUnreadCount();

    const channel =
      subscribeToChatNotifications(
        currentUser.id,
        (payload) => {
          if (
            payload?.eventType ===
              "INSERT" &&
            payload?.new
          ) {
            showBrowserChatNotification(
              payload.new
            );
          }

          if (refreshTimer) {
            clearTimeout(
              refreshTimer
            );
          }

          refreshTimer =
            setTimeout(
              () => {
                loadNotifications();
                refreshNotificationUnreadCount();
              },
              100
            );
        },
        (
          error
        ) => {
          console.error(
            "Notification realtime subscription error:",
            error
          );
        }
      );

    const fallbackRefresh =
      setInterval(
        () => {
          if (
            typeof document !==
              "undefined" &&
            document.hidden
          ) {
            return;
          }

          refreshNotificationUnreadCount();
        },
        60000
      );

    return () => {
      if (refreshTimer) {
        clearTimeout(
          refreshTimer
        );
      }

      clearInterval(
        fallbackRefresh
      );

      if (channel) {
        unsubscribeFromMessages(
          channel
        );
      }
    };
  }, [
    currentUser?.id,
  ]);

  const loadNotificationPreferences =
    async () => {
      if (
        !currentUser?.id
      ) {
        return;
      }

      try {
        const globalPreference =
          await getChatNotificationPreference(
            null
          );

        setGlobalNotificationPreference(
          globalPreference
        );

        if (
          selectedConversation?.id
        ) {
          const conversationPreference =
            await getChatNotificationPreference(
              selectedConversation.id
            );

          setConversationNotificationPreference(
            conversationPreference
          );
        } else {
          setConversationNotificationPreference(
            null
          );
        }
      } catch (error) {
        console.error(
          "Load notification preferences error:",
          error
        );
      }
    };

  useEffect(() => {
    if (
      !currentUser?.id
    ) {
      return;
    }

    loadNotificationPreferences();

    const channel =
      subscribeToChatNotificationPreferences(
        currentUser.id,
        () => {
          loadNotificationPreferences();
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
    currentUser?.id,
    selectedConversation?.id,
  ]);

  /* =========================================================
     AUTO-READ ACTIVE CONVERSATION NOTIFICATIONS
  ========================================================= */

  useEffect(() => {
    if (
      !currentUser?.id ||
      !selectedConversation?.id
    ) {
      return;
    }

    let cancelled =
      false;

    const markActiveConversationRead =
      async () => {
        try {
          const changed =
            await markChatConversationNotificationsRead(
              selectedConversation.id
            );

          if (
            cancelled ||
            !changed
          ) {
            return;
          }

          setNotifications(
            (
              previous
            ) =>
              previous.map(
                (
                  item
                ) =>
                  item.conversation_id ===
                    selectedConversation.id
                    ? {
                        ...item,
                        is_read:
                          true,
                        read_at:
                          item.read_at ||
                          new Date().toISOString(),
                      }
                    : item
              )
          );

          await refreshNotificationUnreadCount();
        } catch (error) {
          console.error(
            "Mark active chat notifications read error:",
            error
          );
        }
      };

    markActiveConversationRead();

    return () => {
      cancelled =
        true;
    };
  }, [
    currentUser?.id,
    selectedConversation?.id,
  ]);

  /* =========================================================
     RESPONSIVE
  ========================================================= */

  useEffect(() => {
    const handleResize =
      () => {
        setIsMobile(
          window.innerWidth <
            768
        );
      };

    handleResize();

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  /* =========================================================
     REMOVE QUERY PARAMETER
  ========================================================= */

  const removeQueryParameter =
    (
      parameter
    ) => {
      try {
        const url =
          new URL(
            window.location.href
          );

        url.searchParams.delete(
          parameter
        );

        const nextUrl =
          `${url.pathname}` +
          `${url.search}` +
          `${url.hash}`;

        window.history.replaceState(
          {},
          "",
          nextUrl
        );
      } catch (error) {
        console.error(
          "Remove URL parameter error:",
          error
        );
      }
    };

  /* =========================================================
     LOAD CONVERSATION BY ID
  ========================================================= */

  const getConversationById =
    async (
      conversationId
    ) => {
      if (!conversationId) {
        return null;
      }

      const {
        data,
        error,
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
            conversationId
          )
          .single();

      if (error) {
        console.error(
          "Load conversation error:",
          error
        );

        throw error;
      }

      return data;
    };

  /* =========================================================
     OPEN CHANNEL
  ========================================================= */

  const openChannel =
    async (
      channel,
      fallbackRole = "member"
    ) => {
      if (
        !channel?.id ||
        !currentUser?.id
      ) {
        return;
      }

      let members = [];

      try {
        members =
          await getConversationMembers(
            channel.id
          );
      } catch (error) {
        console.error(
          "Load channel members error:",
          error
        );
      }

      const myMembership =
        members.find(
          (
            member
          ) =>
            member.user_id ===
            currentUser.id
        );

      setSelectedConversation({
        id:
          channel.id,

        type:
          "channel",

        title:
          channel.title ||
          "Channel",

        displayName:
          channel.title ||
          "Channel",

        description:
          channel.description ||
          null,

        avatar_url:
          channel.avatar_url ||
          null,

        slug:
          channel.slug ||
          null,

        is_private:
          channel.is_private ??
          false,

        memberCount:
          Number(
            channel.member_count ||
              members.length ||
              0
          ),

        currentMemberRole:
          myMembership?.role ||
          fallbackRole,
      });
    };

  /* =========================================================
     OPEN COMMUNITY
  ========================================================= */

  const openCommunity =
    async (
      community,
      fallbackRole = "member"
    ) => {
      if (
        !community?.id ||
        !currentUser?.id
      ) {
        return;
      }

      let members = [];

      try {
        members =
          await getConversationMembers(
            community.id
          );
      } catch (error) {
        console.error(
          "Load community members error:",
          error
        );
      }

      const myMembership =
        members.find(
          (
            member
          ) =>
            member.user_id ===
            currentUser.id
        );

      setSelectedConversation({
        id:
          community.id,

        type:
          "community",

        title:
          community.title ||
          "Community",

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
          community.is_private ??
          false,

        created_by:
          community.created_by ||
          null,

        memberCount:
          Number(
            community.member_count ||
              members.length ||
              0
          ),

        currentMemberRole:
          myMembership?.role ||
          fallbackRole,
      });
    };

  /* =========================================================
     OPEN CHANNEL AFTER INVITE
  ========================================================= */

  const openJoinedInviteChannel =
    async (
      conversationId
    ) => {
      if (
        !conversationId ||
        !currentUser?.id
      ) {
        return;
      }

      const conversation =
        await getConversationById(
          conversationId
        );

      if (!conversation) {
        return;
      }

      const members =
        await getConversationMembers(
          conversationId
        );

      const myMembership =
        members.find(
          (
            member
          ) =>
            member.user_id ===
            currentUser.id
        );

      setSelectedConversation({
        ...conversation,

        type:
          "channel",

        displayName:
          conversation.title ||
          "Channel",

        memberCount:
          members.length,

        currentMemberRole:
          myMembership?.role ||
          "member",
      });
    };

  /* =========================================================
     OPEN JOINED GROUP
  ========================================================= */

  const openJoinedGroup =
    async (
      conversationId
    ) => {
      if (
        !conversationId ||
        !currentUser?.id
      ) {
        return;
      }

      const conversation =
        await getConversationById(
          conversationId
        );

      if (!conversation) {
        return;
      }

      const members =
        await getConversationMembers(
          conversationId
        );

      const myMembership =
        members.find(
          (
            member
          ) =>
            member.user_id ===
            currentUser.id
        );

      setSelectedConversation({
        ...conversation,

        type:
          "group",

        displayName:
          conversation.title ||
          "Group",

        memberCount:
          members.length,

        currentMemberRole:
          myMembership?.role ||
          "member",
      });
    };

  /* =========================================================
     OPEN JOINED COMMUNITY
  ========================================================= */

  const openJoinedCommunity =
    async (
      conversationId
    ) => {
      if (
        !conversationId ||
        !currentUser?.id
      ) {
        return;
      }

      const conversation =
        await getConversationById(
          conversationId
        );

      if (!conversation) {
        throw new Error(
          "Community not found."
        );
      }

      const members =
        await getConversationMembers(
          conversationId
        );

      const myMembership =
        members.find(
          (
            member
          ) =>
            member.user_id ===
            currentUser.id
        );

      setSelectedConversation({
        ...conversation,

        type:
          "community",

        displayName:
          conversation.title ||
          "Community",

        memberCount:
          members.length,

        currentMemberRole:
          myMembership?.role ||
          "member",
      });
    };

  /* =========================================================
     GET GROUP INVITE PREVIEW
  ========================================================= */

  const getGroupInvitePreview =
    async (
      token
    ) => {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_group_invite_preview",
          {
            p_token:
              token,
          }
        );

      if (error) {
        console.error(
          "getGroupInvitePreview error:",
          error
        );

        throw error;
      }

      return Array.isArray(
        data
      )
        ? data[0] || null
        : data || null;
    };

  /* =========================================================
     URL LINK PROCESSING
  ========================================================= */

  useEffect(() => {
    if (
      loading ||
      !currentUser?.id ||
      linkProcessedRef.current
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    const inviteToken =
      params
        .get("invite")
        ?.trim();

    const channelSlug =
      params
        .get("channel")
        ?.trim();

    const groupInviteToken =
      params
        .get("groupinvite")
        ?.trim();

    const communityInviteToken =
      params
        .get("communityinvite")
        ?.trim();

    const communitySlug =
      params
        .get("community")
        ?.trim();

    const notificationConversationId =
      params
        .get("open")
        ?.trim();

    if (
      !inviteToken &&
      !channelSlug &&
      !groupInviteToken &&
      !communityInviteToken &&
      !communitySlug &&
      !notificationConversationId
    ) {
      return;
    }

    linkProcessedRef.current =
      true;

    let cancelled = false;

    const processLink =
      async () => {
        try {
          setProcessingLink(
            true
          );

          /* BROWSER NOTIFICATION CHAT */

          if (
            notificationConversationId
          ) {
            const conversation =
              await getConversationById(
                notificationConversationId
              );

            if (
              cancelled ||
              !conversation
            ) {
              return;
            }

            const members =
              await getConversationMembers(
                notificationConversationId
              );

            const myMembership =
              members.find(
                (
                  member
                ) =>
                  member.user_id ===
                  currentUser.id
              );

            if (
              conversation.type !==
                "direct" &&
              !myMembership
            ) {
              removeQueryParameter(
                "open"
              );

              window.alert(
                "You are no longer a member of this chat."
              );

              return;
            }

            if (
              conversation.type ===
              "direct"
            ) {
              const otherMember =
                members.find(
                  (
                    member
                  ) =>
                    member.user_id !==
                    currentUser.id
                ) ||
                members.find(
                  (
                    member
                  ) =>
                    member.user_id ===
                    currentUser.id
                );

              const profile =
                otherMember
                  ?.profiles ||
                {};

              const isSelfChat =
                members.length ===
                  1 ||
                otherMember?.user_id ===
                  currentUser.id;

              setSelectedConversation({
                ...conversation,

                displayName:
                  isSelfChat
                    ? "You"
                    : profile
                        ?.full_name
                        ?.trim() ||
                      profile
                        ?.username
                        ?.trim() ||
                      conversation.title ||
                      "User",

                full_name:
                  profile?.full_name ||
                  null,

                username:
                  profile?.username ||
                  null,

                avatar_url:
                  profile?.avatar_url ||
                  conversation.avatar_url ||
                  null,

                lastSeenAt:
                  isSelfChat
                    ? null
                    : profile?.last_seen_at ||
                      null,

                otherUserId:
                  otherMember?.user_id ||
                  currentUser.id,

                isSelfChat,
              });
            } else {
              setSelectedConversation({
                ...conversation,

                displayName:
                  conversation.title ||
                  "Chat",

                memberCount:
                  members.length,

                currentMemberRole:
                  myMembership?.role ||
                  "member",
              });
            }

            removeQueryParameter(
              "open"
            );

            return;
          }

          /* COMMUNITY INVITE */

          if (
            communityInviteToken
          ) {
            const preview =
              await getCommunityInvitePreview(
                communityInviteToken
              );

            if (cancelled) {
              return;
            }

            if (!preview) {
              removeQueryParameter(
                "communityinvite"
              );

              window.alert(
                "Community invite not found."
              );

              return;
            }

            if (
              preview.is_member
            ) {
              const conversationId =
                await joinCommunityByInvite(
                  communityInviteToken
                );

              if (
                cancelled ||
                !conversationId
              ) {
                return;
              }

              await openJoinedCommunity(
                conversationId
              );

              removeQueryParameter(
                "communityinvite"
              );

              return;
            }

            setCommunityInvitePreview({
              ...preview,

              token:
                communityInviteToken,
            });

            return;
          }

          /* GROUP INVITE */

          if (
            groupInviteToken
          ) {
            const preview =
              await getGroupInvitePreview(
                groupInviteToken
              );

            if (cancelled) {
              return;
            }

            if (!preview) {
              removeQueryParameter(
                "groupinvite"
              );

              window.alert(
                "Group invite not found."
              );

              return;
            }

            if (
              preview.is_member
            ) {
              const conversationId =
                await joinGroupByInvite(
                  groupInviteToken
                );

              if (
                cancelled ||
                !conversationId
              ) {
                return;
              }

              await openJoinedGroup(
                conversationId
              );

              removeQueryParameter(
                "groupinvite"
              );

              return;
            }

            setGroupInvitePreview({
              ...preview,

              token:
                groupInviteToken,
            });

            return;
          }

          /* PRIVATE CHANNEL INVITE */

          if (inviteToken) {
            const conversationId =
              await joinChannelByInvite(
                inviteToken
              );

            if (
              cancelled ||
              !conversationId
            ) {
              return;
            }

            await openJoinedInviteChannel(
              conversationId
            );

            removeQueryParameter(
              "invite"
            );

            return;
          }

          /* PUBLIC COMMUNITY */

          if (
            communitySlug
          ) {
            const publicCommunity =
              await getPublicCommunityBySlug(
                communitySlug
              );

            if (cancelled) {
              return;
            }

            if (
              !publicCommunity
            ) {
              removeQueryParameter(
                "community"
              );

              window.alert(
                "Public community not found."
              );

              return;
            }

            if (
              publicCommunity.is_member
            ) {
              await openCommunity(
                publicCommunity
              );

              removeQueryParameter(
                "community"
              );

              return;
            }

            setPublicCommunityPreview(
              publicCommunity
            );

            return;
          }

          /* PUBLIC CHANNEL */

          if (channelSlug) {
            const publicChannel =
              await getPublicChannelBySlug(
                channelSlug
              );

            if (cancelled) {
              return;
            }

            if (!publicChannel) {
              removeQueryParameter(
                "channel"
              );

              window.alert(
                "Public channel not found."
              );

              return;
            }

            if (
              publicChannel.is_member
            ) {
              await openChannel(
                publicChannel
              );

              removeQueryParameter(
                "channel"
              );

              return;
            }

            setPublicChannelPreview(
              publicChannel
            );
          }
        } catch (error) {
          console.error(
            "Chat link processing error:",
            error
          );

          if (inviteToken) {
            removeQueryParameter(
              "invite"
            );
          }

          if (channelSlug) {
            removeQueryParameter(
              "channel"
            );
          }

          if (
            groupInviteToken
          ) {
            removeQueryParameter(
              "groupinvite"
            );
          }

          if (
            communityInviteToken
          ) {
            removeQueryParameter(
              "communityinvite"
            );
          }

          if (
            communitySlug
          ) {
            removeQueryParameter(
              "community"
            );
          }

          if (
            notificationConversationId
          ) {
            removeQueryParameter(
              "open"
            );
          }

          if (!cancelled) {
            window.alert(
              error?.message ||
                "Unable to open this chat link."
            );
          }
        } finally {
          if (!cancelled) {
            setProcessingLink(
              false
            );
          }
        }
      };

    processLink();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    currentUser?.id,
  ]);

  /* =========================================================
     JOIN PUBLIC CHANNEL
  ========================================================= */

  const handleJoinPreviewChannel =
    async () => {
      if (
        !publicChannelPreview?.id ||
        joiningPublicChannel
      ) {
        return;
      }

      try {
        setJoiningPublicChannel(
          true
        );

        const conversationId =
          await joinPublicChannel(
            publicChannelPreview.id
          );

        if (!conversationId) {
          throw new Error(
            "Unable to join channel."
          );
        }

        await openChannel({
          ...publicChannelPreview,

          id:
            conversationId,

          is_member:
            true,

          member_count:
            Number(
              publicChannelPreview.member_count ||
                0
            ) + 1,
        });

        setPublicChannelPreview(
          null
        );

        removeQueryParameter(
          "channel"
        );
      } catch (error) {
        console.error(
          "Join public channel preview error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to join this channel."
        );
      } finally {
        setJoiningPublicChannel(
          false
        );
      }
    };

  const handleCancelPublicChannelPreview =
    () => {
      setPublicChannelPreview(
        null
      );

      removeQueryParameter(
        "channel"
      );
    };

  /* =========================================================
     JOIN PUBLIC COMMUNITY
  ========================================================= */

  const handleJoinPublicCommunity =
    async () => {
      if (
        !publicCommunityPreview?.id ||
        joiningPublicCommunity
      ) {
        return;
      }

      try {
        setJoiningPublicCommunity(
          true
        );

        const conversationId =
          await joinPublicCommunity(
            publicCommunityPreview.id
          );

        if (!conversationId) {
          throw new Error(
            "Unable to join community."
          );
        }

        await openCommunity({
          ...publicCommunityPreview,

          id:
            conversationId,

          is_member:
            true,

          member_count:
            Number(
              publicCommunityPreview.member_count ||
                0
            ) + 1,
        });

        setPublicCommunityPreview(
          null
        );

        removeQueryParameter(
          "community"
        );
      } catch (error) {
        console.error(
          "Join public community preview error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to join this community."
        );
      } finally {
        setJoiningPublicCommunity(
          false
        );
      }
    };

  const handleCancelPublicCommunityPreview =
    () => {
      setPublicCommunityPreview(
        null
      );

      removeQueryParameter(
        "community"
      );
    };

  /* =========================================================
     JOIN GROUP INVITE
  ========================================================= */

  const handleJoinGroupInvite =
    async () => {
      if (
        !groupInvitePreview?.token ||
        joiningGroupInvite
      ) {
        return;
      }

      try {
        setJoiningGroupInvite(
          true
        );

        const conversationId =
          await joinGroupByInvite(
            groupInvitePreview.token
          );

        if (!conversationId) {
          throw new Error(
            "Unable to join group."
          );
        }

        await openJoinedGroup(
          conversationId
        );

        setGroupInvitePreview(
          null
        );

        removeQueryParameter(
          "groupinvite"
        );
      } catch (error) {
        console.error(
          "Join group invite error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to join this group."
        );
      } finally {
        setJoiningGroupInvite(
          false
        );
      }
    };

  const handleCancelGroupInvitePreview =
    () => {
      setGroupInvitePreview(
        null
      );

      removeQueryParameter(
        "groupinvite"
      );
    };

  /* =========================================================
     JOIN COMMUNITY INVITE
  ========================================================= */

  const handleJoinCommunityInvite =
    async () => {
      if (
        !communityInvitePreview?.token ||
        joiningCommunityInvite
      ) {
        return;
      }

      try {
        setJoiningCommunityInvite(
          true
        );

        const conversationId =
          await joinCommunityByInvite(
            communityInvitePreview.token
          );

        if (!conversationId) {
          throw new Error(
            "Unable to join community."
          );
        }

        await openJoinedCommunity(
          conversationId
        );

        setCommunityInvitePreview(
          null
        );

        removeQueryParameter(
          "communityinvite"
        );
      } catch (error) {
        console.error(
          "Join community invite error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to join this community."
        );
      } finally {
        setJoiningCommunityInvite(
          false
        );
      }
    };

  const handleCancelCommunityInvitePreview =
    () => {
      setCommunityInvitePreview(
        null
      );

      removeQueryParameter(
        "communityinvite"
      );
    };

  /* =========================================================
     OPEN DIRECT / SELF CHAT
  ========================================================= */

  const handleOpenDirectChat =
    async (
      targetUser
    ) => {
      if (
        !currentUser?.id ||
        !targetUser?.id
      ) {
        return;
      }

      try {
        const isSelfChat =
          targetUser.id ===
          currentUser.id;

        const conversationId =
          await createDirectConversation(
            currentUser.id,
            targetUser.id
          );

        const members =
          await getConversationMembers(
            conversationId
          );

        const targetMember =
          members.find(
            (
              member
            ) =>
              member.user_id ===
              targetUser.id
          );

        const profile =
          targetMember?.profiles ||
          targetUser;

        setSelectedConversation({
          id:
            conversationId,

          type:
            "direct",

          title:
            isSelfChat
              ? "You"
              : profile
                  ?.full_name
                  ?.trim() ||
                profile
                  ?.username
                  ?.trim() ||
                "User",

          displayName:
            isSelfChat
              ? "You"
              : profile
                  ?.full_name
                  ?.trim() ||
                profile
                  ?.username
                  ?.trim() ||
                "User",

          full_name:
            profile?.full_name ||
            null,

          username:
            profile?.username ||
            null,

          avatar_url:
            profile?.avatar_url ||
            null,

          lastSeenAt:
            isSelfChat
              ? null
              : profile
                  ?.last_seen_at ||
                null,

          otherUserId:
            targetUser.id,

          isSelfChat,

          subtitle:
            isSelfChat
              ? "Message yourself"
              : null,
        });
      } catch (error) {
        console.error(
          "Open direct chat error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open conversation."
        );
      }
    };

  /* =========================================================
     OPEN CHILD / ANY CONVERSATION
  ========================================================= */

  const handleOpenConversation =
    (
      conversation
    ) => {
      if (
        !conversation?.id
      ) {
        return;
      }

      setSelectedConversation(
        conversation
      );
    };

  /* =========================================================
     CONVERSATION LEFT / REMOVED
  ========================================================= */

  const handleConversationLeft =
    (
      conversationId
    ) => {
      setSelectedConversation(
        (
          current
        ) => {
          if (
            !current ||
            current.id !==
              conversationId
          ) {
            return current;
          }

          return null;
        }
      );
    };

  /* =========================================================
     MOBILE BACK
  ========================================================= */

  const handleBack =
    () => {
      setSelectedConversation(
        null
      );
    };

  /* =========================================================
     OPEN NOTIFICATION
  ========================================================= */

  const handleOpenNotification =
    async (
      notification
    ) => {
      if (
        !notification
          ?.conversation_id ||
        !currentUser?.id
      ) {
        return;
      }

      try {
        if (
          !notification.is_read
        ) {
          await markChatNotificationRead(
            notification.id
          );

          setNotifications(
            (
              previous
            ) =>
              previous.map(
                (
                  item
                ) =>
                  item.id ===
                    notification.id
                    ? {
                        ...item,
                        is_read:
                          true,
                        read_at:
                          new Date().toISOString(),
                      }
                    : item
              )
          );
        }

        const conversation =
          await getConversationById(
            notification.conversation_id
          );

        if (!conversation) {
          return;
        }

        const members =
          await getConversationMembers(
            conversation.id
          );

        const myMembership =
          members.find(
            (
              member
            ) =>
              member.user_id ===
              currentUser.id
          );

        if (
          conversation.type !==
            "direct" &&
          !myMembership
        ) {
          window.alert(
            "You are no longer a member of this chat."
          );

          await refreshNotificationUnreadCount();
          setShowNotifications(
            false
          );

          return;
        }

        if (
          conversation.type ===
          "direct"
        ) {
          const otherMember =
            members.find(
              (
                member
              ) =>
                member.user_id !==
                currentUser.id
            ) ||
            members.find(
              (
                member
              ) =>
                member.user_id ===
                currentUser.id
            );

          const profile =
            otherMember
              ?.profiles ||
            {};

          const isSelfChat =
            members.length ===
              1 ||
            otherMember?.user_id ===
              currentUser.id;

          setSelectedConversation({
            ...conversation,

            displayName:
              isSelfChat
                ? "You"
                : profile
                    ?.full_name
                    ?.trim() ||
                  profile
                    ?.username
                    ?.trim() ||
                  conversation.title ||
                  "User",

            full_name:
              profile
                ?.full_name ||
              null,

            username:
              profile
                ?.username ||
              null,

            avatar_url:
              profile
                ?.avatar_url ||
              conversation
                .avatar_url ||
              null,

            lastSeenAt:
              isSelfChat
                ? null
                : profile
                    ?.last_seen_at ||
                  null,

            otherUserId:
              otherMember
                ?.user_id ||
              currentUser.id,

            isSelfChat,
          });
        } else {
          setSelectedConversation({
            ...conversation,

            displayName:
              conversation.title ||
              "Chat",

            memberCount:
              members.length,

            currentMemberRole:
              myMembership
                ?.role ||
              "member",
          });
        }

        setShowNotifications(
          false
        );

        await refreshNotificationUnreadCount();
      } catch (error) {
        console.error(
          "Open chat notification error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open this notification."
        );
      }
    };

  /* =========================================================
     MARK ALL NOTIFICATIONS READ
  ========================================================= */

  const handleMarkAllNotificationsRead =
    async () => {
      if (
        markingAllNotificationsRead ||
        notificationUnreadCount ===
          0
      ) {
        return;
      }

      try {
        setMarkingAllNotificationsRead(
          true
        );

        await markAllChatNotificationsRead();

        const readAt =
          new Date().toISOString();

        setNotifications(
          (
            previous
          ) =>
            previous.map(
              (
                item
              ) => ({
                ...item,
                is_read:
                  true,
                read_at:
                  item.read_at ||
                  readAt,
              })
            )
        );

        setNotificationUnreadCount(
          0
        );
      } catch (error) {
        console.error(
          "Mark all notifications read error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to mark notifications as read."
        );
      } finally {
        setMarkingAllNotificationsRead(
          false
        );
      }
    };

  const handleToggleGlobalNotificationSetting =
    async (
      key
    ) => {
      const next = {
        ...globalNotificationPreference,

        [key]:
          !globalNotificationPreference[
            key
          ],
      };

      try {
        setSavingNotificationPreference(
          true
        );

        await setGlobalChatNotificationPreference({
          notificationsEnabled:
            next.notifications_enabled,

          messageEnabled:
            next.message_enabled,

          mentionEnabled:
            next.mention_enabled,

          replyEnabled:
            next.reply_enabled,

          systemEnabled:
            next.system_enabled,
        });

        setGlobalNotificationPreference(
          next
        );
      } catch (error) {
        console.error(
          "Save global notification preference error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to save notification settings."
        );
      } finally {
        setSavingNotificationPreference(
          false
        );
      }
    };

  const handleMuteConversation =
    async (
      duration
    ) => {
      if (
        !selectedConversation?.id
      ) {
        return;
      }

      const durationMs = {
        "1h":
          60 *
          60 *
          1000,

        "8h":
          8 *
          60 *
          60 *
          1000,

        "1d":
          24 *
          60 *
          60 *
          1000,

        "7d":
          7 *
          24 *
          60 *
          60 *
          1000,
      }[duration];

      const muteUntil =
        durationMs
          ? new Date(
              Date.now() +
                durationMs
            ).toISOString()
          : null;

      try {
        setSavingNotificationPreference(
          true
        );

        const current =
          conversationNotificationPreference ||
          globalNotificationPreference;

        await setChatConversationNotificationPreference({
          conversationId:
            selectedConversation.id,

          notificationsEnabled:
            current.notifications_enabled,

          messageEnabled:
            current.message_enabled,

          mentionEnabled:
            current.mention_enabled,

          replyEnabled:
            current.reply_enabled,

          systemEnabled:
            current.system_enabled,

          muteUntil,
        });

        await loadNotificationPreferences();
      } catch (error) {
        console.error(
          "Mute chat notification error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to update this chat's notification settings."
        );
      } finally {
        setSavingNotificationPreference(
          false
        );
      }
    };

  const handleClearConversationNotificationOverride =
    async () => {
      if (
        !selectedConversation?.id
      ) {
        return;
      }

      try {
        setSavingNotificationPreference(
          true
        );

        await clearChatConversationNotificationPreference(
          selectedConversation.id
        );

        await loadNotificationPreferences();
      } catch (error) {
        console.error(
          "Clear chat notification override error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to reset this chat's notification settings."
        );
      } finally {
        setSavingNotificationPreference(
          false
        );
      }
    };

  /* =========================================================
     NOTIFICATION UI
  ========================================================= */

  const renderNotificationUi =
    () => (
      <>
        <button
          type="button"
          onClick={() =>
            setShowNotifications(
              (
                current
              ) =>
                !current
            )
          }
          className="fixed right-4 top-4 z-[70] flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-xl shadow-md hover:bg-gray-50"
          aria-label="Notifications"
        >
          🔔

          {notificationUnreadCount >
            0 && (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {notificationUnreadCount >
              99
                ? "99+"
                : notificationUnreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() =>
                setShowNotifications(
                  false
                )
              }
              className="fixed inset-0 z-[71] cursor-default bg-black/20"
            />

            <section className="fixed bottom-3 right-3 top-16 z-[72] flex w-[calc(100%-24px)] max-w-sm flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:bottom-auto sm:max-h-[min(640px,calc(100vh-80px))]">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="font-bold text-gray-900">
                    Notifications
                  </h2>

                  <div className="text-xs text-gray-400">
                    {notificationUnreadCount >
                    0
                      ? `${notificationUnreadCount} unread`
                      : "You're all caught up"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setShowNotificationSettings(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                  >
                    ⚙ Settings
                  </button>

                  {notificationUnreadCount >
                    0 && (
                    <button
                      type="button"
                      disabled={
                        markingAllNotificationsRead
                      }
                      onClick={
                        handleMarkAllNotificationsRead
                      }
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {markingAllNotificationsRead
                        ? "Marking..."
                        : "Mark all read"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setShowNotifications(
                        false
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-gray-500 hover:bg-gray-100"
                    aria-label="Close notifications"
                  >
                    ×
                  </button>
                </div>
              </div>

              {showNotificationSettings && (
                <div className="border-b bg-gray-50 px-4 py-4">
                  <div className="text-sm font-bold text-gray-800">
                    Notification settings
                  </div>

                  <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">
                          Browser notifications
                        </div>

                        <div className="mt-0.5 text-[11px] text-gray-400">
                          {browserNotificationPermission ===
                          "granted"
                            ? "Enabled for background tabs."
                            : browserNotificationPermission ===
                              "denied"
                            ? "Blocked in browser settings."
                            : browserNotificationPermission ===
                              "unsupported"
                            ? "Not supported on this device."
                            : "Allow alerts while the chat tab is in the background."}
                        </div>
                      </div>

                      {browserNotificationPermission !==
                        "granted" &&
                        browserNotificationPermission !==
                          "unsupported" && (
                          <button
                            type="button"
                            onClick={
                              handleEnableBrowserNotifications
                            }
                            disabled={
                              browserNotificationPermission ===
                              "denied"
                            }
                            className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enable
                          </button>
                        )}

                      {browserNotificationPermission ===
                        "granted" && (
                        <span className="flex-shrink-0 rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-700">
                          ON
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {[
                      [
                        "notifications_enabled",
                        "All notifications",
                      ],
                      [
                        "message_enabled",
                        "Messages",
                      ],
                      [
                        "mention_enabled",
                        "Mentions",
                      ],
                      [
                        "reply_enabled",
                        "Replies",
                      ],
                      [
                        "system_enabled",
                        "Chat updates",
                      ],
                    ].map(
                      ([
                        key,
                        label,
                      ]) => (
                        <label
                          key={
                            key
                          }
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                        >
                          <span className="text-xs font-medium text-gray-700">
                            {label}
                          </span>

                          <input
                            type="checkbox"
                            disabled={
                              savingNotificationPreference
                            }
                            checked={
                              Boolean(
                                globalNotificationPreference[
                                  key
                                ]
                              )
                            }
                            onChange={() =>
                              handleToggleGlobalNotificationSetting(
                                key
                              )
                            }
                            className="h-4 w-4"
                          />
                        </label>
                      )
                    )}
                  </div>

                  {selectedConversation?.id && (
                    <div className="mt-4 border-t border-gray-200 pt-3">
                      <div className="text-xs font-bold text-gray-700">
                        Current chat
                      </div>

                      <div className="mt-1 truncate text-xs text-gray-500">
                        {selectedConversation.displayName ||
                          selectedConversation.title ||
                          "Chat"}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          [
                            "1h",
                            "Mute 1 hour",
                          ],
                          [
                            "8h",
                            "Mute 8 hours",
                          ],
                          [
                            "1d",
                            "Mute 1 day",
                          ],
                          [
                            "7d",
                            "Mute 7 days",
                          ],
                        ].map(
                          ([
                            value,
                            label,
                          ]) => (
                            <button
                              key={
                                value
                              }
                              type="button"
                              disabled={
                                savingNotificationPreference
                              }
                              onClick={() =>
                                handleMuteConversation(
                                  value
                                )
                              }
                              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                            >
                              {label}
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          disabled={
                            savingNotificationPreference
                          }
                          onClick={() =>
                            handleMuteConversation(
                              null
                            )
                          }
                          className="rounded-lg border border-green-200 bg-green-50 px-2 py-2 text-[11px] font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          Unmute
                        </button>

                        <button
                          type="button"
                          disabled={
                            savingNotificationPreference
                          }
                          onClick={
                            handleClearConversationNotificationOverride
                          }
                          className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Use global
                        </button>
                      </div>

                      {conversationNotificationPreference?.mute_until &&
                        new Date(
                          conversationNotificationPreference.mute_until
                        ).getTime() >
                          Date.now() && (
                        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                          Muted until{" "}
                          {new Date(
                            conversationNotificationPreference.mute_until
                          ).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loadingNotifications &&
                notifications.length ===
                  0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">
                    Loading notifications...
                  </div>
                ) : notifications.length ===
                  0 ? (
                  <div className="p-8 text-center">
                    <div className="text-3xl">
                      🔔
                    </div>

                    <div className="mt-2 text-sm font-medium text-gray-500">
                      No notifications yet.
                    </div>
                  </div>
                ) : (
                  notifications.map(
                    (
                      notification
                    ) => (
                      <button
                        key={
                          notification.id
                        }
                        type="button"
                        onClick={() =>
                          handleOpenNotification(
                            notification
                          )
                        }
                        className={`flex w-full gap-3 border-b px-4 py-3 text-left transition hover:bg-gray-50 ${
                          notification.is_read
                            ? "bg-white"
                            : "bg-blue-50/70"
                        }`}
                      >
                        <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-lg">
                          {notification
                            .actor
                            ?.avatar_url ? (
                            <img
                              src={
                                notification
                                  .actor
                                  .avatar_url
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getNotificationIcon(
                              notification.notification_type
                            )
                          )}

                          {!notification.is_read && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className={`truncate text-sm ${
                                notification.is_read
                                  ? "font-medium text-gray-700"
                                  : "font-bold text-gray-900"
                              }`}
                            >
                              {notification.title ||
                                "Notification"}
                            </div>

                            <div className="flex-shrink-0 text-[11px] text-gray-400">
                              {formatNotificationTime(
                                notification.created_at
                              )}
                            </div>
                          </div>

                          {notification.body && (
                            <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                              {notification.body}
                            </div>
                          )}

                          <div className="mt-1 text-[11px] font-medium text-gray-400">
                            {notification.notification_type ===
                            "mention"
                              ? "Mention"
                              : notification.notification_type ===
                                "reply"
                              ? "Reply"
                              : notification.notification_type ===
                                "system"
                              ? "Chat update"
                              : "Message"}
                          </div>
                        </div>
                      </button>
                    )
                  )
                )}

                {notificationsHasMore && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      disabled={
                        loadingMoreNotifications
                      }
                      onClick={() =>
                        loadNotifications({
                          append:
                            true,
                        })
                      }
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {loadingMoreNotifications
                        ? "Loading..."
                        : "Load more"}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </>
    );

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">
          Loading chat...
        </div>
      </div>
    );
  }

  /* =========================================================
     NOT LOGGED IN
  ========================================================= */

  if (!currentUser) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-gray-50">

        <div className="text-center">

          <div className="text-4xl">
            💬
          </div>

          <div className="mt-2 text-sm text-gray-500">
            Please log in to use chat.
          </div>

        </div>

      </div>
    );
  }

  /* =========================================================
     PROCESSING DEEP LINK
  ========================================================= */

  if (processingLink) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-gray-50">

        <div className="text-center">

          <div className="text-4xl">
            💬
          </div>

          <div className="mt-3 text-sm font-medium text-gray-600">
            Opening chat link...
          </div>

          <div className="mt-1 text-xs text-gray-400">
            Please wait.
          </div>

        </div>

      </div>
    );
  }

  /* =========================================================
     PUBLIC COMMUNITY PREVIEW
  ========================================================= */

  if (
    publicCommunityPreview
  ) {
    const memberCount =
      Number(
        publicCommunityPreview.member_count ||
          0
      );

    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-gray-100 p-4">

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">

          <div className="p-6 text-center">

            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-purple-100 text-4xl">

              {publicCommunityPreview.avatar_url ? (
                <img
                  src={
                    publicCommunityPreview.avatar_url
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "🌐"
              )}

            </div>

            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              {publicCommunityPreview.title ||
                "Public Community"}
            </h2>

            {publicCommunityPreview.slug && (
              <div className="mt-1 text-sm font-medium text-purple-600">
                @{publicCommunityPreview.slug}
              </div>
            )}

            <div className="mt-2 text-sm text-gray-500">

              {memberCount}{" "}

              {memberCount === 1
                ? "member"
                : "members"}

            </div>

            {publicCommunityPreview.description && (
              <p className="mx-auto mt-4 max-w-sm whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                {publicCommunityPreview.description}
              </p>
            )}

            <div className="mt-5 rounded-xl bg-purple-50 px-4 py-3 text-xs leading-relaxed text-purple-700">
              🌐 This is a public community. Join to participate and keep it in your chat list.
            </div>

          </div>

          <div className="grid grid-cols-2 gap-3 border-t bg-gray-50 p-4">

            <button
              type="button"
              onClick={
                handleCancelPublicCommunityPreview
              }
              disabled={
                joiningPublicCommunity
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                handleJoinPublicCommunity
              }
              disabled={
                joiningPublicCommunity
              }
              className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {joiningPublicCommunity
                ? "Joining..."
                : "Join Community"}
            </button>

          </div>

        </div>

      </div>
    );
  }

  /* =========================================================
     COMMUNITY INVITE PREVIEW
  ========================================================= */

  if (
    communityInvitePreview
  ) {
    const memberCount =
      Number(
        communityInvitePreview.member_count ||
          0
      );

    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-gray-100 p-4">

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">

          <div className="p-6 text-center">

            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-purple-100 text-4xl">

              {communityInvitePreview.avatar_url ? (
                <img
                  src={
                    communityInvitePreview.avatar_url
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "🌐"
              )}

            </div>

            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              {communityInvitePreview.title ||
                "Community"}
            </h2>

            {communityInvitePreview.slug && (
              <div className="mt-1 text-sm font-medium text-purple-600">
                @{communityInvitePreview.slug}
              </div>
            )}

            <div className="mt-2 text-sm text-gray-500">
              {memberCount}{" "}
              {memberCount === 1
                ? "member"
                : "members"}
            </div>

            {communityInvitePreview.description && (
              <p className="mx-auto mt-4 max-w-sm whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                {communityInvitePreview.description}
              </p>
            )}

            <div className="mt-5 rounded-xl bg-purple-50 px-4 py-3 text-xs leading-relaxed text-purple-700">
              🌐 You were invited to join this community.
            </div>

          </div>

          <div className="grid grid-cols-2 gap-3 border-t bg-gray-50 p-4">

            <button
              type="button"
              onClick={
                handleCancelCommunityInvitePreview
              }
              disabled={
                joiningCommunityInvite
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                handleJoinCommunityInvite
              }
              disabled={
                joiningCommunityInvite
              }
              className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {joiningCommunityInvite
                ? "Joining..."
                : "Join Community"}
            </button>

          </div>

        </div>

      </div>
    );
  }

  /* =========================================================
     GROUP INVITE PREVIEW
  ========================================================= */

  if (
    groupInvitePreview
  ) {
    const memberCount =
      Number(
        groupInvitePreview.member_count ||
          0
      );

    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-gray-100 p-4">

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">

          <div className="p-6 text-center">

            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-4xl">

              {groupInvitePreview.avatar_url ? (
                <img
                  src={
                    groupInvitePreview.avatar_url
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "👥"
              )}

            </div>

            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              {groupInvitePreview.title ||
                "Group"}
            </h2>

            <div className="mt-2 text-sm text-gray-500">
              {memberCount}{" "}
              {memberCount === 1
                ? "member"
                : "members"}
            </div>

            <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700">
              👥 You were invited to join this group.
            </div>

          </div>

          <div className="grid grid-cols-2 gap-3 border-t bg-gray-50 p-4">

            <button
              type="button"
              onClick={
                handleCancelGroupInvitePreview
              }
              disabled={
                joiningGroupInvite
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                handleJoinGroupInvite
              }
              disabled={
                joiningGroupInvite
              }
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {joiningGroupInvite
                ? "Joining..."
                : "Join Group"}
            </button>

          </div>

        </div>

      </div>
    );
  }

  /* =========================================================
     PUBLIC CHANNEL PREVIEW
  ========================================================= */

  if (
    publicChannelPreview
  ) {
    const memberCount =
      Number(
        publicChannelPreview.member_count ||
          0
      );

    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-gray-100 p-4">

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">

          <div className="p-6 text-center">

            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-4xl">

              {publicChannelPreview.avatar_url ? (
                <img
                  src={
                    publicChannelPreview.avatar_url
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "📢"
              )}

            </div>

            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              {publicChannelPreview.title ||
                "Public Channel"}
            </h2>

            {publicChannelPreview.slug && (
              <div className="mt-1 text-sm font-medium text-blue-600">
                @{publicChannelPreview.slug}
              </div>
            )}

            <div className="mt-2 text-sm text-gray-500">
              {memberCount}{" "}
              {memberCount === 1
                ? "subscriber"
                : "subscribers"}
            </div>

            {publicChannelPreview.description && (
              <p className="mx-auto mt-4 max-w-sm whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                {publicChannelPreview.description}
              </p>
            )}

            <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700">
              🌐 This is a public channel. Join to view it in your chat list and receive new posts.
            </div>

          </div>

          <div className="grid grid-cols-2 gap-3 border-t bg-gray-50 p-4">

            <button
              type="button"
              onClick={
                handleCancelPublicChannelPreview
              }
              disabled={
                joiningPublicChannel
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                handleJoinPreviewChannel
              }
              disabled={
                joiningPublicChannel
              }
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {joiningPublicChannel
                ? "Joining..."
                : "Join Channel"}
            </button>

          </div>

        </div>

      </div>
    );
  }

  /* =========================================================
     MOBILE
  ========================================================= */

  if (isMobile) {
    if (
      !selectedConversation
    ) {
      return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

          {renderNotificationUi()}

          <ChatSidebar
            currentUser={
              currentUser
            }

            selectedConversation={
              selectedConversation
            }

            onSelectConversation={
              setSelectedConversation
            }

            onOpenDirectChat={
              handleOpenDirectChat
            }
          />

        </div>
      );
    }

    return (
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

        {renderNotificationUi()}

        <ChatWindow
          currentUser={
            currentUser
          }

          conversation={
            selectedConversation
          }

          onBack={
            handleBack
          }

          onOpenDirectChat={
            handleOpenDirectChat
          }

          onOpenConversation={
            handleOpenConversation
          }

          onConversationLeft={
            handleConversationLeft
          }
        />

      </div>
    );
  }

  /* =========================================================
     DESKTOP
  ========================================================= */

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

      {renderNotificationUi()}

      <ChatSidebar
        currentUser={
          currentUser
        }

        selectedConversation={
          selectedConversation
        }

        onSelectConversation={
          setSelectedConversation
        }

        onOpenDirectChat={
          handleOpenDirectChat
        }
      />

      <ChatWindow
        currentUser={
          currentUser
        }

        conversation={
          selectedConversation
        }

        onOpenDirectChat={
          handleOpenDirectChat
        }

        onOpenConversation={
          handleOpenConversation
        }

        onConversationLeft={
          handleConversationLeft
        }
      />

    </div>
  );
}