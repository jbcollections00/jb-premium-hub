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
  const rows =
    messages ||
    [];

  const messageIds =
    rows
      .map(
        (
          message
        ) =>
          message.id
      )
      .filter(
        Boolean
      );

  if (
    messageIds.length ===
    0
  ) {
    return rows.map(
      (
        message
      ) => ({
        ...message,
        attachments:
          [],
      })
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "chat_attachments"
      )
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
      .in(
        "message_id",
        messageIds
      );

  if (
    error
  ) {
    console.error(
      "hydrateAttachments error:",
      error
    );

    return rows.map(
      (
        message
      ) => ({
        ...message,
        attachments:
          [],
      })
    );
  }

  const attachmentRows =
    data ||
    [];

  const signedUrlMap =
    await createChatAttachmentSignedUrlMap(
      attachmentRows
    );

  const grouped =
    new Map();

  for (
    const attachment of
    attachmentRows
  ) {
    if (
      !grouped.has(
        attachment.message_id
      )
    ) {
      grouped.set(
        attachment.message_id,
        []
      );
    }

    const storagePath =
      extractChatAttachmentStoragePath(
        attachment
      );

    grouped
      .get(
        attachment.message_id
      )
      .push({
        ...attachment,

        storage_path:
          storagePath ||
          attachment.storage_path ||
          null,

        file_url:
          resolveAttachmentFileUrl(
            attachment,
            signedUrlMap
          ),
      });
  }

  return rows.map(
    (
      message
    ) => ({
      ...message,

      attachments:
        grouped.get(
          message.id
        ) ||
        [],
    })
  );
}

async function hydrateReactions(messages) {
  const rows =
    messages || [];

  if (
    rows.length ===
    0
  ) {
    return [];
  }

  try {
    const reactionMap =
      await getMessageReactionsBatch(
        rows.map(
          (
            message
          ) =>
            message.id
        )
      );

    return rows.map(
      (
        message
      ) => ({
        ...message,

        reactions:
          reactionMap.get(
            message.id
          ) ||
          [],
      })
    );
  } catch (error) {
    console.error(
      "hydrateReactions batch error:",
      error
    );

    return rows.map(
      (
        message
      ) => ({
        ...message,

        reactions:
          message.reactions ||
          [],
      })
    );
  }
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

const CHAT_ATTACHMENT_MAX_SIZE =
  25 * 1024 * 1024;

const CHAT_ATTACHMENT_BUCKET =
  "chat-attachments";

const CHAT_ATTACHMENT_SIGNED_URL_TTL =
  60 * 60;

const CHAT_ATTACHMENT_TYPES = {
  jpg: [
    "image/jpeg",
  ],

  jpeg: [
    "image/jpeg",
  ],

  png: [
    "image/png",
  ],

  gif: [
    "image/gif",
  ],

  webp: [
    "image/webp",
  ],

  avif: [
    "image/avif",
  ],

  heic: [
    "image/heic",
    "image/heif",
  ],

  heif: [
    "image/heif",
    "image/heic",
  ],

  mp4: [
    "video/mp4",
  ],

  webm: [
    "video/webm",
  ],

  mov: [
    "video/quicktime",
  ],

  m4v: [
    "video/x-m4v",
    "video/mp4",
  ],

  pdf: [
    "application/pdf",
  ],

  doc: [
    "application/msword",
  ],

  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],

  xls: [
    "application/vnd.ms-excel",
  ],

  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],

  txt: [
    "text/plain",
  ],

  zip: [
    "application/zip",
    "application/x-zip-compressed",
  ],

  rar: [
    "application/vnd.rar",
    "application/x-rar-compressed",
  ],
};

function getFileExtension(
  name
) {
  const cleanName =
    String(
      name ||
        ""
    )
      .trim()
      .toLowerCase();

  const lastDot =
    cleanName.lastIndexOf(
      "."
    );

  if (
    lastDot <= 0 ||
    lastDot ===
      cleanName.length -
        1
  ) {
    return "";
  }

  return cleanName.slice(
    lastDot +
      1
  );
}

function getSafeAttachmentMimeType(
  file
) {
  const extension =
    getFileExtension(
      file?.name
    );

  const allowedMimes =
    CHAT_ATTACHMENT_TYPES[
      extension
    ] ||
    null;

  if (
    !allowedMimes
  ) {
    throw new Error(
      "Unsupported file type. Allowed: images, videos, PDF, Office documents, TXT, ZIP, and RAR."
    );
  }

  const providedMime =
    String(
      file?.type ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    !providedMime ||
    providedMime ===
      "application/octet-stream"
  ) {
    return allowedMimes[0];
  }

  if (
    !allowedMimes.includes(
      providedMime
    )
  ) {
    throw new Error(
      "The file extension does not match its reported file type."
    );
  }

  return providedMime;
}

export function validateChatAttachmentFile(
  file
) {
  if (!file) {
    throw new Error(
      "Missing attachment"
    );
  }

  const size =
    Number(
      file.size ||
        0
    );

  if (
    !Number.isFinite(
      size
    ) ||
    size <=
      0
  ) {
    throw new Error(
      "The attachment is empty or invalid."
    );
  }

  if (
    size >
    CHAT_ATTACHMENT_MAX_SIZE
  ) {
    throw new Error(
      "File is too large. Maximum is 25 MB."
    );
  }

  const fileName =
    String(
      file.name ||
        ""
    ).trim();

  if (
    !fileName
  ) {
    throw new Error(
      "Attachment filename is required."
    );
  }

  if (
    fileName.length >
    255
  ) {
    throw new Error(
      "Attachment filename is too long."
    );
  }

  const mimeType =
    getSafeAttachmentMimeType(
      file
    );

  return {
    extension:
      getFileExtension(
        fileName
      ),

    mimeType,

    size,

    fileName,
  };
}

function getAttachmentMessageType(
  file
) {
  const mime =
    file?.type ||
    "";

  if (
    mime.startsWith(
      "image/"
    )
  ) {
    return "image";
  }

  if (
    mime.startsWith(
      "video/"
    )
  ) {
    return "video";
  }

  return "file";
}

function sanitizeFileName(
  name
) {
  const clean =
    (
      name ||
      "attachment"
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )
      .replace(
        /_+/g,
        "_"
      )
      .replace(
        /^\.+/,
        ""
      )
      .slice(
        0,
        120
      );

  return (
    clean ||
    "attachment"
  );
}

