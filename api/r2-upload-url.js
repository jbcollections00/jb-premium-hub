import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import {
  createClient,
} from "@supabase/supabase-js";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,

  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

function setCors(req, res) {
  const origin =
    req.headers.origin || "";

  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://www.jb-premium-hub.vip",
    "https://jb-premium-hub.vip",
  ];

  if (
    allowedOrigins.includes(
      origin
    )
  ) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  res.setHeader(
    "Vary",
    "Origin"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}

function sanitizeFileName(
  fileName = "file"
) {
  return fileName
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )
    .slice(
      0,
      120
    );
}

function normalizePublicUrl(
  value
) {
  return String(
    value || ""
  ).replace(
    /\/+$/,
    ""
  );
}

export default async function handler(
  req,
  res
) {
  setCors(
    req,
    res
  );

  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }

  if (
    req.method !==
    "POST"
  ) {
    return res
      .status(405)
      .json({
        error:
          "Method not allowed",
      });
  }

  try {
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET_NAME ||
      !R2_PUBLIC_URL
    ) {
      return res
        .status(500)
        .json({
          error:
            "R2 server configuration is incomplete.",
        });
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return res
        .status(500)
        .json({
          error:
            "Supabase server configuration is incomplete.",
        });
    }

    /* =============================================
       VERIFY LOGGED-IN USER
    ============================================= */

    const authorization =
      req.headers.authorization ||
      "";

    const token =
      authorization.startsWith(
        "Bearer "
      )
        ? authorization.slice(
            7
          )
        : null;

    if (!token) {
      return res
        .status(401)
        .json({
          error:
            "Authentication required.",
        });
    }

    const supabaseAdmin =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        }
      );

    const {
      data: authData,
      error: authError,
    } =
      await supabaseAdmin.auth.getUser(
        token
      );

    if (
      authError ||
      !authData?.user
    ) {
      return res
        .status(401)
        .json({
          error:
            "Invalid session.",
        });
    }

    /* =============================================
       ADMIN ONLY
    ============================================= */

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "id, role"
        )
        .eq(
          "id",
          authData.user.id
        )
        .maybeSingle();

    if (
      profileError ||
      !profile
    ) {
      return res
        .status(403)
        .json({
          error:
            "Profile not found.",
        });
    }

    if (
      profile.role !==
      "admin"
    ) {
      return res
        .status(403)
        .json({
          error:
            "Admin access required.",
        });
    }

    /* =============================================
       INPUT
    ============================================= */

    const {
      fileName,
      contentType,
      folder = "",
      fileSize = 0,
    } = req.body || {};

    if (!fileName) {
      return res
        .status(400)
        .json({
          error:
            "fileName is required.",
        });
    }

    const numericSize =
      Number(
        fileSize ||
        0
      );

    /*
      Single PUT uploads should stay below
      the provider's single-object request limits.
      5 GB ceiling here prevents obviously invalid input.
    */
    const MAX_FILE_SIZE =
      5 *
      1024 *
      1024 *
      1024;

    if (
      numericSize < 0 ||
      numericSize >
        MAX_FILE_SIZE
    ) {
      return res
        .status(400)
        .json({
          error:
            "File is too large.",
        });
    }

    const safeName =
      sanitizeFileName(
        fileName
      );

    const safeFolder =
      String(
        folder || ""
      )
        .replace(
          /[^a-zA-Z0-9/_-]/g,
          ""
        )
        .replace(
          /^\/+|\/+$/g,
          ""
        );

    const randomPart =
      crypto.randomUUID();

    const key =
      safeFolder
        ? `${safeFolder}/${Date.now()}-${randomPart}-${safeName}`
        : `${Date.now()}-${randomPart}-${safeName}`;

    /* =============================================
       R2 CLIENT
    ============================================= */

    const s3 =
      new S3Client({
        region:
          "auto",

        endpoint:
          `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

        credentials: {
          accessKeyId:
            R2_ACCESS_KEY_ID,

          secretAccessKey:
            R2_SECRET_ACCESS_KEY,
        },
      });

    const normalizedType =
      contentType ||
      "application/octet-stream";

    const command =
      new PutObjectCommand({
        Bucket:
          R2_BUCKET_NAME,

        Key:
          key,

        ContentType:
          normalizedType,
      });

    const uploadUrl =
      await getSignedUrl(
        s3,
        command,
        {
          expiresIn:
            3600,
        }
      );

    const publicBase =
      normalizePublicUrl(
        R2_PUBLIC_URL
      );

    return res
      .status(200)
      .json({
        uploadUrl,

        key,

        publicUrl:
          `${publicBase}/${key}`,
      });

  } catch (error) {
    console.error(
      "r2-upload-url error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          "Unable to create upload URL.",
      });
  }
}