;; web/stdlib.scm — the paper's prelude. Scheme, portable: everything here
;; runs on any Scheme with the FFI floor provided. The floor is small and
;; mechanical (see lisp.ts): event emission, log folds, string concat.
;; Everything above it — including this file — is the language we own.

(define (string-append . xs) (apply concat xs))

(define (cadr x) (car (cdr x)))
(define (caddr x) (car (cdr (cdr x))))

;; (when test body…) — the one-conditional every program wants
(define-macro (when test . body)
  `(if ,test (begin ,@body)))
