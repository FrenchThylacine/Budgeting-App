import type { Translator } from "../../domain/i18n";
import React, { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { faviconUrl, itemDomain, normalizeItemUrl, withAlpha } from "../../domain/wishlist";
import { ActivityIcon, IconPicker } from "./IconPicker";
import { Button } from "./Button";
import { AdvancedFields } from "./EditorSheet";
import { Field, FieldGroup } from "./Field";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * One mark, one resolution order, one fallback
 * ============================================
 * Wishlist items and activities both carry a visual identity, and they used to
 * carry it in two unrelated pieces of code: the wishlist resolved a favicon
 * with an `onError` net, and an activity had a library icon and nothing else.
 * A second architecture for the same job is how the two drift — and the drift
 * always ends in a broken image, because only one of the copies has the net.
 *
 * The order below is fixed and is the same everywhere:
 *
 *   1. **A direct image link.** The most specific thing the user can state, so
 *      it wins outright.
 *   2. **A library icon.** An explicit choice from the picker. It beats the
 *      site icon because many sites have none, and some answer with a generic
 *      placeholder that renders as something indistinguishable from a fault.
 *   3. **A site icon.** The favicon of the source website.
 *   4. **The fallback mark.** Never a broken image: every network-fetched
 *      layer has an `onError` that steps down to the next one.
 */

/**
 * Which of the four layers is actually on screen.
 *
 * Reported rather than inferred, because "there is an image link" and "the
 * image loaded" are different facts. Saying the first while showing the second
 * is how a broken link stays broken: the editor tells the user their image is
 * in use, and the card quietly shows something else.
 */
export type MarkLayer = "image" | "icon" | "site" | "fallback";

export interface MarkSource {
  /** A direct link to an image. Highest priority. */
  iconUrl?: string;
  /** A library icon name. */
  icon?: string;
  /** A website whose icon identifies the thing. */
  sourceUrl?: string;
}

interface EntityMarkProps {
  source: MarkSource;
  /** Tints the tile and colours the fallback glyph. */
  accent: string;
  size?: number;
  /** Drawn when nothing else resolves. */
  fallback?: React.ReactNode;
  radius?: number;
  /** Called whenever the layer actually being rendered changes. */
  onResolve?: (layer: MarkLayer) => void;
}

export const EntityMark: React.FC<EntityMarkProps> = ({
  source,
  accent,
  size = 34,
  fallback,
  radius = 10,
  onResolve,
}) => {
  const { t } = useTranslation();
  const iconUrl = normalizeItemUrl(source.iconUrl);
  const domain = itemDomain(source.sourceUrl);

  // Two independent failure flags, because the two layers fail independently:
  // a dead image link must fall through to the library icon, and only then to
  // the favicon.
  const [imageFailed, setImageFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  // A new link is a new chance to succeed. Without this, editing a broken URL
  // into a working one leaves the failure flag set and the mark never recovers
  // until the component unmounts.
  useEffect(() => setImageFailed(false), [iconUrl]);
  useEffect(() => setFaviconFailed(false), [domain]);

  const layer: MarkLayer = iconUrl && !imageFailed
    ? "image"
    : source.icon
      ? "icon"
      : domain && !faviconFailed
        ? "site"
        : "fallback";

  // In an effect, not during render: reporting up while the parent is
  // rendering is a state update during render, and doing it on every render
  // rather than on every *change* is an infinite loop.
  const report = React.useRef(onResolve);
  report.current = onResolve;
  useEffect(() => report.current?.(layer), [layer]);

  const inner = size - 14;

  const content = (() => {
    if (iconUrl && !imageFailed) {
      return (
        <img
          src={iconUrl}
          alt=""
          width={inner}
          height={inner}
          loading="lazy"
          // The app should not tell a third party which page the user is on.
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          style={{ display: "block", width: inner, height: inner, objectFit: "contain" }}
        />
      );
    }
    if (source.icon) {
      return <ActivityIcon name={source.icon} size={size - 16} color={accent} />;
    }
    if (domain && !faviconFailed) {
      return (
        <img
          src={faviconUrl(domain, 64)}
          alt=""
          width={inner}
          height={inner}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFaviconFailed(true)}
          style={{ display: "block", width: inner, height: inner, objectFit: "contain" }}
        />
      );
    }
    return fallback ?? <ShoppingBag size={size - 18} color={accent} />;
  })();

  return (
    <span
      aria-hidden="true"
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: radius,
        background: withAlpha(accent, 0.18),
        border: `1px solid ${withAlpha(accent, 0.28)}`,
        overflow: "hidden",
      }}
    >
      {content}
    </span>
  );
};

/**
 * What the mark will actually be, said in a sentence.
 *
 * The chain has four steps and any of them can quietly fail. Stating which one
 * is in force is the difference between choosing an icon and hoping for one.
 */
/**
 * What the mark is actually showing, in the reader's language.
 *
 * The translator is a parameter because this is a module-level helper rather
 * than a component — the same arrangement `describeSchedule` and
 * `describePaymentCycle` use in the domain.
 */
export function describeMarkSource(source: MarkSource, t: Translator, layer?: MarkLayer): string {
  const domain = itemDomain(source.sourceUrl);
  const wanted = normalizeItemUrl(source.iconUrl)
    ? "image"
    : source.icon
      ? "icon"
      : domain
        ? "site"
        : "fallback";

  // What the user asked for, and what they actually got, when those differ.
  // A link that 404s is invisible otherwise: the mark falls through to the
  // next source and looks perfectly fine, so the user never learns the link
  // is dead until they wonder why their logo never appeared.
  if (layer && layer !== wanted && wanted === "image") {
    const instead =
      layer === "icon"
        ? t("mark.insteadIcon")
        : layer === "site"
          ? t("mark.insteadSite", { domain })
          : t("mark.insteadFallback");
    return t("mark.imageFailed", { instead });
  }

  if (wanted === "image") return t("mark.usingImage");
  if (wanted === "icon") return t("mark.usingIcon");
  if (wanted === "site") {
    return layer === "fallback" ? t("mark.siteHasNoIcon", { domain }) : t("mark.usingSiteIcon", { domain });
  }
  return t("mark.none");
}


