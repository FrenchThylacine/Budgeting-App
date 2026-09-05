import React from "react";

/**
 * The thylacine pilot.
 * ====================
 *
 * The tour's character — a small, consistent illustration rather than a
 * fresh drawing per step. One body, one head, one cap, one scarf; poses
 * differ only in the arms, the eyes and (rarely) a couple of extra marks,
 * layered onto that shared base. That is what makes it read as the *same*
 * character throughout the tour instead of a slideshow of similar animals.
 *
 * **Fixed literals, not theme tokens.** Like the tricolour band and the
 * loading-screen aircraft (`AppMark.tsx`, `styles-extras.css`), this is
 * brand artwork: it should look identical in every theme, including a
 * custom one, rather than repainting itself the user's accent colour.
 *
 * **Why a thylacine.** A stand-in that is extinct, real, and almost nobody
 * has strong feelings about — unlike a dog or a cat breed, it carries no
 * one's existing pet, and unlike an invented creature it still reads as
 * "a real animal" rather than a logo. The pilot cap and goggles are what
 * make it *this app's* guide rather than a generic mascot.
 */
export type ThylacinePose =
  | "neutral"
  | "waving"
  | "pointing-left"
  | "pointing-right"
  | "pointing-up"
  | "pointing-down"
  | "explaining"
  | "thinking"
  | "warning"
  | "celebrating";

const FUR = "#E3B27E";
const FUR_LIGHT = "#F3DDBB";
const FUR_LINE = "#7A4B27";
const CAP = "#7A4B27";
const CAP_LINE = "#4A2A12";
const GOGGLE_GLASS = "#CFE0F0";
const GOGGLE_LINE = "#1B2A4A";
const NOSE = "#3A2415";
const EYE = "#2A1A0F";

const furProps = { fill: FUR, stroke: FUR_LINE, strokeWidth: 3, strokeLinejoin: "round" as const };
const furLightProps = { fill: FUR_LIGHT, stroke: FUR_LINE, strokeWidth: 3, strokeLinejoin: "round" as const };
const stripeProps = { stroke: FUR_LINE, strokeWidth: 5, fill: "none", strokeLinecap: "round" as const };
const capProps = { fill: CAP, stroke: CAP_LINE, strokeWidth: 3, strokeLinejoin: "round" as const };
const goggleGlassProps = { fill: GOGGLE_GLASS, stroke: GOGGLE_LINE, strokeWidth: 4 };
const goggleStrapProps = { fill: "none", stroke: CAP_LINE, strokeWidth: 5 };

/** Body, tail, legs and stripes — identical on every pose. */
const Base: React.FC = () => (
  <>
    <path {...furProps} d="M 142 168 Q 185 172 190 130 Q 192 108 180 104 Q 184 122 173 140 Q 163 158 140 162 Z" />
    <path {...stripeProps} d="M 179 116 Q 185 120 181 128" />
    <path {...stripeProps} d="M 170 134 Q 176 138 172 146" />
    <ellipse {...furProps} cx={90} cy={182} rx={15} ry={12} />
    <ellipse {...furProps} cx={130} cy={182} rx={15} ry={12} />
    <path
      {...furProps}
      d="M 65 118 Q 58 150 72 172 Q 85 188 110 188 Q 135 188 148 172 Q 162 150 155 118 Q 145 98 110 96 Q 75 98 65 118 Z"
    />
    <ellipse {...furLightProps} cx={110} cy={145} rx={26} ry={34} />
    <path {...stripeProps} d="M 128 108 Q 145 114 142 128" />
    <path {...stripeProps} d="M 124 130 Q 143 135 138 150" />
    <path {...stripeProps} d="M 118 152 Q 137 156 130 170" />
  </>
);

