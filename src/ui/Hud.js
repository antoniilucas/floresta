// Interface HTML sobre o canvas: tela de carregamento, estado e painel de teclas.
export class Hud {
  constructor() {
    this.loading = document.getElementById('loading');
    this.loadingText = document.getElementById('loading-text');
    this.barFill = document.getElementById('bar-fill');
    this.state = document.getElementById('state');
    this.help = document.getElementById('help');
    this._last = '';
    document.getElementById('help-toggle')?.addEventListener('click', () => {
      this.help.classList.toggle('collapsed');
    });
  }

  setProgress(fraction, text) {
    this.barFill.style.width = Math.round(fraction * 100) + '%';
    if (text) this.loadingText.textContent = text;
  }

  hideLoading() {
    this.loading.classList.add('hidden');
    setTimeout(() => this.loading.remove(), 600);
  }

  showError(message) {
    this.loading.classList.remove('hidden');
    this.loadingText.innerHTML = message;
    this.loadingText.classList.add('error');
    this.barFill.style.width = '0%';
  }

  setState(label) {
    if (label !== this._last) { this.state.textContent = label; this._last = label; }
  }
}
