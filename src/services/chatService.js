import { supabase } from "./supabaseClient";

/* =========================================================
   HYDRATION HELPERS
========================================================= */

async function hydrateReplyMessages(messages) {
  const rows = messages || [];

  const replyIds = [
    ...new Set(
      rows
        .map((message) => message.reply_to)
        .filter(Boolean)
    ),
  ];

  if (replyIds.length === 0) {
    return rows.map((message) => ({
      ...message,
      reply_message: null,
    }));
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select(`
      id,
      conversation_id,
      sender_id,
      message,
      message_type,
      reply_to,
      edited_at,
      deleted_at,
      created_at,
      sender:profiles!chat_messages_sender_id_fkey (
        id,
        full_name,
        username,
        avatar_url
      )
    `)
    .in("id", replyIds);

  if (error) {
    console.error(
      "hydrateReplyMessages error:",
      error
    );

    return rows;
  }

  const replyMap = new Map(
    (data || []).map((reply) => [
      reply.id,
      reply,
    ])
  );

  return rows.map((message) => ({
    ...message,

    reply_message: message.reply_to
      ? replyMap.get(message.reply_to) || null
      : null,
  }));
}

async function hydrateAttachments(messages) {
  const rows = messages || [];

  const messageIds = rows
    .map((message) => message.id)
    .filter(Boolean);

  if (messageIds.length === 0) {
    return rows.map((message) => ({
      ...message,
      attachments: [],
    }));
  }

  const { data, error } = await supabase
    .from("chat_attachments")
    .select(`
      id,
      message_id,
      file_url,
      storage_path,
      file_name,
      mime_type,
      file_size,
      created_at
    `)
    .in("message_id", messageIds);

  if (error) {
    console.error(
      "hydrateAttachments error:",
      error
    );

    return rows.map((message) => ({
      ...message,
      attachments: [],
    }));
  }

  const grouped = new Map();

  for (const attachment of data || []) {
    if (!grouped.has(attachment.message_id)) {
      grouped.set(
        attachment.message_id,
        []
      );
    }

    grouped
      .get(attachment.message_id)
      .push(attachment);
  }

  return rows.map((message) => ({
    ...message,

    attachments:
      grouped.get(message.id) || [],
  }));
}

async function hydrateReactions(messages) {
  const rows = messages || [];

  if (rows.length === 0) {
    return [];
  }

  return Promise.all(
    rows.map(async (message) => {
      try {
        const { data, error } =
          await supabase.rpc(
            "get_message_reactions",
            {
              p_message_id:
                message.id,
            }
          );

        if (error) {
          console.error(
            "hydrateReactions error:",
            error
          );

          return {
            ...message,
            reactions: [],
          };
        }

        return {
          ...message,
          reactions:
            data || [],
        };
      } catch (error) {
        console.error(
          "hydrateReactions error:",
          error
        );

        return {
          ...message,
          reactions: [],
        };
      }
    })
  );
}

async function hydrateMessages(messages) {
  const replies =
    await hydrateReplyMessages(
      messages
    );

  const attachments =
    await hydrateAttachments(
      replies
    );

  return hydrateReactions(
    attachments
  );
}

/* =========================================================
   FILE HELPERS
========================================================= */

function getAttachmentMessageType(file) {
  const mime =
    file?.type || "";

  if (
    mime.startsWith("image/")
  ) {
    return "image";
  }

  if (
    mime.startsWith("video/")
  ) {
    return "video";
  }

  return "file";
}

function sanitizeFileName(name) {
  return (
    name ||
    "attachment"
  )
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )
    .slice(0, 120);
}

/* =========================================================
   USER SEARCH
========================================================= */

export async function searchUsers(query) {
  const value =
    query
      ?.trim()
      .replace(/^@/, "");

  if (!value) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "search_chat_users",
      {
        p_query:
          value,
      }
    );

  if (error) {
    console.error(
      "searchUsers error:",
      error
    );

    throw error;
  }

  let results = [
    ...(data || []),
  ];

  try {
    const {
      data: {
        user,
      },
    } =
      await supabase.auth.getUser();

    if (user?.id) {
      const {
        data: ownProfile,
        error: profileError,
      } =
        await supabase
          .from("profiles")
          .select(`
            id,
            full_name,
            username,
            avatar_url,
            last_seen_at
          `)
          .eq(
            "id",
            user.id
          )
          .maybeSingle();

      if (profileError) {
        console.error(
          "Load own profile error:",
          profileError
        );
      }

      if (ownProfile) {
        const cleanSearch =
          value
            .trim()
            .toLowerCase();

        const ownUsername =
          ownProfile
            .username
            ?.trim()
            .toLowerCase() ||
          "";

        const ownName =
          ownProfile
            .full_name
            ?.trim()
            .toLowerCase() ||
          "";

        const matchesSelf =
          ownUsername.includes(
            cleanSearch
          ) ||
          ownName.includes(
            cleanSearch
          ) ||
          "you".includes(
            cleanSearch
          ) ||
          "message yourself".includes(
            cleanSearch
          );

        const alreadyIncluded =
          results.some(
            (item) =>
              item.id ===
              ownProfile.id
          );

        if (
          matchesSelf &&
          !alreadyIncluded
        ) {
          results = [
            {
              ...ownProfile,
              isSelf:
                true,
            },

            ...results,
          ];
        }
      }
    }
  } catch (error) {
    console.error(
      "Include self search error:",
      error
    );
  }

  return results;
}

