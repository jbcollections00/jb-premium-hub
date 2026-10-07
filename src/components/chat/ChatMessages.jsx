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
  getConversationMembers,
  getPublicChannelBySlug,
  joinChannelByInvite,
  joinGroupByInvite,
  joinPublicChannel,
} from "../services/chatService";

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

  const [
    publicChannelPreview,
    setPublicChannelPreview,
  ] = useState(null);

  const [
    joiningPublicChannel,
    setJoiningPublicChannel,
  ] = useState(false);

  const [
    groupInvitePreview,
    setGroupInvitePreview,
  ] = useState(null);

  const [
    joiningGroupInvite,
    setJoiningGroupInvite,
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
    (parameter) => {
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
          `${
            url.search
          }` +
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
     BUILD / OPEN CHANNEL
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
          (member) =>
            member.user_id ===
            currentUser.id
        );

      const conversation = {
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
      };

      setSelectedConversation(
        conversation
      );
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

      const {
        data: conversation,
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
          "Load invited channel error:",
          error
        );

        throw error;
      }

      const members =
        await getConversationMembers(
          conversationId
        );

      const myMembership =
        members.find(
          (member) =>
            member.user_id ===
            currentUser.id
        );

      setSelectedConversation({
        ...conversation,

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

      const {
        data: conversation,
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
          "Load invited group error:",
          error
        );

        throw error;
      }

      const members =
        await getConversationMembers(
          conversationId
        );

      const myMembership =
        members.find(
          (member) =>
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

     Supports:
     /chat?invite=TOKEN
     /chat?channel=slug
     /chat?groupinvite=TOKEN
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

    if (
      !inviteToken &&
      !channelSlug &&
      !groupInviteToken
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

          /* ===============================================
             GROUP INVITE LINK
          =============================================== */

          if (groupInviteToken) {
            const preview =
              await getGroupInvitePreview(
                groupInviteToken
              );

            if (
              cancelled
            ) {
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

            /*
              Already a member:
              join RPC is safe/idempotent and returns
              the same conversation ID without counting
              another invite use.
            */
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

          /* ===============================================
             PRIVATE / INVITE LINK
          =============================================== */

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

          /* ===============================================
             PUBLIC CHANNEL LINK
          =============================================== */

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

            /*
              Already subscribed:
              simply open it.
            */
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

            /*
              Not subscribed yet.

              Show a proper preview card instead of
              using window.confirm().
            */
            setPublicChannelPreview(
              publicChannel
            );

            return;
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

          if (groupInviteToken) {
            removeQueryParameter(
              "groupinvite"
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
     JOIN PUBLIC CHANNEL FROM PREVIEW
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

  /* =========================================================
     CANCEL PUBLIC CHANNEL PREVIEW
  ========================================================= */

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
     JOIN GROUP FROM INVITE PREVIEW
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

  /* =========================================================
     CANCEL GROUP INVITE PREVIEW
  ========================================================= */

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
            (member) =>
              member.user_id ===
              targetUser.id
          );

        const profile =
          targetMember?.profiles ||
          targetUser;

        const conversation = {
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
        };

        setSelectedConversation(
          conversation
        );
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
     CONVERSATION LEFT / REMOVED
  ========================================================= */

  const handleConversationLeft =
    (
      conversationId
    ) => {
      setSelectedConversation(
        (current) => {
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
            📢
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
     GROUP INVITE PREVIEW
  ========================================================= */

  if (groupInvitePreview) {
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
              {Number(
                groupInvitePreview.member_count ||
                  0
              )}{" "}
              {Number(
                groupInvitePreview.member_count ||
                  0
              ) === 1
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
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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

  if (publicChannelPreview) {
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
                @
                {
                  publicChannelPreview.slug
                }
              </div>
            )}

            <div className="mt-2 text-sm text-gray-500">
              {Number(
                publicChannelPreview.member_count ||
                  0
              )}{" "}
              {Number(
                publicChannelPreview.member_count ||
                  0
              ) === 1
                ? "subscriber"
                : "subscribers"}
            </div>

            {publicChannelPreview.description && (
              <p className="mx-auto mt-4 max-w-sm whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                {
                  publicChannelPreview.description
                }
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
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    /*
      No selected chat:
      show sidebar only.
    */
    if (
      !selectedConversation
    ) {
      return (
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

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

    /*
      Selected chat:
      show ChatWindow only.
    */
    return (
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

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
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

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

        onConversationLeft={
          handleConversationLeft
        }
      />
    </div>
  );
}