function extractChatAttachmentStoragePath(
  attachment
) {
  const directPath =
    attachment
      ?.storage_path
      ?.trim();

  if (
    directPath
  ) {
    return directPath;
  }

  const fileUrl =
    String(
      attachment?.file_url ||
        ""
    ).trim();

  if (
    !fileUrl
  ) {
    return null;
  }

  const privatePrefix =
    `private://${CHAT_ATTACHMENT_BUCKET}/`;

  if (
    fileUrl.startsWith(
      privatePrefix
    )
  ) {
    return fileUrl.slice(
      privatePrefix.length
    );
  }

  try {
    const parsed =
      new URL(
        fileUrl
      );

    const markers = [
      `/storage/v1/object/public/${CHAT_ATTACHMENT_BUCKET}/`,
      `/storage/v1/object/sign/${CHAT_ATTACHMENT_BUCKET}/`,
      `/storage/v1/object/authenticated/${CHAT_ATTACHMENT_BUCKET}/`,
    ];

    for (
      const marker of
      markers
    ) {
      const index =
        parsed.pathname.indexOf(
          marker
        );

      if (
        index >=
        0
      ) {
        const encodedPath =
          parsed.pathname.slice(
            index +
              marker.length
          );

        if (
          encodedPath
        ) {
          return decodeURIComponent(
            encodedPath
          );
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function createChatAttachmentSignedUrlMap(
  attachmentRows
) {
  const rows =
    attachmentRows ||
    [];

  const paths =
    [
      ...new Set(
        rows
          .map(
            (
              attachment
            ) =>
              extractChatAttachmentStoragePath(
                attachment
              )
          )
          .filter(
            Boolean
          )
      ),
    ];

  const map =
    new Map();

  if (
    paths.length ===
    0
  ) {
    return map;
  }

  try {
    const {
      data,
      error,
    } =
      await supabase.storage
        .from(
          CHAT_ATTACHMENT_BUCKET
        )
        .createSignedUrls(
          paths,
          CHAT_ATTACHMENT_SIGNED_URL_TTL
        );

    if (error) {
      throw error;
    }

    for (
      const item of
      data ||
      []
    ) {
      if (
        item?.path &&
        item?.signedUrl
      ) {
        map.set(
          item.path,
          item.signedUrl
        );
      }
    }

    return map;
  } catch (
    batchError
  ) {
    console.warn(
      "Batch attachment signing failed; falling back to single URL signing:",
      batchError
    );
  }

  await Promise.all(
    paths.map(
      async (
        path
      ) => {
        try {
          const {
            data,
            error,
          } =
            await supabase.storage
              .from(
                CHAT_ATTACHMENT_BUCKET
              )
              .createSignedUrl(
                path,
                CHAT_ATTACHMENT_SIGNED_URL_TTL
              );

          if (
            error
          ) {
            throw error;
          }

          if (
            data?.signedUrl
          ) {
            map.set(
              path,
              data.signedUrl
            );
          }
        } catch (
          error
        ) {
          console.error(
            "Attachment signing fallback failed:",
            path,
            error
          );
        }
      }
    )
  );

  return map;
}

function resolveAttachmentFileUrl(
  attachment,
  signedUrlMap
) {
  const storagePath =
    extractChatAttachmentStoragePath(
      attachment
    );

  if (
    storagePath &&
    signedUrlMap?.has(
      storagePath
    )
  ) {
    return signedUrlMap.get(
      storagePath
    );
  }

  const fallbackUrl =
    String(
      attachment?.file_url ||
        ""
    ).trim();

  if (
    fallbackUrl.startsWith(
      "private://"
    )
  ) {
    return null;
  }

  return (
    fallbackUrl ||
    null
  );
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

export async function getMessagesPage({
  conversationId,
  before = null,
  limit = 50,
} = {}) {
  if (!conversationId) {
    return {
      messages: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const pageSize =
    Math.max(
      1,
      Math.min(
        Number(limit) ||
          50,
        100
      )
    );

  let query =
    supabase
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
      );

  if (before) {
    query =
      query.lt(
        "created_at",
        before
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(
        pageSize + 1
      );

  if (error) {
    console.error(
      "getMessagesPage error:",
      error
    );

    throw error;
  }

  const rows =
    data || [];

  const hasMore =
    rows.length >
    pageSize;

  const pageRows =
    rows
      .slice(
        0,
        pageSize
      )
      .reverse();

  const hydrated =
    await hydrateMessages(
      pageRows
    );

  return {
    messages:
      hydrated ||
      [],

    hasMore,

    nextCursor:
      pageRows[0]
        ?.created_at ||
      null,
  };
}

export async function getMessages(
  conversationId,
  limit = 50
) {
  const page =
    await getMessagesPage({
      conversationId,
      limit,
    });

  return page.messages;
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
   FAST MESSAGE BROADCAST

   Reuses the already-subscribed conversation WebSocket.
   Only message IDs are broadcast.

   Receiver performs one lightweight RLS-protected fetch
   so message content is not exposed directly through a
   public Broadcast payload.

   Postgres Changes remains the full hydration backup.
========================================================= */

const activeMessageChannels =
  new Map();

const messageConversationByChannel =
  new WeakMap();

function getMessageBroadcastTopic(
  conversationId
) {
  return `chat-messages-${conversationId}`;
}

/* =========================================================
   FAST MESSAGE FETCH

   Used only by Broadcast.
   No reaction RPC.
   No attachment query.
   No reply hydration.

   Full hydration will arrive later from Postgres Realtime.
========================================================= */

async function getMessageByIdFast(
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
      "getMessageByIdFast error:",
      error
    );

    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    ...data,

    reply_message:
      null,

    attachments:
      [],

    reactions:
      [],
  };
}

/* =========================================================
   SEND BROADCAST ON ACTIVE WEBSOCKET
========================================================= */

async function sendMessageBroadcast(
  channel,
  conversationId,
  messageId
) {
  if (
    !channel ||
    !conversationId ||
    !messageId
  ) {
    return false;
  }

  try {
    const result =
      await channel.send({
        type:
          "broadcast",

        event:
          "message:new",

        payload: {
          conversationId,
          messageId,
        },
      });

    return (
      result === "ok" ||
      result === undefined
    );
  } catch (error) {
    console.error(
      "WebSocket message broadcast error:",
      error
    );

    return false;
  }
}

/* =========================================================
   TEMPORARY WEBSOCKET FALLBACK
========================================================= */

async function broadcastUsingTemporaryChannel(
  conversationId,
  messageId
) {
  const channel =
    supabase.channel(
      `${getMessageBroadcastTopic(
        conversationId
      )}-sender-${crypto.randomUUID()}`
    );

  try {
    await new Promise(
      (
        resolve,
        reject
      ) => {
        let finished =
          false;

        const timeout =
          setTimeout(
            () => {
              if (finished) {
                return;
              }

              finished =
                true;

              reject(
                new Error(
                  "Broadcast channel subscription timed out"
                )
              );
            },
            2500
          );

        channel.subscribe(
          async (
            status,
            error
          ) => {
            if (
              finished
            ) {
              return;
            }

            if (error) {
              finished =
                true;

              clearTimeout(
                timeout
              );

              reject(
                error
              );

              return;
            }

            if (
              status ===
              "SUBSCRIBED"
            ) {
              try {
                await channel.send({
                  type:
                    "broadcast",

                  event:
                    "message:new",

                  payload: {
                    conversationId,
                    messageId,
                  },
                });

                finished =
                  true;

                clearTimeout(
                  timeout
                );

                resolve();
              } catch (
                sendError
              ) {
                finished =
                  true;

                clearTimeout(
                  timeout
                );

                reject(
                  sendError
                );
              }
            }

            if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT"
            ) {
              finished =
                true;

              clearTimeout(
                timeout
              );

              reject(
                new Error(
                  `Broadcast subscription status: ${status}`
                )
              );
            }
          }
        );
      }
    );
  } catch (error) {
    console.error(
      "Temporary WebSocket broadcast error:",
      error
    );
  } finally {
    try {
      await supabase.removeChannel(
        channel
      );
    } catch {
      // Ignore cleanup error.
    }
  }
}
/* =========================================================
   BROADCAST NEW MESSAGE
========================================================= */

async function broadcastNewMessage(
  conversationId,
  messageId
) {
  if (
    !conversationId ||
    !messageId
  ) {
    return;
  }

  const activeChannel =
    activeMessageChannels.get(
      conversationId
    );

  if (activeChannel) {
    const sent =
      await sendMessageBroadcast(
        activeChannel,
        conversationId,
        messageId
      );

    if (sent) {
      return;
    }
  }

  await broadcastUsingTemporaryChannel(
    conversationId,
    messageId
  );
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
  clientRequestId = null,
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

  if (
    clientRequestId
  ) {
    const {
      data:
        existingMessage,
      error:
        existingError,
    } =
      await supabase
        .from(
          "chat_messages"
        )
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
        .eq(
          "sender_id",
          senderId
        )
        .eq(
          "client_request_id",
          clientRequestId
        )
        .maybeSingle();

    if (
      existingError
    ) {
      console.error(
        "sendMessage idempotency lookup error:",
        existingError
      );

      throw existingError;
    }

    if (
      existingMessage
    ) {
      const hydrated =
        await hydrateMessages([
          existingMessage,
        ]);

      return hydrated[0] ||
        existingMessage;
    }
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

        client_request_id:
          clientRequestId ||
          null,
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

  void broadcastNewMessage(
    conversationId,
    data.id
  );

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
  clientRequestId = null,
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

  if (
    clientRequestId
  ) {
    const {
      data:
        existingMessage,
      error:
        existingError,
    } =
      await supabase
        .from(
          "chat_messages"
        )
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
        .eq(
          "sender_id",
          senderId
        )
        .eq(
          "client_request_id",
          clientRequestId
        )
        .maybeSingle();

    if (
      existingError
    ) {
      console.error(
        "sendAttachmentMessage idempotency lookup error:",
        existingError
      );

      throw existingError;
    }

    if (
      existingMessage
    ) {
      const hydrated =
        await hydrateMessages([
          existingMessage,
        ]);

      return hydrated[0] ||
        existingMessage;
    }
  }

  const {
    mimeType:
      safeMimeType,

    fileName:
      validatedFileName,
  } =
    validateChatAttachmentFile(
      file
    );

  const safeName =
    sanitizeFileName(
      validatedFileName
    );

  const randomId =
    clientRequestId ||
    crypto.randomUUID();

  const storagePath =
    `${senderId}/${conversationId}/${randomId}-${safeName}`;

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(
        CHAT_ATTACHMENT_BUCKET
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
            safeMimeType,
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
    data: signedUrlData,
    error: signedUrlError,
  } =
    await supabase.storage
      .from(
        CHAT_ATTACHMENT_BUCKET
      )
      .createSignedUrl(
        storagePath,
        CHAT_ATTACHMENT_SIGNED_URL_TTL
      );

  const fileUrl =
    signedUrlData
      ?.signedUrl;

  if (
    signedUrlError ||
    !fileUrl
  ) {
    await supabase.storage
      .from(
        CHAT_ATTACHMENT_BUCKET
      )
      .remove([
        storagePath,
      ]);

    console.error(
      "Attachment signed URL error:",
      signedUrlError
    );

    throw signedUrlError ||
      new Error(
        "Unable to create secure attachment URL"
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

        client_request_id:
          clientRequestId ||
          null,
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
          `private://${CHAT_ATTACHMENT_BUCKET}/${storagePath}`,

        storage_path:
          storagePath,

        file_name:
          validatedFileName,

        mime_type:
          safeMimeType,

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

  void broadcastNewMessage(
    conversationId,
    messageData.id
  );

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
   SHARED MEDIA / FILES
========================================================= */

export async function getConversationSharedAttachments({
  conversationId,
  kind = "all",
  limit = 40,
  before = null,
} = {}) {
  if (!conversationId) {
    throw new Error(
      "Missing conversation ID"
    );
  }

  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            40
        ),
        1
      ),
      100
    );

  const normalizedKind =
    [
      "all",
      "media",
      "files",
    ].includes(
      kind
    )
      ? kind
      : "all";

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_shared_attachments",
      {
        p_conversation_id:
          conversationId,

        p_kind:
          normalizedKind,

        p_limit:
          safeLimit + 1,

        p_before:
          before ||
          null,
      }
    );

  if (error) {
    console.error(
      "getConversationSharedAttachments error:",
      error
    );

    throw error;
  }

  const rows =
    data ||
    [];

  const hasMore =
    rows.length >
    safeLimit;

  const pageRows =
    hasMore
      ? rows.slice(
          0,
          safeLimit
        )
      : rows;

  const signedMap =
    await createChatAttachmentSignedUrlMap(
      pageRows
    );

  const attachments =
    pageRows.map(
      (
        row
      ) => {
        const storagePath =
          extractChatAttachmentStoragePath(
            row
          );

        return {
          ...row,

          storage_path:
            storagePath ||
            row.storage_path ||
            null,

          file_url:
            resolveAttachmentFileUrl(
              row,
              signedMap
            ),

          sender:
          row.sender_id
            ? {
                id:
                  row.sender_id,

                full_name:
                  row.sender_full_name ||
                  null,

                username:
                  row.sender_username ||
                  null,

                avatar_url:
                  row.sender_avatar_url ||
                  null,
              }
            : null,
        };
      }
    );

  return {
    attachments,

    hasMore,

    nextCursor:
      attachments.length >
      0
        ? attachments[
            attachments.length -
              1
          ].created_at
        : null,
  };
}

/* =========================================================
   MESSAGE SEARCH
========================================================= */

export async function searchChatMessages({
  query,
  conversationId = null,
  limit = 30,
  before = null,
} = {}) {
  const cleanQuery =
    String(
      query ||
        ""
    ).trim();

  if (
    cleanQuery.length <
    2
  ) {
    return {
      messages:
        [],

      hasMore:
        false,

      nextCursor:
        null,
    };
  }

  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            30
        ),
        1
      ),
      100
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "search_chat_messages",
      {
        p_query:
          cleanQuery,

        p_conversation_id:
          conversationId ||
          null,

        p_limit:
          safeLimit + 1,

        p_before:
          before ||
          null,
      }
    );

  if (error) {
    console.error(
      "searchChatMessages error:",
      error
    );

    throw error;
  }

  const rows =
    data ||
    [];

  const hasMore =
    rows.length >
    safeLimit;

  const pageRows =
    hasMore
      ? rows.slice(
          0,
          safeLimit
        )
      : rows;

  const messages =
    pageRows.map(
      (
        row
      ) => ({
        id:
          row.id,

        conversation_id:
          row.conversation_id,

        sender_id:
          row.sender_id,

        message:
          row.message,

        message_type:
          row.message_type,

        reply_to:
          row.reply_to,

        edited_at:
          row.edited_at,

        deleted_at:
          row.deleted_at,

        created_at:
          row.created_at,

        conversation:
          row.conversation_id
            ? {
                id:
                  row.conversation_id,

                type:
                  row.conversation_type ||
                  null,

                title:
                  row.conversation_title ||
                  null,

                avatar_url:
                  row.conversation_avatar_url ||
                  null,
              }
            : null,

        sender:
          row.sender_id
            ? {
                id:
                  row.sender_id,

                full_name:
                  row.sender_full_name ||
                  null,

                username:
                  row.sender_username ||
                  null,

                avatar_url:
                  row.sender_avatar_url ||
                  null,
              }
            : null,
      })
    );

  return {
    messages,

    hasMore,

    nextCursor:
      messages.length >
      0
        ? messages[
            messages.length -
              1
          ].created_at
        : null,
  };
}

/* =========================================================
   MESSAGE REPORTING
========================================================= */

export async function reportChatMessage({
  messageId,
  reason,
  details = "",
} = {}) {
  if (!messageId) {
    throw new Error(
      "Missing message ID"
    );
  }

  const normalizedReason =
    String(
      reason ||
        ""
    )
      .trim()
      .toLowerCase();

  const allowedReasons = [
    "spam",
    "harassment",
    "hate",
    "sexual",
    "violence",
    "scam",
    "privacy",
    "other",
  ];

  if (
    !allowedReasons.includes(
      normalizedReason
    )
  ) {
    throw new Error(
      "Invalid report reason"
    );
  }

  const cleanDetails =
    String(
      details ||
        ""
    ).trim();

  if (
    cleanDetails.length >
    1000
  ) {
    throw new Error(
      "Report details are too long."
    );
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "report_chat_message",
      {
        p_message_id:
          messageId,

        p_reason:
          normalizedReason,

        p_details:
          cleanDetails ||
          null,
      }
    );

  if (error) {
    console.error(
      "reportChatMessage error:",
      error
    );

    throw error;
  }

  return data;
}

export async function getMyChatMessageReports({
  limit = 50,
  before = null,
} = {}) {
  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            50
        ),
        1
      ),
      100
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_my_chat_message_reports",
      {
        p_limit:
          safeLimit + 1,

        p_before:
          before ||
          null,
      }
    );

  if (error) {
    console.error(
      "getMyChatMessageReports error:",
      error
    );

    throw error;
  }

  const rows =
    data ||
    [];

  const hasMore =
    rows.length >
    safeLimit;

  const reports =
    hasMore
      ? rows.slice(
          0,
          safeLimit
        )
      : rows;

  return {
    reports,

    hasMore,

    nextCursor:
      reports[
        reports.length -
          1
      ]?.created_at ||
      null,
  };
}

/* =========================================================
   CHAT ANALYTICS
========================================================= */

export async function getChatAnalyticsOverview({
  days = 30,
} = {}) {
  const safeDays =
    Math.min(
      Math.max(
        Number(
          days ||
            30
        ),
        1
      ),
      365
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_analytics_overview",
      {
        p_days:
          safeDays,
      }
    );

  if (error) {
    console.error(
      "getChatAnalyticsOverview error:",
      error
    );

    throw error;
  }

  return data || {};
}

export async function getChatAnalyticsDaily({
  days = 30,
} = {}) {
  const safeDays =
    Math.min(
      Math.max(
        Number(
          days ||
            30
        ),
        1
      ),
      365
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_analytics_daily",
      {
        p_days:
          safeDays,
      }
    );

  if (error) {
    console.error(
      "getChatAnalyticsDaily error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function getChatAnalyticsTopConversations({
  days = 30,
  limit = 10,
} = {}) {
  const safeDays =
    Math.min(
      Math.max(
        Number(
          days ||
            30
        ),
        1
      ),
      365
    );

  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            10
        ),
        1
      ),
      100
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_analytics_top_conversations",
      {
        p_days:
          safeDays,

        p_limit:
          safeLimit,
      }
    );

  if (error) {
    console.error(
      "getChatAnalyticsTopConversations error:",
      error
    );

    throw error;
  }

  return data || [];
}

