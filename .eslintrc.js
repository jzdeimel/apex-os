/**
 * ESLint config as JS rather than JSON, so the reasoning can live next to the
 * rule it explains. (A `_comment` key in .eslintrc.json is an invalid top-level
 * property and ESLint refuses the whole config — which is exactly how it broke
 * CI once already.)
 */
module.exports = {
  extends: "next/core-web-vitals",
  ignorePatterns: ["scripts/**", "hardload.mjs", ".next/**", "node_modules/**"],
  rules: {
    /**
     * Demoted to a warning DELIBERATELY. An apostrophe in JSX text renders
     * correctly and has no runtime effect, and 36 of them were the only thing
     * standing between this repo and a lint gate that actually gates. Keeping
     * them as errors would have meant `|| true` in CI forever, which is how the
     * three real bugs below stayed hidden.
     */
    "react/no-unescaped-entities": "warn",
    /**
     * Stays an ERROR. This is a crash, not a style opinion: a hook after an
     * early return throws "Rendered fewer hooks than expected" the moment the
     * branch flips. Three genuine violations were hiding behind the old
     * advisory lint — one of them on the client chart.
     */
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
};
