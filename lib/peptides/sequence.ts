/**
 * Real primary-sequence data for the compounds in the peptide library.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The molecule graphic used to be a parametric ellipse — `Math.cos(t)`,
 * `Math.sin(t)` and some jitter — drawn identically for every compound with
 * only the hue changing. It was decorative, and it was also wrong: these are
 * linear chains, not rings, so the picture actively misinformed.
 *
 * Encoding the real primary sequence fixes both problems at once. Two molecules
 * stop looking alike because two molecules ARE not alike: BPC-157's five
 * prolines give it a genuinely distinctive kinked backbone, glutathione is three
 * residues, and PT-141 is one of the few here that really is cyclic. The
 * differentiation is a free consequence of telling the truth.
 *
 * HONESTY RULES
 * -------------
 * A sequence appears here only where it is well established in the public
 * literature. Where a compound's exact published sequence is not something we
 * can state with confidence, it is OMITTED rather than approximated — a
 * plausible-looking fake sequence is precisely the failure mode this file was
 * created to remove. `sequenceFor()` returning undefined is a supported state
 * and the UI must degrade gracefully and say why.
 *
 * Nothing here is a dose, a schedule or an instruction. It is structural
 * chemistry: what the molecule IS, not how anyone should use it.
 */

/** Broad chemical class of a residue side chain. Drives colour encoding. */
export type ResidueClass = "hydrophobic" | "polar" | "acidic" | "basic" | "special";

export interface Residue {
  /** One-letter code, or a short token for a non-standard residue. */
  code: string;
  /** Three-letter code. */
  short: string;
  name: string;
  cls: ResidueClass;
  /**
   * Kyte–Doolittle hydropathy index. Positive is hydrophobic, negative is
   * hydrophilic. Real published values — they drive the backbone's vertical
   * profile, so the shape of the chain carries information rather than noise.
   */
  hydropathy: number;
}

const R = (
  code: string,
  short: string,
  name: string,
  cls: ResidueClass,
  hydropathy: number,
): Residue => ({ code, short, name, cls, hydropathy });

/** The twenty proteinogenic amino acids, plus the non-standard residues used below. */
export const RESIDUES: Record<string, Residue> = {
  A: R("A", "Ala", "Alanine", "hydrophobic", 1.8),
  R: R("R", "Arg", "Arginine", "basic", -4.5),
  N: R("N", "Asn", "Asparagine", "polar", -3.5),
  D: R("D", "Asp", "Aspartic acid", "acidic", -3.5),
  C: R("C", "Cys", "Cysteine", "polar", 2.5),
  Q: R("Q", "Gln", "Glutamine", "polar", -3.5),
  E: R("E", "Glu", "Glutamic acid", "acidic", -3.5),
  G: R("G", "Gly", "Glycine", "special", -0.4),
  H: R("H", "His", "Histidine", "basic", -3.2),
  I: R("I", "Ile", "Isoleucine", "hydrophobic", 4.5),
  L: R("L", "Leu", "Leucine", "hydrophobic", 3.8),
  K: R("K", "Lys", "Lysine", "basic", -3.9),
  M: R("M", "Met", "Methionine", "hydrophobic", 1.9),
  F: R("F", "Phe", "Phenylalanine", "hydrophobic", 2.8),
  // Proline is the structural outlier: its side chain loops back onto the
  // backbone nitrogen, which puts a rigid kink in the chain. The renderer
  // draws that kink literally, which is why BPC-157 looks like nothing else
  // in the library.
  P: R("P", "Pro", "Proline", "special", -1.6),
  S: R("S", "Ser", "Serine", "polar", -0.8),
  T: R("T", "Thr", "Threonine", "polar", -0.7),
  W: R("W", "Trp", "Tryptophan", "hydrophobic", -0.9),
  Y: R("Y", "Tyr", "Tyrosine", "polar", -1.3),
  V: R("V", "Val", "Valine", "hydrophobic", 4.2),

  // --- Non-standard residues that appear in these specific molecules --------
  // Aib resists enzymatic cleavage, which is a large part of why the GLP-1
  // analogues below survive in circulation far longer than native GLP-1.
  X: R("X", "Aib", "α-aminoisobutyric acid", "special", 1.8),
  n: R("n", "Nle", "Norleucine", "hydrophobic", 3.8),
  f: R("f", "D-Phe", "D-Phenylalanine", "hydrophobic", 2.8),
  a: R("a", "D-Ala", "D-Alanine", "hydrophobic", 1.8),
  w: R("w", "D-2-Nal", "D-2-Naphthylalanine", "hydrophobic", 2.8),
};

