import {
  useEffect,
  useRef,
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

/* =========================================================
   SYSTEM EVENT
========================================================= */

function SystemEvent({
  event,
}) {
  const text =
    formatSystemEvent(
      event
    );

  return (
    <div
      className="
        flex
        w-full
        justify-center
        px-4
        py-2
      "
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
    </div>
  );
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
  onReply,
  onJumpToMessage,
  onDelete,
  onReact,
  onPin,
  onOpenDirectChat,
}) {
  const bottomRef =
    useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior:
        "smooth",
    });
  }, [
    messages.length,
  ]);

  if (!messages?.length) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-4">

        <div className="text-center text-sm text-gray-400">

          No messages yet.

          <br />

          Send the first message.

        </div>

      </div>
    );
  }

  return (
    <div
      className="
        flex-1
        overflow-y-auto
        bg-gray-50
        px-3
        py-4
        sm:px-5
        [scrollbar-width:none]
        [-ms-overflow-style:none]
        [&::-webkit-scrollbar]:hidden
      "
    >

      {messages.map(
        (
          message
        ) => {
          const isSystem =
            message.timeline_type ===
              "system" ||
            Boolean(
              message.event_type
            );

          if (isSystem) {
            return (
              <div
                key={
                  `system-${message.id}`
                }
                className="transition-all duration-300"
              >

                <SystemEvent
                  event={
                    message
                  }
                />

              </div>
            );
          }

          return (
            <div
              id={
                `message-${message.id}`
              }
              key={
                message.id
              }
              className="transition-all duration-300"
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
                  pinnedMessageIds.has(
                    message.id
                  )
                }

                isMentioned={
                  mentionedMessageIds.has(
                    message.id
                  )
                }

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
        }
      )}

      <div
        ref={
          bottomRef
        }
      />

    </div>
  );
}