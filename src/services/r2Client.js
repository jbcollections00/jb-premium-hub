const configuredPublicUrl =
  import.meta.env
    .VITE_R2_PUBLIC_URL ||
  "https://cdn.jb-premium-hub.vip";

export const R2_PUBLIC_DOMAIN =
  configuredPublicUrl.replace(
    /\/+$/,
    ""
  );

export const r2PublicDomain =
  R2_PUBLIC_DOMAIN;

export function getR2PublicUrl(
  key
) {
  if (!key) {
    return "";
  }

  const cleanKey =
    String(key).replace(
      /^\/+/,
      ""
    );

  return `${R2_PUBLIC_DOMAIN}/${cleanKey}`;
}

/* =========================================================
   GET AUTHENTICATED SIGNED UPLOAD URL
========================================================= */

export async function createR2UploadUrl({
  fileName,
  contentType,
  fileSize,
  folder = "",
}) {
  const {
    data: {
      session,
    },
  } =
    await (
      await import(
        "./supabaseClient"
      )
    ).supabase.auth.getSession();

  const token =
    session?.access_token;

  if (!token) {
    throw new Error(
      "You must be logged in."
    );
  }

  const signerBase =
    (
      import.meta.env
        .VITE_R2_SIGNER_URL ||
      ""
    ).replace(
      /\/+$/,
      ""
    );

  /*
    Production:
      empty base -> /api/r2-upload-url

    Local Vite:
      set VITE_R2_SIGNER_URL to your deployed site,
      OR run the app using `vercel dev`.
  */
  const endpoint =
    signerBase
      ? `${signerBase}/api/r2-upload-url`
      : "/api/r2-upload-url";

  const response =
    await fetch(
      endpoint,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`,
        },

        body:
          JSON.stringify({
            fileName,
            contentType,
            fileSize,
            folder,
          }),
      }
    );

  const result =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    throw new Error(
      result?.error ||
      "Unable to prepare R2 upload."
    );
  }

  return result;
}

/* =========================================================
   DIRECT BROWSER -> R2 UPLOAD WITH PROGRESS
========================================================= */

export function uploadFileToR2({
  file,
  uploadUrl,
  onProgress,
}) {
  if (
    !file ||
    !uploadUrl
  ) {
    return Promise.reject(
      new Error(
        "Missing file or upload URL."
      )
    );
  }

  return new Promise(
    (
      resolve,
      reject
    ) => {
      const xhr =
        new XMLHttpRequest();

      xhr.open(
        "PUT",
        uploadUrl,
        true
      );

      xhr.setRequestHeader(
        "Content-Type",
        file.type ||
          "application/octet-stream"
      );

      xhr.upload.onprogress =
        (
          event
        ) => {
          if (
            event.lengthComputable
          ) {
            const percentage =
              Math.round(
                (
                  event.loaded /
                  event.total
                ) *
                  100
              );

            onProgress?.(
              percentage
            );
          }
        };

      xhr.onload =
        () => {
          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {
            onProgress?.(
              100
            );

            resolve(
              true
            );
          } else {
            reject(
              new Error(
                `R2 upload failed (${xhr.status}).`
              )
            );
          }
        };

      xhr.onerror =
        () => {
          reject(
            new Error(
              "Network error while uploading to R2."
            )
          );
        };

      xhr.onabort =
        () => {
          reject(
            new Error(
              "Upload cancelled."
            )
          );
        };

      xhr.send(
        file
      );
    }
  );
}