/* =========================================================
   CHAT ANALYTICS — DRILLDOWN
========================================================= */

export async function getChatAnalyticsEngagement({
  days = 30,
} = {}) {
  const safeDays =
    Math.min(
      Math.max(
        Number(
          days ||
            30
        ),
        1
      ),
      365
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_analytics_engagement",
      {
        p_days:
          safeDays,
      }
    );

  if (error) {
    console.error(
      "getChatAnalyticsEngagement error:",
      error
    );

    throw error;
  }

  return data || {};
}

export async function getChatAnalyticsConversationTypes({
  days = 30,
} = {}) {
  const safeDays =
    Math.min(
      Math.max(
        Number(
          days ||
            30
        ),
        1
      ),
      365
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_analytics_conversation_types",
      {
        p_days:
          safeDays,
      }
    );

  if (error) {
    console.error(
      "getChatAnalyticsConversationTypes error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function getChatAnalyticsTopSenders({
  days = 30,
  limit = 10,
} = {}) {
  const safeDays =
    Math.min(
      Math.max(
        Number(
          days ||
            30
        ),
        1
      ),
      365
    );

  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            10
        ),
        1
      ),
      100
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_analytics_top_senders",
      {
        p_days:
          safeDays,

        p_limit:
          safeLimit,
      }
    );

  if (error) {
    console.error(
      "getChatAnalyticsTopSenders error:",
      error
    );

    throw error;
  }

  return data || [];
}

