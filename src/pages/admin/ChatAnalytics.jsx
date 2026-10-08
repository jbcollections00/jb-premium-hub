import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

import {
  getChatAnalyticsConversationTypes,
  getChatAnalyticsDaily,
  getChatAnalyticsEngagement,
  getChatAnalyticsOverview,
  getChatAnalyticsTopConversations,
  getChatAnalyticsTopSenders,
} from "../../services/chatService";

const PERIODS = [
  {
    label:
      "7 days",
    value:
      7,
  },
  {
    label:
      "30 days",
    value:
      30,
  },
  {
    label:
      "90 days",
    value:
      90,
  },
];

function formatNumber(
  value
) {
  const number =
    Number(
      value ||
        0
    );

  return new Intl.NumberFormat(
    "en-US"
  ).format(
    number
  );
}

function formatDay(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month:
        "short",
      day:
        "numeric",
    }
  );
}

function conversationLabel(
  row
) {
  if (
    row.conversation_title
      ?.trim()
  ) {
    return row
      .conversation_title
      .trim();
  }

  if (
    row.conversation_type ===
    "direct"
  ) {
    return "Direct chat";
  }

  return (
    row.conversation_type ||
    "Conversation"
  );
}


function csvEscape(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "";
  }

  const text =
    String(
      value
    );

  if (
    text.includes(
      ","
    ) ||
    text.includes(
      "\""
    ) ||
    text.includes(
      "\n"
    )
  ) {
    return `"${text.replaceAll(
      "\"",
      "\"\""
    )}"`;
  }

  return text;
}

function rowsToCsv(
  headers,
  rows
) {
  const headerLine =
    headers
      .map(
        (
          header
        ) =>
          csvEscape(
            header.label
          )
      )
      .join(
        ","
      );

  const bodyLines =
    rows.map(
      (
        row
      ) =>
        headers
          .map(
            (
              header
            ) =>
              csvEscape(
                row[
                  header.key
                ]
              )
          )
          .join(
            ","
          )
    );

  return [
    headerLine,
    ...bodyLines,
  ].join(
    "\n"
  );
}

function downloadCsv(
  filename,
  csv
) {
  const blob =
    new Blob(
      [
        "\ufeff",
        csv,
      ],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor
  );

  anchor.click();
  anchor.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    0
  );
}

function analyticsFileDate() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10
    );
}

