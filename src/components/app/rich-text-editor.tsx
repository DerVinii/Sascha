"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import {
  MAIL_FONT,
  MAX_IMAGE_BYTES,
  sanitizeEmailHtml,
} from "@/lib/signature";

/**
 * Rich-Text-Editor im Outlook-Stil für Signaturen und den Mail-Composer.
 *
 * Bewusst auf `document.execCommand` gebaut: formal veraltet, aber in allen
 * relevanten Browsern implementiert und die einzige Variante, die ohne
 * zusätzliche Abhängigkeit sauberes, E-Mail-taugliches HTML erzeugt
 * (<b>/<i>/<u> statt Klassen, Inline-Styles statt Stylesheet).
 *
 * Bilder werden als Data-URI eingebettet und lassen sich per Anfasser in der
 * Größe ziehen. Beim Versand macht die Server-Seite daraus CID-Anhänge — nur
 * so sieht der Empfänger das Bild tatsächlich (siehe mailbox-actions.ts).
 */

const FONTS: { label: string; value: string }[] = [
  { label: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
];

const SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "36"];

/** Startbreite eines frisch eingefügten Bildes (px). */
const INSERT_WIDTH = 320;
/** Kandidaten-Breiten beim Herunterrechnen, bis das Bild klein genug ist. */
const SCALE_STEPS = [1200, 900, 600, 400];

type Box = { left: number; top: number; width: number; height: number };

