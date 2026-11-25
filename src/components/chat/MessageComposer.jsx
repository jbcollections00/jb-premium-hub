import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getConversationMembers,
} from "../../services/chatService";

const MAX_ATTACHMENT_SIZE =
  25 * 1024 * 1024;

const CHAT_DRAFT_PREFIX =
  "jbph-chat-draft:";

const MAX_DRAFT_LENGTH =
  10000;

function getDraftStorageKey(
  conversationId
) {
  if (
    !conversationId
  ) {
    return null;
  }

  return `${CHAT_DRAFT_PREFIX}${conversationId}`;
}

function readStoredDraft(
  conversationId
) {
  const key =
    getDraftStorageKey(
      conversationId
    );

  if (
    !key ||
    typeof window ===
      "undefined"
  ) {
    return "";
  }

  try {
    const stored =
      window.localStorage.getItem(
        key
      );

    if (!stored) {
      return "";
    }

    const parsed =
      JSON.parse(
        stored
      );

    if (
      typeof parsed?.text !==
        "string"
    ) {
      return "";
    }

    return parsed.text.slice(
      0,
      MAX_DRAFT_LENGTH
    );
  } catch (
    error
  ) {
    console.error(
      "Read chat draft error:",
      error
    );

    return "";
  }
}

function writeStoredDraft(
  conversationId,
  text
) {
  const key =
    getDraftStorageKey(
      conversationId
    );

  if (
    !key ||
    typeof window ===
      "undefined"
  ) {
    return;
  }

  try {
    const value =
      String(
        text ||
          ""
      ).slice(
        0,
        MAX_DRAFT_LENGTH
      );

    if (!value.trim()) {
      window.localStorage.removeItem(
        key
      );

      return;
    }

    window.localStorage.setItem(
      key,
      JSON.stringify({
        text:
          value,

        updatedAt:
          new Date().toISOString(),
      })
    );
  } catch (
    error
  ) {
    console.error(
      "Write chat draft error:",
      error
    );
  }
}

function clearStoredDraft(
  conversationId
) {
  const key =
    getDraftStorageKey(
      conversationId
    );

  if (
    !key ||
    typeof window ===
      "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.removeItem(
      key
    );
  } catch (
    error
  ) {
    console.error(
      "Clear chat draft error:",
      error
    );
  }
}

function formatBytes(value) {
  const bytes = Number(value || 0);

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  }

  const mb = kb / 1024;

  return `${mb.toFixed(mb >= 100 ? 0 : 2)} MB`;
}

function getFileKind(file) {
  const mime = file?.type || "";

  if (mime.startsWith("image/")) {
    return "image";
  }

  if (mime.startsWith("video/")) {
    return "video";
  }

  return "file";
}

function getFileIcon(file) {
  const name = file?.name?.toLowerCase() || "";
  const mime = file?.type || "";

  if (
    mime === "application/pdf" ||
    name.endsWith(".pdf")
  ) {
    return "📕";
  }

  if (
    name.endsWith(".zip") ||
    name.endsWith(".rar")
  ) {
    return "🗜️";
  }

  if (
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return "📝";
  }

  if (
    name.endsWith(".xls") ||
    name.endsWith(".xlsx")
  ) {
    return "📊";
  }

  return "📄";
}

