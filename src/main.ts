import './ui/style.css';
import { App } from './app';

const container = document.getElementById('game')!;
const loading = document.getElementById('loading');

function boot() {
  try {
    const app = new App(container);
    (window as any).__app = app;
  } catch (e) {
    console.error(e);
    if (loading) loading.innerHTML = `<div style="padding:24px;text-align:center">앗! 이 기기에서 게임을 시작할 수 없어요.<br><small>${String(e)}</small></div>`;
    return;
  }
  if (loading) {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);
  }
}

// give the web font a moment so canvas-drawn labels use it
const fonts = (document as any).fonts;
if (fonts?.load) {
  Promise.race([fonts.load('20px Jua'), new Promise((r) => setTimeout(r, 1200))]).finally(() => requestAnimationFrame(boot));
} else boot();
