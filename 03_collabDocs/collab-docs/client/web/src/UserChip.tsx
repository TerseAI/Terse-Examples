import { initials, type User } from "./user";

/** Your own avatar; click to change the name collaborators see. */
export function UserChip({ user, onRename }: { user: User; onRename: () => void }) {
  return (
    <button className="user-chip" onClick={onRename} title={`You are ${user.name}. Click to rename.`}>
      <span className="avatar" style={{ background: user.color }}>
        {initials(user.name)}
      </span>
      <span className="user-name">{user.name}</span>
    </button>
  );
}
