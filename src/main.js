// main.js — bootstrap.
import { Game } from './game.js';

function boot() {
  const canvas = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const loading = document.getElementById('loading');
  try {
    const game = new Game(canvas, uiRoot);
    window.__game = game; // for debugging in console
    if (loading) loading.style.display = 'none';
  } catch (err) {
    console.error(err);
    if (loading) {
      loading.innerHTML = '<h1>Could not start</h1><p>' + (err && err.message ? err.message : err) +
        '</p><p>This game needs a browser with WebGL2 (Chrome, Edge, Firefox, Safari 15+).</p>';
    }
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
