import bcrypt from "bcryptjs";

/**
 * @param {string} username
 * @param {string} password
 * @returns {{ username: string, recordJson: string }}
 */
export function buildUserRecord(username, password) {
  username = String(username ?? "").trim();
  password = String(password ?? "").trim();

  if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
    throw new Error(
      "Username must be 3–50 chars, alphanumeric/underscore only.",
    );
  }
  if (!password) {
    throw new Error("Password is required.");
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const recordJson = JSON.stringify({ username, hashedPassword });
  return { username, recordJson };
}
