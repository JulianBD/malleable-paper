#lang racket

;; olog.rkt — ologs as runnable theories (design-by-program).
;;
;; An olog is a presentation of a category: TYPES (boxes, English noun
;; phrases), ASPECTS (labeled arrows, each functional — one target per
;; source), and FACTS (path equations: two parallel paths that the theory
;; declares equal). Checks are programs: type-ends, composable paths,
;; orphan types, fact parallelism, congruence closure, and functoriality
;; of alignments between ologs.
;;
;; Placement: this file is FLOOR (type layer, git-time). Theories live
;; here; only instances (data) and check verdicts belong in a runtime log.
;;
;; Reference: Spivak & Kent, "Ologs: a Categorical Framework for
;; Knowledge Representation" (arXiv 1102.1889), §2–§4.

(require racket/list)
(provide (all-defined-out))

;; ── representation ──────────────────────────────────────────────

(struct olog (name types aspects facts) #:transparent)
;; types   : (hash/c symbol? string?)        type-id → English noun phrase
;; aspects : (hash/c symbol? aspect?)        aspect-id → aspect
;; facts   : (listof fact?)

(struct aspect (id from label to) #:transparent)   ; from/to = type ids
(struct fact (lhs rhs) #:transparent)              ; lhs/rhs = lists of aspect ids
(struct functor (name src tgt types aspects) #:transparent)
;; functor types   : (hash/c symbol? symbol?)        src type → tgt type
;; functor aspects : (hash/c symbol? (listof symbol?)) src aspect → tgt path

(struct verdict (kind msg) #:transparent)          ; kind ∈ '(ok info fail)

;; ── constructors (and functional updates — grow a theory in the REPL) ──

(define (make-olog name [types '()] [aspects '()] [facts '()])
  (olog name
        (for/hash ([t (in-list types)]) (values (first t) (second t)))
        (for/hash ([a (in-list aspects)])
          (values (aspect-id a) a))
        (list->vector
         (for/list ([f (in-list facts)])
           (match f
             [(list lhs rhs) (fact lhs rhs)]
             [_ f])))))

;; clause vocabulary for (make-olog ...):
;;   types   : (list (type 'event "an event") ...)
;;   aspects : (list (aspect 'letters 'log "has as letters" 'event) ...)  ; struct ctor
;;   facts   : (list (fact '(a b) '(c)) ...)                               ; struct ctor
(define (type id label) (list id label))

(define (add-type    o id label)
  (struct-copy olog o [types (hash-set (olog-types o) id label)]))
(define (add-aspect* o a)
  (struct-copy olog o [aspects (hash-set (olog-aspects o) (aspect-id a) a)]))
(define (add-fact    o f)
  (struct-copy olog o [facts (vector-append (olog-facts o) (vector f))]))

;; ── paths ───────────────────────────────────────────────────────
;; A path is a list of aspect ids, composable head-to-tail.
;; (path-ends o '(a b)) → (cons from-type to-type), or #f if invalid.

(define (aspect-ref o id) (hash-ref (olog-aspects o) id #f))

(define (path-ends o path)
  (let loop ([ids path] [cur #f] [first #f])
    (cond
      [(null? ids) (and cur (cons first cur))]
      [(not (aspect-ref o (car ids))) #f]
      [else (let* ([a (aspect-ref o (car ids))]
                   [src (aspect-from a)] [tgt (aspect-to a)])
              (cond
                [(not cur) (loop (cdr ids) tgt src)]
                [(eq? cur src) (loop (cdr ids) tgt first)]
                [else #f]))])))

;; all composable paths up to length n (BFS from each type)
(define (all-paths o [max-len 4])
  (define out '())
  (let grow ([paths (for/list ([(id a) (in-hash (olog-aspects o))]) (list id))]
             [len 1])
    (unless (> len max-len)
      (set! out (append paths out))
      (grow (for*/list ([p (in-list paths)]
                        [(id a) (in-hash (olog-aspects o))]
                        #:when (and (path-ends o p)
                                    (eq? (aspect-to (aspect-ref o (last p)))
                                         (aspect-from a))))
              (append p (list id)))
            (add1 len))))
  (filter (λ (p) (path-ends o p)) (remove-duplicates out)))

;; ── English readings ────────────────────────────────────────────
;; (read-path o '(letters is-an)) →
;;   "a log that has as letters an event that is an act-aspect…" style prose.
;; Mirrors path-to-sentence in the widget: the reading IS the check.

(define (type-label o id) (hash-ref (olog-types o) id (symbol->string id)))

(define (read-path o path)
  (define ends (path-ends o path))
  (unless ends (error 'read-path "invalid path: ~a" path))
  (let loop ([ids path] [acc (type-label o (car ends))])
    (if (null? ids)
        acc
        (let* ([a (aspect-ref o (car ids))])
          (loop (cdr ids)
                (string-append acc " that " (aspect-label a)
                               " " (type-label o (aspect-to a))))))))

;; ── congruence closure ──────────────────────────────────────────
;; Classes of parallel paths: reflexive/symmetric/transitive over the
;; declared facts, closed under left/right composition (if p ≡ q, then
;; a∘p ≡ a∘q and p∘a ≡ q∘a where composable). Bounded by the path
;; enumeration above — a sound approximation for small theories.

(define (congruence-classes o [max-len 4])
  (define paths (all-paths o max-len))
  (define find (make-hash)) ; path → representative path
  (define (rep p)
    (define r (hash-ref find p p))
    (if (equal? r p)
        p
        (let ([root (rep r)]) (hash-set! find p root) root)))
  (define (union! p q)
    (define rp (rep p)) (define rq (rep q))
    (unless (equal? rp rq)
      (hash-set! find rq rp)
      (for ([k (in-hash-keys find)]
            #:when (equal? (hash-ref find k) rq))
        (hash-set! find k rp))))
  (for ([p (in-list paths)]) (hash-set! find p p))       ; reflexive
  (for ([f (in-vector (olog-facts o))])                  ; symmetric via both
    (union! (fact-lhs f) (fact-rhs f))
    (union! (fact-rhs f) (fact-lhs f)))
  ;; transitive + congruence: fixpoint
  (let loop ()
    (define changed #f)
    ;; transitivity: class members sharing a rep are already unioned —
    ;; re-union declared facts through reps
    (for ([f (in-vector (olog-facts o))])
      (unless (equal? (rep (fact-lhs f)) (rep (fact-rhs f)))
        (union! (fact-lhs f) (fact-rhs f)) (set! changed #t)))
    ;; congruence: single-aspect pre/post-composition
    (for* ([p (in-list paths)] [q (in-list paths)]
           #:when (and (equal? (path-ends o p) (path-ends o q))
                       (not (equal? p q))
                       (equal? (rep p) (rep q)))
           [(id a) (in-hash (olog-aspects o))])
      (when (eq? (aspect-to a) (car (path-ends o p)))
        (unless (equal? (rep (cons id p)) (rep (cons id q)))
          (union! (cons id p) (cons id q)) (set! changed #t)))
      (when (eq? (aspect-from a) (cdr (path-ends o p)))
        (unless (equal? (rep (append p (list id))) (rep (append q (list id))))
          (union! (append p (list id)) (append q (list id))) (set! changed #t))))
    (when changed (loop)))
  find)

(define (congruent? o p q [max-len 4])
  (define find (congruence-classes o max-len))
  (define rp (hash-ref find p #f)) (define rq (hash-ref find q #f))
  (and rp rq (equal? rp rq)))

;; ── checks (verdicts are the design conversation) ───────────────

(define (check-olog o)
  (define verdicts '())
  (define (say k m) (set! verdicts (cons (verdict k m) verdicts)))
  ;; aspect ends must be declared types
  (for ([(id a) (in-hash (olog-aspects o))])
    (for ([end (list (aspect-from a) (aspect-to a))])
      (unless (hash-has-key? (olog-types o) end)
        (say 'fail (format "aspect ~a references undeclared type ~a" id end)))))
  ;; facts: valid, composable, parallel paths
  (for ([f (in-vector (olog-facts o))] [i (in-naturals)])
    (define l (path-ends o (fact-lhs f)))
    (define r (path-ends o (fact-rhs f)))
    (cond
      [(not (and l r)) (say 'fail (format "fact ~a: invalid path" i))]
      [(not (equal? l r))
       (say 'fail (format "fact ~a: paths not parallel (~a ≠ ~a)"
                          i (car l) (car r)))]
      [else (say 'ok (format "fact ~a: ~a = ~a"
                             i (read-path o (fact-lhs f))
                             (read-path o (fact-rhs f))))]))
  ;; orphan types: declared, no aspects touch them (info, not fail —
  ;; Spivak allows them, but they deserve a hard look)
  (for ([(id lbl) (in-hash (olog-types o))]
        #:unless (for/or ([(aid a) (in-hash (olog-aspects o))]
                          #:when (or (eq? (aspect-from a) id)
                                     (eq? (aspect-to a) id)))
                   #t))
    (say 'info (format "orphan type ~a (~a)" id lbl)))
  (reverse verdicts))

(define (check-functor f)
  (define o (functor-src f)) (define d (functor-tgt f))
  (define tv (functor-types f)) (define av (functor-aspects f))
  (define verdicts '())
  (define (say k m) (set! verdicts (cons (verdict k m) verdicts)))
  ;; types: unmapped is info (alignment in progress); mapped must exist
  (for ([(id to) (in-hash tv)])
    (unless (hash-has-key? (olog-types d) to)
      (say 'fail (format "type ~a → ~a: ~a undeclared in ~a"
                         id to to (olog-name d)))))
  (define unmapped-types
    (for/list ([id (in-hash-keys (olog-types o))]
               #:unless (hash-has-key? tv id))
      id))
  (unless (null? unmapped-types)
    (say 'info (format "~a types unmapped — alignment incomplete: ~a"
                       (length unmapped-types) unmapped-types)))
  ;; aspects: mapped path must be valid in d and preserve endpoints
  (for ([(id path) (in-hash av)])
    (define a (aspect-ref o id))
    (define ends (path-ends d path))
    (cond
      [(not a) (say 'fail (format "aspect mapping for unknown aspect ~a" id))]
      [(not ends) (say 'fail (format "aspect ~a → ~a: invalid path in ~a"
                                     id path (olog-name d)))]
      [else (let ([f-from (hash-ref tv (aspect-from a) #f)]
                  [f-to   (hash-ref tv (aspect-to a) #f)])
              (unless (and f-from (eq? (car ends) f-from))
                (say 'fail (format "aspect ~a: source ~a maps to ~a, path starts at ~a"
                                   id (aspect-from a) f-from (car ends))))
              (unless (and f-to (eq? (cdr ends) f-to))
                (say 'fail (format "aspect ~a: target ~a maps to ~a, path ends at ~a"
                                   id (aspect-to a) f-to (cdr ends)))))]))
  (define unmapped-aspects
    (for/list ([id (in-hash-keys (olog-aspects o))]
               #:unless (hash-has-key? av id))
      id))
  (unless (null? unmapped-aspects)
    (say 'info (format "~a aspects unmapped — alignment incomplete: ~a"
                       (length unmapped-aspects) unmapped-aspects)))
  ;; facts must be preserved: mapped lhs ≡ mapped rhs in d
  (for ([fc (in-vector (olog-facts o))] [i (in-naturals)])
    (define (map-path p)
      (append* (for/list ([id (in-list p)]) (hash-ref av id '(#f)))))
    (define (fully-mapped? p)
      (andmap (λ (id) (hash-has-key? av id)) p))
    (cond
      [(not (and (fully-mapped? (fact-lhs fc))
                 (fully-mapped? (fact-rhs fc))))
       (say 'info (format "fact ~a not checkable — alignment incomplete" i))]
      [else
       (define ml (map-path (fact-lhs fc)))
       (define mr (map-path (fact-rhs fc)))
       (if (and (path-ends d ml) (path-ends d mr)
                (congruent? d ml mr))
           (say 'ok (format "fact ~a preserved by ~a" i (functor-name f)))
           (say 'fail (format "fact ~a NOT preserved by ~a: ~a ≢ ~a in ~a"
                              i (functor-name f) ml mr (olog-name d))))]))
  (reverse verdicts))

(define (make-functor name src tgt type-map aspect-map)
  (functor name src tgt type-map aspect-map))

;; ── printing ────────────────────────────────────────────────────

(define (print-verdicts verdicts [port (current-output-port)])
  (for ([v (in-list verdicts)])
    (fprintf port "~a ~a~n"
             (case (verdict-kind v) [(ok) "✓"] [(info) "○"] [(fail) "✗"])
             (verdict-msg v))))

(define (show o [port (current-output-port)])
  (fprintf port "olog ~a — ~a types, ~a aspects, ~a facts~n"
           (olog-name o)
           (hash-count (olog-types o))
           (hash-count (olog-aspects o))
           (vector-length (olog-facts o)))
  (for ([(id lbl) (in-hash (olog-types o))])
    (fprintf port "  [~a]~n    ~a~n" id lbl))
  (for ([(id a) (in-hash (olog-aspects o))])
    (fprintf port "  (~a) ~a --~a--> ~a~n"
             id (aspect-from a) (aspect-label a) (aspect-to a)))
  (for ([f (in-vector (olog-facts o))])
    (fprintf port "  = ~a~n        = ~a~n"
             (read-path o (fact-lhs f))
             (read-path o (fact-rhs f))))
  (void))

;; graphviz dot — a theory you can look at
(define (olog->dot o)
  (define lines
    (append
     (for/list ([(id lbl) (in-hash (olog-types o))])
       (format "  ~a [label=\"~a\"];" id lbl))
     (for/list ([(id a) (in-hash (olog-aspects o))])
       (format "  ~a -> ~a [label=\"~a\"];"
               (aspect-from a) (aspect-to a) (aspect-label a)))))
  (string-append "digraph " (symbol->string (olog-name o)) " {\n"
                 (string-join lines "\n") "\n}\n"))
