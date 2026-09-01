(function () {
  'use strict';

  function hasBootstrap() {
    return typeof window.bootstrap !== 'undefined';
  }

  function iconFor(type) {
    if (type === 'success') return 'bi-check-circle-fill';
    if (type === 'danger') return 'bi-exclamation-octagon-fill';
    if (type === 'warning') return 'bi-exclamation-triangle-fill';
    return 'bi-info-circle-fill';
  }

  function toast(message, type) {
    var variant = type || 'info';
    var container = document.querySelector('.toast-container[data-sikunjung-toast]');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      container.setAttribute('data-sikunjung-toast', '');
      container.style.zIndex = '3000';
      document.body.appendChild(container);
    }

    var element = document.createElement('div');
    element.className = 'toast align-items-center border-0';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-atomic', 'true');
    element.innerHTML =
      '<div class="d-flex">' +
      '<div class="toast-body d-flex align-items-start gap-2">' +
      '<i class="bi ' + iconFor(variant) + '"></i>' +
      '<span></span>' +
      '</div>' +
      '<button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Tutup"></button>' +
      '</div>';

    element.querySelector('.toast-body span').textContent = message;
    element.querySelector('.toast-body i').style.color =
      variant === 'success'
        ? 'var(--success)'
        : variant === 'danger'
          ? 'var(--destructive)'
          : variant === 'warning'
            ? 'var(--warning)'
            : 'var(--info)';

    container.appendChild(element);

    if (hasBootstrap()) {
      var instance = new window.bootstrap.Toast(element, { delay: 4200 });
      element.addEventListener('hidden.bs.toast', function () {
        element.remove();
      });
      instance.show();
    } else {
      element.classList.add('show');
      window.setTimeout(function () {
        element.remove();
      }, 4200);
    }
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var helper = document.createElement('textarea');
      helper.value = value;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        helper.remove();
      }
    });
  }

  function setupCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-copy');
        if (!value) {
          var target = button.getAttribute('data-copy-target');
          var source = target ? document.querySelector(target) : null;
          value = source ? source.textContent.trim() : '';
        }
        if (!value) return;
        copyText(value)
          .then(function () {
            toast('Berhasil disalin ke clipboard.', 'success');
          })
          .catch(function () {
            toast('Gagal menyalin. Silakan salin secara manual.', 'danger');
          });
      });
    });
  }

  function setupFileInputs() {
    document.querySelectorAll('.file-control-input').forEach(function (input) {
      if (!input.id) return;
      var name = document.querySelector('[data-file-name-for="' + input.id + '"]');
      if (!name) return;
      var defaultText = name.textContent;

      function syncFileName() {
        var file = input.files && input.files[0];
        name.textContent = file ? file.name : defaultText;
        name.classList.toggle('has-file', Boolean(file));
      }

      input.addEventListener('change', syncFileName);
      if (input.form) input.form.addEventListener('reset', syncFileName);
    });
  }

  function setupPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach(function (button) {
      button.addEventListener('click', function () {
        var targetSelector = button.getAttribute('data-toggle-password');
        var input = document.querySelector(targetSelector);
        if (!input) return;
        var isPassword = input.getAttribute('type') === 'password';
        input.setAttribute('type', isPassword ? 'text' : 'password');
        button.setAttribute('aria-label', isPassword ? 'Sembunyikan password' : 'Tampilkan password');
        button.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
        var icon = button.querySelector('i');
        if (icon) {
          icon.className = 'bi ' + (isPassword ? 'bi-eye-slash' : 'bi-eye');
        }
      });
    });
  }

  function setupConfirmations() {
    var modalElement = document.getElementById('sikunjungConfirmModal');
    if (!hasBootstrap() || !modalElement) {
      document.querySelectorAll('form[data-confirm]').forEach(function (form) {
        form.addEventListener('submit', function (event) {
          if (form.dataset.confirmed === 'true') return;
          if (!window.confirm(form.getAttribute('data-confirm'))) {
            event.preventDefault();
          } else {
            form.dataset.confirmed = 'true';
          }
        });
      });
      return;
    }

    var modal = new window.bootstrap.Modal(modalElement);
    var confirmButton = modalElement.querySelector('[data-confirm-accept]');
    var titleElement = modalElement.querySelector('[data-confirm-title]');
    var messageElement = modalElement.querySelector('[data-confirm-message]');
    var pendingForm = null;

    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
      form.addEventListener(
        'submit',
        function (event) {
          if (form.dataset.confirmed === 'true') return;
          event.preventDefault();
          event.stopImmediatePropagation();
          pendingForm = form;
          titleElement.textContent = form.getAttribute('data-confirm-title') || 'Konfirmasi tindakan';
          messageElement.textContent = form.getAttribute('data-confirm');
          confirmButton.className =
            'btn ' +
            (form.getAttribute('data-confirm-variant') === 'danger'
              ? 'btn-danger'
              : 'btn-primary');
          confirmButton.textContent = form.getAttribute('data-confirm-label') || 'Ya, lanjutkan';
          modal.show();
        },
        true
      );
    });

    confirmButton.addEventListener('click', function () {
      if (!pendingForm) return;
      pendingForm.dataset.confirmed = 'true';
      modal.hide();
      var formToSubmit = pendingForm;
      pendingForm = null;
      formToSubmit.requestSubmit();
    });

    modalElement.addEventListener('hidden.bs.modal', function () {
      pendingForm = null;
    });
  }

  function setupFormLoading() {
    document.querySelectorAll('form').forEach(function (form) {
      if (form.hasAttribute('data-no-loading')) return;
      if ((form.getAttribute('method') || 'get').toLowerCase() === 'get') return;

      form.addEventListener('submit', function () {
        if (form.dataset.submitting === 'true') return;
        form.dataset.submitting = 'true';
        var button = form.querySelector('button[type="submit"]');
        if (!button) return;
        button.disabled = true;
        button.classList.add('btn-loading');
        var label = button.innerHTML;
        button.dataset.originalLabel = label;
        button.innerHTML =
          '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Memproses...</span>';
      });
    });
  }

  function setupTooltips() {
    if (!hasBootstrap()) return;
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (element) {
      new window.bootstrap.Tooltip(element);
    });
  }

  function setupAutoSubmit() {
    document.querySelectorAll('[data-auto-submit]').forEach(function (element) {
      element.addEventListener('change', function () {
        if (element.form) element.form.submit();
      });
    });
  }

  function setupCsrfForms() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (!meta || !meta.content) return;

    function inject(form) {
      if (!form || !form.getAttribute) return;
      if ((form.getAttribute('method') || 'get').toLowerCase() !== 'post') return;
      if (form.querySelector('input[name="_csrf"]')) return;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_csrf';
      input.value = meta.content;
      form.appendChild(input);
    }

    document.querySelectorAll('form').forEach(inject);
    document.addEventListener(
      'submit',
      function (event) {
        inject(event.target);
      },
      true
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupCsrfForms();
    setupCopyButtons();
    setupFileInputs();
    setupPasswordToggles();
    setupConfirmations();
    setupFormLoading();
    setupTooltips();
    setupAutoSubmit();
  });

  window.sikunjungUI = {
    toast: toast,
    copy: copyText
  };
})();
