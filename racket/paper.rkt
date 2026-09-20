#lang racket

;; paper.rkt — the malleable-paper project's own ontology, written as a
;; runnable theory (design-by-program). Open in DrRacket, hit Run: the
;; theory prints itself, checks itself, and an alignment to the widget's
;; world is checked — one of its mappings is deliberately broken so you
;; can see a verdict fail.
;;
;; This file is FLOOR: theory in git-time. Facts below are claims from
;; the project's ruling log, restated as path equations — where a ruling
;; can't be written as a fact, that's a foundation not yet poured.

(require "olog.rkt")

;; ── the paper olog ───────────────────────────────────────────────
;; Types are noun phrases; aspects are functional arrows; facts are
;; path equations the theory asserts.

(define paper
  (make-olog 'paper
    (list
      (type 'log      "a log")
      (type 'act      "an act")
      (type 'event    "an event")
      (type 'kind     "a kind")
      (type 'lexicon  "a lexicon")
      (type 'floor    "the floor")
      (type 'fold     "a fold")
      (type 'state    "a state")
      (type 'view     "a view")
      (type 'eye      "an eye")
      (type 'node     "a node")
      (type 'id       "an id")
      (type 'label    "a label")
      (type 'rename   "a rename")
      (type 'supersede "a supersede"))
    (list
      (aspect 'letters      'log     "has as letters"      'event)
      (aspect 'appended-by  'log     "is appended to by"   'act)
      (aspect 'is-an        'act     "is an"               'event)
      (aspect 'validated-by 'act     "is validated by"     'lexicon)
      (aspect 'lives-in     'lexicon "lives in"            'floor)
      (aspect 'declared-by  'fold    "is declared by"      'lexicon)
      (aspect 'takes        'fold    "takes"               'log)
      (aspect 'returns      'fold    "returns"             'state)
      (aspect 'returned-by  'state   "is returned by"      'fold)
      (aspect 'fold-of      'state   "is the fold of"      'log)
      (aspect 'projects     'state   "projects onto"       'view)
      (aspect 'seen-by      'view    "is seen by"          'eye)
      (aspect 'identity     'node    "has as identity"     'id)
      (aspect 'presence     'node    "has as presence"     'label)
      (aspect 'renamed-by   'node    "is renamed by"       'rename)
      (aspect 'renames      'rename  "renames"             'node)
      (aspect 'retracts     'supersede "retracts the presence of" 'node))
    (list
      ;; a state's fold is the fold that returns it, and the log it folds
      ;; is the log that fold takes  (a commutative square)
      (fact '(fold-of) '(returned-by takes))
      ;; identity is preserved by rename: the id of a renamed node is the
      ;; id of the node its rename renames  (ruling: identity is the fold
      ;; key, never the profile)
      (fact '(identity) '(renamed-by renames identity)))))

;; ── the widget's world, as an olog (for alignment practice) ──────

(define runtime
  (make-olog 'runtime
    (list
      (type 'box  "a box")
      (type 'pill "a label pill")
      (type 'line "a line"))
    (list
      (aspect 'carries  'box  "carries"         'pill)
      (aspect 'from     'line "is drawn from"   'box)
      (aspect 'to       'line "is drawn to"     'box)
      (aspect 'words    'pill "shows the words of" 'box))
    '()))

;; ── an alignment paper → runtime ─────────────────────────────────
;; Unmapped types/aspects are ○ (alignment incomplete) — design in
;; progress. Endpoint mismatches and unpreserved facts are ✗.

(define align-paper->runtime
  (make-functor 'F paper runtime
    (hash 'node 'box 'label 'pill)
    (hash 'presence '(carries))     ; node has as presence label
          ;; renamed-by: no widget gesture maps cleanly yet — left unmapped,
          ;; which the check reports as an incomplete alignment, honestly
          ))

;; a deliberately broken mapping: 'identity mapped to a path that lands
;; on a pill, not on anything id-like — the check must catch it
(define align-broken
  (make-functor 'F-broken paper runtime
    (hash 'node 'box 'id 'pill 'label 'pill)
    (hash 'identity '(carries words)  ; box → pill → box : ends at a BOX
          'presence '(carries))))

;; ── run the design session ───────────────────────────────────────

(module+ main
  (show paper)
  (printf "checks on ~a:~n" (olog-name paper))
  (print-verdicts (check-olog paper))
  (newline)
  (printf "alignment ~a (paper → runtime):~n" (functor-name align-paper->runtime))
  (print-verdicts (check-functor align-paper->runtime))
  (newline)
  (printf "alignment ~a (one mapping deliberately wrong):~n" (functor-name align-broken))
  (print-verdicts (check-functor align-broken))
  (newline)
  (printf "a reading: ~a~n" (read-path paper '(fold-of letters)))
  (printf "congruent? (identity) ≡ (renamed-by renames identity): ~a~n"
          (congruent? paper '(identity) '(renamed-by renames identity))))
