import bcrypt from "bcryptjs";

/**
 * @param {string} username email used as KV key
 * @param {string} password
 * @returns {{ username: string, recordJson: string }}
 */
export function buildUserRecord(username, password) {
  username = String(username ?? "").trim();
  password = String(password ?? "").trim();

  if (username.length < 3 || username.length > 200) {
    throw new Error("Email/username must be 3–200 characters.");
  }
  if (!password) {
    throw new Error("Password is required.");
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const recordJson = JSON.stringify({ username, hashedPassword });
  return { username, recordJson };
}