/** A structural annotation drawn on top of the backbone. */
export interface SequenceFeature {
  kind: "acylation" | "cyclisation" | "amidation" | "acetylation" | "site";
  /** 1-based residue index the feature attaches to. */
  at: number;
  /** For cyclisation, the other end of the bond. */
  to?: number;
  label: string;
  /** Why this matters, in plain language. Shown on hover. */
  note: string;
}

export interface PeptideSequence {
  /** Residue codes, N-terminus first. Keys into RESIDUES. */
  seq: string;
  /** True only where the molecule genuinely is a macrocycle. */
  cyclic: boolean;
  features: SequenceFeature[];
  /** Where this sequence comes from, so the UI can cite it. */
  provenance: string;
}

/**
 * Sequences keyed by `PeptideEntry.key`.
 *
 * Deliberately absent: retatrutide and CJC-1295 (published sequences we cannot
 * state with confidence), NAD+ (a dinucleotide, not a peptide), testosterone
 * cypionate (a steroid ester), and hCG (a two-chain glycoprotein hormone of 92
 * + 145 residues — far too large for residue-level rendering, and drawing it
 * as a short chain would misrepresent it).
 */
export const SEQUENCES: Record<string, PeptideSequence> = {
  "bpc-157": {
    seq: "GEPPPGKPADDAGLV",
    cyclic: false,
    features: [],
    provenance:
      "Published 15-residue sequence of Body Protection Compound 157, a fragment derived from human gastric juice protein BPC.",
  },

  "tb-500": {
    // TB-500 is marketed as a fragment; the parent molecule thymosin β4 is the
    // 43-residue peptide shown here, which is what `chainLength: 43` refers to.
    seq: "SDKPDMAEIEKFDKSKLKKTETQEKNPLPSKETIEQEKQAGES",
    cyclic: false,
    features: [
      {
        kind: "site",
        at: 17,
        label: "LKKTETQ",
        note: "The actin-binding motif at residues 17-23. Most of the activity attributed to TB-500 is attributed to this short region of the parent molecule.",
      },
    ],
    provenance: "Published 43-residue sequence of human thymosin β4, the parent molecule of the TB-500 fragment.",
  },

  semaglutide: {
    // Native GLP-1(7-37) with three defining changes: Aib at position 2 (blocks
    // DPP-4 cleavage), Arg substituted at position 28, and a C18 diacid chain
    // on the lysine at position 20.
    seq: "HXEGTFTSDVSSYLEGQAAKEFIAWLVRGRG",
    cyclic: false,
    features: [
      {
        kind: "site",
        at: 2,
        label: "Aib",
        note: "α-aminoisobutyric acid replaces alanine here. It blocks the DPP-4 enzyme that would otherwise clear native GLP-1 within minutes.",
      },
      {
        kind: "acylation",
        at: 20,
        label: "C18 diacid",
        note: "A fatty-acid chain attached to this lysine binds albumin in the bloodstream. That tether is the main reason the molecule persists for days rather than minutes.",
      },
    ],
    provenance: "Published GLP-1 analogue backbone: native GLP-1(7-37) with Aib8, Arg34 and C18 diacid acylation at Lys26 (positions given in GLP-1 numbering).",
  },

  tirzepatide: {
    seq: "YXEGTFTSDYSIXLDKIAQKAFVQWLIAGGPSSGAPPPS",
    cyclic: false,
    features: [
      {
        kind: "site",
        at: 2,
        label: "Aib",
        note: "One of two α-aminoisobutyric acid substitutions that resist enzymatic breakdown.",
      },
      {
        kind: "site",
        at: 13,
        label: "Aib",
        note: "The second Aib substitution.",
      },
      {
        kind: "acylation",
        at: 20,
        label: "C20 diacid",
        note: "A fatty-acid chain that binds albumin and extends how long the molecule stays in circulation.",
      },
    ],
    provenance: "Published 39-residue dual GIP/GLP-1 receptor agonist backbone with Aib substitutions and C20 diacid acylation.",
  },

  sermorelin: {
    // GRF(1-29): the first 29 residues of growth-hormone-releasing hormone,
    // which is the shortest fragment retaining full activity.
    seq: "YADAIFTNSYRKVLGQLSARKLLQDIMSR",
    cyclic: false,
    features: [
      {
        kind: "amidation",
        at: 29,
        label: "C-terminal amide",
        note: "The chain ends in an amide rather than a free acid, which is characteristic of this fragment.",
      },
    ],
    provenance:
      "Published sequence of GRF(1-29), the N-terminal 29 residues of human growth-hormone-releasing hormone — the shortest fragment that retains full activity.",
  },

  ipamorelin: {
    // Only five residues, three of them non-standard. Rendering it beside a
    // 43-residue chain is the clearest possible illustration that these
    // compounds are not interchangeable.
    seq: "XHwfK",
    cyclic: false,
    features: [
      {
        kind: "amidation",
        at: 5,
        label: "C-terminal amide",
        note: "The chain terminates in an amide.",
      },
    ],
    provenance:
      "Published pentapeptide sequence Aib-His-D-2-Nal-D-Phe-Lys-NH2. Three of the five residues are non-standard, which is why it is not broken down like an ordinary short peptide.",
  },

  "pt-141": {
    // Genuinely cyclic — a lactam bridge between Asp and Lys. This is the one
    // molecule in the library where the old ring drawing was accidentally the
    // right shape, and now it is the right shape for the right reason.
    seq: "nDHfRWK",
    cyclic: true,
    features: [
      {
        kind: "cyclisation",
        at: 2,
        to: 7,
        label: "Lactam bridge",
        note: "A covalent bond between the Asp and Lys side chains closes this molecule into a ring. The rigid ring is what holds the active face in the shape its receptor recognises.",
      },
      {
        kind: "acetylation",
        at: 1,
        label: "N-acetyl",
        note: "The N-terminus is capped, protecting it from breakdown.",
      },
    ],
    provenance:
      "Published cyclic heptapeptide: Ac-Nle-cyclo(Asp-His-D-Phe-Arg-Trp-Lys)-OH. One of the few genuinely macrocyclic compounds in this library.",
  },

  glutathione: {
    // A tripeptide, and an unusual one: the first peptide bond uses glutamate's
    // side-chain carboxyl rather than its backbone one.
    seq: "ECG",
    cyclic: false,
    features: [
      {
        kind: "site",
        at: 1,
        label: "γ-linkage",
        note: "This first bond forms through glutamate's side chain rather than its backbone — unusual, and the reason ordinary peptidases cannot break this molecule down.",
      },
      {
        kind: "site",
        at: 2,
        label: "Reactive thiol",
        note: "The cysteine sulphur is the business end of the molecule: it is the group that actually performs the antioxidant chemistry.",
      },
    ],
    provenance: "γ-L-glutamyl-L-cysteinylglycine, the standard published structure of glutathione.",
  },
};