/* =========================================================
   CHAT USER PREFERENCES
========================================================= */

export const DEFAULT_CHAT_PREFERENCES = {
  chat_density:
    "comfortable",

  enter_to_send:
    true,

  show_read_receipts:
    true,

  show_typing_indicator:
    true,

  reduce_motion:
    false,

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
};

function normalizeChatPreferences(
  preferences
) {
  const value =
    preferences ||
    {};

  const density =
    value.chat_density ===
      "compact"
      ? "compact"
      : "comfortable";

  return {
    chat_density:
      density,

    enter_to_send:
      value.enter_to_send ===
        false
        ? false
        : true,

    show_read_receipts:
      value.show_read_receipts ===
        false
        ? false
        : true,

    show_typing_indicator:
      value.show_typing_indicator ===
        false
        ? false
        : true,

    reduce_motion:
      Boolean(
        value.reduce_motion
      ),

    message_font_size: ["small", "medium", "large"].includes(value.message_font_size)
      ? value.message_font_size : "medium",

    message_line_spacing: ["tight", "normal", "relaxed"].includes(value.message_line_spacing) ? value.message_line_spacing : "normal",
    show_message_timestamps: value.show_message_timestamps !== false,
    bubble_color: ["blue", "emerald", "violet", "slate"].includes(value.bubble_color) ? value.bubble_color : "blue",
    bubble_shape: ["rounded", "soft", "square"].includes(value.bubble_shape) ? value.bubble_shape : "rounded",
    show_sender_names: value.show_sender_names !== false,
    show_date_separators: value.show_date_separators !== false,
    show_reaction_counts: value.show_reaction_counts !== false,
    show_reaction_badges: value.show_reaction_badges !== false,
    show_pinned_indicators: value.show_pinned_indicators !== false,
    show_sender_avatars: value.show_sender_avatars !== false,
    show_edited_labels: value.show_edited_labels !== false,
    show_reply_previews: value.show_reply_previews !== false,
    show_attachment_previews: value.show_attachment_previews !== false,
    show_attachment_file_sizes: value.show_attachment_file_sizes !== false,
    highlight_mentions: value.highlight_mentions !== false,
    message_time_format: ["system", "12h", "24h"].includes(value.message_time_format) ? value.message_time_format : "system",
  };
}