export function RichTextEditor({
  value,
  onChange,
  minHeight = 180,
  maxHeight,
  placeholder,
  onError,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  maxHeight?: number;
  placeholder?: string;
  onError?: (message: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Letzter von uns gemeldeter HTML-Stand — verhindert, dass das Zurückspielen
  // des Props den Cursor bei jedem Tastendruck an den Anfang springen lässt.
  const lastHtml = useRef(value);
  const savedRange = useRef<Range | null>(null);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [empty, setEmpty] = useState(!value);

  // --- Grundmechanik --------------------------------------------------------

  const emit = useCallback(() => {
    const el = edRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastHtml.current = html;
    setEmpty(el.textContent?.trim() === "" && !el.querySelector("img"));
    onChangeRef.current(html);
  }, []);

  useEffect(() => {
    const el = edRef.current;
    if (!el) return;
    if (value !== lastHtml.current) {
      el.innerHTML = value;
      lastHtml.current = value;
      setSelImg(null);
      setBox(null);
    }
    setEmpty(el.textContent?.trim() === "" && !el.querySelector("img"));
  }, [value]);

  useEffect(() => {
    // Firefox hängt sonst eigene Anfasser an Bilder — die kollidieren mit
    // unseren und schreiben andere Attribute.
    try {
      document.execCommand("enableObjectResizing", false, "false");
      document.execCommand("enableInlineTableEditing", false, "false");
    } catch {
      /* nicht überall unterstützt */
    }
  }, []);

  // Auswahl dauerhaft mitschreiben: Klicks auf Toolbar/Selects nehmen dem
  // Editor den Fokus, ohne den gemerkten Bereich verlieren wir die Stelle.
  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (edRef.current?.contains(range.commonAncestorContainer)) {
        savedRange.current = range.cloneRange();
      }
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRange.current;
    if (!range || !edRef.current?.contains(range.commonAncestorContainer))
      return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const exec = useCallback(
    (command: string, arg?: string, useCss = false) => {
      const el = edRef.current;
      if (!el) return;
      el.focus();
      restoreSelection();
      try {
        document.execCommand("styleWithCSS", false, useCss ? "true" : "false");
      } catch {
        /* ältere Engines kennen den Schalter nicht */
      }
      document.execCommand(command, false, arg);
      emit();
    },
    [emit, restoreSelection],
  );

  /**
   * Schriftgröße: execCommand kennt nur die Stufen 1–7. Wir setzen Stufe 7 und
   * ersetzen die entstandenen <font size="7">-Knoten durch Spans mit echter
   * pt-Angabe — das versteht jeder Mail-Client.
   */
  const applyFontSize = useCallback(
    (pt: string) => {
      const el = edRef.current;
      if (!el) return;
      el.focus();
      restoreSelection();
      try {
        document.execCommand("styleWithCSS", false, "false");
      } catch {
        /* egal */
      }
      document.execCommand("fontSize", false, "7");
      el.querySelectorAll('font[size="7"]').forEach((node) => {
        const span = document.createElement("span");
        span.style.fontSize = `${pt}pt`;
        while (node.firstChild) span.appendChild(node.firstChild);
        node.replaceWith(span);
      });
      emit();
    },
    [emit, restoreSelection],
  );

  const applyHighlight = useCallback(
    (color: string) => {
      const el = edRef.current;
      if (!el) return;
      el.focus();
      restoreSelection();
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* egal */
      }
      // hiliteColor ist der Standard; einzelne Engines können nur backColor.
      if (!document.execCommand("hiliteColor", false, color)) {
        document.execCommand("backColor", false, color);
      }
      emit();
    },
    [emit, restoreSelection],
  );

  // --- Bild-Auswahl und Größenänderung -------------------------------------

  const measure = useCallback((img: HTMLImageElement): Box | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const a = img.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    return {
      left: a.left - b.left + wrap.scrollLeft,
      top: a.top - b.top + wrap.scrollTop,
      width: a.width,
      height: a.height,
    };
  }, []);

  const selectImage = useCallback(
    (img: HTMLImageElement | null) => {
      setSelImg(img);
      setBox(img ? measure(img) : null);
      if (img) {
        // Das Bild auch in der DOM-Auswahl markieren, damit Entf/Backspace es
        // löscht und ein neues Bild es ersetzt.
        const range = document.createRange();
        range.selectNode(img);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    },
    [measure],
  );

  // Klick außerhalb des Editors hebt die Bildauswahl auf.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setSelImg(null);
        setBox(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Position der Anfasser nachführen, wenn sich das Layout ändert.
  useEffect(() => {
    if (!selImg) return;
    const update = () => setBox(measure(selImg));
    window.addEventListener("resize", update);
    const wrap = wrapRef.current;
    wrap?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      wrap?.removeEventListener("scroll", update);
    };
  }, [selImg, measure]);

  const applyWidth = useCallback(
    (img: HTMLImageElement, rawWidth: number) => {
      const natW = img.naturalWidth || Math.round(rawWidth);
      const natH = img.naturalHeight || Math.round(rawWidth * 0.75);
      const width = Math.max(16, Math.min(1600, Math.round(rawWidth)));
      const height = Math.max(1, Math.round((width * natH) / natW));
      // Attribute UND Inline-Style setzen: Outlook rendert über den
      // Word-Motor und wertet die Attribute aus, Gmail/Apple Mail den Style.
      img.setAttribute("width", String(width));
      img.setAttribute("height", String(height));
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
      setBox(measure(img));
    },
    [measure],
  );

  const drag = useRef<{
    img: HTMLImageElement;
    startX: number;
    startWidth: number;
    dir: 1 | -1;
  } | null>(null);

  const onDragMove = useCallback(
    (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      ev.preventDefault();
      applyWidth(d.img, d.startWidth + (ev.clientX - d.startX) * d.dir);
    },
    [applyWidth],
  );

  const onDragEnd = useCallback(() => {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (drag.current) {
      drag.current = null;
      emit();
    }
  }, [onDragMove, emit]);

  function startDrag(e: React.PointerEvent, dir: 1 | -1) {
    if (!selImg) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      img: selImg,
      startX: e.clientX,
      startWidth: selImg.getBoundingClientRect().width,
      dir,
    };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  }

  useEffect(() => onDragEnd, [onDragEnd]);

  function deleteImage() {
    if (!selImg) return;
    selImg.remove();
    setSelImg(null);
    setBox(null);
    emit();
  }

  // --- Bild einfügen --------------------------------------------------------

  const insertImageFile = useCallback(
    async (file: File) => {
      try {
        const prepared = await prepareImage(file);
        const el = edRef.current;
        if (!el) return;
        el.focus();
        restoreSelection();
        document.execCommand(
          "insertHTML",
          false,
          `<img src="${prepared.dataUrl}" alt="" width="${prepared.width}" height="${prepared.height}" style="width:${prepared.width}px;height:${prepared.height}px;" />`,
        );
        emit();
      } catch (err) {
        onErrorRef.current?.(
          err instanceof Error ? err.message : "Bild konnte nicht eingefügt werden.",
        );
      }
    },
    [emit, restoreSelection],
  );

  // --- Render ---------------------------------------------------------------

  const naturalWidth = selImg?.naturalWidth || 0;

  return (
    <div ref={rootRef} className="rounded-md border border-line bg-surface">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImageFile(file);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      {/* Werkzeugleiste */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-bg/60 px-1.5 py-1 rounded-t-md">
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value, true);
            e.target.value = "";
          }}
          title="Schriftart"
          className="h-7 rounded border border-line bg-surface px-1 text-xs text-ink focus:outline-none"
        >
          <option value="">Schriftart</option>
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyFontSize(e.target.value);
            e.target.value = "";
          }}
          title="Schriftgröße"
          className="h-7 rounded border border-line bg-surface px-1 text-xs text-ink focus:outline-none"
        >
          <option value="">Größe</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Divider />
        <ToolButton icon={Bold} label="Fett" onClick={() => exec("bold")} />
        <ToolButton icon={Italic} label="Kursiv" onClick={() => exec("italic")} />
        <ToolButton
          icon={Underline}
          label="Unterstrichen"
          onClick={() => exec("underline")}
        />

        <ColorButton
          icon={Baseline}
          label="Schriftfarbe"
          defaultColor="#111827"
          onPick={(c) => exec("foreColor", c, true)}
        />
        <ColorButton
          icon={Highlighter}
          label="Texthervorhebung"
          defaultColor="#fef08a"
          onPick={applyHighlight}
        />

        <Divider />
        <ToolButton
          icon={AlignLeft}
          label="Linksbündig"
          onClick={() => exec("justifyLeft", undefined, true)}
        />
        <ToolButton
          icon={AlignCenter}
          label="Zentriert"
          onClick={() => exec("justifyCenter", undefined, true)}
        />
        <ToolButton
          icon={AlignRight}
          label="Rechtsbündig"
          onClick={() => exec("justifyRight", undefined, true)}
        />
        <ToolButton
          icon={List}
          label="Aufzählung"
          onClick={() => exec("insertUnorderedList")}
        />
        <ToolButton
          icon={ListOrdered}
          label="Nummerierung"
          onClick={() => exec("insertOrderedList")}
        />

        <Divider />
        <ToolButton
          icon={Link2}
          label="Link einfügen"
          onClick={() => {
            setLinkUrl("https://");
            setLinkOpen(true);
          }}
        />
        <ToolButton
          icon={ImagePlus}
          label="Bild einfügen"
          onClick={() => fileRef.current?.click()}
        />
        <ToolButton
          icon={RemoveFormatting}
          label="Formatierung entfernen"
          onClick={() => exec("removeFormat")}
        />
      </div>

      {/* Link-Leiste */}
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-line bg-bg/40 px-2 py-1.5">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            placeholder="https://…"
            className="h-7 flex-1 min-w-0 rounded border border-line bg-surface px-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-7 px-2.5 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover transition"
          >
            Einfügen
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-sub hover:text-ink hover:bg-bg transition"
            aria-label="Abbrechen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Schreibfläche */}
      <div
        ref={wrapRef}
        className="relative overflow-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <div
          ref={edRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder ?? "Inhalt"}
          spellCheck
          onInput={() => {
            // Ein gelöschtes Bild darf nicht weiter „ausgewählt" bleiben.
            if (selImg && !edRef.current?.contains(selImg)) {
              setSelImg(null);
              setBox(null);
            }
            emit();
          }}
          onBlur={emit}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              selectImage(target as HTMLImageElement);
            } else {
              setSelImg(null);
              setBox(null);
            }
          }}
          onPaste={(e) => {
            const data = e.clipboardData;
            const image = Array.from(data.files ?? []).find((f) =>
              f.type.startsWith("image/"),
            );
            if (image) {
              e.preventDefault();
              void insertImageFile(image);
              return;
            }
            const html = data.getData("text/html");
            if (html) {
              e.preventDefault();
              document.execCommand("insertHTML", false, sanitizeEmailHtml(html));
              emit();
            }
          }}
          className="px-3 py-2.5 text-sm text-ink outline-none [word-break:break-word]"
          style={{ minHeight, fontFamily: MAIL_FONT }}
        />

        {empty && placeholder && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-sub">
            {placeholder}
          </div>
        )}

        {/* Auswahlrahmen + Anfasser über dem Bild */}
        {selImg && box && (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
          >
            <div className="absolute inset-0 border-2 border-accent/70" />
            <Handle position="nw" onPointerDown={(e) => startDrag(e, -1)} />
            <Handle position="ne" onPointerDown={(e) => startDrag(e, 1)} />
            <Handle position="sw" onPointerDown={(e) => startDrag(e, -1)} />
            <Handle position="se" onPointerDown={(e) => startDrag(e, 1)} />

            {/* Größen-Leiste unter dem Bild (Outlook: „Bild formatieren") */}
            <div
              className="pointer-events-auto absolute top-full left-0 mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 shadow-lg"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span className="text-[11px] text-sub">Breite</span>
              <input
                type="number"
                min={16}
                max={1600}
                value={Math.round(box.width)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0)
                    applyWidth(selImg, next);
                }}
                onBlur={emit}
                className="h-7 w-16 rounded border border-line bg-bg px-1.5 text-xs text-ink focus:outline-none"
              />
              <span className="text-[11px] text-sub">px</span>
              {naturalWidth > 0 &&
                [25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      applyWidth(selImg, (naturalWidth * pct) / 100);
                      emit();
                    }}
                    className="h-7 px-1.5 rounded border border-line text-[11px] text-sub hover:text-ink hover:bg-bg transition"
                  >
                    {pct} %
                  </button>
                ))}
              <input
                value={selImg.getAttribute("alt") ?? ""}
                onChange={(e) => {
                  selImg.setAttribute("alt", e.target.value);
                }}
                onBlur={emit}
                placeholder="Alternativtext"
                className="h-7 w-32 rounded border border-line bg-bg px-1.5 text-xs text-ink placeholder:text-sub focus:outline-none"
              />
              <button
                type="button"
                onClick={deleteImage}
                title="Bild entfernen"
                className="h-7 w-7 inline-flex items-center justify-center rounded text-sub hover:text-err hover:bg-err/5 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function applyLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url || url === "https://") return;
    const el = edRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.isCollapsed) {
      document.execCommand(
        "insertHTML",
        false,
        `<a href="${url.replace(/"/g, "&quot;")}">${url
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</a>`,
      );
    } else {
      document.execCommand("createLink", false, url);
    }
    emit();
  }
}

