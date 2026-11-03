import { useState } from "react";

import { DocPage } from "./DocPage";
import { Home } from "./Home";
import { useRoute } from "./router";
import { loadUser, saveUser, type User } from "./user";

export function App() {
  const route = useRoute();
  const [user, setUser] = useState<User>(loadUser);

  const rename = () => {
    const name = window.prompt("Your name, as collaborators see it:", user.name)?.trim().slice(0, 40);
    if (!name || name === user.name) return;
    const next = { ...user, name };
    saveUser(next);
    setUser(next);
  };

  return route.page === "doc" ? (
    // Re-key on name/color so the actor socket reconnects with the new identity.
    <DocPage key={`${route.docId}:${user.name}:${user.color}`} docId={route.docId} user={user} onRename={rename} />
  ) : (
    <Home user={user} onRename={rename} />
  );
}
