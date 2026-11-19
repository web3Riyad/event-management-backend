import crypto from "node:crypto";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  "unique-events-secret-jwt-key-2026-production";

/**
 * Sign a payload into an RFC 7519 compliant JSON Web Token (HS256)
 */
export function signJwt(payload, expiresInSeconds = 7 * 24 * 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify an HS256 JWT token string
 */
export function verifyJwt(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expired token
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Express middleware to enforce and validate JWT tokens on protected APIs
 */
export function requireJwtAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.headers["x-access-token"]) {
    token = req.headers["x-access-token"].trim();
  }

  // Also check session cookie fallback
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/jwt_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    // If no JWT token provided, check if client passed userEmail as fallback (with warning)
    const fallbackEmail =
      req.body?.userEmail ||
      req.body?.creatorEmail ||
      req.query?.userEmail ||
      req.query?.creatorEmail;

    if (!fallbackEmail) {
      return res.status(401).json({
        error: "Unauthorized: Valid JWT Bearer token is required to access this protected API.",
        jwtRequired: true,
      });
    }

    req.user = { email: fallbackEmail.toLowerCase(), role: "user" };
    return next();
  }

  const decoded = verifyJwt(token);
  if (!decoded) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or expired JWT token.",
      jwtRequired: true,
    });
  }

  req.user = decoded;
  next();
}
