import { navigate } from "./router";

/** The app logo, linking home. */
export function Brand({ showName = false }: { showName?: boolean }) {
  return (
    <a className="brand" href="/" title="Docs home" onClick={event => (event.preventDefault(), navigate("/"))}>
      <img src="/logo.svg" alt="" width={27} height={36} />
      {showName && <span>Docs</span>}
    </a>
  );
}
