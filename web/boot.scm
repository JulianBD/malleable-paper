;; web/boot.scm — the boot program. The server reads this file at startup
;; and queues it as {kind:"eval", actor:"boot"}: no special path, the same
;; queue → drain → validate → append as any act. Everything below is
;; live-computed — counts fold the log as of this run, so a re-boot after
;; new events refreshes the numbers in place (frame_defs fold
;; latest-per-id; re-boots never duplicate the frame).
;;
;; Re-run on demand: GET /boot (re-reads this file, so edits take effect
;; without a server restart).
;;
;; NOTE (flagged, not built): definitions made here live only for this
;; evaluation — evaluate() builds a fresh LIPS environment per program, so
;; these helpers don't persist into later evals. A persistent env would
;; mean one long-lived environment with the floor rebound per-eval (its
;; readers/writers close over each eval's log and emit buffer) — a real
;; change to lisp.ts's shape, not smuggled in here. Boot re-defines what
;; it needs; stdlib.scm is prepended to every program anyway.

;; helpers, immediately used — boot composing over the stdlib
;; (string-append → the floor's concat) like any program
(define (stat label n)
  (string-append "- " label ": **" n "**\n"))

(define (join sep xs)
  (if (null? xs)
      ""
      (string-append (car xs)
                     (if (null? (cdr xs))
                         ""
                         (string-append sep (join sep (cdr xs)))))))

(define pending (pending-cards))

(frame "F-boot"
       "boot · the runtime starts here"
       (string-append
         "## the runtime, as read by a program\n\n"
         "This frame is `web/boot.scm`'s output — the server queued the file "
         "as an eval act at startup, the drain expanded it, and every number "
         "below was folded from the log at boot time. None of it is typed:\n\n"
         (stat "human messages" (count "human_message"))
         (stat "agent messages" (count "agent_message"))
         (stat "evals" (count "eval"))
         (stat "frame switches" (count "frame_switch"))
         (stat "frame defs" (count "frame_def"))
         (string-append "- pending cards: **"
                        (if (null? pending)
                            "none — the docket is clear"
                            (string-append (length pending) " open — " (join ", " pending)))
                        "**\n")
         "\nRe-run: `GET /boot` — latest-per-id, so this refreshes in place."))
