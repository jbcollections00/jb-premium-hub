import {
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "../services/supabaseClient";

import ChatSidebar from "../components/chat/ChatSidebar";
import ChatWindow from "../components/chat/ChatWindow";

import {
  createDirectConversation,
  getConversationMembers,
} from "../services/chatService";

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

  /* =========================================================
     CURRENT USER + RESPONSIVE
  ========================================================= */

  useEffect(() => {
    loadUser();

    const handleResize = () => {
      setIsMobile(
        window.innerWidth < 768
      );
    };

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

  async function loadUser() {
    try {
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

      setCurrentUser(
        user || null
      );
    } catch (error) {
      console.error(
        "Get current user error:",
        error
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =========================================================
     OPEN DIRECT CHAT
     - normal direct chat
     - self chat
  ========================================================= */

  const handleOpenDirectChat =
    async (targetUser) => {
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

        if (!conversationId) {
          return;
        }

        let resolvedUser = {
          ...targetUser,
        };

        try {
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

          if (
            targetMember?.profiles
          ) {
            resolvedUser = {
              ...resolvedUser,
              ...targetMember.profiles,

              id:
                targetUser.id,
            };
          }
        } catch (error) {
          console.error(
            "Load direct chat member error:",
            error
          );
        }

        const displayName =
          isSelfChat
            ? "You"
            : resolvedUser
                ?.full_name
                ?.trim() ||
              resolvedUser
                ?.username
                ?.trim() ||
              "User";

        const directConversation = {
          id:
            conversationId,

          type:
            "direct",

          displayName,

          title:
            displayName,

          avatar_url:
            resolvedUser
              ?.avatar_url ||
            null,

          username:
            resolvedUser
              ?.username ||
            null,

          full_name:
            resolvedUser
              ?.full_name ||
            null,

          lastSeenAt:
            isSelfChat
              ? null
              : resolvedUser
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
          directConversation
        );
      } catch (error) {
        console.error(
          "Open direct chat error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open direct chat."
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
      /*
        Only close the current conversation
        if it is the one that was left.
      */
      setSelectedConversation(
        (
          current
        ) => {
          if (
            !current
          ) {
            return null;
          }

          if (
            !conversationId ||
            current.id ===
              conversationId
          ) {
            return null;
          }

          return current;
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
      <div className="flex h-full min-h-0 items-center justify-center">
        Loading chat...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        Please log in to use chat.
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-gray-100">

      {/* =====================================================
          MOBILE
      ===================================================== */}
      {isMobile ? (
        <>
          {!selectedConversation ? (
            <div className="h-full min-h-0 w-full overflow-hidden">
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
          ) : (
            <div className="h-full min-h-0 w-full overflow-hidden">
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

                /*
                  NEW:
                  successful Leave Group
                  clears parent selection.
                */
                onConversationLeft={
                  handleConversationLeft
                }
              />
            </div>
          )}
        </>
      ) : (
        /* =====================================================
           DESKTOP
        ===================================================== */
        <>
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

            /*
              IMPORTANT:
              Desktop has no Back button,
              but Leave Group can still
              clear the selected conversation.
            */
            onConversationLeft={
              handleConversationLeft
            }
          />
        </>
      )}
    </div>
  );
}