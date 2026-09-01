(function () {
  'use strict';

  var STORAGE_KEY = 'sikunjung_theme';

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* Storage can be unavailable in private browsing. */
    }
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
  }

  function updateButtons(theme) {
    var isDark = theme === 'dark';
    document.querySelectorAll('.theme-toggle-btn').forEach(function (button) {
      var icon = button.querySelector('.theme-icon');
      var text = button.querySelector('.theme-text');
      button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      button.setAttribute(
        'aria-label',
        isDark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'
      );
      button.setAttribute(
        'title',
        isDark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'
      );
      if (icon) {
        icon.className = 'theme-icon bi ' + (isDark ? 'bi-sun' : 'bi-moon-stars');
      }
      if (text) {
        text.textContent = isDark ? 'Tema Terang' : 'Tema Gelap';
      }
    });
  }

  function applyTheme(theme) {
    var nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    updateButtons(nextTheme);
    return nextTheme;
  }

  function toggleTheme() {
    var nextTheme = currentTheme() === 'dark' ? 'light' : 'dark';
    storeTheme(nextTheme);
    applyTheme(nextTheme);
    document.dispatchEvent(
      new CustomEvent('sikunjung:themechange', { detail: { theme: nextTheme } })
    );
  }

  // Apply immediately so navigating between pages feels seamless.
  var initialTheme = getStoredTheme() || currentTheme() || systemTheme();
  applyTheme(initialTheme);

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(currentTheme());
    document.querySelectorAll('.theme-toggle-btn').forEach(function (button) {
      button.addEventListener('click', toggleTheme);
    });
  });

  if (window.matchMedia) {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var handleSystemChange = function (event) {
      if (!getStoredTheme()) {
        applyTheme(event.matches ? 'dark' : 'light');
      }
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleSystemChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleSystemChange);
    }
  }

  window.sikunjungTheme = {
    toggle: toggleTheme,
    apply: applyTheme,
    current: currentTheme
  };
})();