/* =========================================================
   CONVERSATIONS
========================================================= */

export async function getUserConversations(
  userId
) {
  if (!userId) {
    return [];
  }

  const { data, error } =
    await supabase
      .from("chat_members")
      .select(`
        id,
        conversation_id,
        role,
        is_muted,
        is_archived,
        joined_at,
        last_read_message_id,

        chat_conversations!inner (
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
        )
      `)
      .eq(
        "user_id",
        userId
      )
      .eq(
        "is_archived",
        false
      );

  if (error) {
    console.error(
      "getUserConversations error:",
      error
    );

    throw error;
  }

  const rows =
    data || [];

  rows.sort((a, b) => {
    const aDate =
      a.chat_conversations
        ?.updated_at ||
      a.joined_at;

    const bDate =
      b.chat_conversations
        ?.updated_at ||
      b.joined_at;

    return (
      new Date(
        bDate
      ).getTime() -
      new Date(
        aDate
      ).getTime()
    );
  });

  return rows;
}

/* =========================================================
   DIRECT CHAT
========================================================= */

export async function createDirectConversation(
  currentUserId,
  otherUserId
) {
  if (
    !currentUserId ||
    !otherUserId
  ) {
    throw new Error(
      "Missing user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "start_direct_conversation",
      {
        p_other_user_id:
          otherUserId,
      }
    );

  if (error) {
    console.error(
      "createDirectConversation error:",
      error
    );

    throw error;
  }

  return data;
}

/* =========================================================
   GROUP CHAT
========================================================= */

export async function createGroupConversation({
  title,
  memberIds = [],
  avatarUrl = null,
}) {
  const cleanTitle =
    title?.trim();

  if (!cleanTitle) {
    throw new Error(
      "Group name is required"
    );
  }

  const uniqueMemberIds = [
    ...new Set(
      (memberIds || [])
        .filter(Boolean)
    ),
  ];

  const { data, error } =
    await supabase.rpc(
      "create_group_conversation",
      {
        p_title:
          cleanTitle,

        p_member_ids:
          uniqueMemberIds,

        p_avatar_url:
          avatarUrl,
      }
    );

  if (error) {
    console.error(
      "createGroupConversation error:",
      error
    );

    throw error;
  }

  return data;
}

export async function addGroupMember(
  conversationId,
  userId
) {
  if (
    !conversationId ||
    !userId
  ) {
    throw new Error(
      "Missing conversation or user ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "add_group_member",
      {
        p_conversation_id:
          conversationId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "addGroupMember error:",
      error
    );

    throw error;
  }
}

export async function removeGroupMember(
  conversationId,
  userId
) {
  if (
    !conversationId ||
    !userId
  ) {
    throw new Error(
      "Missing conversation or user ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "remove_group_member",
      {
        p_conversation_id:
          conversationId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "removeGroupMember error:",
      error
    );

    throw error;
  }
}

export async function updateGroupDetails({
  conversationId,
  title,
  avatarUrl = null,
}) {
  const cleanTitle =
    title?.trim();

  if (!conversationId) {
    throw new Error(
      "Missing conversation ID"
    );
  }

  if (!cleanTitle) {
    throw new Error(
      "Group name is required"
    );
  }

  const { error } =
    await supabase.rpc(
      "update_group_details",
      {
        p_conversation_id:
          conversationId,

        p_title:
          cleanTitle,

        p_avatar_url:
          avatarUrl,
      }
    );

  if (error) {
    console.error(
      "updateGroupDetails error:",
      error
    );

    throw error;
  }
}

export async function setGroupMemberRole(
  conversationId,
  userId,
  role
) {
  if (
    !conversationId ||
    !userId
  ) {
    throw new Error(
      "Missing conversation or user ID"
    );
  }

  if (
    role !== "admin" &&
    role !== "member"
  ) {
    throw new Error(
      "Invalid group role"
    );
  }

  const { error } =
    await supabase.rpc(
      "set_group_member_role",
      {
        p_conversation_id:
          conversationId,

        p_user_id:
          userId,

        p_role:
          role,
      }
    );

  if (error) {
    console.error(
      "setGroupMemberRole error:",
      error
    );

    throw error;
  }
}

export async function transferGroupOwnership(
  conversationId,
  newOwnerId
) {
  if (
    !conversationId ||
    !newOwnerId
  ) {
    throw new Error(
      "Missing conversation or new owner ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "transfer_group_ownership",
      {
        p_conversation_id:
          conversationId,

        p_new_owner_id:
          newOwnerId,
      }
    );

  if (error) {
    console.error(
      "transferGroupOwnership error:",
      error
    );

    throw error;
  }
}

export async function leaveGroup(
  conversationId
) {
  if (!conversationId) {
    throw new Error(
      "Missing conversation ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "leave_group",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "leaveGroup error:",
      error
    );

    throw error;
  }
}

/* =========================================================
   GROUP INVITE LINKS
========================================================= */

export async function createGroupInviteLink({
  conversationId,
  expiresAt = null,
  maxUses = null,
}) {
  if (!conversationId) {
    throw new Error(
      "Missing group conversation ID"
    );
  }

  let normalizedMaxUses =
    null;

  if (
    maxUses !== null &&
    maxUses !== undefined &&
    maxUses !== ""
  ) {
    normalizedMaxUses =
      Number(maxUses);

    if (
      !Number.isInteger(
        normalizedMaxUses
      ) ||
      normalizedMaxUses <= 0
    ) {
      throw new Error(
        "Maximum uses must be a positive whole number."
      );
    }
  }

  const { data, error } =
    await supabase.rpc(
      "create_group_invite_link",
      {
        p_conversation_id:
          conversationId,

        p_expires_at:
          expiresAt ||
          null,

        p_max_uses:
          normalizedMaxUses,
      }
    );

  if (error) {
    console.error(
      "createGroupInviteLink error:",
      error
    );

    throw error;
  }

  return data;
}

export async function getGroupInviteLinks(
  conversationId
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "chat_group_invite_links"
      )
      .select(`
        id,
        conversation_id,
        token,
        created_by,
        is_active,
        expires_at,
        max_uses,
        use_count,
        created_at
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );

  if (error) {
    console.error(
      "getGroupInviteLinks error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function revokeGroupInviteLink(
  inviteId
) {
  if (!inviteId) {
    throw new Error(
      "Missing group invite ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "revoke_group_invite_link",
      {
        p_invite_id:
          inviteId,
      }
    );

  if (error) {
    console.error(
      "revokeGroupInviteLink error:",
      error
    );

    throw error;
  }

  return true;
}

export async function joinGroupByInvite(
  token
) {
  const cleanToken =
    token?.trim();

  if (!cleanToken) {
    throw new Error(
      "Missing group invite token"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "join_group_by_invite",
      {
        p_token:
          cleanToken,
      }
    );

  if (error) {
    console.error(
      "joinGroupByInvite error:",
      error
    );

    throw error;
  }

  return data;
}

/* =========================================================
   CHANNELS
========================================================= */

export async function createChannelConversation({
  title,
  description = "",
  avatarUrl = null,
  memberIds = [],
}) {
  const cleanTitle =
    title?.trim();

  if (!cleanTitle) {
    throw new Error(
      "Channel name is required"
    );
  }

  const uniqueMemberIds = [
    ...new Set(
      (memberIds || [])
        .filter(Boolean)
    ),
  ];

  const { data, error } =
    await supabase.rpc(
      "create_channel_conversation",
      {
        p_title:
          cleanTitle,

        p_description:
          description?.trim() ||
          null,

        p_avatar_url:
          avatarUrl,

        p_member_ids:
          uniqueMemberIds,
      }
    );

  if (error) {
    console.error(
      "createChannelConversation error:",
      error
    );

    throw error;
  }

  return data;
}

export async function addChannelMember(
  conversationId,
  userId
) {
  if (
    !conversationId ||
    !userId
  ) {
    throw new Error(
      "Missing channel or user ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "add_channel_member",
      {
        p_conversation_id:
          conversationId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "addChannelMember error:",
      error
    );

    throw error;
  }
}

export async function removeChannelMember(
  conversationId,
  userId
) {
  if (
    !conversationId ||
    !userId
  ) {
    throw new Error(
      "Missing channel or user ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "remove_channel_member",
      {
        p_conversation_id:
          conversationId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "removeChannelMember error:",
      error
    );

    throw error;
  }
}

export async function setChannelMemberRole(
  conversationId,
  userId,
  role
) {
  if (
    !conversationId ||
    !userId
  ) {
    throw new Error(
      "Missing channel or user ID"
    );
  }

  const allowedRoles = [
    "member",
    "moderator",
    "admin",
  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {
    throw new Error(
      "Invalid channel role"
    );
  }

  const { error } =
    await supabase.rpc(
      "set_channel_member_role",
      {
        p_conversation_id:
          conversationId,

        p_user_id:
          userId,

        p_role:
          role,
      }
    );

  if (error) {
    console.error(
      "setChannelMemberRole error:",
      error
    );

    throw error;
  }
}

export async function transferChannelOwnership(
  conversationId,
  newOwnerId
) {
  if (
    !conversationId ||
    !newOwnerId
  ) {
    throw new Error(
      "Missing channel or new owner ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "transfer_channel_ownership",
      {
        p_conversation_id:
          conversationId,

        p_new_owner_id:
          newOwnerId,
      }
    );

  if (error) {
    console.error(
      "transferChannelOwnership error:",
      error
    );

    throw error;
  }
}

export async function leaveChannel(
  conversationId
) {
  if (!conversationId) {
    throw new Error(
      "Missing channel ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "leave_channel",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "leaveChannel error:",
      error
    );

    throw error;
  }
}

export async function canSendChatMessage(
  conversationId
) {
  if (!conversationId) {
    return false;
  }

  const { data, error } =
    await supabase.rpc(
      "can_send_chat_message",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "canSendChatMessage error:",
      error
    );

    return false;
  }

  return Boolean(data);
}

/* =========================================================
   PUBLIC CHANNEL DISCOVERY
========================================================= */

export async function searchPublicChannels(
  query = ""
) {
  const cleanQuery =
    query?.trim() || "";

  const { data, error } =
    await supabase.rpc(
      "search_public_channels",
      {
        p_query:
          cleanQuery,
      }
    );

  if (error) {
    console.error(
      "searchPublicChannels error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function joinPublicChannel(
  conversationId
) {
  if (!conversationId) {
    throw new Error(
      "Missing channel ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "join_public_channel",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "joinPublicChannel error:",
      error
    );

    throw error;
  }

  return data;
}

export async function getPublicChannelBySlug(
  slug
) {
  const cleanSlug =
    slug
      ?.trim()
      .replace(/^@/, "")
      .toLowerCase();

  if (!cleanSlug) {
    throw new Error(
      "Channel username is required"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "get_public_channel_by_slug",
      {
        p_slug:
          cleanSlug,
      }
    );

  if (error) {
    console.error(
      "getPublicChannelBySlug error:",
      error
    );

    throw error;
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

/* =========================================================
   CHANNEL SETTINGS
========================================================= */

export async function updateChannelSettings({
  conversationId,
  title,
  description = "",
  isPrivate = true,
  slug = null,
}) {
  if (!conversationId) {
    throw new Error(
      "Missing channel ID"
    );
  }

  const cleanTitle =
    title?.trim();

  if (!cleanTitle) {
    throw new Error(
      "Channel name is required"
    );
  }

  let cleanSlug =
    slug
      ?.trim()
      .toLowerCase() ||
    null;

  if (isPrivate) {
    cleanSlug =
      null;
  }

  const { error } =
    await supabase.rpc(
      "update_channel_settings",
      {
        p_conversation_id:
          conversationId,

        p_title:
          cleanTitle,

        p_description:
          description?.trim() ||
          null,

        p_is_private:
          Boolean(
            isPrivate
          ),

        p_slug:
          cleanSlug,
      }
    );

  if (error) {
    console.error(
      "updateChannelSettings error:",
      error
    );

    throw error;
  }

  return {
    id:
      conversationId,

    title:
      cleanTitle,

    displayName:
      cleanTitle,

    description:
      description?.trim() ||
      null,

    is_private:
      Boolean(
        isPrivate
      ),

    slug:
      cleanSlug,
  };
}

/* =========================================================
   CHANNEL INVITE LINKS
========================================================= */

export async function createChannelInviteLink({
  conversationId,
  expiresAt = null,
  maxUses = null,
}) {
  if (!conversationId) {
    throw new Error(
      "Missing channel ID"
    );
  }

  const parsedMaxUses =
    maxUses === null ||
    maxUses === "" ||
    maxUses === undefined
      ? null
      : Number(maxUses);

  if (
    parsedMaxUses !== null &&
    (
      !Number.isInteger(
        parsedMaxUses
      ) ||
      parsedMaxUses <= 0
    )
  ) {
    throw new Error(
      "Max uses must be a positive whole number"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "create_channel_invite_link",
      {
        p_conversation_id:
          conversationId,

        p_expires_at:
          expiresAt ||
          null,

        p_max_uses:
          parsedMaxUses,
      }
    );

  if (error) {
    console.error(
      "createChannelInviteLink error:",
      error
    );

    throw error;
  }

  return data;
}

export async function getChannelInviteLinks(
  conversationId
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "chat_invite_links"
      )
      .select(`
        id,
        conversation_id,
        token,
        created_by,
        is_active,
        expires_at,
        max_uses,
        use_count,
        created_at
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );

  if (error) {
    console.error(
      "getChannelInviteLinks error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function revokeChannelInviteLink(
  inviteId
) {
  if (!inviteId) {
    throw new Error(
      "Missing invite ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "revoke_channel_invite_link",
      {
        p_invite_id:
          inviteId,
      }
    );

  if (error) {
    console.error(
      "revokeChannelInviteLink error:",
      error
    );

    throw error;
  }
}

export async function joinChannelByInvite(
  token
) {
  const cleanToken =
    token?.trim();

  if (!cleanToken) {
    throw new Error(
      "Invite token is required"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "join_channel_by_invite",
      {
        p_token:
          cleanToken,
      }
    );

  if (error) {
    console.error(
      "joinChannelByInvite error:",
      error
    );

    throw error;
  }

  return data;
}

/* =========================================================
   MEMBERS
========================================================= */

export async function getConversationMembers(
  conversationId
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_chat_conversation_members",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "getConversationMembers error:",
      error
    );

    throw error;
  }

  return (data || []).map(
    (member) => ({
      user_id:
        member.user_id,

      role:
        member.role,

      profiles: {
        id:
          member.user_id,

        full_name:
          member.full_name,

        username:
          member.username,

        avatar_url:
          member.avatar_url,

        last_seen_at:
          member.last_seen_at,
      },
    })
  );
}

/* =========================================================
   MESSAGES
========================================================= */

export async function getMessages(
  conversationId,
  limit = 100
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase
      .from("chat_messages")
      .select(`
        id,
        conversation_id,
        sender_id,
        message,
        message_type,
        reply_to,
        edited_at,
        deleted_at,
        created_at,

        sender:profiles!chat_messages_sender_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        )
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        }
      )
      .limit(limit);

  if (error) {
    console.error(
      "getMessages error:",
      error
    );

    throw error;
  }

  return hydrateMessages(
    data || []
  );
}

export async function getMessageById(
  messageId
) {
  if (!messageId) {
    return null;
  }

  const { data, error } =
    await supabase
      .from("chat_messages")
      .select(`
        id,
        conversation_id,
        sender_id,
        message,
        message_type,
        reply_to,
        edited_at,
        deleted_at,
        created_at,

        sender:profiles!chat_messages_sender_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        )
      `)
      .eq(
        "id",
        messageId
      )
      .single();

  if (error) {
    console.error(
      "getMessageById error:",
      error
    );

    throw error;
  }

  const hydrated =
    await hydrateMessages([
      data,
    ]);

  return hydrated[0] || data;
}

export async function getLatestMessage(
  conversationId
) {
  if (!conversationId) {
    return null;
  }

  const { data, error } =
    await supabase
      .from("chat_messages")
      .select(`
        id,
        conversation_id,
        sender_id,
        message,
        message_type,
        deleted_at,
        created_at
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    console.error(
      "getLatestMessage error:",
      error
    );

    throw error;
  }

  return data || null;
}

/* =========================================================
   MENTIONS PROCESSING
========================================================= */

export async function processMessageMentions(
  messageId
) {
  if (!messageId) {
    return 0;
  }

  const { data, error } =
    await supabase.rpc(
      "process_message_mentions",
      {
        p_message_id:
          messageId,
      }
    );

  if (error) {
    console.error(
      "processMessageMentions error:",
      error
    );

    throw error;
  }

  return Number(
    data || 0
  );
}

/* =========================================================
   SEND TEXT
========================================================= */

export async function sendMessage({
  conversationId,
  senderId,
  message,
  replyTo = null,
}) {
  const text =
    message?.trim();

  if (!conversationId) {
    throw new Error(
      "Missing conversation ID"
    );
  }

  if (!senderId) {
    throw new Error(
      "Missing sender ID"
    );
  }

  if (!text) {
    return null;
  }

  const { data, error } =
    await supabase
      .from("chat_messages")
      .insert({
        conversation_id:
          conversationId,

        sender_id:
          senderId,

        message:
          text,

        message_type:
          "text",

        reply_to:
          replyTo,
      })
      .select(`
        id,
        conversation_id,
        sender_id,
        message,
        message_type,
        reply_to,
        edited_at,
        deleted_at,
        created_at,

        sender:profiles!chat_messages_sender_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        )
      `)
      .single();

  if (error) {
    console.error(
      "sendMessage error:",
      error
    );

    throw error;
  }

  try {
    await processMessageMentions(
      data.id
    );
  } catch (error) {
    console.error(
      "Mention processing failed:",
      error
    );
  }

  const hydrated =
    await hydrateMessages([
      data,
    ]);

  return hydrated[0] || data;
}

/* =========================================================
   ATTACHMENTS
========================================================= */

export async function sendAttachmentMessage({
  conversationId,
  senderId,
  file,
  caption = "",
  replyTo = null,
}) {
  if (!conversationId) {
    throw new Error(
      "Missing conversation ID"
    );
  }

  if (!senderId) {
    throw new Error(
      "Missing sender ID"
    );
  }

  if (!file) {
    throw new Error(
      "Missing attachment"
    );
  }

  const MAX_SIZE =
    25 * 1024 * 1024;

  if (
    file.size >
    MAX_SIZE
  ) {
    throw new Error(
      "File is too large. Maximum is 25 MB."
    );
  }

  const safeName =
    sanitizeFileName(
      file.name
    );

  const randomId =
    crypto.randomUUID();

  const storagePath =
    `${senderId}/${conversationId}/${Date.now()}-${randomId}-${safeName}`;

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(
        "chat-attachments"
      )
      .upload(
        storagePath,
        file,
        {
          cacheControl:
            "3600",

          upsert:
            false,

          contentType:
            file.type ||
            undefined,
        }
      );

  if (uploadError) {
    console.error(
      "Attachment upload error:",
      uploadError
    );

    throw uploadError;
  }

  const {
    data: publicUrlData,
  } =
    supabase.storage
      .from(
        "chat-attachments"
      )
      .getPublicUrl(
        storagePath
      );

  const fileUrl =
    publicUrlData
      ?.publicUrl;

  if (!fileUrl) {
    await supabase.storage
      .from(
        "chat-attachments"
      )
      .remove([
        storagePath,
      ]);

    throw new Error(
      "Unable to create attachment URL"
    );
  }

  const messageType =
    getAttachmentMessageType(
      file
    );

  const text =
    caption?.trim() ||
    "";

  const {
    data: messageData,
    error: messageError,
  } =
    await supabase
      .from(
        "chat_messages"
      )
      .insert({
        conversation_id:
          conversationId,

        sender_id:
          senderId,

        message:
          text,

        message_type:
          messageType,

        reply_to:
          replyTo,
      })
      .select(`
        id,
        conversation_id,
        sender_id,
        message,
        message_type,
        reply_to,
        edited_at,
        deleted_at,
        created_at,

        sender:profiles!chat_messages_sender_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        )
      `)
      .single();

  if (messageError) {
    await supabase.storage
      .from(
        "chat-attachments"
      )
      .remove([
        storagePath,
      ]);

    console.error(
      "Attachment message error:",
      messageError
    );

    throw messageError;
  }

  const {
    error: attachmentError,
  } =
    await supabase
      .from(
        "chat_attachments"
      )
      .insert({
        message_id:
          messageData.id,

        file_url:
          fileUrl,

        storage_path:
          storagePath,

        file_name:
          file.name,

        mime_type:
          file.type ||
          "application/octet-stream",

        file_size:
          file.size,
      });

  if (attachmentError) {
    console.error(
      "Attachment row error:",
      attachmentError
    );

    await supabase.storage
      .from(
        "chat-attachments"
      )
      .remove([
        storagePath,
      ]);

    throw attachmentError;
  }

  if (text) {
    try {
      await processMessageMentions(
        messageData.id
      );
    } catch (error) {
      console.error(
        "Attachment mention processing failed:",
        error
      );
    }
  }

  const hydrated =
    await hydrateMessages([
      messageData,
    ]);

  return hydrated[0] || messageData;
}

/* =========================================================
   DELETE MESSAGE
========================================================= */

export async function deleteChatMessage(
  messageId
) {
  if (!messageId) {
    throw new Error(
      "Missing message ID"
    );
  }

  const { error } =
    await supabase.rpc(
      "delete_chat_message",
      {
        p_message_id:
          messageId,
      }
    );

  if (error) {
    console.error(
      "deleteChatMessage error:",
      error
    );

    throw error;
  }
}

/* =========================================================
   REACTIONS
========================================================= */

export async function getMessageReactions(
  messageId
) {
  if (!messageId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_message_reactions",
      {
        p_message_id:
          messageId,
      }
    );

  if (error) {
    console.error(
      "getMessageReactions error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function toggleChatReaction(
  messageId,
  emoji
) {
  if (
    !messageId ||
    !emoji
  ) {
    throw new Error(
      "Missing message or reaction"
    );
  }

  const { error } =
    await supabase.rpc(
      "toggle_chat_reaction",
      {
        p_message_id:
          messageId,

        p_emoji:
          emoji,
      }
    );

  if (error) {
    console.error(
      "toggleChatReaction error:",
      error
    );

    throw error;
  }

  return getMessageReactions(
    messageId
  );
}

/* =========================================================
   PINNED MESSAGES
========================================================= */

export async function getPinnedMessages(
  conversationId
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_pinned_messages",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "getPinnedMessages error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function togglePinnedMessage(
  messageId
) {
  if (!messageId) {
    throw new Error(
      "Missing message ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "toggle_pinned_message",
      {
        p_message_id:
          messageId,
      }
    );

  if (error) {
    console.error(
      "togglePinnedMessage error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

/* =========================================================
   PIN REALTIME
========================================================= */

export function subscribeToPinnedMessages(
  onChange,
  onError
) {
  const channel =
    supabase
      .channel(
        `chat-pins-${Date.now()}`
      )
      .on(
        "postgres_changes",
        {
          event:
            "*",

          schema:
            "public",

          table:
            "chat_pinned_messages",
        },

        (payload) => {
          onChange?.(
            payload
          );
        }
      )
      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Pin realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   MESSAGE REALTIME
========================================================= */

export function subscribeToMessages(
  conversationId,
  onMessage,
  onError
) {
  if (!conversationId) {
    return null;
  }

  const channel =
    supabase
      .channel(
        `chat-messages-${conversationId}-${Date.now()}`
      )

      .on(
        "postgres_changes",
        {
          event:
            "INSERT",

          schema:
            "public",

          table:
            "chat_messages",

          filter:
            `conversation_id=eq.${conversationId}`,
        },

        async (payload) => {
          try {
            const hydrated =
              await getMessageById(
                payload.new.id
              );

            onMessage?.(
              hydrated ||
                payload.new,
              "INSERT"
            );
          } catch (error) {
            console.error(
              "Realtime message hydration failed:",
              error
            );

            onMessage?.(
              payload.new,
              "INSERT"
            );
          }
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
            "chat_messages",

          filter:
            `conversation_id=eq.${conversationId}`,
        },

        async (payload) => {
          try {
            const hydrated =
              await getMessageById(
                payload.new.id
              );

            onMessage?.(
              hydrated ||
                payload.new,
              "UPDATE"
            );
          } catch (error) {
            console.error(
              "Realtime message update failed:",
              error
            );

            onMessage?.(
              payload.new,
              "UPDATE"
            );
          }
        }
      )

      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Message realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   ATTACHMENT REALTIME
========================================================= */

export function subscribeToAttachments(
  onChange,
  onError
) {
  const channel =
    supabase
      .channel(
        `chat-attachments-${Date.now()}`
      )
      .on(
        "postgres_changes",
        {
          event:
            "INSERT",

          schema:
            "public",

          table:
            "chat_attachments",
        },

        (payload) => {
          onChange?.(
            payload.new
          );
        }
      )
      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Attachment realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   REACTION REALTIME
========================================================= */

export function subscribeToReactions(
  onChange,
  onError
) {
  const channel =
    supabase
      .channel(
        `chat-reactions-${Date.now()}`
      )
      .on(
        "postgres_changes",
        {
          event:
            "*",

          schema:
            "public",

          table:
            "chat_reactions",
        },

        (payload) => {
          onChange?.(
            payload
          );
        }
      )
      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Reaction realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   CHAT LIST REALTIME
========================================================= */

export function subscribeToChatList(
  userId,
  onChange,
  onError
) {
  if (!userId) {
    return null;
  }

  const channel =
    supabase
      .channel(
        `chat-list-${userId}-${Date.now()}`
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
        },

        () => {
          onChange?.();
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
            "chat_messages",
        },

        () => {
          onChange?.();
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
        },

        () => {
          onChange?.();
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
            "chat_mentions",

          filter:
            `mentioned_user_id=eq.${userId}`,
        },

        () => {
          onChange?.();
        }
      )

      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Chat list realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   MENTIONS
========================================================= */

export async function getConversationMentions(
  conversationId
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "chat_mentions"
      )
      .select(`
        id,
        conversation_id,
        message_id,
        mentioned_user_id,
        mentioned_by,
        is_read,
        read_at,
        created_at
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        }
      );

  if (error) {
    console.error(
      "getConversationMentions error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function getUnreadMentionCount(
  conversationId = null
) {
  const { data, error } =
    await supabase.rpc(
      "get_unread_mention_count",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "getUnreadMentionCount error:",
      error
    );

    return 0;
  }

  return Number(
    data || 0
  );
}

export async function markConversationMentionsRead(
  conversationId
) {
  if (!conversationId) {
    return 0;
  }

  const { data, error } =
    await supabase.rpc(
      "mark_conversation_mentions_read",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "markConversationMentionsRead error:",
      error
    );

    throw error;
  }

  return Number(
    data || 0
  );
}

export function subscribeToMentions(
  userId,
  onChange,
  onError
) {
  if (!userId) {
    return null;
  }

  const channel =
    supabase
      .channel(
        `chat-mentions-${userId}-${Date.now()}`
      )

      .on(
        "postgres_changes",
        {
          event:
            "*",

          schema:
            "public",

          table:
            "chat_mentions",

          filter:
            `mentioned_user_id=eq.${userId}`,
        },

        (payload) => {
          onChange?.(
            payload
          );
        }
      )

      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Mention realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   SYSTEM EVENT MAPPER
========================================================= */

function mapSystemEvent(event) {
  if (!event) {
    return null;
  }

  return {
    id:
      event.id,

    conversation_id:
      event.conversation_id,

    actor_user_id:
      event.actor_user_id,

    target_user_id:
      event.target_user_id,

    event_type:
      event.event_type,

    message:
      event.message,

    metadata:
      event.metadata ||
      {},

    created_at:
      event.created_at,

    actor:
      event.actor_user_id
        ? {
            id:
              event.actor_user_id,

            full_name:
              event.actor_full_name,

            username:
              event.actor_username,

            avatar_url:
              event.actor_avatar_url,
          }
        : null,

    target:
      event.target_user_id
        ? {
            id:
              event.target_user_id,

            full_name:
              event.target_full_name,

            username:
              event.target_username,

            avatar_url:
              event.target_avatar_url,
          }
        : null,
  };
}

/* =========================================================
   SYSTEM EVENTS FULL LIST
========================================================= */

export async function getSystemEvents(
  conversationId
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_chat_system_events",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "getSystemEvents error:",
      error
    );

    throw error;
  }

  return (
    data ||
    []
  )
    .map(
      mapSystemEvent
    )
    .filter(Boolean);
}

/* =========================================================
   SYSTEM EVENTS AFTER TIMESTAMP
========================================================= */

export async function getSystemEventsAfter(
  conversationId,
  afterTimestamp
) {
  if (!conversationId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_chat_system_events_after",
      {
        p_conversation_id:
          conversationId,

        p_after:
          afterTimestamp ||
          "1970-01-01T00:00:00.000Z",
      }
    );

  if (error) {
    console.error(
      "getSystemEventsAfter error:",
      error
    );

    throw error;
  }

  return (
    data ||
    []
  )
    .map(
      mapSystemEvent
    )
    .filter(Boolean);
}

/* =========================================================
   SINGLE SYSTEM EVENT
========================================================= */

export async function getSystemEventById(
  eventId
) {
  if (!eventId) {
    return null;
  }

  const { data, error } =
    await supabase.rpc(
      "get_chat_system_event_by_id",
      {
        p_event_id:
          eventId,
      }
    );

  if (error) {
    console.error(
      "getSystemEventById error:",
      error
    );

    throw error;
  }

  const event =
    Array.isArray(data)
      ? data[0] || null
      : data || null;

  return mapSystemEvent(
    event
  );
}

/* =========================================================
   SYSTEM EVENTS REALTIME
========================================================= */

export function subscribeToSystemEvents(
  conversationId,
  onChange,
  onError
) {
  if (!conversationId) {
    return null;
  }

  const channel =
    supabase
      .channel(
        `chat-system-events-${conversationId}-${Date.now()}`
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

          filter:
            `conversation_id=eq.${conversationId}`,
        },

        (payload) => {
          onChange?.(
            payload
          );
        }
      )
      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "System events realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   READ / UNREAD
========================================================= */

export async function markConversationRead(
  conversationId
) {
  if (!conversationId) {
    return;
  }

  const { error } =
    await supabase.rpc(
      "mark_conversation_read",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "markConversationRead error:",
      error
    );

    throw error;
  }
}

export async function getUnreadCount(
  conversationId
) {
  if (!conversationId) {
    return 0;
  }

  const { data, error } =
    await supabase.rpc(
      "get_conversation_unread_count",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "getUnreadCount error:",
      error
    );

    return 0;
  }

  return Number(
    data || 0
  );
}

export async function getMessageReadCount(
  messageId
) {
  if (!messageId) {
    return 0;
  }

  const { data, error } =
    await supabase.rpc(
      "get_message_read_count",
      {
        p_message_id:
          messageId,
      }
    );

  if (error) {
    console.error(
      "getMessageReadCount error:",
      error
    );

    return 0;
  }

  return Number(
    data || 0
  );
}

export function subscribeToReadReceipts(
  conversationId,
  onChange,
  onError
) {
  if (!conversationId) {
    return null;
  }

  const channel =
    supabase
      .channel(
        `chat-read-receipts-${conversationId}-${Date.now()}`
      )

      .on(
        "postgres_changes",
        {
          event:
            "*",

          schema:
            "public",

          table:
            "chat_message_reads",
        },

        () => {
          onChange?.();
        }
      )

      .subscribe(
        (
          status,
          error
        ) => {
          if (error) {
            console.error(
              "Read receipt realtime error:",
              error
            );

            onError?.(
              error
            );
          }
        }
      );

  return channel;
}

/* =========================================================
   ONLINE STATUS
========================================================= */

export async function updateMyLastSeen() {
  const { error } =
    await supabase.rpc(
      "update_my_last_seen"
    );

  if (error) {
    console.error(
      "updateMyLastSeen error:",
      error
    );
  }
}

/* =========================================================
   TYPING
========================================================= */

export function subscribeToTyping(
  conversationId,
  currentUserId,
  onTyping,
  onError
) {
  if (
    !conversationId ||
    !currentUserId
  ) {
    return null;
  }

  const channel =
    supabase.channel(
      `chat-typing-${conversationId}`
    );

  channel.on(
    "broadcast",
    {
      event:
        "typing",
    },

    ({
      payload,
    }) => {
      if (
        !payload ||
        payload.userId ===
          currentUserId
      ) {
        return;
      }

      onTyping?.({
        userId:
          payload.userId,

        isTyping:
          Boolean(
            payload.isTyping
          ),
      });
    }
  );

  channel.subscribe(
    (
      status,
      error
    ) => {
      if (error) {
        console.error(
          "Typing realtime error:",
          error
        );

        onError?.(
          error
        );
      }
    }
  );

  return channel;
}

/* =========================================================
   SEND TYPING STATUS
========================================================= */

export async function sendTypingStatus(
  channel,
  userId,
  isTyping
) {
  if (
    !channel ||
    !userId
  ) {
    return;
  }

  const payload = {
    userId,

    isTyping:
      Boolean(
        isTyping
      ),
  };

  try {
    if (
      typeof channel.httpSend ===
      "function"
    ) {
      await channel.httpSend(
        "typing",
        payload
      );

      return;
    }

    await channel.send({
      type:
        "broadcast",

      event:
        "typing",

      payload,
    });
  } catch (error) {
    console.error(
      "sendTypingStatus error:",
      error
    );
  }
}

/* =========================================================
   REMOVE REALTIME CHANNEL
========================================================= */

export async function unsubscribeFromMessages(
  channel
) {
  if (!channel) {
    return;
  }

  try {
    await supabase.removeChannel(
      channel
    );
  } catch (error) {
    console.error(
      "Remove realtime channel error:",
      error
    );
  }
}