// --- Bausteine ---------------------------------------------------------------

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-line" />;
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Fokus im Editor lassen — sonst geht die Auswahl beim Klick verloren.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded text-sub hover:text-ink hover:bg-bg transition"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ColorButton({
  icon: Icon,
  label,
  defaultColor,
  onPick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  defaultColor: string;
  onPick: (color: string) => void;
}) {
  const [color, setColor] = useState(defaultColor);
  return (
    <label
      title={label}
      className="relative h-7 w-7 inline-flex flex-col items-center justify-center rounded text-sub hover:text-ink hover:bg-bg transition cursor-pointer"
    >
      <Icon className="h-3.5 w-3.5" />
      <span
        aria-hidden
        className="mt-0.5 h-[3px] w-4 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <input
        type="color"
        value={color}
        aria-label={label}
        onChange={(e) => {
          setColor(e.target.value);
          onPick(e.target.value);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

const HANDLE_POS: Record<string, string> = {
  nw: "-left-1 -top-1 cursor-nwse-resize",
  ne: "-right-1 -top-1 cursor-nesw-resize",
  sw: "-left-1 -bottom-1 cursor-nesw-resize",
  se: "-right-1 -bottom-1 cursor-nwse-resize",
};

function Handle({
  position,
  onPointerDown,
}: {
  position: keyof typeof HANDLE_POS;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <span
      role="presentation"
      onPointerDown={onPointerDown}
      // touch-none: sonst scrollt die Seite beim Ziehen auf dem Handy.
      style={{ touchAction: "none" }}
      className={`pointer-events-auto absolute h-3 w-3 rounded-sm border border-white bg-accent shadow ${HANDLE_POS[position]}`}
    />
  );
}

// --- Bildaufbereitung --------------------------------------------------------

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    img.src = src;
  });
}

function renderScaled(
  img: HTMLImageElement,
  targetWidth: number,
  mime: string,
): string {
  const natW = img.naturalWidth || targetWidth;
  const natH = img.naturalHeight || targetWidth;
  const scale = targetWidth / natW;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(natW * scale));
  canvas.height = Math.max(1, Math.round(natH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG behält Transparenz (wichtig für Logos), JPEG bleibt JPEG.
  return mime === "image/jpeg"
    ? canvas.toDataURL("image/jpeg", 0.9)
    : canvas.toDataURL("image/png");
}

/**
 * Liest die Datei, rechnet zu große Bilder herunter und liefert die Data-URI
 * samt Startmaßen. Die Obergrenze schützt Datenbank und Mailversand: eine
 * Signatur wird bei jeder E-Mail mitgeschickt.
 */
async function prepareImage(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith("image/"))
    throw new Error("Bitte eine Bilddatei auswählen (PNG, JPG, GIF).");

  const original = await readDataUrl(file);
  const img = await loadImage(original);
  const natW = img.naturalWidth || 1;
  const natH = img.naturalHeight || 1;

  // GIF (Animation) und SVG (Vektor) würden über die Canvas ihre Eigenschaft
  // verlieren — die bleiben unverändert.
  const keepOriginal =
    file.type === "image/gif" || file.type === "image/svg+xml";

  let dataUrl = original;
  if (!keepOriginal && dataUrl.length > MAX_IMAGE_BYTES) {
    for (const step of SCALE_STEPS) {
      const scaled = renderScaled(img, Math.min(natW, step), file.type);
      if (!scaled) break;
      dataUrl = scaled;
      if (dataUrl.length <= MAX_IMAGE_BYTES) break;
    }
  }

  if (dataUrl.length > MAX_IMAGE_BYTES)
    throw new Error(
      "Das Bild ist zu groß (max. ca. 1,5 MB). Bitte ein kleineres Bild verwenden.",
    );

  const width = Math.min(natW, INSERT_WIDTH);
  const height = Math.max(1, Math.round((width * natH) / natW));
  return { dataUrl, width, height };
}
