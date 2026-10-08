/* =========================================================
   JB PREMIUM HUB - CHAT NOTIFICATION SERVICE WORKER
========================================================= */

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const targetUrl =
      event.notification?.data?.url ||
      "/chat";

    event.waitUntil(
      self.clients
        .matchAll({
          type:
            "window",
          includeUncontrolled:
            true,
        })
        .then(
          async (
            clientList
          ) => {
            for (
              const client
              of clientList
            ) {
              try {
                const clientUrl =
                  new URL(
                    client.url
                  );

                if (
                  clientUrl.origin ===
                  self.location.origin
                ) {
                  await client.focus();

                  if (
                    "navigate" in
                    client
                  ) {
                    await client.navigate(
                      targetUrl
                    );
                  }

                  return;
                }
              } catch (error) {
                // Ignore malformed client URLs.
              }
            }

            if (
              self.clients
                .openWindow
            ) {
              await self.clients.openWindow(
                targetUrl
              );
            }
          }
        )
    );
  }
);