export async function getChatPreferences() {
  const {
    data:
      authData,
    error:
      authError,
  } =
    await supabase.auth.getUser();

  if (
    authError
  ) {
    throw authError;
  }

  const userId =
    authData?.user?.id;

  if (
    !userId
  ) {
    throw new Error(
      "Not authenticated"
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "chat_user_preferences"
      )
      .select(
        `
          user_id,
          chat_density,
          enter_to_send,
          show_read_receipts,
          show_typing_indicator,
          reduce_motion,
          message_font_size,
          message_line_spacing,
          show_message_timestamps,
          bubble_color,
          bubble_shape,
          show_sender_names,
          show_date_separators,
          show_reaction_counts,
          show_reaction_badges,
          show_pinned_indicators,
          show_sender_avatars,
          show_edited_labels,
          show_reply_previews,
          show_attachment_previews,
          show_attachment_file_sizes,
          highlight_mentions,
          message_time_format,
          created_at,
          updated_at
        `
      )
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();

  if (
    error
  ) {
    console.error(
      "getChatPreferences error:",
      error
    );

    throw error;
  }

  if (
    !data
  ) {
    return {
      user_id:
        userId,

      ...DEFAULT_CHAT_PREFERENCES,
    };
  }

  return {
    ...data,

    ...normalizeChatPreferences(
      data
    ),
  };
}

export async function updateChatPreferences(
  preferences
) {
  const {
    data:
      authData,
    error:
      authError,
  } =
    await supabase.auth.getUser();

  if (
    authError
  ) {
    throw authError;
  }

  const userId =
    authData?.user?.id;

  if (
    !userId
  ) {
    throw new Error(
      "Not authenticated"
    );
  }

  const normalized =
    normalizeChatPreferences(
      preferences
    );

  const payload = {
    user_id:
      userId,

    ...normalized,

    updated_at:
      new Date().toISOString(),
  };

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "chat_user_preferences"
      )
      .upsert(
        payload,
        {
          onConflict:
            "user_id",
        }
      )
      .select(
        `
          user_id,
          chat_density,
          enter_to_send,
          show_read_receipts,
          show_typing_indicator,
          reduce_motion,
          message_font_size,
          message_line_spacing,
          show_message_timestamps,
          bubble_color,
          bubble_shape,
          show_sender_names,
          show_date_separators,
          show_reaction_counts,
          show_reaction_badges,
          show_pinned_indicators,
          show_sender_avatars,
          show_edited_labels,
          show_reply_previews,
          show_attachment_previews,
          show_attachment_file_sizes,
          highlight_mentions,
          message_time_format,
          created_at,
          updated_at
        `
      )
      .single();

  if (
    error
  ) {
    console.error(
      "updateChatPreferences error:",
      error
    );

    throw error;
  }

  return {
    ...data,

    ...normalizeChatPreferences(
      data
    ),
  };
}

export async function resetChatPreferences() {
  const {
    data:
      authData,
    error:
      authError,
  } =
    await supabase.auth.getUser();

  if (
    authError
  ) {
    throw authError;
  }

  const userId =
    authData?.user?.id;

  if (
    !userId
  ) {
    throw new Error(
      "Not authenticated"
    );
  }

  const {
    error,
  } =
    await supabase
      .from(
        "chat_user_preferences"
      )
      .delete()
      .eq(
        "user_id",
        userId
      );

  if (
    error
  ) {
    console.error(
      "resetChatPreferences error:",
      error
    );

    throw error;
  }

  return {
    user_id:
      userId,

    ...DEFAULT_CHAT_PREFERENCES,
  };
}

/* =========================================================
   MODERATION REPORT QUEUE
========================================================= */

export async function getChatMessageReportQueue({
  status = "pending",
  limit = 50,
  before = null,
} = {}) {
  const normalizedStatus =
    [
      "all",
      "pending",
      "reviewing",
      "resolved",
      "dismissed",
    ].includes(
      String(
        status ||
          ""
      ).toLowerCase()
    )
      ? String(
          status
        ).toLowerCase()
      : "pending";

  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            50
        ),
        1
      ),
      100
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_message_report_queue",
      {
        p_status:
          normalizedStatus,

        p_limit:
          safeLimit + 1,

        p_before:
          before ||
          null,
      }
    );

  if (error) {
    console.error(
      "getChatMessageReportQueue error:",
      error
    );

    throw error;
  }

  const rows =
    data ||
    [];

  const hasMore =
    rows.length >
    safeLimit;

  const reports =
    hasMore
      ? rows.slice(
          0,
          safeLimit
        )
      : rows;

  return {
    reports,

    hasMore,

    nextCursor:
      reports[
        reports.length -
          1
      ]?.created_at ||
      null,
  };
}

export async function reviewChatMessageReport({
  reportId,
  status,
  moderatorNote = "",
} = {}) {
  if (!reportId) {
    throw new Error(
      "Missing report ID"
    );
  }

  const normalizedStatus =
    String(
      status ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    ![
      "reviewing",
      "resolved",
      "dismissed",
    ].includes(
      normalizedStatus
    )
  ) {
    throw new Error(
      "Invalid moderation status"
    );
  }

  const cleanNote =
    String(
      moderatorNote ||
        ""
    ).trim();

  if (
    cleanNote.length >
    2000
  ) {
    throw new Error(
      "Moderator note is too long."
    );
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "review_chat_message_report",
      {
        p_report_id:
          reportId,

        p_status:
          normalizedStatus,

        p_moderator_note:
          cleanNote ||
          null,
      }
    );

  if (error) {
    console.error(
      "reviewChatMessageReport error:",
      error
    );

    throw error;
  }

  return data;
}

/* =========================================================
   MODERATION ACTIONS
========================================================= */

export async function moderateDeleteReportedMessage({
  reportId,
  moderatorNote = "",
} = {}) {
  if (!reportId) {
    throw new Error(
      "Missing report ID"
    );
  }

  const cleanNote =
    String(
      moderatorNote ||
        ""
    ).trim();

  if (
    cleanNote.length >
    2000
  ) {
    throw new Error(
      "Moderator note is too long."
    );
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "moderator_delete_reported_message",
      {
        p_report_id:
          reportId,

        p_moderator_note:
          cleanNote ||
          null,
      }
    );

  if (error) {
    console.error(
      "moderateDeleteReportedMessage error:",
      error
    );

    throw error;
  }

  return data;
}

export async function moderateDeleteAndResolveReport({
  reportId,
  moderatorNote = "",
} = {}) {
  if (!reportId) {
    throw new Error(
      "Missing report ID"
    );
  }

  const cleanNote =
    String(
      moderatorNote ||
        ""
    ).trim();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "moderator_delete_and_resolve_report",
      {
        p_report_id:
          reportId,

        p_moderator_note:
          cleanNote ||
          null,
      }
    );

  if (error) {
    console.error(
      "moderateDeleteAndResolveReport error:",
      error
    );

    throw error;
  }

  return data;
}

/* =========================================================
   DELETE MESSAGE
========================================================= */

export async function cleanupDeletedChatMessageAttachments(
  messageId
) {
  if (!messageId) {
    return {
      removed:
        0,

      failed:
        0,
    };
  }

  const {
    data: pathRows,
    error: pathError,
  } =
    await supabase.rpc(
      "get_deleted_chat_message_attachment_paths",
      {
        p_message_id:
          messageId,
      }
    );

  if (pathError) {
    console.error(
      "get_deleted_chat_message_attachment_paths error:",
      pathError
    );

    return {
      removed:
        0,

      failed:
        0,
    };
  }

  const paths =
    [
      ...new Set(
        (
          pathRows ||
          []
        )
          .map(
            (
              row
            ) =>
              row.storage_path
          )
          .filter(
            Boolean
          )
      ),
    ];

  if (
    paths.length ===
    0
  ) {
    return {
      removed:
        0,

      failed:
        0,
    };
  }

  const {
    error: storageError,
  } =
    await supabase.storage
      .from(
        "chat-attachments"
      )
      .remove(
        paths
      );

  if (storageError) {
    console.error(
      "Deleted attachment storage cleanup error:",
      storageError
    );

    return {
      removed:
        0,

      failed:
        paths.length,
    };
  }

  const {
    error: finalizeError,
  } =
    await supabase.rpc(
      "finalize_deleted_chat_message_attachments",
      {
        p_message_id:
          messageId,
      }
    );

  if (finalizeError) {
    console.error(
      "finalize_deleted_chat_message_attachments error:",
      finalizeError
    );

    return {
      removed:
        paths.length,

      failed:
        0,
    };
  }

  return {
    removed:
      paths.length,

    failed:
      0,
  };
}

