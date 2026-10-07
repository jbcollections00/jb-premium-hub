import {
  useEffect,
  useState,
} from "react";

import CreateGroupModal from "./CreateGroupModal";
import CreateChannelModal from "./CreateChannelModal";

import {
  createDirectConversation,
  getConversationMembers,
  getLatestMessage,
  getUnreadCount,
  getUnreadMentionCount,
  getUserConversations,
  joinPublicChannel,
  searchPublicChannels,
  searchUsers,
  subscribeToChatList,
  unsubscribeFromMessages,
  updateMyLastSeen,
} from "../../services/chatService";

/* =========================================================
   HELPERS
========================================================= */

function isActiveNow(
  lastSeen
) {
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
  latest
) {
  if (!latest) {
    return null;
  }

  if (
    latest.deleted_at
  ) {
    return "Message deleted";
  }

  if (
    latest.message?.trim()
  ) {
    return latest.message;
  }

  if (
    latest.message_type ===
    "image"
  ) {
    return "📷 Photo";
  }

  if (
    latest.message_type ===
    "video"
  ) {
    return "🎥 Video";
  }

  if (
    latest.message_type ===
    "file"
  ) {
    return "📎 File";
  }

  return "Attachment";
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
  /* =========================================================
     STATE
  ========================================================= */

  const [
    conversations,
    setConversations,
  ] = useState([]);

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
    searching,
    setSearching,
  ] = useState(false);

  const [
    joiningChannelId,
    setJoiningChannelId,
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
    loadingChats,
    setLoadingChats,
  ] = useState(false);

  /* =========================================================
     NORMALIZE CONVERSATION
  ========================================================= */

  const normalizeConversation =
    async (row) => {
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

      /*
        DIRECT CHAT
      */
      if (
        conversation.type ===
        "direct"
      ) {
        try {
          const members =
            await getConversationMembers(
              conversation.id
            );

          /*
            Self chat has only the current user.
          */
          const otherMember =
            members.find(
              (member) =>
                member.user_id !==
                currentUser.id
            );

          if (!otherMember) {
            const selfMember =
              members.find(
                (member) =>
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

            lastSeenAt =
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
        } catch (error) {
          console.error(
            "Load direct conversation members error:",
            error
          );
        }
      }

      /*
        GROUP / CHANNEL MEMBER COUNT
      */
      if (
        conversation.type ===
          "group" ||
        conversation.type ===
          "channel"
      ) {
        try {
          const members =
            await getConversationMembers(
              conversation.id
            );

          memberCount =
            members.length;

          const myMembership =
            members.find(
              (member) =>
                member.user_id ===
                currentUser.id
            );

          if (
            myMembership?.role
          ) {
            currentMemberRole =
              myMembership.role;
          }
        } catch (error) {
          console.error(
            "Load conversation member count error:",
            error
          );
        }
      }

      const [
        latest,
        unreadCount,
        unreadMentionCount,
      ] =
        await Promise.all([
          getLatestMessage(
            conversation.id
          ),

          getUnreadCount(
            conversation.id
          ),

          getUnreadMentionCount(
            conversation.id
          ),
        ]);

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
    };

  /* =========================================================
     LOAD CONVERSATIONS
  ========================================================= */

  const loadConversations =
    async () => {
      if (
        !currentUser?.id
      ) {
        return [];
      }

      try {
        setLoadingChats(
          true
        );

        const rows =
          await getUserConversations(
            currentUser.id
          );

        const normalized =
          await Promise.all(
            (rows || []).map(
              normalizeConversation
            )
          );

        const valid =
          normalized.filter(
            Boolean
          );

        valid.sort(
          (a, b) => {
            const aDate =
              a.latestMessage
                ?.created_at ||
              a.updated_at ||
              a.created_at;

            const bDate =
              b.latestMessage
                ?.created_at ||
              b.updated_at ||
              b.created_at;

            return (
              new Date(
                bDate
              ).getTime() -
              new Date(
                aDate
              ).getTime()
            );
          }
        );

        setConversations(
          valid
        );

        return valid;
      } catch (error) {
        console.error(
          "Load conversations error:",
          error
        );

        return [];
      } finally {
        setLoadingChats(
          false
        );
      }
    };

  /* =========================================================
     INITIAL + REALTIME
  ========================================================= */

  useEffect(() => {
    if (
      !currentUser?.id
    ) {
      return;
    }

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
          loadConversations();
        },
        30000
      );

    const channel =
      subscribeToChatList(
        currentUser.id,

        () => {
          loadConversations();
        },

        (error) => {
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
     SEARCH USERS + PUBLIC CHANNELS
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

            return;
          }

          try {
            setSearching(
              true
            );

            const [
              users,
              publicChannels,
            ] =
              await Promise.all([
                searchUsers(
                  value
                ),

                searchPublicChannels(
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
          } catch (error) {
            console.error(
              "Chat search error:",
              error
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
     OPEN USER CHAT
  ========================================================= */

  const openUserChat =
    async (user) => {
      try {
        /*
          If parent already provides handler,
          use it so mobile navigation stays consistent.
        */
        if (
          onOpenDirectChat
        ) {
          await onOpenDirectChat(
            user
          );

          setQuery("");
          setUserResults([]);
          setChannelResults([]);

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
            (member) =>
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
        };

        setQuery("");
        setUserResults([]);
        setChannelResults([]);

        await loadConversations();

        onSelectConversation?.(
          conversation
        );
      } catch (error) {
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
     SELECT CHAT
  ========================================================= */

  const selectConversation =
    (conversation) => {
      setConversations(
        (previous) =>
          previous.map(
            (item) =>
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

      onSelectConversation?.(
        conversation
      );

      setTimeout(
        () => {
          loadConversations();
        },
        500
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
        /*
          Refresh our own conversations first.
        */
        const refreshed =
          await loadConversations();

        const existing =
          refreshed.find(
            (conversation) =>
              conversation.id ===
              publicChannel.id
          );

        if (existing) {
          setQuery("");
          setUserResults([]);
          setChannelResults([]);

          selectConversation(
            existing
          );

          return;
        }

        /*
          Fallback object if realtime/list hasn't
          caught up yet.
        */
        const members =
          await getConversationMembers(
            publicChannel.id
          );

        const myMembership =
          members.find(
            (member) =>
              member.user_id ===
              currentUser.id
          );

        const conversation = {
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
            myMembership?.role ||
            "member",
        };

        setQuery("");
        setUserResults([]);
        setChannelResults([]);

        onSelectConversation?.(
          conversation
        );
      } catch (error) {
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
      if (
        !publicChannel?.id
      ) {
        return;
      }

      try {
        setJoiningChannelId(
          publicChannel.id
        );

        await joinPublicChannel(
          publicChannel.id
        );

        /*
          Reload list after membership insert.
        */
        const refreshed =
          await loadConversations();

        let joinedConversation =
          refreshed.find(
            (conversation) =>
              conversation.id ===
              publicChannel.id
          );

        /*
          If realtime/cache has not caught up yet,
          construct it manually.
        */
        if (
          !joinedConversation
        ) {
          const members =
            await getConversationMembers(
              publicChannel.id
            );

          const myMembership =
            members.find(
              (member) =>
                member.user_id ===
                currentUser.id
            );

          joinedConversation = {
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
              members.length,

            currentMemberRole:
              myMembership?.role ||
              "member",

            unreadCount:
              0,

            unreadMentionCount:
              0,
          };
        }

        setChannelResults(
          (previous) =>
            previous.map(
              (channel) =>
                channel.id ===
                publicChannel.id
                  ? {
                      ...channel,

                      is_member:
                        true,

                      member_count:
                        Number(
                          channel.member_count ||
                            0
                        ) + 1,
                    }
                  : channel
            )
        );

        setQuery("");
        setUserResults([]);
        setChannelResults([]);

        onSelectConversation?.(
          joinedConversation
        );
      } catch (error) {
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
     CREATED GROUP
  ========================================================= */

  const handleGroupCreated =
    async (
      conversation
    ) => {
      setShowGroupModal(
        false
      );

      await loadConversations();

      onSelectConversation?.(
        conversation
      );
    };

  /* =========================================================
     CREATED CHANNEL
  ========================================================= */

  const handleChannelCreated =
    async (
      conversation
    ) => {
      setShowChannelModal(
        false
      );

      const refreshed =
        await loadConversations();

      const loaded =
        refreshed.find(
          (item) =>
            item.id ===
            conversation?.id
        );

      onSelectConversation?.(
        loaded ||
          conversation
      );
    };

  /* =========================================================
     SEARCH STATE
  ========================================================= */

  const hasUserResults =
    userResults.length >
    0;

  const hasChannelResults =
    channelResults.length >
    0;

  const hasAnyResults =
    hasUserResults ||
    hasChannelResults;

  /* =========================================================
     UI
  ========================================================= */

  return (
    <>
      <aside className="flex h-full min-h-0 w-full flex-shrink-0 flex-col border-r bg-white md:w-[340px]">

        {/* =================================================
            HEADER
        ================================================= */}
        <div className="flex-shrink-0 border-b p-4">

          <div className="mb-4 flex items-center justify-between gap-2">

            <div className="text-xl font-bold">
              JB Chat
            </div>

            <div className="flex items-center gap-2">

              <button
                type="button"
                onClick={() =>
                  setShowGroupModal(
                    true
                  )
                }
                className="flex h-9 items-center gap-1 rounded-full bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <span className="text-base">
                  +
                </span>

                Group
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowChannelModal(
                    true
                  )
                }
                className="flex h-9 items-center gap-1 rounded-full bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800"
              >
                <span className="text-base">
                  +
                </span>

                Channel
              </button>
            </div>
          </div>

          {/* SEARCH */}
          <input
            value={query}
            onChange={(
              event
            ) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Search users or channels..."
            className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
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
                  No users or public channels found.
                </div>
              )}

            {/* =================================================
                USERS
            ================================================= */}
            {!searching &&
              hasUserResults && (
                <>
                  <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase text-gray-400">
                    Users
                  </div>

                  {userResults.map(
                    (user) => {
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
                          <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-visible rounded-full bg-gray-200">

                            <div className="h-11 w-11 overflow-hidden rounded-full">
                              {user.avatar_url ? (
                                <img
                                  src={
                                    user.avatar_url
                                  }
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  👤
                                </div>
                              )}
                            </div>

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
                                : isActiveNow(
                                    user.last_seen_at
                                  )
                                ? "Active now"
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

            {/* =================================================
                PUBLIC CHANNELS
            ================================================= */}
            {!searching &&
              hasChannelResults && (
                <>
                  <div className="border-t px-4 pb-2 pt-4 text-xs font-semibold uppercase text-gray-400">
                    Public Channels
                  </div>

                  {channelResults.map(
                    (channel) => {
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
                          {/* AVATAR */}
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
                              <span className="text-xl">
                                📢
                              </span>
                            )}
                          </div>

                          {/* DETAILS */}
                          <div className="min-w-0 flex-1">

                            <div className="truncate text-sm font-semibold">
                              {channel.title ||
                                "Channel"}
                            </div>

                            {channel.slug && (
                              <div className="truncate text-xs text-blue-600">
                                @
                                {
                                  channel.slug
                                }
                              </div>
                            )}

                            <div className="mt-0.5 truncate text-[11px] text-gray-400">
                              {Number(
                                channel.member_count ||
                                  0
                              )}{" "}
                              {Number(
                                channel.member_count ||
                                  0
                              ) === 1
                                ? "subscriber"
                                : "subscribers"}
                            </div>
                          </div>

                          {/* ACTION */}
                          {member ? (
                            <button
                              type="button"
                              onClick={() =>
                                openPublicChannel(
                                  channel
                                )
                              }
                              className="flex-shrink-0 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100"
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
                              className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
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

            <div className="px-4 py-3 text-xs font-semibold uppercase text-gray-400">
              Chats
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
              (conversation) => {
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
                    conversation.latestMessage
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
                  if (
                    conversation.description
                      ?.trim()
                  ) {
                    fallbackPreview =
                      conversation.description;
                  } else {
                    fallbackPreview =
                      `${
                        conversation.memberCount ||
                        0
                      } ${
                        conversation.memberCount ===
                        1
                          ? "subscriber"
                          : "subscribers"
                      }`;
                  }
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

                return (
                  <button
                    key={
                      conversation.id
                    }
                    type="button"
                    onClick={() =>
                      selectConversation(
                        conversation
                      )
                    }
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                      active
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >

                    {/* AVATAR */}
                    <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-visible rounded-full bg-gray-200">

                      <div className="h-12 w-12 overflow-hidden rounded-full">

                        {conversation.avatar_url ? (
                          <img
                            src={
                              conversation.avatar_url
                            }
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl">
                            {isChannel
                              ? "📢"
                              : isGroup
                              ? "👥"
                              : "👤"}
                          </div>
                        )}
                      </div>

                      {online && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                      )}
                    </div>

                    {/* DETAILS */}
                    <div className="min-w-0 flex-1">

                      <div className="flex items-center justify-between gap-2">

                        <div
                          className={`truncate ${
                            unread >
                              0 ||
                            mentions >
                              0
                              ? "font-bold"
                              : "font-medium"
                          }`}
                        >
                          {
                            conversation.displayName
                          }
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-1">

                          {/* MENTION BADGE */}
                          {mentions >
                            0 && (
                            <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 text-[10px] font-bold text-white">
                              @
                            </div>
                          )}

                          {/* UNREAD BADGE */}
                          {unread >
                            0 && (
                            <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                              {
                                unread
                              }
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className={`truncate text-xs ${
                          unread >
                            0 ||
                          mentions >
                            0
                            ? "font-semibold text-gray-700"
                            : "text-gray-400"
                        }`}
                      >
                        {preview ||
                          fallbackPreview}
                      </div>
                    </div>
                  </button>
                );
              }
            )}
          </div>
        )}
      </aside>

      {/* =================================================
          CREATE GROUP
      ================================================= */}
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

      {/* =================================================
          CREATE CHANNEL
      ================================================= */}
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
    </>
  );
}