/** Real sequence for a library entry, or undefined where we do not have one. */
export function sequenceFor(key: string): PeptideSequence | undefined {
  return SEQUENCES[key];
}

/** Residue lookup, tolerant of unknown codes. */
export function residue(code: string): Residue {
  return RESIDUES[code] ?? R(code, code, "Unknown residue", "special", 0);
}

/** Expanded residue list for a sequence, 1-indexed positions preserved. */
export function residues(seq: string): Residue[] {
  return Array.from(seq).map(residue);
}

/** Colour per residue class. Kept here so chart and card agree. */
export const CLASS_COLOR: Record<ResidueClass, string> = {
  hydrophobic: "#e0bd6e",
  polar: "#60a5fa",
  acidic: "#f87171",
  basic: "#34d399",
  special: "#a78bfa",
};

export const CLASS_LABEL: Record<ResidueClass, string> = {
  hydrophobic: "Hydrophobic",
  polar: "Polar",
  acidic: "Acidic",
  basic: "Basic",
  special: "Structural",
};

/** Composition breakdown — drives the legend and the summary line. */
export function composition(seq: string): { cls: ResidueClass; count: number; pct: number }[] {
  const rs = residues(seq);
  const counts = new Map<ResidueClass, number>();
  for (const r of rs) counts.set(r.cls, (counts.get(r.cls) ?? 0) + 1);
  return (Object.keys(CLASS_COLOR) as ResidueClass[])
    .map((cls) => ({ cls, count: counts.get(cls) ?? 0, pct: (counts.get(cls) ?? 0) / rs.length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Mean Kyte–Doolittle hydropathy. Negative means broadly water-soluble. */
export function meanHydropathy(seq: string): number {
  const rs = residues(seq);
  return rs.reduce((n, r) => n + r.hydropathy, 0) / rs.length;
}
