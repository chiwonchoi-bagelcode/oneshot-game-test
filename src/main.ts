import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import './ui/style.css';
import { App } from './app';

const container = document.getElementById('game')!;
const loading = document.getElementById('loading');

function boot() {
  let app: App;
  try {
    app = new App(container);
  } catch (e) {
    console.error(e);
    if (loading) loading.innerHTML = `<div style="padding:24px;text-align:center">앗! 이 기기에서 게임을 시작할 수 없어요.<br><small>그래픽(WebGL)을 지원하는 최신 브라우저에서 다시 열어주세요.</small></div>`;
    return;
  }
  // test hooks exist only in dev / test builds; the release bundle never contains them
  if (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1') import('./dev/testhooks').then((m) => m.installTestHooks(app));
  if (loading) {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);
  }
}

// give the bundled font a moment so canvas-drawn labels use it
const fonts = (document as any).fonts;
if (fonts?.load) {
  Promise.race([fonts.load('20px Jua'), new Promise((r) => setTimeout(r, 1200))]).finally(() => requestAnimationFrame(boot));
} else boot();
