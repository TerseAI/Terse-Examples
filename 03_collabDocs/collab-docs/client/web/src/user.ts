/** Who you are. No accounts in this demo: a random name and color, kept in localStorage. */
export type User = { userId: string; name: string; color: string };

const KEY = "docs.user";
const COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#007b83", "#b80672", "#5f6368"];
const ANIMALS = ["Armadillo", "Otter", "Heron", "Lynx", "Badger", "Falcon", "Gecko", "Narwhal", "Panda", "Koala", "Ibis", "Marten"];

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;

export function loadUser(): User {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as User | null;
    if (saved?.userId && saved.name && saved.color) return saved;
  } catch {
    // Storage unavailable or corrupt; fall through to a fresh identity.
  }
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(10)), byte => (byte % 36).toString(36)).join("");
  const user = { userId: `u_${suffix}`, name: `Anonymous ${pick(ANIMALS)}`, color: pick(COLORS) };
  saveUser(user);
  return user;
}

export function saveUser(user: User) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Keep working without persistence.
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join("");
}
