# racket/ — ologs as runnable theories

Design-by-program: the theory is a program you run and argue with, not a
diagram you stare at. This is FLOOR (type layer, git-time): theories here,
instances and check verdicts in a runtime log.

- `olog.rkt` — the library: types/aspects/facts, path readings,
  congruence closure, olog checks, functor (alignment) checks, dot output.
- `paper.rkt` — the project's own ontology as a runnable theory, plus an
  alignment to the widget's world with one deliberately broken mapping.
  Open in DrRacket and hit Run.

Run headless: `racket paper.rkt` (from this directory).

Verdict vocabulary: ✓ ok · ○ info (incomplete/ors) · ✗ fail.
Reference: Spivak & Kent, arXiv 1102.1889 §2–§4.
