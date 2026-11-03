import { useEditorState, type Editor } from "@tiptap/react";
import type { ReactNode } from "react";

import { Icon, icons } from "./icons";

type Block = "p" | "h1" | "h2" | "h3";
type Align = "left" | "center" | "right";

export function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const block: Block = editor.isActive("heading", { level: 1 })
        ? "h1"
        : editor.isActive("heading", { level: 2 })
          ? "h2"
          : editor.isActive("heading", { level: 3 })
            ? "h3"
            : "p";
      const align: Align = editor.isActive({ textAlign: "center" })
        ? "center"
        : editor.isActive({ textAlign: "right" })
          ? "right"
          : "left";
      return {
        block,
        align,
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
        strike: editor.isActive("strike"),
        code: editor.isActive("code"),
        link: editor.isActive("link"),
        bullets: editor.isActive("bulletList"),
        numbers: editor.isActive("orderedList"),
        quote: editor.isActive("blockquote"),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
      };
    },
  });

  if (!editor || !state) return <div className="toolbar" />;
  const chain = () => editor.chain().focus();

  const setBlock = (block: Block) => {
    if (block === "p") chain().setParagraph().run();
    else chain().setHeading({ level: Number(block[1]) as 1 | 2 | 3 }).run();
  };

  const toggleLink = () => {
    if (state.link) return chain().extendMarkRange("link").unsetLink().run();
    const href = window.prompt("Link URL:", "https://");
    if (href && href !== "https://") chain().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Tool label="Undo (⌘Z)" onClick={() => chain().undo().run()} disabled={!state.canUndo}>
        <Icon path={icons.undo} />
      </Tool>
      <Tool label="Redo (⌘⇧Z)" onClick={() => chain().redo().run()} disabled={!state.canRedo}>
        <Icon path={icons.redo} />
      </Tool>
      <Divider />
      <select
        className="block-select"
        aria-label="Text style"
        value={state.block}
        onChange={event => setBlock(event.target.value as Block)}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Divider />
      <Tool label="Bold (⌘B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Icon path={icons.bold} />
      </Tool>
      <Tool label="Italic (⌘I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Icon path={icons.italic} />
      </Tool>
      <Tool label="Underline (⌘U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <Icon path={icons.underline} />
      </Tool>
      <Tool label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Icon path={icons.strike} />
      </Tool>
      <Tool label="Inline code" active={state.code} onClick={() => chain().toggleCode().run()}>
        <Icon path={icons.code} />
      </Tool>
      <Tool label="Link" active={state.link} onClick={toggleLink}>
        <Icon path={icons.link} />
      </Tool>
      <Divider />
      <Tool label="Align left" active={state.align === "left"} onClick={() => chain().setTextAlign("left").run()}>
        <Icon path={icons.alignLeft} />
      </Tool>
      <Tool label="Align center" active={state.align === "center"} onClick={() => chain().setTextAlign("center").run()}>
        <Icon path={icons.alignCenter} />
      </Tool>
      <Tool label="Align right" active={state.align === "right"} onClick={() => chain().setTextAlign("right").run()}>
        <Icon path={icons.alignRight} />
      </Tool>
      <Divider />
      <Tool label="Bulleted list" active={state.bullets} onClick={() => chain().toggleBulletList().run()}>
        <Icon path={icons.bullets} />
      </Tool>
      <Tool label="Numbered list" active={state.numbers} onClick={() => chain().toggleOrderedList().run()}>
        <Icon path={icons.numbers} />
      </Tool>
      <Tool label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Icon path={icons.quote} />
      </Tool>
      <Divider />
      <Tool label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <Icon path={icons.clear} />
      </Tool>
    </div>
  );
}

type ToolProps = { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode };

function Tool({ label, onClick, active, disabled, children }: ToolProps) {
  return (
    <button
      type="button"
      className={`tool${active ? " active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor's selection while clicking toolbar buttons.
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="divider" aria-hidden="true" />;