/** Head, ears, pilot cap and goggles — identical on every pose. */
const Head: React.FC = () => (
  <>
    <circle {...furProps} cx={110} cy={70} r={48} />
    <path {...furLightProps} d="M 88 80 Q 84 104 110 108 Q 136 104 132 80 Q 122 68 110 68 Q 98 68 88 80 Z" />
    <ellipse cx={110} cy={98} rx={8} ry={6} fill={NOSE} />
    <path {...furProps} d="M 68 42 Q 58 14 78 12 Q 92 22 86 48 Z" />
    <path {...furProps} d="M 152 42 Q 162 14 142 12 Q 128 22 134 48 Z" />
    <path {...capProps} d="M 60 62 Q 50 8 110 6 Q 170 8 160 62 Q 155 30 110 26 Q 65 30 60 62 Z" />
    <path {...capProps} d="M 63 55 Q 52 70 58 92 Q 68 98 74 88 Q 70 70 76 58 Z" />
    <path {...capProps} d="M 157 55 Q 168 70 162 92 Q 152 98 146 88 Q 150 70 144 58 Z" />
    <path {...goggleStrapProps} d="M 68 48 Q 110 40 152 48" />
    <circle {...goggleGlassProps} cx={84} cy={50} r={15} />
    <circle {...goggleGlassProps} cx={136} cy={50} r={15} />
    <path {...goggleStrapProps} d="M 99 50 L 121 50" />
  </>
);

/** Tricolour scarf, tied at the neck — identical on every pose. */
const Scarf: React.FC = () => (
  <>
    <path d="M 82 100 Q 110 114 138 100 L 141 112 Q 110 128 79 112 Z" fill="#0B2A5B" stroke="#07173A" strokeWidth={2} />
    <path d="M 88 104 Q 110 114 132 104 L 134 111 Q 110 122 86 111 Z" fill="#F5F5F5" />
    <path d="M 100 106 Q 110 111 120 106 L 121 111 Q 110 116 99 111 Z" fill="#B4162C" />
  </>
);

const ARMS: Record<ThylacinePose, React.ReactNode> = {
  neutral: (
    <>
      <path {...furProps} d="M 70 120 Q 48 128 46 152 Q 45 166 58 168 Q 70 170 70 156 Q 71 138 84 126 Z" />
      <path {...furProps} d="M 150 120 Q 172 128 174 152 Q 175 166 162 168 Q 150 170 150 156 Q 149 138 136 126 Z" />
    </>
  ),
  waving: (
    <>
      <path {...furProps} d="M 70 120 Q 48 128 46 152 Q 45 166 58 168 Q 70 170 70 156 Q 71 138 84 126 Z" />
      <path {...furProps} d="M 148 116 Q 168 96 172 66 Q 174 52 163 50 Q 153 48 152 60 Q 150 82 134 100 Z" />
    </>
  ),
  "pointing-left": (
    <>
      <path {...furProps} d="M 150 120 Q 172 128 174 152 Q 175 166 162 168 Q 150 170 150 156 Q 149 138 136 126 Z" />
      <path {...furProps} d="M 72 118 Q 40 110 18 118 Q 8 122 10 132 Q 12 142 24 138 Q 44 132 78 134 Z" />
    </>
  ),
  "pointing-right": (
    <>
      <path {...furProps} d="M 70 120 Q 48 128 46 152 Q 45 166 58 168 Q 70 170 70 156 Q 71 138 84 126 Z" />
      <path {...furProps} d="M 148 118 Q 180 110 202 118 Q 212 122 210 132 Q 208 142 196 138 Q 176 132 142 134 Z" />
    </>
  ),
  "pointing-up": (
    <>
      <path {...furProps} d="M 70 120 Q 48 128 46 152 Q 45 166 58 168 Q 70 170 70 156 Q 71 138 84 126 Z" />
      <path {...furProps} d="M 146 112 Q 158 80 156 44 Q 155 30 144 31 Q 133 32 134 46 Q 136 76 128 100 Z" />
    </>
  ),
  "pointing-down": (
    <>
      <path {...furProps} d="M 70 120 Q 48 128 46 152 Q 45 166 58 168 Q 70 170 70 156 Q 71 138 84 126 Z" />
      <path
        {...furProps}
        d="M 148 118 Q 172 122 176 152 Q 180 178 176 200 Q 175 210 165 209 Q 155 208 156 198 Q 159 176 156 152 Q 154 132 136 126 Z"
      />
    </>
  ),
  explaining: (
    <>
      <path {...furProps} d="M 72 122 Q 44 122 32 142 Q 26 154 36 160 Q 46 166 52 154 Q 60 138 82 130 Z" />
      <path {...furProps} d="M 148 122 Q 176 122 188 142 Q 194 154 184 160 Q 174 166 168 154 Q 160 138 138 130 Z" />
    </>
  ),
  thinking: (
    <>
      <path {...furProps} d="M 72 120 Q 50 128 48 152 Q 47 166 60 168 Q 72 170 72 156 Q 73 138 86 126 Z" />
      <path {...furProps} d="M 150 122 Q 168 110 138 94 Q 128 90 124 100 Q 121 108 131 112 Q 146 118 144 130 Z" />
    </>
  ),
  warning: (
    <>
      <path {...furProps} d="M 72 120 Q 50 128 48 152 Q 47 166 60 168 Q 72 170 72 156 Q 73 138 86 126 Z" />
      <path {...furProps} d="M 148 118 Q 168 112 172 92 Q 174 80 163 78 Q 152 76 151 88 Q 150 102 136 110 Z" />
    </>
  ),
  celebrating: (
    <>
      <path {...furProps} d="M 74 116 Q 54 90 50 56 Q 48 42 60 40 Q 72 38 73 52 Q 76 80 92 100 Z" />
      <path {...furProps} d="M 146 116 Q 166 90 170 56 Q 172 42 160 40 Q 148 38 147 52 Q 144 80 128 100 Z" />
      <circle cx={46} cy={34} r={3} fill="#FFCC00" />
      <circle cx={164} cy={30} r={3} fill="#FFCC00" />
      <circle cx={56} cy={24} r={2.4} fill="#0B2A5B" />
      <circle cx={154} cy={20} r={2.4} fill="#B4162C" />
    </>
  ),
};

