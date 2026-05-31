// =============================================================
// Frakt landing — Pricing email capture (Session 4)
//
// Stub form: validates basic email format, then swaps the form for
// a confirmation message. NO actual email send for v1 — Tally form
// (or equivalent) wiring is a post-launch task. Flagged in code so
// it's easy to find when we wire the real backend.
// =============================================================

(function () {
  'use strict';

  // POST-LAUNCH TODO: replace this stub with a real submission to
  // Tally / ConvertKit / a Cloudflare Worker. Until then, we just
  // validate the format and confirm — no email is actually sent.
  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function boot() {
    const $form    = document.getElementById('pr-email-form');
    const $input   = document.getElementById('pr-email-input');
    const $error   = document.getElementById('pr-email-error');
    const $confirm = document.getElementById('pr-email-confirm');
    if (!$form || !$input || !$error || !$confirm) return;

    function clearError() {
      $error.setAttribute('hidden', '');
      $input.removeAttribute('aria-invalid');
    }

    function showError(msg) {
      $error.textContent = msg;
      $error.removeAttribute('hidden');
      $input.setAttribute('aria-invalid', 'true');
    }

    $input.addEventListener('input', clearError);

    $form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = ($input.value || '').trim();
      if (!isValidEmail(email)) {
        showError("That doesn't look right — try again?");
        $input.focus();
        return;
      }

      // Stub success path. Hide the form + error, show confirmation.
      // (Real submission goes here post-launch.)
      $form.setAttribute('hidden', '');
      $error.setAttribute('hidden', '');
      $confirm.removeAttribute('hidden');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