interface MarkFieldsProps {
  /**
   * The draft values **as typed**, not normalised.
   *
   * Normalising here would rewrite the field under the user's cursor: typing
   * the "a" of "azurpoly.com" would immediately become "https://a/". The
   * resolver below parses raw text perfectly well, and the value is normalised
   * once, on save.
   */
  source: MarkSource;
  /**
   * A second website to fall back to for the preview when `sourceUrl` is
   * empty — the shop, when the brand field has not been filled in. Never
   * written to any field; it only decides what the preview shows.
   */
  sourceFallbackUrl?: string;
  accent: string;
  /** Applied on any change; only the named keys are ever sent. */
  onChange: (patch: Partial<{ icon: string; iconUrl: string; sourceUrl: string }>) => void;
  /** Names the website field, which differs by entity. */
  sourceLabel: string;
  sourceHint: React.ReactNode;
  sourcePlaceholder: string;
  fallback?: React.ReactNode;
}

/**
 * The icon controls, shared by the activity editor and the wishlist editor.
 *
 * Everything the brief asks for in one place: a library icon with search and
 * groups, a custom image link, a website to take the icon from, a live preview
 * of the result, and one control that clears all three.
 */
export const MarkFields: React.FC<MarkFieldsProps> = ({
  source,
  sourceFallbackUrl,
  accent,
  onChange,
  sourceLabel,
  sourceHint,
  sourcePlaceholder,
  fallback,
}) => {
  const { t } = useTranslation();
  const iconUrlError = (source.iconUrl ?? "").trim().length > 0 && normalizeItemUrl(source.iconUrl) == null;
  const sourceUrlError = (source.sourceUrl ?? "").trim().length > 0 && normalizeItemUrl(source.sourceUrl) == null;
  const hasAnything = Boolean(source.icon || (source.iconUrl ?? "").trim() || (source.sourceUrl ?? "").trim());
  // What the preview is genuinely showing, reported back by the mark itself.
  const [layer, setLayer] = useState<MarkLayer | undefined>(undefined);
  const resolved: MarkSource = {
    ...source,
    sourceUrl: (source.sourceUrl ?? "").trim() || sourceFallbackUrl,
  };

  return (
    <>
      <FieldGroup title={t("mark.icon")}>
        {/* What the mark will actually be, resolved live from whatever is
            filled in. The chain has four steps and any of them can quietly
            fail — a site with no icon, an image link that 404s. Seeing the
            result before saving is the difference between choosing an icon and
            hoping for one.

            Inside the group rather than above it: floating between the
            previous group and this heading, it read as belonging to whatever
            came before. */}
        <Field label={t("mark.preview")} span group>
          <div className="wishlist-mark-preview">
            <EntityMark source={resolved} accent={accent} size={40} fallback={fallback} onResolve={setLayer} />
            <span className="text-caption">{describeMarkSource(resolved, t, layer)}</span>
          </div>
        </Field>
        <Field
          label={t("mark.fromTheLibrary")}
          span
          group
        >
          <IconPicker
            value={source.icon || undefined}
            accent={accent}
            label=""
            onChange={(name) => onChange({ icon: name ?? "" })}
          />
        </Field>
        {hasAnything && (
          <Field label={t("mark.startAgain")} group>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ icon: "", iconUrl: "", sourceUrl: "" })}
            >
              {t("mark.resetTheIcon")}
            </Button>
          </Field>
        )}
      </FieldGroup>

      {/* The library covers most cases in one click. An image link and a site
          to take the icon from are the answer when it does not, and asking
          everyone for two URLs to serve the minority is how an editor becomes
          a form nobody finishes. */}
      <AdvancedFields label={t("mark.useAnImageOrA")}>
      <FieldGroup title={t("mark.customIcon")}>
        <Field
          label={t("mark.imageLink")}
          span
          hint={
            iconUrlError ? (
              <span style={{ color: "var(--danger-text)" }}>{t("wishlist.enterAValidWebAddress")}</span>
            ) : (
              "A direct link to an image. It beats both the library icon and the site icon below. If it ever fails to load, the next one in the list is used instead of a broken image."
            )
          }
        >
          <input
            className="input"
            // Deliberately not type="url": the browser then demands a scheme
            // and silently refuses to submit what the placeholder suggests.
            // The app's own check is stricter anyway — it also rejects
            // javascript: and data:, which type="url" accepts.
            type="text"
            inputMode="url"
            placeholder={t("mark.exampleComLogoPng")}
            value={source.iconUrl ?? ""}
            onChange={(event) => onChange({ iconUrl: event.target.value })}
            style={{ borderColor: iconUrlError ? "var(--danger)" : undefined }}
          />
        </Field>
        <Field
          label={sourceLabel}
          span
          hint={
            sourceUrlError ? (
              <span style={{ color: "var(--danger-text)" }}>{t("wishlist.enterAValidWebAddress")}</span>
            ) : (
              sourceHint
            )
          }
        >
          <input
            className="input"
            type="text"
            inputMode="url"
            placeholder={sourcePlaceholder}
            value={source.sourceUrl ?? ""}
            onChange={(event) => onChange({ sourceUrl: event.target.value })}
            style={{ borderColor: sourceUrlError ? "var(--danger)" : undefined }}
          />
        </Field>
      </FieldGroup>
      </AdvancedFields>
    </>
  );
};