export default function MessageComposer({
  conversationId,
  conversationType = "direct",
  onSend,
  onTypingChange,
  replyingTo = null,
  onCancelReply,
  disabled = false,
  enterToSend = true,
}) {
  const [message, setMessage] =
    useState("");

  const [file, setFile] =
    useState(null);

  const [sending, setSending] =
    useState(false);

  const [
    sendError,
    setSendError,
  ] = useState("");

  const [
    isDragging,
    setIsDragging,
  ] = useState(false);

  const [
    members,
    setMembers,
  ] = useState([]);

  const [
    mentionQuery,
    setMentionQuery,
  ] = useState("");

  const [
    mentionStart,
    setMentionStart,
  ] = useState(null);

  const [
    mentionOpen,
    setMentionOpen,
  ] = useState(false);

  const [
    selectedMentionIndex,
    setSelectedMentionIndex,
  ] = useState(0);

  const typingTimeoutRef =
    useRef(null);

  const fileInputRef =
    useRef(null);

  const textareaRef =
    useRef(null);

  const pendingRequestIdRef =
    useRef(null);

  const draftSaveTimerRef =
    useRef(null);

  const loadedDraftConversationRef =
    useRef(null);

  const onTypingChangeRef =
    useRef(onTypingChange);

  useEffect(() => {
    onTypingChangeRef.current =
      onTypingChange;
  }, [
    onTypingChange,
  ]);

  useEffect(() => {
    pendingRequestIdRef.current =
      null;

    setSendError(
      ""
    );

    if (
      draftSaveTimerRef.current
    ) {
      clearTimeout(
        draftSaveTimerRef.current
      );

      draftSaveTimerRef.current =
        null;
    }

    if (
      !conversationId
    ) {
      loadedDraftConversationRef.current =
        null;

      setMessage(
        ""
      );

      return;
    }

    const storedDraft =
      readStoredDraft(
        conversationId
      );

    loadedDraftConversationRef.current =
      conversationId;

    setMessage(
      storedDraft
    );
  }, [
    conversationId,
  ]);

  useEffect(() => {
    if (
      !conversationId ||
      loadedDraftConversationRef.current !==
        conversationId
    ) {
      return;
    }

    if (
      draftSaveTimerRef.current
    ) {
      clearTimeout(
        draftSaveTimerRef.current
      );
    }

    draftSaveTimerRef.current =
      setTimeout(
        () => {
          writeStoredDraft(
            conversationId,
            message
          );

          draftSaveTimerRef.current =
            null;
        },
        350
      );

    return () => {
      if (
        draftSaveTimerRef.current
      ) {
        clearTimeout(
          draftSaveTimerRef.current
        );

        draftSaveTimerRef.current =
          null;
      }
    };
  }, [
    conversationId,
    message,
  ]);

  /*
    LOAD MEMBERS FOR @MENTIONS
  */
  useEffect(() => {
    let cancelled =
      false;

    const loadMembers =
      async () => {
        if (
          !conversationId ||
          conversationType ===
            "direct"
        ) {
          setMembers(
            []
          );

          setMentionOpen(
            false
          );

          return;
        }

        try {
          const rows =
            await getConversationMembers(
              conversationId
            );

          if (
            cancelled
          ) {
            return;
          }

          setMembers(
            rows || []
          );
        } catch (error) {
          console.error(
            "Load mention members error:",
            error
          );

          if (
            !cancelled
          ) {
            setMembers(
              []
            );
          }
        }
      };

    loadMembers();

    return () => {
      cancelled =
        true;
    };
  }, [
    conversationId,
    conversationType,
  ]);

  /*
    ATTACHMENT PREVIEW
  */
  const previewUrl =
    useMemo(() => {
      if (!file) {
        return null;
      }

      if (
        file.type.startsWith(
          "image/"
        ) ||
        file.type.startsWith(
          "video/"
        )
      ) {
        return URL.createObjectURL(
          file
        );
      }

      return null;
    }, [
      file,
    ]);

  const fileKind =
    useMemo(
      () =>
        getFileKind(
          file
        ),
      [file]
    );

  useEffect(() => {
    return () => {
      if (
        previewUrl
      ) {
        URL.revokeObjectURL(
          previewUrl
        );
      }
    };
  }, [
    previewUrl,
  ]);

  /*
    TYPING CLEANUP
  */
  useEffect(() => {
    return () => {
      if (
        typingTimeoutRef.current
      ) {
        clearTimeout(
          typingTimeoutRef.current
        );
      }

      onTypingChangeRef.current?.(
        false
      );
    };
  }, []);

  /*
    RESET MENTION STATE
    WHEN CHAT CHANGES
  */
  useEffect(() => {
    setMentionOpen(
      false
    );

    setMentionQuery(
      ""
    );

    setMentionStart(
      null
    );

    setSelectedMentionIndex(
      0
    );
  }, [
    conversationId,
  ]);

  const stopTypingSoon =
    () => {
      if (
        typingTimeoutRef.current
      ) {
        clearTimeout(
          typingTimeoutRef.current
        );
      }

      typingTimeoutRef.current =
        setTimeout(
          () => {
            onTypingChangeRef.current?.(
              false
            );

            typingTimeoutRef.current =
              null;
          },
          1200
        );
    };

  /*
    DETECT ACTIVE @MENTION

    Examples:
    @
    @john
    Hello @john
  */
  const detectMention =
    (
      value,
      cursorPosition
    ) => {
      if (
        conversationType ===
          "direct"
      ) {
        setMentionOpen(
          false
        );

        return;
      }

      const beforeCursor =
        value.slice(
          0,
          cursorPosition
        );

      const match =
        beforeCursor.match(
          /(?:^|\s)@([a-zA-Z0-9._-]*)$/
        );

      if (
        !match
      ) {
        setMentionOpen(
          false
        );

        setMentionQuery(
          ""
        );

        setMentionStart(
          null
        );

        return;
      }

      const query =
        match[1] || "";

      const atIndex =
        beforeCursor.lastIndexOf(
          "@"
        );

      setMentionQuery(
        query
      );

      setMentionStart(
        atIndex
      );

      setMentionOpen(
        true
      );

      setSelectedMentionIndex(
        0
      );
    };

  /*
    VALID USERNAME-ONLY MENTIONS

    Allowed:
    john
    john_123
    john.doe
    john-doe

    Not allowed:
    JB COLLECTIONS
    john@email.com
    @john
  */
  const mentionResults =
    useMemo(() => {
      if (
        !mentionOpen
      ) {
        return [];
      }

      const query =
        mentionQuery
          .trim()
          .toLowerCase();

      return (
        members || []
      )
        .filter(
          (
            member
          ) => {
            const profile =
              member.profiles ||
              {};

            const username =
              profile.username
                ?.trim() ||
              "";

            const validUsername =
              /^[a-zA-Z0-9._-]+$/.test(
                username
              );

            if (
              !validUsername
            ) {
              return false;
            }

            const fullName =
              profile.full_name
                ?.trim()
                .toLowerCase() ||
              "";

            const cleanUsername =
              username.toLowerCase();

            if (
              !query
            ) {
              return true;
            }

            return (
              cleanUsername.includes(
                query
              ) ||
              fullName.includes(
                query
              )
            );
          }
        )
        .slice(
          0,
          8
        );
    }, [
      members,
      mentionOpen,
      mentionQuery,
    ]);

  /*
    INSERT SELECTED @USERNAME
  */
  const insertMention =
    (
      member
    ) => {
      const profile =
        member?.profiles ||
        {};

      const username =
        profile.username
          ?.trim();

      if (
        !username ||
        !/^[a-zA-Z0-9._-]+$/.test(
          username
        )
      ) {
        return;
      }

      const mentionText =
        `@${username}`;

      const textarea =
        textareaRef.current;

      const cursorPosition =
        textarea
          ?.selectionStart ??
        message.length;

      const start =
        mentionStart ??
        message.lastIndexOf(
          "@",
          cursorPosition
        );

      if (
        start < 0
      ) {
        return;
      }

      const before =
        message.slice(
          0,
          start
        );

      const after =
        message.slice(
          cursorPosition
        );

      const newMessage =
        `${before}${mentionText} ${after}`;

      const newCursor =
        before.length +
        mentionText.length +
        1;

      setMessage(
        newMessage
      );

      setMentionOpen(
        false
      );

      setMentionQuery(
        ""
      );

      setMentionStart(
        null
      );

      setSelectedMentionIndex(
        0
      );

      onTypingChangeRef.current?.(
        true
      );

      stopTypingSoon();

      requestAnimationFrame(
        () => {
          textareaRef.current?.focus();

          textareaRef.current?.setSelectionRange(
            newCursor,
            newCursor
          );
        }
      );
    };

  /*
    MESSAGE INPUT CHANGE
  */
  const handleChange =
    (
      event
    ) => {
      const value =
        event.target.value;

      const cursorPosition =
        event.target
          .selectionStart ??
        value.length;

      setMessage(
        value
      );

      setSendError(
        ""
      );

      detectMention(
        value,
        cursorPosition
      );

      const hasText =
        Boolean(
          value.trim()
        );

      onTypingChangeRef.current?.(
        hasText
      );

      if (
        hasText
      ) {
        stopTypingSoon();
      } else {
        if (
          typingTimeoutRef.current
        ) {
          clearTimeout(
            typingTimeoutRef.current
          );

          typingTimeoutRef.current =
            null;
        }

        onTypingChangeRef.current?.(
          false
        );
      }
    };

  /*
    FILE
  */

  const selectFile =
    (
      selected
    ) => {
      if (!selected) {
        return;
      }

      pendingRequestIdRef.current =
        null;

      setSendError(
        ""
      );

      if (
        selected.size >
        MAX_ATTACHMENT_SIZE
      ) {
        setSendError(
          "Attachment is too large. Maximum size is 25 MB."
        );

        return;
      }

      setFile(
        selected
      );
    };

  const handleFileChange =
    (
      event
    ) => {
      const selected =
        event.target.files?.[0];

      event.target.value =
        "";

      selectFile(
        selected
      );
    };

  const handleDragOver =
    (
      event
    ) => {
      event.preventDefault();

      if (
        disabled ||
        sending
      ) {
        return;
      }

      setIsDragging(
        true
      );
    };

  const handleDragLeave =
    (
      event
    ) => {
      event.preventDefault();

      setIsDragging(
        false
      );
    };

  const handleDrop =
    (
      event
    ) => {
      event.preventDefault();

      setIsDragging(
        false
      );

      if (
        disabled ||
        sending
      ) {
        return;
      }

      selectFile(
        event.dataTransfer
          ?.files?.[0]
      );
    };

  const removeFile =
    () => {
      if (sending) {
        return;
      }

      setFile(
        null
      );

      pendingRequestIdRef.current =
        null;

      setSendError(
        ""
      );
    };

  /*
    SEND
  */
  const handleSend =
    async () => {
      const text =
        message.trim();

      if (
        (!text && !file) ||
        sending ||
        disabled
      ) {
        return;
      }

      const requestId =
        pendingRequestIdRef.current ||
        crypto.randomUUID();

      pendingRequestIdRef.current =
        requestId;

      try {
        setSending(
          true
        );

        setSendError(
          ""
        );

        setMentionOpen(
          false
        );

        if (
          typingTimeoutRef.current
        ) {
          clearTimeout(
            typingTimeoutRef.current
          );

          typingTimeoutRef.current =
            null;
        }

        onTypingChangeRef.current?.(
          false
        );

        await onSend?.(
          text,
          file,
          requestId
        );

        pendingRequestIdRef.current =
          null;

        clearStoredDraft(
          conversationId
        );

        setMessage(
          ""
        );

        setFile(
          null
        );

        setMentionQuery(
          ""
        );

        setMentionStart(
          null
        );

        setSelectedMentionIndex(
          0
        );
      } catch (error) {
        console.error(
          "Send message error:",
          error
        );

        setSendError(
          error?.message ||
            "Unable to send this message. Please try again."
        );
      } finally {
        setSending(
          false
        );
      }
    };

  useEffect(() => {
    return () => {
      if (
        draftSaveTimerRef.current
      ) {
        clearTimeout(
          draftSaveTimerRef.current
        );
      }
    };
  }, []);

  /*
    KEYBOARD CONTROLS
  */
  const handleKeyDown =
    (
      event
    ) => {
      if (
        mentionOpen &&
        mentionResults.length >
          0
      ) {
        if (
          event.key ===
          "ArrowDown"
        ) {
          event.preventDefault();

          setSelectedMentionIndex(
            (
              previous
            ) =>
              previous + 1 >=
              mentionResults.length
                ? 0
                : previous + 1
          );

          return;
        }

        if (
          event.key ===
          "ArrowUp"
        ) {
          event.preventDefault();

          setSelectedMentionIndex(
            (
              previous
            ) =>
              previous - 1 < 0
                ? mentionResults.length -
                  1
                : previous - 1
          );

          return;
        }

        if (
          event.key ===
            "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();

          insertMention(
            mentionResults[
              selectedMentionIndex
            ]
          );

          return;
        }

        if (
          event.key ===
          "Escape"
        ) {
          event.preventDefault();

          setMentionOpen(
            false
          );

          return;
        }
      }

      if (
        event.key ===
          "Escape" &&
        replyingTo
      ) {
        event.preventDefault();
        onCancelReply?.();

        requestAnimationFrame(
          () => textareaRef.current?.focus()
        );

        return;
      }

      if (
        event.key ===
          "Enter" &&
        !event.shiftKey &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        (enterToSend ? !event.ctrlKey && !event.metaKey && !event.altKey : (event.ctrlKey || event.metaKey))
      ) {
        event.preventDefault();

        handleSend();
      }
    };

  /*
    RE-CHECK MENTION WHEN
    CURSOR IS MOVED
  */
  const handleTextareaClick =
    (
      event
    ) => {
      const cursorPosition =
        event.currentTarget
          .selectionStart ??
        message.length;

      detectMention(
        message,
        cursorPosition
      );
    };

  const replyName =
    replyingTo?.sender
      ?.full_name?.trim() ||
    replyingTo?.sender
      ?.username?.trim() ||
    "User";

  const sendStatusText =
    sending
      ? file
        ? "Uploading and sending attachment..."
        : "Sending message..."
      : "";

  return (
    <div
      className={`relative flex-shrink-0 border-t bg-white ${
        isDragging
          ? "ring-2 ring-inset ring-blue-400"
          : ""
      }`}
      onDragOver={
        handleDragOver
      }
      onDragLeave={
        handleDragLeave
      }
      onDrop={
        handleDrop
      }
    >

      {/* REPLY PREVIEW */}
      {replyingTo && (
        <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2">
          <div className="min-w-0 flex-1 border-l-4 border-blue-500 pl-3">
            <div className="text-xs font-semibold text-blue-600">
              Replying to{" "}
              {replyName}
            </div>

            <div className="truncate text-xs text-gray-500">
              {replyingTo.deleted_at
                ? "Message deleted"
                : replyingTo.message ||
                  "Attachment"}
            </div>
          </div>

          <button
            type="button"
            onClick={
              onCancelReply
            }
            disabled={
              sending
            }
            className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 disabled:opacity-40"
            aria-label="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}

      {/* DRAG DROP */}
      {isDragging && (
        <div className="border-b bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700">
          Drop file to attach
        </div>
      )}

      {/* FILE PREVIEW */}
      {file && (
        <div className="border-b bg-gray-50 px-3 py-3">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

            {fileKind ===
              "image" &&
              previewUrl && (
                <div className="bg-gray-100">
                  <img
                    src={
                      previewUrl
                    }
                    alt="Attachment preview"
                    className="max-h-56 w-full object-contain"
                  />
                </div>
              )}

            {fileKind ===
              "video" &&
              previewUrl && (
                <div className="bg-black">
                  <video
                    src={
                      previewUrl
                    }
                    className="max-h-56 w-full object-contain"
                    controls
                    playsInline
                    preload="metadata"
                  />
                </div>
              )}

            <div className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl">
                {fileKind ===
                "image"
                  ? "🖼️"
                  : fileKind ===
                    "video"
                  ? "🎬"
                  : getFileIcon(
                      file
                    )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-800">
                  {file.name}
                </div>

                <div className="mt-0.5 text-[11px] text-gray-400">
                  {formatBytes(
                    file.size
                  )}{" "}
                  ·{" "}
                  {fileKind ===
                  "image"
                    ? "Image"
                    : fileKind ===
                      "video"
                    ? "Video"
                    : "File"}
                </div>
              </div>

              {!sending && (
                <button
                  type="button"
                  onClick={
                    removeFile
                  }
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm text-gray-600 hover:bg-gray-200"
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              )}
            </div>

            {sending && (
              <div className="border-t bg-blue-50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  Uploading securely...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {sendError && (
        <div
          id="chat-composer-error"
          role="alert"
          className="border-b border-red-100 bg-red-50 px-3 py-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-medium leading-relaxed text-red-700">
              {sendError}
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={
                  handleSend
                }
                disabled={
                  sending
                }
                className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Retry
              </button>

              <button
                type="button"
                onClick={() => {
                  pendingRequestIdRef.current =
                    null;

                  setSendError(
                    ""
                  );
                }}
                className="text-xs font-bold text-red-500"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {sending && (
        <div
          role="status"
          aria-live="polite"
          className="px-3 pt-2 text-[11px] font-medium text-gray-400"
        >
          {sendStatusText}
        </div>
      )}

      {message.trim() && !sending && (
        <div
          role="status"
          aria-live="polite"
          className="px-3 pt-2 text-[10px] font-medium text-gray-400"
        >
          Draft saved automatically for this conversation.
        </div>
      )}

      {/* COMPOSER AREA */}
      <div className="relative p-2 sm:p-3">

        {/* MENTION AUTOCOMPLETE */}
        {mentionOpen &&
          conversationType !==
            "direct" && (
            <div
              id="chat-mention-listbox"
              role="listbox"
              aria-label="Mention member suggestions"
              className="absolute bottom-full left-2 right-2 z-[80] mb-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:left-12 sm:right-auto sm:w-[320px]"
            >

              <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Mention member
              </div>

              {mentionResults.length ===
              0 ? (
                <div className="px-4 py-4 text-center text-sm text-gray-400">
                  No matching members.
                </div>
              ) : (
                mentionResults.map(
                  (
                    member,
                    index
                  ) => {
                    const profile =
                      member.profiles ||
                      {};

                    const name =
                      profile.full_name
                        ?.trim() ||
                      profile.username
                        ?.trim() ||
                      "User";

                    const username =
                      profile.username
                        ?.trim();

                    const active =
                      index ===
                      selectedMentionIndex;

                    return (
                      <button
                        key={
                          member.user_id
                        }
                        type="button"
                        role="option"
                        aria-selected={
                          active
                        }
                        onMouseDown={(
                          event
                        ) => {
                          event.preventDefault();
                        }}
                        onClick={() =>
                          insertMention(
                            member
                          )
                        }
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                          active
                            ? "bg-blue-50"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                          {profile.avatar_url ? (
                            <img
                              src={
                                profile.avatar_url
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            "👤"
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {name}
                          </div>

                          {username && (
                            <div className="truncate text-xs text-blue-500">
                              @{username}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  }
                )
              )}
            </div>
          )}

        <div className="flex items-end gap-2">

          {/* FILE INPUT */}
          <input
            ref={
              fileInputRef
            }
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
            onChange={
              handleFileChange
            }
            className="hidden"
          />

          {/* ATTACH BUTTON */}
          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={
              disabled ||
              sending
            }
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Add attachment"
            title="Attach file"
          >
            📎
          </button>

          {/* TEXTAREA */}
          <textarea
            ref={
              textareaRef
            }
            value={
              message
            }
            disabled={
              disabled ||
              sending
            }
            onChange={
              handleChange
            }
            onKeyDown={
              handleKeyDown
            }
            onClick={
              handleTextareaClick
            }
            onKeyUp={(
              event
            ) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                ].includes(
                  event.key
                )
              ) {
                detectMention(
                  event.currentTarget
                    .value,
                  event.currentTarget
                    .selectionStart ??
                    message.length
                );
              }
            }}
            rows={1}
            aria-label={
              replyingTo
                ? "Reply message"
                : file
                ? "Attachment caption"
                : "Message"
            }
            aria-describedby={
              sendError
                ? "chat-composer-help chat-composer-error"
                : "chat-composer-help"
            }
            aria-controls={
              mentionOpen
                ? "chat-mention-listbox"
                : undefined
            }
            aria-expanded={
              conversationType !== "direct"
                ? mentionOpen
                : undefined
            }
            aria-autocomplete={
              conversationType !== "direct"
                ? "list"
                : undefined
            }
            placeholder={
              sending
                ? "Sending..."
                : file
                ? "Add a caption..."
                : replyingTo
                ? "Write a reply..."
                : conversationType !==
                    "direct"
                ? "Type a message... Use @ to mention"
                : "Type a message..."
            }
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-3xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />

          {/* SEND BUTTON */}
          <button
            type="button"
            disabled={
              disabled ||
              sending ||
              (!message.trim() &&
                !file)
            }
            onClick={
              handleSend
            }
            className="flex h-10 min-w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={
              sending
                ? "Sending"
                : "Send message"
            }
          >
            {sending ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "➤"
            )}
          </button>
        </div>

        <div
          id="chat-composer-help"
          className="mt-1 px-12 text-[10px] text-gray-400"
        >
          {enterToSend
            ? "Enter to send · Shift+Enter for a new line"
            : "Enter for a new line · Ctrl/Cmd+Enter to send"}
          {replyingTo
            ? " · Esc cancels reply"
            : ""}
        </div>
      </div>
    </div>
  );
}