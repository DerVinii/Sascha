/**
 * Platzierung für Menüs, die per `position: fixed` an einem Knopf hängen.
 *
 * Regel: Das Menü liegt immer vollständig im sichtbaren Fenster. Es klappt nach
 * unten auf, solange dort Platz ist, sonst nach oben; reicht es nirgends, wird
 * die Höhe gekürzt und die Liste scrollt selbst. Ohne diese Rechnung lief das
 * Variablen-Menü im Kampagnen-Dialog unten aus dem Bild — die letzten Einträge
 * waren nicht erreichbar.
 */

export type MenuRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export type MenuOptions = {
  /** Wunschbreite; wird bei schmalen Fenstern gekürzt. */
  width: number;
  /** Wunschhöhe; darüber hinaus scrollt die Liste. */
  maxHeight: number;
  /** Sichtfenster — im Browser window.innerWidth/innerHeight. */
  viewport: { width: number; height: number };
  /** Sicherheitsabstand zum Fensterrand. */
  padding?: number;
  /** Abstand zwischen Knopf und Menü. */
  gap?: number;
};

/** Rechteck des auslösenden Knopfs (Teilmenge von DOMRect). */
export type AnchorRect = {
  left: number;
  top: number;
  bottom: number;
};

export function menuPosition(anchor: AnchorRect, opts: MenuOptions): MenuRect {
  const padding = opts.padding ?? 8;
  const gap = opts.gap ?? 4;
  const { width: vw, height: vh } = opts.viewport;

  const width = Math.max(0, Math.min(opts.width, vw - 2 * padding));
  const platzUnten = vh - anchor.bottom - gap - padding;
  const platzOben = anchor.top - gap - padding;

  // Nach oben klappen, wenn unten nicht die volle Höhe passt und oben mehr Platz ist.
  const nachOben = platzUnten < opts.maxHeight && platzOben > platzUnten;
  const platz = Math.max(nachOben ? platzOben : platzUnten, 0);

  let maxHeight = Math.min(opts.maxHeight, platz);
  let top = nachOben ? anchor.top - gap - maxHeight : anchor.bottom + gap;

  // Notnagel für sehr flache Fenster: oben andocken und auf das kürzen, was
  // wirklich da ist — lieber ein kurzes scrollbares Menü als eines im Nirgendwo.
  if (top < padding) top = padding;
  maxHeight = Math.max(0, Math.min(maxHeight, vh - top - padding));

  return {
    left: Math.max(padding, Math.min(anchor.left, vw - width - padding)),
    top,
    width,
    maxHeight,
  };
}