export async function cleanupMyDeletedChatAttachments({
  limit = 100,
} = {}) {
  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit ||
            100
        ),
        1
      ),
      500
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_my_deleted_chat_attachment_paths",
      {
        p_limit:
          safeLimit,
      }
    );

  if (error) {
    console.error(
      "get_my_deleted_chat_attachment_paths error:",
      error
    );

    throw error;
  }

  const rows =
    data ||
    [];

  if (
    rows.length ===
    0
  ) {
    return {
      removed:
        0,

      failed:
        0,
    };
  }

  const grouped =
    new Map();

  for (
    const row of
    rows
  ) {
    if (
      !row?.message_id ||
      !row?.storage_path
    ) {
      continue;
    }

    if (
      !grouped.has(
        row.message_id
      )
    ) {
      grouped.set(
        row.message_id,
        []
      );
    }

    grouped
      .get(
        row.message_id
      )
      .push(
        row.storage_path
      );
  }

  let removed =
    0;

  let failed =
    0;

  for (
    const [
      messageId,
      messagePaths,
    ] of grouped
  ) {
    const uniquePaths =
      [
        ...new Set(
          messagePaths
        ),
      ];

    const {
      error:
        storageError,
    } =
      await supabase.storage
        .from(
          "chat-attachments"
        )
        .remove(
          uniquePaths
        );

    if (
      storageError
    ) {
      console.error(
        "Orphan attachment cleanup error:",
        storageError
      );

      failed +=
        uniquePaths.length;

      continue;
    }

    const {
      error:
        finalizeError,
    } =
      await supabase.rpc(
        "finalize_deleted_chat_message_attachments",
        {
          p_message_id:
            messageId,
        }
      );

    if (
      finalizeError
    ) {
      console.error(
        "Orphan attachment metadata cleanup error:",
        finalizeError
      );
    }

    removed +=
      uniquePaths.length;
  }

  return {
    removed,
    failed,
  };
}

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

  try {
    await cleanupDeletedChatMessageAttachments(
      messageId
    );
  } catch (
    cleanupError
  ) {
    console.error(
      "Attachment cleanup after message delete failed:",
      cleanupError
    );
  }
}

/* =========================================================
   REACTIONS
========================================================= */

