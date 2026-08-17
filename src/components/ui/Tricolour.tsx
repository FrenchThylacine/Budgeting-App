import React from "react";

/**
 * A thin French tricolour rule.
 *
 * The whole visual signature, in three segments and two pixels. It sits at the
 * top edge of the shell and of the sign-in card, which is where a printed
 * document would carry its masthead rule.
 *
 * Deliberately small. The brief for this identity is "if you know what
 * inspired it, you notice it" — a full-width flag would be the opposite, and
 * would also read as a status bar, which is a meaning it must not carry.
 *
 * Purely decorative, so it is hidden from assistive technology: announcing
 * "blue white red" before every screen would be noise.
 */
export const Tricolour: React.FC<{ className?: string }> = ({ className = "" }) => (
  <span className={`tricolour ${className}`} aria-hidden="true">
    <span className="tricolour-blue" />
    <span className="tricolour-white" />
    <span className="tricolour-red" />
  </span>
);
