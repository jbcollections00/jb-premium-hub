import {
  useEffect,
  useState,
} from "react";

import {
  getChatMessageReportQueue,
  moderateDeleteAndResolveReport,
  moderateDeleteReportedMessage,
  reviewChatMessageReport,
} from "../../services/chatService";

const FILTERS = [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
  "all",
];

function formatDate(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleString();
}

function getName(
  fullName,
  username,
  fallback = "User"
) {
  return (
    fullName?.trim() ||
    username?.trim() ||
    fallback
  );
}

function statusClass(
  status
) {
  if (
    status ===
    "pending"
  ) {
    return "bg-amber-100 text-amber-700";
  }

  if (
    status ===
    "reviewing"
  ) {
    return "bg-blue-100 text-blue-700";
  }

  if (
    status ===
    "resolved"
  ) {
    return "bg-green-100 text-green-700";
  }

  return "bg-gray-100 text-gray-600";
}

export default function ChatReports() {
  const [
    status,
    setStatus,
  ] =
    useState(
      "pending"
    );

  const [
    reports,
    setReports,
  ] =
    useState(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    loadingMore,
    setLoadingMore,
  ] =
    useState(
      false
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
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    selectedReport,
    setSelectedReport,
  ] =
    useState(
      null
    );

  const [
    moderatorNote,
    setModeratorNote,
  ] =
    useState(
      ""
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const loadReports =
    async ({
      append = false,
      before = null,
    } = {}) => {
      try {
        if (
          append
        ) {
          setLoadingMore(
            true
          );
        } else {
          setLoading(
            true
          );
        }

        setError(
          ""
        );

        const result =
          await getChatMessageReportQueue({
            status,
            limit:
              40,
            before,
          });

        setReports(
          (
            previous
          ) =>
            append
              ? [
                  ...previous,
                  ...(
                    result.reports ||
                    []
                  ),
                ]
              : result.reports ||
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
        loadError
      ) {
        console.error(
          "Load report queue error:",
          loadError
        );

        setError(
          loadError?.message ||
            "Unable to load reports."
        );
      } finally {
        setLoading(
          false
        );

        setLoadingMore(
          false
        );
      }
    };

  useEffect(() => {
    setReports(
      []
    );

    setCursor(
      null
    );

    setSelectedReport(
      null
    );

    loadReports();
  }, [
    status,
  ]);

  const openReport =
    (
      report
    ) => {
      setSelectedReport(
        report
      );

      setModeratorNote(
        report.moderator_note ||
          ""
      );
    };

  const updateStatus =
    async (
      nextStatus
    ) => {
      if (
        !selectedReport?.id ||
        saving
      ) {
        return;
      }

      try {
        setSaving(
          true
        );

        await reviewChatMessageReport({
          reportId:
            selectedReport.id,

          status:
            nextStatus,

          moderatorNote:
            moderatorNote.trim(),
        });

        setSelectedReport(
          null
        );

        await loadReports();
      } catch (
        saveError
      ) {
        console.error(
          "Review report error:",
          saveError
        );

        window.alert(
          saveError?.message ||
            "Unable to update report."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const deleteReportedMessage =
    async () => {
      if (
        !selectedReport?.id ||
        saving
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Delete this reported message? The message will be hidden from the chat."
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setSaving(
          true
        );

        await moderateDeleteReportedMessage({
          reportId:
            selectedReport.id,

          moderatorNote:
            moderatorNote.trim(),
        });

        setSelectedReport(
          null
        );

        await loadReports();
      } catch (
        deleteError
      ) {
        console.error(
          "Moderator delete message error:",
          deleteError
        );

        window.alert(
          deleteError?.message ||
            "Unable to delete reported message."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const deleteAndResolve =
    async () => {
      if (
        !selectedReport?.id ||
        saving
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Delete this message and mark the report resolved?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setSaving(
          true
        );

        await moderateDeleteAndResolveReport({
          reportId:
            selectedReport.id,

          moderatorNote:
            moderatorNote.trim(),
        });

        setSelectedReport(
          null
        );

        await loadReports();
      } catch (
        actionError
      ) {
        console.error(
          "Delete and resolve report error:",
          actionError
        );

        window.alert(
          actionError?.message ||
            "Unable to complete moderation action."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Chat Reports
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Review reported chat messages.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              loadReports()
            }
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm ring-1 ring-gray-200 hover:bg-blue-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map(
            (
              item
            ) => (
              <button
                key={
                  item
                }
                type="button"
                onClick={() =>
                  setStatus(
                    item
                  )
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                  status ===
                  item
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        {error && (
          <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              Loading reports...
            </div>
          ) : reports.length ===
            0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No reports found.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reports.map(
                (
                  report
                ) => (
                  <button
                    key={
                      report.id
                    }
                    type="button"
                    onClick={() =>
                      openReport(
                        report
                      )
                    }
                    className="block w-full px-5 py-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {getName(
                              report.reported_user_full_name,
                              report.reported_user_username,
                              "Reported user"
                            )}
                          </span>

                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(
                            report.status
                          )}`}>
                            {report.status}
                          </span>

                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600">
                            {report.reason}
                          </span>
                        </div>

                        <div className="mt-2 line-clamp-2 text-sm text-gray-600">
                          {report.message_text ||
                            "No message text"}
                        </div>

                        <div className="mt-2 text-xs text-gray-400">
                          Reporter:{" "}
                          {getName(
                            report.reporter_full_name,
                            report.reporter_username
                          )}
                          {" · "}
                          {report.conversation_title ||
                            report.conversation_type ||
                            "Conversation"}
                          {" · "}
                          {formatDate(
                            report.created_at
                          )}
                        </div>
                      </div>

                      <span className="text-gray-400">
                        ›
                      </span>
                    </div>
                  </button>
                )
              )}
            </div>
          )}

          {hasMore && (
            <div className="border-t bg-gray-50 px-5 py-4 text-center">
              <button
                type="button"
                onClick={() =>
                  loadReports({
                    append:
                      true,
                    before:
                      cursor,
                  })
                }
                disabled={
                  loadingMore
                }
                className="rounded-xl bg-white px-5 py-2 text-sm font-semibold text-blue-600 ring-1 ring-gray-200 disabled:opacity-50"
              >
                {loadingMore
                  ? "Loading..."
                  : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedReport && (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget &&
              !saving
            ) {
              setSelectedReport(
                null
              );
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-base font-bold text-gray-900">
                  Review report
                </div>

                <div className="mt-1 text-xs text-gray-400">
                  {formatDate(
                    selectedReport.created_at
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedReport(
                    null
                  )
                }
                disabled={
                  saving
                }
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Reported message
                </div>

                <div className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-800">
                  {selectedReport.message_deleted_at
                    ? "Message deleted"
                    : selectedReport.message_text ||
                      "No message text"}
                </div>

                {selectedReport.message_deleted_at && (
                  <div className="mt-2 text-xs font-semibold text-red-500">
                    This message is already deleted.
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Reported user
                  </div>

                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {getName(
                      selectedReport.reported_user_full_name,
                      selectedReport.reported_user_username
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Reporter
                  </div>

                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {getName(
                      selectedReport.reporter_full_name,
                      selectedReport.reporter_username
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Reason
                </div>

                <div className="mt-1 text-sm font-semibold capitalize text-red-600">
                  {selectedReport.reason}
                </div>
              </div>

              {selectedReport.details && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Reporter details
                  </div>

                  <div className="mt-2 whitespace-pre-wrap rounded-xl bg-amber-50 px-4 py-3 text-sm text-gray-700">
                    {selectedReport.details}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="moderator-note"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                >
                  Moderator note
                </label>

                <textarea
                  id="moderator-note"
                  value={
                    moderatorNote
                  }
                  onChange={(
                    event
                  ) =>
                    setModeratorNote(
                      event.target.value.slice(
                        0,
                        2000
                      )
                    )
                  }
                  rows={
                    4
                  }
                  className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Optional internal note..."
                />

                <div className="mt-1 text-right text-[10px] text-gray-400">
                  {moderatorNote.length}/2000
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 bg-red-50/50 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-500">
                Message moderation
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={
                    deleteReportedMessage
                  }
                  disabled={
                    saving ||
                    Boolean(
                      selectedReport.message_deleted_at
                    )
                  }
                  className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete message
                </button>

                <button
                  type="button"
                  onClick={
                    deleteAndResolve
                  }
                  disabled={
                    saving ||
                    Boolean(
                      selectedReport.message_deleted_at
                    )
                  }
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete + resolve
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
              {selectedReport.status !==
                "reviewing" && (
                <button
                  type="button"
                  onClick={() =>
                    updateStatus(
                      "reviewing"
                    )
                  }
                  disabled={
                    saving
                  }
                  className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  Mark reviewing
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  updateStatus(
                    "dismissed"
                  )
                }
                disabled={
                  saving
                }
                className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Dismiss
              </button>

              <button
                type="button"
                onClick={() =>
                  updateStatus(
                    "resolved"
                  )
                }
                disabled={
                  saving
                }
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