export async function getMessageReactionsBatch(
  messageIds
) {
  const ids = [
    ...new Set(
      (
        messageIds ||
        []
      ).filter(
        Boolean
      )
    ),
  ];

  const grouped =
    new Map(
      ids.map(
        (
          id
        ) => [
          id,
          [],
        ]
      )
    );

  if (
    ids.length ===
    0
  ) {
    return grouped;
  }

  /*
    Preferred path:
    one RPC for the whole page.

    Important:
    Do not query chat_reactions.emoji directly here.
    Older deployments may store the reaction value under
    another physical column name while get_message_reactions
    still exposes it as "emoji".
  */
  const {
    data:
      batchRows,
    error:
      batchError,
  } =
    await supabase.rpc(
      "get_message_reactions_batch",
      {
        p_message_ids:
          ids,
      }
    );

  if (
    !batchError
  ) {
    for (
      const row of
      batchRows ||
      []
    ) {
      if (
        !row?.message_id
      ) {
        continue;
      }

      let reactions =
        row.reactions ||
        [];

      if (
        typeof reactions ===
        "string"
      ) {
        try {
          reactions =
            JSON.parse(
              reactions
            );
        } catch {
          reactions =
            [];
        }
      }

      grouped.set(
        row.message_id,
        Array.isArray(
          reactions
        )
          ? reactions
          : []
      );
    }

    return grouped;
  }

  /*
    Compatibility fallback:
    if the batch RPC has not been installed yet,
    use the existing per-message RPC.

    This avoids the repeated 400 errors caused by selecting
    a non-existent physical "emoji" column directly.
  */
  if (
    batchError?.code !==
      "PGRST202" &&
    batchError?.code !==
      "42883"
  ) {
    console.warn(
      "getMessageReactionsBatch batch RPC fallback:",
      batchError
    );
  }

  const fallbackRows =
    await Promise.all(
      ids.map(
        async (
          messageId
        ) => {
          const {
            data:
              reactions,
            error:
              reactionError,
          } =
            await supabase.rpc(
              "get_message_reactions",
              {
                p_message_id:
                  messageId,
              }
            );

          if (
            reactionError
          ) {
            console.error(
              "getMessageReactionsBatch fallback error:",
              reactionError
            );

            return [
              messageId,
              [],
            ];
          }

          return [
            messageId,
            reactions ||
              [],
          ];
        }
      )
    );

  return new Map(
    fallbackRows
  );
}

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
        getMessageBroadcastTopic(
          conversationId
        )
      )

      .on(
        "broadcast",
        {
          event:
            "message:new",
        },

        async ({
          payload,
        }) => {
          if (
            !payload?.messageId ||
            payload.conversationId !==
              conversationId
          ) {
            return;
          }

          try {
            const fastMessage =
              await getMessageByIdFast(
                payload.messageId
              );

            if (
              !fastMessage ||
              fastMessage
                .conversation_id !==
                conversationId
            ) {
              return;
            }

            onMessage?.(
              fastMessage,
              "INSERT"
            );
          } catch (error) {
            console.error(
              "Fast Broadcast message fetch failed:",
              error
            );
          }
        }
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

        async (
          payload
        ) => {
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

        async (
          payload
        ) => {
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

          if (
            status ===
            "SUBSCRIBED"
          ) {
            activeMessageChannels.set(
              conversationId,
              channel
            );

            messageConversationByChannel.set(
              channel,
              conversationId
            );
          }

          if (
            status ===
              "CHANNEL_ERROR" ||
            status ===
              "TIMED_OUT"
          ) {
            if (
              activeMessageChannels.get(
                conversationId
              ) ===
              channel
            ) {
              activeMessageChannels.delete(
                conversationId
              );
            }

            onError?.(
              new Error(
                `Message realtime status: ${status}`
              )
            );
          }
        }
      );

  messageConversationByChannel.set(
    channel,
    conversationId
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

export async function deleteSystemEvent(eventId) {
  if (!eventId) throw new Error("Missing system event ID");
  const { data, error } = await supabase.rpc("delete_chat_system_event", {
    p_event_id: String(eventId),
  });
  if (error) throw error;
  if (data !== true) throw new Error("System event could not be deleted.");
  return true;
}

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
            "*",

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

export async function getMessageReadCounts(
  messageIds
) {
  const ids = [
    ...new Set(
      (
        messageIds ||
        []
      ).filter(
        Boolean
      )
    ),
  ];

  const counts =
    new Map(
      ids.map(
        (
          id
        ) => [
          id,
          0,
        ]
      )
    );

  if (
    ids.length ===
    0
  ) {
    return counts;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "chat_message_reads"
      )
      .select(
        "message_id"
      )
      .in(
        "message_id",
        ids
      );

  if (!error) {
    for (
      const row of
      data ||
      []
    ) {
      if (
        !row?.message_id
      ) {
        continue;
      }

      counts.set(
        row.message_id,
        (
          counts.get(
            row.message_id
          ) ||
          0
        ) +
          1
      );
    }

    return counts;
  }

  console.warn(
    "getMessageReadCounts direct query fallback:",
    error
  );

  const fallback =
    await Promise.all(
      ids.map(
        async (
          messageId
        ) => [
          messageId,
          await getMessageReadCount(
            messageId
          ),
        ]
      )
    );

  return new Map(
    fallback
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

  const conversationId =
    messageConversationByChannel.get(
      channel
    );

  if (
    conversationId &&
    activeMessageChannels.get(
      conversationId
    ) ===
      channel
  ) {
    activeMessageChannels.delete(
      conversationId
    );
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


/* =========================================================
   CHAT NOTIFICATIONS
========================================================= */

export async function getChatNotifications({
  limit = 50,
  before = null,
} = {}) {
  const pageSize =
    Math.max(
      1,
      Math.min(
        Number(limit) ||
          50,
        100
      )
    );

  let query =
    supabase
      .from(
        "chat_notifications"
      )
      .select(`
        id,
        user_id,
        actor_id,
        conversation_id,
        message_id,
        notification_type,
        title,
        body,
        is_read,
        read_at,
        created_at,

        actor:profiles!chat_notifications_actor_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        ),

        conversation:chat_conversations!chat_notifications_conversation_id_fkey (
          id,
          type,
          title,
          avatar_url,
          slug,
          is_private
        )
      `)
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(
        pageSize + 1
      );

  if (before) {
    query =
      query.lt(
        "created_at",
        before
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    console.error(
      "getChatNotifications error:",
      error
    );

    throw error;
  }

  const rows =
    data || [];

  const hasMore =
    rows.length >
    pageSize;

  const notifications =
    rows.slice(
      0,
      pageSize
    );

  return {
    notifications,

    hasMore,

    nextCursor:
      notifications[
        notifications.length -
          1
      ]?.created_at ||
      null,
  };
}

export async function getChatNotificationUnreadCount() {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_notification_unread_count"
    );

  if (error) {
    console.error(
      "getChatNotificationUnreadCount error:",
      error
    );

    return 0;
  }

  return Number(
    data ||
      0
  );
}

export async function markChatNotificationRead(
  notificationId
) {
  if (!notificationId) {
    return false;
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "mark_chat_notification_read",
      {
        p_notification_id:
          notificationId,
      }
    );

  if (error) {
    console.error(
      "markChatNotificationRead error:",
      error
    );

    throw error;
  }

  return Boolean(
    data
  );
}

export async function markChatConversationNotificationsRead(
  conversationId
) {
  if (!conversationId) {
    return 0;
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "mark_chat_conversation_notifications_read",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "markChatConversationNotificationsRead error:",
      error
    );

    throw error;
  }

  return Number(
    data ||
      0
  );
}

export async function markAllChatNotificationsRead() {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "mark_all_chat_notifications_read"
    );

  if (error) {
    console.error(
      "markAllChatNotificationsRead error:",
      error
    );

    throw error;
  }

  return Number(
    data ||
      0
  );
}


export async function getChatNotificationPreference(
  conversationId = null
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_chat_notification_preference",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "getChatNotificationPreference error:",
      error
    );

    throw error;
  }

  const row =
    Array.isArray(data)
      ? data[0] || null
      : data || null;

  return {
    notifications_enabled:
      row?.notifications_enabled !== false,

    message_enabled:
      row?.message_enabled !== false,

    mention_enabled:
      row?.mention_enabled !== false,

    reply_enabled:
      row?.reply_enabled !== false,

    system_enabled:
      row?.system_enabled !== false,

    mute_until:
      row?.mute_until || null,
  };
}

export async function setGlobalChatNotificationPreference({
  notificationsEnabled = true,
  messageEnabled = true,
  mentionEnabled = true,
  replyEnabled = true,
  systemEnabled = true,
} = {}) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "set_global_chat_notification_preference",
      {
        p_notifications_enabled:
          Boolean(notificationsEnabled),

        p_message_enabled:
          Boolean(messageEnabled),

        p_mention_enabled:
          Boolean(mentionEnabled),

        p_reply_enabled:
          Boolean(replyEnabled),

        p_system_enabled:
          Boolean(systemEnabled),
      }
    );

  if (error) {
    console.error(
      "setGlobalChatNotificationPreference error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function setChatConversationNotificationPreference({
  conversationId,
  notificationsEnabled = true,
  messageEnabled = true,
  mentionEnabled = true,
  replyEnabled = true,
  systemEnabled = true,
  muteUntil = null,
} = {}) {
  if (!conversationId) {
    throw new Error(
      "Missing conversation ID"
    );
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "set_chat_conversation_notification_preference",
      {
        p_conversation_id:
          conversationId,

        p_notifications_enabled:
          Boolean(notificationsEnabled),

        p_message_enabled:
          Boolean(messageEnabled),

        p_mention_enabled:
          Boolean(mentionEnabled),

        p_reply_enabled:
          Boolean(replyEnabled),

        p_system_enabled:
          Boolean(systemEnabled),

        p_mute_until:
          muteUntil || null,
      }
    );

  if (error) {
    console.error(
      "setChatConversationNotificationPreference error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function clearChatConversationNotificationPreference(
  conversationId
) {
  if (!conversationId) {
    return false;
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "clear_chat_conversation_notification_preference",
      {
        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "clearChatConversationNotificationPreference error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export function subscribeToChatNotificationPreferences(
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
        `chat-notification-preferences-${userId}-${Date.now()}`
      )
      .on(
        "postgres_changes",
        {
          event:
            "*",

          schema:
            "public",

          table:
            "chat_notification_preferences",

          filter:
            `user_id=eq.${userId}`,
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
              "Chat notification preferences realtime error:",
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

export function subscribeToChatNotifications(
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
        `chat-notifications-${userId}-${Date.now()}`
      )

      .on(
        "postgres_changes",
        {
          event:
            "*",

          schema:
            "public",

          table:
            "chat_notifications",

          filter:
            `user_id=eq.${userId}`,
        },

        (
          payload
        ) => {
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
              "Chat notifications realtime error:",
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
   COMMUNITY SERVICE LAYER
========================================================= */

export async function createCommunity({
  title,
  description = "",
  avatarUrl = null,
  isPrivate = false,
  slug = null,
}) {
  const cleanTitle = title?.trim();

  if (!cleanTitle) {
    throw new Error(
      "Community name is required"
    );
  }

  const cleanSlug = isPrivate
    ? null
    : slug
        ?.trim()
        .replace(/^@/, "")
        .toLowerCase() || null;

  const { data, error } =
    await supabase.rpc(
      "create_community",
      {
        p_title:
          cleanTitle,

        p_description:
          description?.trim() ||
          null,

        p_avatar_url:
          avatarUrl ||
          null,

        p_is_private:
          Boolean(isPrivate),

        p_slug:
          cleanSlug,
      }
    );

  if (error) {
    console.error(
      "createCommunity error:",
      error
    );

    throw error;
  }

  return data;
}

export async function updateCommunity({
  communityId,
  title,
  description = "",
  avatarUrl = null,
  isPrivate = false,
  slug = null,
}) {
  if (!communityId) {
    throw new Error(
      "Missing community ID"
    );
  }

  const cleanTitle =
    title?.trim();

  if (!cleanTitle) {
    throw new Error(
      "Community name is required"
    );
  }

  const cleanSlug = isPrivate
    ? null
    : slug
        ?.trim()
        .replace(/^@/, "")
        .toLowerCase() || null;

  const { data, error } =
    await supabase.rpc(
      "update_community",
      {
        p_community_id:
          communityId,

        p_title:
          cleanTitle,

        p_description:
          description?.trim() ||
          null,

        p_avatar_url:
          avatarUrl ||
          null,

        p_is_private:
          Boolean(isPrivate),

        p_slug:
          cleanSlug,
      }
    );

  if (error) {
    console.error(
      "updateCommunity error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function searchPublicCommunities(
  query = ""
) {
  const { data, error } =
    await supabase.rpc(
      "search_public_communities",
      {
        p_query:
          query?.trim() ||
          "",
      }
    );

  if (error) {
    console.error(
      "searchPublicCommunities error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function getPublicCommunityBySlug(
  slug
) {
  const cleanSlug =
    slug
      ?.trim()
      .replace(/^@/, "")
      .toLowerCase();

  if (!cleanSlug) {
    throw new Error(
      "Community username is required"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "get_public_community_by_slug",
      {
        p_slug:
          cleanSlug,
      }
    );

  if (error) {
    console.error(
      "getPublicCommunityBySlug error:",
      error
    );

    throw error;
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

export async function joinPublicCommunity(
  communityId
) {
  if (!communityId) {
    throw new Error(
      "Missing community ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "join_public_community",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "joinPublicCommunity error:",
      error
    );

    throw error;
  }

  return data;
}

export async function leaveCommunity(
  communityId
) {
  if (!communityId) {
    throw new Error(
      "Missing community ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "leave_community",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "leaveCommunity error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function deleteCommunity(
  communityId
) {
  if (!communityId) {
    throw new Error(
      "Missing community ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "delete_community",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "deleteCommunity error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function addCommunityMember(
  communityId,
  userId
) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "add_community_member",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "addCommunityMember error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function removeCommunityMember(
  communityId,
  userId
) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "remove_community_member",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "removeCommunityMember error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function setCommunityMemberRole(
  communityId,
  userId,
  role
) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const allowedRoles = [
    "admin",
    "moderator",
    "member",
  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {
    throw new Error(
      "Invalid community role"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "set_community_member_role",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,

        p_role:
          role,
      }
    );

  if (error) {
    console.error(
      "setCommunityMemberRole error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function transferCommunityOwnership(
  communityId,
  newOwnerId
) {
  if (
    !communityId ||
    !newOwnerId
  ) {
    throw new Error(
      "Missing community or new owner ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "transfer_community_ownership",
      {
        p_community_id:
          communityId,

        p_new_owner_id:
          newOwnerId,
      }
    );

  if (error) {
    console.error(
      "transferCommunityOwnership error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function banCommunityMember({
  communityId,
  userId,
  reason = null,
}) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "ban_community_member",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,

        p_reason:
          reason?.trim() ||
          null,
      }
    );

  if (error) {
    console.error(
      "banCommunityMember error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function unbanCommunityMember(
  communityId,
  userId
) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "unban_community_member",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "unbanCommunityMember error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function muteCommunityMember({
  communityId,
  userId,
  mutedUntil = null,
  reason = null,
}) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "mute_community_member",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,

        p_muted_until:
          mutedUntil ||
          null,

        p_reason:
          reason?.trim() ||
          null,
      }
    );

  if (error) {
    console.error(
      "muteCommunityMember error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function unmuteCommunityMember(
  communityId,
  userId
) {
  if (
    !communityId ||
    !userId
  ) {
    throw new Error(
      "Missing community or user ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "unmute_community_member",
      {
        p_community_id:
          communityId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    console.error(
      "unmuteCommunityMember error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function attachConversationToCommunity(
  communityId,
  conversationId
) {
  if (
    !communityId ||
    !conversationId
  ) {
    throw new Error(
      "Missing community or conversation ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "attach_conversation_to_community",
      {
        p_community_id:
          communityId,

        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "attachConversationToCommunity error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function detachConversationFromCommunity(
  communityId,
  conversationId
) {
  if (
    !communityId ||
    !conversationId
  ) {
    throw new Error(
      "Missing community or conversation ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "detach_conversation_from_community",
      {
        p_community_id:
          communityId,

        p_conversation_id:
          conversationId,
      }
    );

  if (error) {
    console.error(
      "detachConversationFromCommunity error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function getCommunityConversations(
  communityId
) {
  if (!communityId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_community_conversations",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "getCommunityConversations error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function createCommunityInviteLink({
  communityId,
  expiresAt = null,
  maxUses = null,
}) {
  if (!communityId) {
    throw new Error(
      "Missing community ID"
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
      "create_community_invite_link",
      {
        p_community_id:
          communityId,

        p_expires_at:
          expiresAt ||
          null,

        p_max_uses:
          normalizedMaxUses,
      }
    );

  if (error) {
    console.error(
      "createCommunityInviteLink error:",
      error
    );

    throw error;
  }

  return data;
}

export async function getCommunityInviteLinks(
  communityId
) {
  if (!communityId) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "community_invite_links"
      )
      .select(`
        id,
        community_id,
        token,
        created_by,
        is_active,
        expires_at,
        max_uses,
        use_count,
        created_at
      `)
      .eq(
        "community_id",
        communityId
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
      "getCommunityInviteLinks error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function revokeCommunityInviteLink(
  inviteId
) {
  if (!inviteId) {
    throw new Error(
      "Missing community invite ID"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "revoke_community_invite_link",
      {
        p_invite_id:
          inviteId,
      }
    );

  if (error) {
    console.error(
      "revokeCommunityInviteLink error:",
      error
    );

    throw error;
  }

  return Boolean(data);
}

export async function getCommunityInvitePreview(
  token
) {
  const cleanToken =
    token?.trim();

  if (!cleanToken) {
    throw new Error(
      "Missing community invite token"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "get_community_invite_preview",
      {
        p_token:
          cleanToken,
      }
    );

  if (error) {
    console.error(
      "getCommunityInvitePreview error:",
      error
    );

    throw error;
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

export async function joinCommunityByInvite(
  token
) {
  const cleanToken =
    token?.trim();

  if (!cleanToken) {
    throw new Error(
      "Missing community invite token"
    );
  }

  const { data, error } =
    await supabase.rpc(
      "join_community_by_invite",
      {
        p_token:
          cleanToken,
      }
    );

  if (error) {
    console.error(
      "joinCommunityByInvite error:",
      error
    );

    throw error;
  }

  return data;
}

export async function getCommunityMembers(
  communityId
) {
  if (!communityId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_community_members",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "getCommunityMembers error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function getCommunityBans(
  communityId
) {
  if (!communityId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_community_bans",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "getCommunityBans error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function getCommunityMutes(
  communityId
) {
  if (!communityId) {
    return [];
  }

  const { data, error } =
    await supabase.rpc(
      "get_community_mutes",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "getCommunityMutes error:",
      error
    );

    throw error;
  }

  return data || [];
}

export async function canSendCommunityMessage(
  communityId
) {
  if (!communityId) {
    return false;
  }

  const { data, error } =
    await supabase.rpc(
      "can_send_community_message",
      {
        p_community_id:
          communityId,
      }
    );

  if (error) {
    console.error(
      "canSendCommunityMessage error:",
      error
    );

    return false;
  }

  return Boolean(data);
}