import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
export function verifyPassword(password, credential) {
  if (
    !credential ||
    !/^[a-f0-9]{32}$/.test(credential.salt) ||
    !/^[a-f0-9]{128}$/.test(credential.hash)
  )
    return false;
  return timingSafeEqual(
    scryptSync(password, credential.salt, 64),
    Buffer.from(credential.hash, "hex"),
  );
}
