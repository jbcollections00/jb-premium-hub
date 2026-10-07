import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getConversationMembers,
} from "../../services/chatService";

export default function MessageComposer({
  conversationId,
  conversationType = "direct",
  onSend,
  onTypingChange,
  replyingTo = null,
  onCancelReply,
  disabled = false,
}) {
  const [message, setMessage] =
    useState("");

  const [file, setFile] =
    useState(null);

  const [sending, setSending] =
    useState(false);

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

  const onTypingChangeRef =
    useRef(onTypingChange);

  useEffect(() => {
    onTypingChangeRef.current =
      onTypingChange;
  }, [
    onTypingChange,
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
  const handleFileChange =
    (
      event
    ) => {
      const selected =
        event.target.files?.[0];

      event.target.value =
        "";

      if (
        !selected
      ) {
        return;
      }

      const MAX_SIZE =
        25 * 1024 * 1024;

      if (
        selected.size >
        MAX_SIZE
      ) {
        window.alert(
          "Maximum attachment size is 25 MB."
        );

        return;
      }

      setFile(
        selected
      );
    };

  const removeFile =
    () => {
      setFile(
        null
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

      try {
        setSending(
          true
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
          file
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
      } finally {
        setSending(
          false
        );
      }
    };

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
          "Enter" &&
        !event.shiftKey
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

  return (
    <div className="relative flex-shrink-0 border-t bg-white">

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
            className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200"
            aria-label="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}

      {/* FILE PREVIEW */}
      {file && (
        <div className="border-b bg-gray-50 px-3 py-3">
          <div className="relative inline-block max-w-[240px] rounded-xl border bg-white p-2">

            {file.type.startsWith(
              "image/"
            ) &&
              previewUrl && (
                <img
                  src={
                    previewUrl
                  }
                  alt="Attachment preview"
                  className="max-h-40 rounded-lg object-contain"
                />
              )}

            {file.type.startsWith(
              "video/"
            ) &&
              previewUrl && (
                <video
                  src={
                    previewUrl
                  }
                  className="max-h-40 rounded-lg"
                  controls
                  playsInline
                />
              )}

            {!file.type.startsWith(
              "image/"
            ) &&
              !file.type.startsWith(
                "video/"
              ) && (
                <div className="flex items-center gap-2 px-2 py-3">
                  <span className="text-2xl">
                    📄
                  </span>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {file.name}
                    </div>

                    <div className="text-xs text-gray-400">
                      {(
                        file.size /
                        1024 /
                        1024
                      ).toFixed(
                        2
                      )}{" "}
                      MB
                    </div>
                  </div>
                </div>
              )}

            <button
              type="button"
              onClick={
                removeFile
              }
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-xs text-white"
              aria-label="Remove attachment"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* COMPOSER AREA */}
      <div className="relative p-2 sm:p-3">

        {/* MENTION AUTOCOMPLETE */}
        {mentionOpen &&
          conversationType !==
            "direct" && (
            <div className="absolute bottom-full left-2 right-2 z-[80] mb-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:left-12 sm:right-auto sm:w-[320px]">

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
            placeholder={
              file
                ? "Add a caption..."
                : replyingTo
                ? "Write a reply..."
                : conversationType !==
                    "direct"
                ? "Type a message... Use @ to mention"
                : "Type a message..."
            }
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-3xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
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
            aria-label="Send message"
          >
            {sending
              ? "..."
              : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}