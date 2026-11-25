import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  searchChatMessages,
} from "../../services/chatService";

function formatDate(
  value
) {
  if (!value) {
    return "";
  }

  try {
    return new Date(
      value
    ).toLocaleString(
      [],
      {
        month:
          "short",

        day:
          "numeric",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit",
      }
    );
  } catch {
    return "";
  }
}

function getSenderName(
  message
) {
  return (
    message?.sender
      ?.full_name
      ?.trim() ||
    message?.sender
      ?.username
      ?.trim() ||
    "User"
  );
}

function getConversationName(
  message
) {
  return (
    message?.conversation
      ?.title
      ?.trim() ||
    "Chat"
  );
}

function highlightText(
  text,
  query
) {
  const source =
    String(
      text ||
        ""
    );

  const search =
    String(
      query ||
        ""
    ).trim();

  if (
    !source ||
    !search
  ) {
    return source;
  }

  const lowerSource =
    source.toLowerCase();

  const lowerSearch =
    search.toLowerCase();

  const parts =
    [];

  let cursor =
    0;

  while (
    cursor <
    source.length
  ) {
    const index =
      lowerSource.indexOf(
        lowerSearch,
        cursor
      );

    if (
      index ===
      -1
    ) {
      parts.push(
        <span
          key={`tail-${cursor}`}
        >
          {source.slice(
            cursor
          )}
        </span>
      );

      break;
    }

    if (
      index >
      cursor
    ) {
      parts.push(
        <span
          key={`text-${cursor}`}
        >
          {source.slice(
            cursor,
            index
          )}
        </span>
      );
    }

    parts.push(
      <mark
        key={`match-${index}`}
        className="rounded bg-yellow-200 px-0.5 text-inherit"
      >
        {source.slice(
          index,
          index +
            search.length
        )}
      </mark>
    );

    cursor =
      index +
      search.length;
  }

  return parts;
}