const HAPPY_EYES = (
  <>
    <path d="M 90 80 Q 96 74 102 80" stroke={EYE} strokeWidth={4.5} fill="none" strokeLinecap="round" />
    <path d="M 118 80 Q 124 74 130 80" stroke={EYE} strokeWidth={4.5} fill="none" strokeLinecap="round" />
  </>
);
const UP_EYES = (
  <>
    <circle cx={96} cy={76} r={6} fill={EYE} />
    <circle cx={124} cy={76} r={6} fill={EYE} />
    <circle cx={97.5} cy={73} r={2} fill="white" />
    <circle cx={125.5} cy={73} r={2} fill="white" />
  </>
);
const NORMAL_EYES = (
  <>
    <circle cx={96} cy={80} r={6} fill={EYE} />
    <circle cx={124} cy={80} r={6} fill={EYE} />
    <circle cx={98.5} cy={77.5} r={2} fill="white" />
    <circle cx={126.5} cy={77.5} r={2} fill="white" />
  </>
);
const CONCERNED_EYES = (
  <>
    <circle cx={96} cy={81} r={5.5} fill={EYE} />
    <circle cx={124} cy={81} r={5.5} fill={EYE} />
    <path d="M 88 70 L 101 74" stroke={EYE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
    <path d="M 132 70 L 119 74" stroke={EYE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
  </>
);

const EYES: Record<ThylacinePose, React.ReactNode> = {
  neutral: NORMAL_EYES,
  waving: HAPPY_EYES,
  "pointing-left": NORMAL_EYES,
  "pointing-right": NORMAL_EYES,
  "pointing-up": UP_EYES,
  "pointing-down": CONCERNED_EYES,
  explaining: NORMAL_EYES,
  thinking: UP_EYES,
  warning: CONCERNED_EYES,
  celebrating: HAPPY_EYES,
};

const OPEN_MOUTH = <ellipse cx={110} cy={100} rx={6} ry={5} fill="#5C3A21" />;

const MOUTHS: Partial<Record<ThylacinePose, React.ReactNode>> = {
  explaining: OPEN_MOUTH,
  celebrating: OPEN_MOUTH,
};

export const Thylacine: React.FC<{ pose?: ThylacinePose; size?: number; className?: string }> = ({
  pose = "neutral",
  size = 96,
  className,
}) => (
  <svg viewBox="0 0 220 220" width={size} height={size} className={className} role="img" aria-hidden="true">
    <Base />
    <Head />
    {EYES[pose]}
    {MOUTHS[pose]}
    <Scarf />
    {ARMS[pose]}
  </svg>
);