export default function ChatAnalytics() {
  const [
    days,
    setDays,
  ] =
    useState(
      30
    );

  const [
    overview,
    setOverview,
  ] =
    useState(
      null
    );

  const [
    daily,
    setDaily,
  ] =
    useState(
      []
    );

  const [
    topConversations,
    setTopConversations,
  ] =
    useState(
      []
    );

  const [
    engagement,
    setEngagement,
  ] =
    useState(
      null
    );

  const [
    conversationTypes,
    setConversationTypes,
  ] =
    useState(
      []
    );

  const [
    topSenders,
    setTopSenders,
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
    refreshing,
    setRefreshing,
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

  const loadAnalytics =
    async ({
      background =
        false,
    } = {}) => {
      try {
        if (
          background
        ) {
          setRefreshing(
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

        const [
          overviewData,
          dailyData,
          topData,
          engagementData,
          typeData,
          senderData,
        ] =
          await Promise.all([
            getChatAnalyticsOverview({
              days,
            }),

            getChatAnalyticsDaily({
              days,
            }),

            getChatAnalyticsTopConversations({
              days,
              limit:
                10,
            }),

            getChatAnalyticsEngagement({
              days,
            }),

            getChatAnalyticsConversationTypes({
              days,
            }),

            getChatAnalyticsTopSenders({
              days,
              limit:
                10,
            }),
          ]);

        setOverview(
          overviewData ||
            {}
        );

        setDaily(
          dailyData ||
            []
        );

        setTopConversations(
          topData ||
            []
        );

        setEngagement(
          engagementData ||
            {}
        );

        setConversationTypes(
          typeData ||
            []
        );

        setTopSenders(
          senderData ||
            []
        );
      } catch (
        loadError
      ) {
        console.error(
          "Load chat analytics error:",
          loadError
        );

        setError(
          loadError?.message ||
            "Unable to load chat analytics."
        );
      } finally {
        setLoading(
          false
        );

        setRefreshing(
          false
        );
      }
    };

  useEffect(() => {
    loadAnalytics();
  }, [
    days,
  ]);

  const chartData =
    useMemo(
      () =>
        (
          daily ||
          []
        ).map(
          (
            row
          ) => ({
            ...row,

            label:
              formatDay(
                row.day
              ),

            messages:
              Number(
                row.messages ||
                  0
              ),

            active_senders:
              Number(
                row.active_senders ||
                  0
              ),

            active_conversations:
              Number(
                row.active_conversations ||
                  0
              ),

            attachments:
              Number(
                row.attachments ||
                  0
              ),

            reactions:
              Number(
                row.reactions ||
                  0
              ),
          })
        ),
      [
        daily,
      ]
    );

  const topChartData =
    useMemo(
      () =>
        (
          topConversations ||
          []
        ).slice(
          0,
          8
        ).map(
          (
            row
          ) => ({
            ...row,

            shortLabel:
              conversationLabel(
                row
              ).slice(
                0,
                20
              ),

            message_count:
              Number(
                row.message_count ||
                  0
              ),
          })
        ),
      [
        topConversations,
      ]
    );

  const exportSummaryCsv =
    () => {
      const rows = [
        {
          metric:
            "Period Days",
          value:
            days,
        },
        {
          metric:
            "Messages",
          value:
            overview?.messages_period ||
            0,
        },
        {
          metric:
            "Active Senders",
          value:
            overview?.active_senders ||
            0,
        },
        {
          metric:
            "Active Conversations",
          value:
            overview?.active_conversations ||
            0,
        },
        {
          metric:
            "Attachments",
          value:
            overview?.attachments_period ||
            0,
        },
        {
          metric:
            "Reactions",
          value:
            overview?.reactions_period ||
            0,
        },
        {
          metric:
            "Reports",
          value:
            overview?.reports_period ||
            0,
        },
        {
          metric:
            "Pending Reports",
          value:
            overview?.pending_reports ||
            0,
        },
        {
          metric:
            "Total Conversations",
          value:
            overview?.total_conversations ||
            0,
        },
        {
          metric:
            "Total Memberships",
          value:
            overview?.total_memberships ||
            0,
        },
        {
          metric:
            "Replies",
          value:
            engagement?.replies ||
            0,
        },
        {
          metric:
            "Mentions",
          value:
            engagement?.mentions ||
            0,
        },
        {
          metric:
            "Attachment Messages",
          value:
            engagement?.attachment_messages ||
            0,
        },
        {
          metric:
            "Messages Per Active Sender",
          value:
            engagement?.messages_per_active_sender ||
            0,
        },
        {
          metric:
            "Reply Rate Percent",
          value:
            engagement?.reply_rate_percent ||
            0,
        },
        {
          metric:
            "Reaction Rate Percent",
          value:
            engagement?.reaction_rate_percent ||
            0,
        },
      ];

      downloadCsv(
        `chat-analytics-summary-${days}d-${analyticsFileDate()}.csv`,
        rowsToCsv(
          [
            {
              key:
                "metric",
              label:
                "Metric",
            },
            {
              key:
                "value",
              label:
                "Value",
            },
          ],
          rows
        )
      );
    };

  const exportDailyCsv =
    () => {
      downloadCsv(
        `chat-analytics-daily-${days}d-${analyticsFileDate()}.csv`,
        rowsToCsv(
          [
            {
              key:
                "day",
              label:
                "Day",
            },
            {
              key:
                "messages",
              label:
                "Messages",
            },
            {
              key:
                "active_senders",
              label:
                "Active Senders",
            },
            {
              key:
                "active_conversations",
              label:
                "Active Conversations",
            },
            {
              key:
                "attachments",
              label:
                "Attachments",
            },
            {
              key:
                "reactions",
              label:
                "Reactions",
            },
          ],
          daily ||
            []
        )
      );
    };

  const exportConversationsCsv =
    () => {
      downloadCsv(
        `chat-analytics-conversations-${days}d-${analyticsFileDate()}.csv`,
        rowsToCsv(
          [
            {
              key:
                "conversation_id",
              label:
                "Conversation ID",
            },
            {
              key:
                "conversation_type",
              label:
                "Type",
            },
            {
              key:
                "conversation_title",
              label:
                "Title",
            },
            {
              key:
                "message_count",
              label:
                "Messages",
            },
            {
              key:
                "active_senders",
              label:
                "Active Senders",
            },
            {
              key:
                "attachment_count",
              label:
                "Attachments",
            },
            {
              key:
                "last_message_at",
              label:
                "Last Message At",
            },
          ],
          topConversations ||
            []
        )
      );
    };

  const exportSendersCsv =
    () => {
      downloadCsv(
        `chat-analytics-senders-${days}d-${analyticsFileDate()}.csv`,
        rowsToCsv(
          [
            {
              key:
                "user_id",
              label:
                "User ID",
            },
            {
              key:
                "full_name",
              label:
                "Full Name",
            },
            {
              key:
                "username",
              label:
                "Username",
            },
            {
              key:
                "message_count",
              label:
                "Messages",
            },
            {
              key:
                "conversation_count",
              label:
                "Conversations",
            },
            {
              key:
                "attachment_count",
              label:
                "Attachments",
            },
            {
              key:
                "reaction_received_count",
              label:
                "Reactions Received",
            },
            {
              key:
                "last_message_at",
              label:
                "Last Message At",
            },
          ],
          topSenders ||
            []
        )
      );
    };

  const exportConversationTypesCsv =
    () => {
      downloadCsv(
        `chat-analytics-conversation-types-${days}d-${analyticsFileDate()}.csv`,
        rowsToCsv(
          [
            {
              key:
                "conversation_type",
              label:
                "Conversation Type",
            },
            {
              key:
                "message_count",
              label:
                "Messages",
            },
            {
              key:
                "active_conversations",
              label:
                "Active Conversations",
            },
            {
              key:
                "active_senders",
              label:
                "Active Senders",
            },
          ],
          conversationTypes ||
            []
        )
      );
    };

  const cards = [
    {
      label:
        "Messages",

      value:
        overview?.messages_period,

      icon:
        "💬",
    },

    {
      label:
        "Active Senders",

      value:
        overview?.active_senders,

      icon:
        "👤",
    },

    {
      label:
        "Active Chats",

      value:
        overview?.active_conversations,

      icon:
        "🗨️",
    },

    {
      label:
        "Attachments",

      value:
        overview?.attachments_period,

      icon:
        "📎",
    },

    {
      label:
        "Reactions",

      value:
        overview?.reactions_period,

      icon:
        "👍",
    },

    {
      label:
        "Reports",

      value:
        overview?.reports_period,

      icon:
        "🚩",
    },

    {
      label:
        "Pending Reports",

      value:
        overview?.pending_reports,

      icon:
        "⚠️",
    },

    {
      label:
        "Total Chats",

      value:
        overview?.total_conversations,

      icon:
        "🧵",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-black text-white sm:text-2xl">
            Chat Analytics
          </h1>

          <p className="mt-1 text-xs text-gray-400">
            Usage and engagement metrics for JB PREMIUM HUB chat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-gray-800 bg-gray-900 p-1">
            {PERIODS.map(
              (
                period
              ) => (
                <button
                  key={
                    period.value
                  }
                  type="button"
                  onClick={() =>
                    setDays(
                      period.value
                    )
                  }
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                    days ===
                    period.value
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {
                    period.label
                  }
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              loadAnalytics({
                background:
                  true,
              })
            }
            disabled={
              refreshing
            }
            className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-2.5 text-xs font-bold text-blue-400 hover:bg-gray-800 disabled:opacity-50"
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
                exportSummaryCsv
              }
              className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-bold text-emerald-400 hover:bg-gray-800"
            >
              Export Summary CSV
            </button>

            <button
              type="button"
              onClick={
                exportDailyCsv
              }
              className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-bold text-sky-400 hover:bg-gray-800"
            >
              Export Daily CSV
            </button>

            <button
              type="button"
              onClick={
                exportConversationsCsv
              }
              className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-bold text-purple-400 hover:bg-gray-800"
            >
              Export Chats CSV
            </button>

            <button
              type="button"
              onClick={
                exportSendersCsv
              }
              className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-bold text-amber-400 hover:bg-gray-800"
            >
              Export Senders CSV
            </button>

            <button
              type="button"
              onClick={
                exportConversationTypesCsv
              }
              className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-xs font-bold text-pink-400 hover:bg-gray-800"
            >
              Export Types CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-16 text-center text-sm text-gray-400">
          Loading chat analytics...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {cards.map(
              (
                card
              ) => (
                <div
                  key={
                    card.label
                  }
                  className="rounded-2xl border border-gray-800 bg-gray-900 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg">
                      {
                        card.icon
                      }
                    </span>

                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {days}d
                    </span>
                  </div>

                  <div className="mt-3 text-2xl font-black text-white">
                    {formatNumber(
                      card.value
                    )}
                  </div>

                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {
                      card.label
                    }
                  </div>
                </div>
              )
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Message Activity
                </h2>

                <p className="mt-1 text-[11px] text-gray-400">
                  Daily message volume for the selected period.
                </p>
              </div>

              <div className="mt-5 h-72">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={
                      chartData
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1f2937"
                    />

                    <XAxis
                      dataKey="label"
                      stroke="#6b7280"
                      fontSize={
                        11
                      }
                      tickLine={
                        false
                      }
                    />

                    <YAxis
                      stroke="#6b7280"
                      fontSize={
                        11
                      }
                      allowDecimals={
                        false
                      }
                      tickLine={
                        false
                      }
                    />

                    <Tooltip
                      contentStyle={{
                        backgroundColor:
                          "#111827",
                        borderColor:
                          "#374151",
                        borderRadius:
                          "12px",
                        fontSize:
                          "12px",
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="messages"
                      stroke="#3b82f6"
                      strokeWidth={
                        3
                      }
                      dot={
                        false
                      }
                      name="Messages"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Active Senders
                </h2>

                <p className="mt-1 text-[11px] text-gray-400">
                  Unique chat senders per day.
                </p>
              </div>

              <div className="mt-5 h-72">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={
                      chartData
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1f2937"
                    />

                    <XAxis
                      dataKey="label"
                      stroke="#6b7280"
                      fontSize={
                        11
                      }
                      tickLine={
                        false
                      }
                    />

                    <YAxis
                      stroke="#6b7280"
                      fontSize={
                        11
                      }
                      allowDecimals={
                        false
                      }
                      tickLine={
                        false
                      }
                    />

                    <Tooltip
                      contentStyle={{
                        backgroundColor:
                          "#111827",
                        borderColor:
                          "#374151",
                        borderRadius:
                          "12px",
                        fontSize:
                          "12px",
                      }}
                    />

                    <Bar
                      dataKey="active_senders"
                      fill="#10b981"
                      radius={[
                        5,
                        5,
                        0,
                        0,
                      ]}
                      name="Active Senders"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-bold text-white">
                Top Conversations
              </h2>

              <p className="mt-1 text-[11px] text-gray-400">
                Most active chats by message volume.
              </p>
            </div>

            <div className="mt-5 h-72">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    topChartData
                  }
                  layout="vertical"
                  margin={{
                    left:
                      12,
                    right:
                      20,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1f2937"
                  />

                  <XAxis
                    type="number"
                    stroke="#6b7280"
                    fontSize={
                      11
                    }
                    allowDecimals={
                      false
                    }
                  />

                  <YAxis
                    type="category"
                    dataKey="shortLabel"
                    stroke="#6b7280"
                    fontSize={
                      11
                    }
                    width={
                      110
                    }
                    tickLine={
                      false
                    }
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor:
                        "#111827",
                      borderColor:
                        "#374151",
                      borderRadius:
                        "12px",
                      fontSize:
                        "12px",
                    }}
                  />

                  <Bar
                    dataKey="message_count"
                    fill="#8b5cf6"
                    radius={[
                      0,
                      5,
                      5,
                      0,
                    ]}
                    name="Messages"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Engagement Breakdown
                </h2>

                <p className="mt-1 text-[11px] text-gray-400">
                  Interaction quality for the selected period.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Replies", engagement?.replies],
                  ["Mentions", engagement?.mentions],
                  ["Files", engagement?.attachment_messages],
                  ["Msgs / Sender", engagement?.messages_per_active_sender],
                  ["Reply Rate", `${Number(engagement?.reply_rate_percent || 0).toFixed(1)}%`],
                  ["Reaction Rate", `${Number(engagement?.reaction_rate_percent || 0).toFixed(1)}%`],
                ].map(
                  (
                    [
                      label,
                      value,
                    ]
                  ) => (
                    <div
                      key={
                        label
                      }
                      className="rounded-xl border border-gray-800 bg-gray-950/70 p-3"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {label}
                      </div>

                      <div className="mt-2 text-xl font-black text-white">
                        {typeof value ===
                        "number"
                          ? formatNumber(
                              value
                            )
                          : value ??
                            "0"}
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Conversation Type Mix
                </h2>

                <p className="mt-1 text-[11px] text-gray-400">
                  Message activity by direct, group, channel, and community.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {(conversationTypes || []).length ===
                0 ? (
                  <div className="py-10 text-center text-sm text-gray-500">
                    No activity for this period.
                  </div>
                ) : (
                  conversationTypes.map(
                    (
                      row
                    ) => (
                      <div
                        key={
                          row.conversation_type
                        }
                        className="rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold capitalize text-white">
                              {row.conversation_type ||
                                "unknown"}
                            </div>

                            <div className="mt-1 text-[10px] text-gray-500">
                              {formatNumber(
                                row.active_conversations
                              )} active chats ·{" "}
                              {formatNumber(
                                row.active_senders
                              )} senders
                            </div>
                          </div>

                          <div className="text-lg font-black text-blue-400">
                            {formatNumber(
                              row.message_count
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-4 py-4 sm:px-5">
              <h2 className="text-sm font-bold text-white">
                Top Chat Senders
              </h2>

              <p className="mt-1 text-[11px] text-gray-400">
                Most active users in chat for the selected period.
              </p>
            </div>

            {(topSenders || []).length ===
            0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No sender activity for this period.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {topSenders.map(
                  (
                    row,
                    index
                  ) => {
                    const name =
                      row.full_name?.trim() ||
                      row.username?.trim() ||
                      "User";

                    return (
                      <div
                        key={
                          row.user_id
                        }
                        className="grid gap-3 px-4 py-4 sm:grid-cols-[44px_minmax(0,1fr)_repeat(4,minmax(85px,auto))] sm:items-center sm:px-5"
                      >
                        <div className="text-lg font-black text-gray-600">
                          #{index + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">
                            {name}
                          </div>

                          {row.username && (
                            <div className="mt-1 truncate text-[10px] text-gray-500">
                              @{row.username}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">
                            Messages
                          </div>

                          <div className="mt-1 text-sm font-bold text-blue-400">
                            {formatNumber(
                              row.message_count
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">
                            Chats
                          </div>

                          <div className="mt-1 text-sm font-bold text-emerald-400">
                            {formatNumber(
                              row.conversation_count
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">
                            Files
                          </div>

                          <div className="mt-1 text-sm font-bold text-purple-400">
                            {formatNumber(
                              row.attachment_count
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">
                            Reactions
                          </div>

                          <div className="mt-1 text-sm font-bold text-amber-400">
                            {formatNumber(
                              row.reaction_received_count
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-4 py-4 sm:px-5">
              <h2 className="text-sm font-bold text-white">
                Conversation Ranking
              </h2>
            </div>

            {topConversations.length ===
            0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No chat activity for this period.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {topConversations.map(
                  (
                    row,
                    index
                  ) => (
                    <div
                      key={
                        row.conversation_id
                      }
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[44px_minmax(0,1fr)_repeat(3,minmax(90px,auto))] sm:items-center sm:px-5"
                    >
                      <div className="text-lg font-black text-gray-600">
                        #
                        {index +
                          1}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {conversationLabel(
                            row
                          )}
                        </div>

                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {row.conversation_type ||
                            "chat"}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          Messages
                        </div>

                        <div className="mt-1 text-sm font-bold text-blue-400">
                          {formatNumber(
                            row.message_count
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          Senders
                        </div>

                        <div className="mt-1 text-sm font-bold text-emerald-400">
                          {formatNumber(
                            row.active_senders
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          Files
                        </div>

                        <div className="mt-1 text-sm font-bold text-purple-400">
                          {formatNumber(
                            row.attachment_count
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