export default function MessageSearchModal({
  isOpen,
  onClose,
  conversationId = null,
  conversationTitle = "",
  onOpenResult,
}) {
  const [
    scope,
    setScope,
  ] =
    useState(
      conversationId
        ? "current"
        : "all"
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      ""
    );

  const [
    results,
    setResults,
  ] =
    useState(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );

  const [
    loadingMore,
    setLoadingMore,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    hasMore,
    setHasMore,
  ] =
    useState(
      false
    );

  const [
    cursor,
    setCursor,
  ] =
    useState(
      null
    );

  const [
    selectedIndex,
    setSelectedIndex,
  ] =
    useState(
      -1
    );

  const inputRef =
    useRef(
      null
    );

  const requestIdRef =
    useRef(
      0
    );

  const activeConversationId =
    scope ===
      "current"
      ? conversationId
      : null;

  const scopeLabel =
    useMemo(
      () =>
        scope ===
          "current"
          ? conversationTitle ||
            "Current chat"
          : "All chats",
      [
        scope,
        conversationTitle,
      ]
    );

  useEffect(() => {
    if (
      !isOpen
    ) {
      return;
    }

    setScope(
      conversationId
        ? "current"
        : "all"
    );

    setQuery(
      ""
    );

    setResults(
      []
    );

    setError(
      ""
    );

    setHasMore(
      false
    );

    setCursor(
      null
    );

    setSelectedIndex(
      -1
    );

    const timer =
      setTimeout(
        () => {
          inputRef.current?.focus();
        },
        50
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    isOpen,
    conversationId,
  ]);

  useEffect(() => {
    if (
      !isOpen
    ) {
      return;
    }

    const handleKeyDown =
      (
        event
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          event.preventDefault();
          onClose?.();
          return;
        }

        if (
          event.key ===
            "ArrowDown" &&
          results.length >
            0
        ) {
          event.preventDefault();

          setSelectedIndex(
            (
              previous
            ) => {
              const next =
                previous <
                results.length -
                  1
                  ? previous +
                    1
                  : 0;

              setTimeout(
                () => {
                  document
                    .getElementById(
                      `message-search-result-${next}`
                    )
                    ?.scrollIntoView({
                      block:
                        "nearest",
                    });
                },
                0
              );

              return next;
            }
          );

          return;
        }

        if (
          event.key ===
            "ArrowUp" &&
          results.length >
            0
        ) {
          event.preventDefault();

          setSelectedIndex(
            (
              previous
            ) => {
              const next =
                previous >
                0
                  ? previous -
                    1
                  : results.length -
                    1;

              setTimeout(
                () => {
                  document
                    .getElementById(
                      `message-search-result-${next}`
                    )
                    ?.scrollIntoView({
                      block:
                        "nearest",
                    });
                },
                0
              );

              return next;
            }
          );

          return;
        }

        if (
          event.key ===
            "Enter" &&
          selectedIndex >=
            0 &&
          results[
            selectedIndex
          ]
        ) {
          event.preventDefault();

          onOpenResult?.(
            results[
              selectedIndex
            ]
          );
        }
      };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [
    isOpen,
    onClose,
    onOpenResult,
    results,
    selectedIndex,
  ]);

  useEffect(() => {
    if (
      !isOpen
    ) {
      return;
    }

    const cleanQuery =
      query.trim();

    requestIdRef.current +=
      1;

    const requestId =
      requestIdRef.current;

    if (
      cleanQuery.length <
      2
    ) {
      setResults(
        []
      );

      setHasMore(
        false
      );

      setCursor(
        null
      );

      setError(
        ""
      );

      setLoading(
        false
      );

      setSelectedIndex(
        -1
      );

      return;
    }

    const timer =
      setTimeout(
        async () => {
          try {
            setLoading(
              true
            );

            setError(
              ""
            );

            setSelectedIndex(
              -1
            );

            const result =
              await searchChatMessages({
                query:
                  cleanQuery,

                conversationId:
                  activeConversationId,

                limit:
                  30,

                before:
                  null,
              });

            if (
              requestId !==
              requestIdRef.current
            ) {
              return;
            }

            setResults(
              result.messages ||
                []
            );

            setHasMore(
              Boolean(
                result.hasMore
              )
            );

            setCursor(
              result.nextCursor ||
                null
            );
          } catch (
            searchError
          ) {
            if (
              requestId !==
              requestIdRef.current
            ) {
              return;
            }

            console.error(
              "Message search error:",
              searchError
            );

            setError(
              searchError?.message ||
                "Unable to search messages."
            );

            setResults(
              []
            );

            setHasMore(
              false
            );

            setCursor(
              null
            );
          } finally {
            if (
              requestId ===
              requestIdRef.current
            ) {
              setLoading(
                false
              );
            }
          }
        },
        300
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    isOpen,
    query,
    activeConversationId,
  ]);

  const loadMore =
    async () => {
      const cleanQuery =
        query.trim();

      if (
        cleanQuery.length <
          2 ||
        !hasMore ||
        !cursor ||
        loadingMore
      ) {
        return;
      }

      const requestId =
        requestIdRef.current;

      try {
        setLoadingMore(
          true
        );

        const result =
          await searchChatMessages({
            query:
              cleanQuery,

            conversationId:
              activeConversationId,

            limit:
              30,

            before:
              cursor,
          });

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        setResults(
          (
            previous
          ) => {
            const map =
              new Map(
                previous.map(
                  (
                    item
                  ) => [
                    item.id,
                    item,
                  ]
                )
              );

            for (
              const item of
              result.messages ||
              []
            ) {
              map.set(
                item.id,
                item
              );
            }

            return [
              ...map.values(),
            ];
          }
        );

        setHasMore(
          Boolean(
            result.hasMore
          )
        );

        setCursor(
          result.nextCursor ||
            null
        );
      } catch (
        loadError
      ) {
        console.error(
          "Load more search results error:",
          loadError
        );

        setError(
          loadError?.message ||
            "Unable to load more results."
        );
      } finally {
        setLoadingMore(
          false
        );
      }
    };

  const handleOpenResult =
    (
      message
    ) => {
      onOpenResult?.(
        message
      );
    };

  if (
    !isOpen
  ) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-0 sm:p-4"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose?.();
        }
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[82vh] sm:max-w-3xl sm:rounded-2xl">

        {/* HEADER */}
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div>
            <div className="text-base font-bold text-gray-900">
              Search messages
            </div>

            <div className="text-xs text-gray-400">
              {scopeLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close message search"
          >
            ✕
          </button>
        </div>

        {/* SEARCH */}
        <div className="border-b bg-white px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3">
            <span className="text-gray-400">
              🔎
            </span>

            <input
              ref={
                inputRef
              }
              type="search"
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
              placeholder="Search messages..."
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />

            {query && (
              <button
                type="button"
                onClick={() =>
                  setQuery(
                    ""
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {conversationId && (
              <button
                type="button"
                onClick={() =>
                  setScope(
                    "current"
                  )
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  scope ===
                  "current"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Current chat
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setScope(
                  "all"
                )
              }
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                scope ===
                "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All chats
            </button>
          </div>

          <div className="mt-2 text-[10px] text-gray-400">
            ↑ ↓ navigate · Enter open · Esc close
          </div>
        </div>

        {/* RESULTS */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">

          {query.trim().length <
          2 ? (
            <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
              <div className="text-sm text-gray-400">
                Type at least 2 characters to search.
              </div>
            </div>
          ) : loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Searching messages...
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
              <div className="text-sm font-medium text-red-600">
                {error}
              </div>
            </div>
          ) : results.length ===
            0 ? (
            <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
              <div className="text-sm text-gray-400">
                No matching messages found.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 bg-white">
              {results.map(
                (
                  message
                ) => {
                  const senderName =
                    getSenderName(
                      message
                    );

                  const conversationName =
                    getConversationName(
                      message
                    );

                  return (
                    <button
                      key={
                        message.id
                      }
                      id={`message-search-result-${results.indexOf(
                        message
                      )}`}
                      type="button"
                      onMouseEnter={() =>
                        setSelectedIndex(
                          results.indexOf(
                            message
                          )
                        )
                      }
                      onFocus={() =>
                        setSelectedIndex(
                          results.indexOf(
                            message
                          )
                        )
                      }
                      onClick={() =>
                        handleOpenResult(
                          message
                        )
                      }
                      className={`block w-full px-4 py-3 text-left sm:px-5 ${
                        selectedIndex ===
                        results.indexOf(
                          message
                        )
                          ? "bg-blue-50 ring-1 ring-inset ring-blue-100"
                          : "hover:bg-blue-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                          {message.sender
                            ?.avatar_url ? (
                            <img
                              src={
                                message.sender.avatar_url
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-sm">
                              👤
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-gray-900">
                              {senderName}
                            </span>

                            {scope ===
                              "all" && (
                              <span className="truncate text-[11px] font-medium text-blue-600">
                                {conversationName}
                              </span>
                            )}

                            <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400">
                              {formatDate(
                                message.created_at
                              )}
                            </span>
                          </div>

                          <div className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                            {highlightText(
                              message.message ||
                                "",
                              query.trim()
                            )}
                          </div>

                          {message.message_type &&
                            message.message_type !==
                              "text" && (
                              <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                {message.message_type}
                              </div>
                            )}
                        </div>
                      </div>
                    </button>
                  );
                }
              )}

              {hasMore && (
                <div className="flex justify-center bg-gray-50 px-4 py-4">
                  <button
                    type="button"
                    onClick={
                      loadMore
                    }
                    disabled={
                      loadingMore
                    }
                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-600 shadow-sm ring-1 ring-gray-200 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {loadingMore
                      ? "Loading..."
                      : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
