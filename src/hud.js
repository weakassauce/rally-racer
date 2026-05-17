import { CAR } from './config.js';

export class HUD {
  constructor() {
    this.canvas = document.querySelector('#hud canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }
  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  draw({ car, distanceToFinish, finished, elapsed }) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const speedKmh = Math.round(car.speed() * 3.6);

    // Speed (bottom-right)
    ctx.save();
    ctx.font = 'bold 60px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(245,250,225,0.95)';
    ctx.textAlign = 'right';
    ctx.fillText(String(speedKmh).padStart(3, ' '), W - 28, H - 48);
    ctx.font = '16px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(200,220,180,0.85)';
    ctx.fillText('km/h', W - 28, H - 26);
    ctx.restore();

    // Speed bar
    const barW = 220, barH = 10;
    const bx = W - 28 - barW, by = H - 100;
    ctx.strokeStyle = 'rgba(200,220,180,0.55)';
    ctx.strokeRect(bx, by, barW, barH);
    const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    grad.addColorStop(0, '#9ad36a');
    grad.addColorStop(0.6, '#e2cc55');
    grad.addColorStop(1, '#d65a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(bx + 1, by + 1, (barW - 2) * Math.min(1, car.speed() / CAR.topSpeed), barH - 2);

    // Timer + distance (top-left)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(245,250,225,0.95)';
    ctx.font = 'bold 22px ui-monospace, Menlo, Consolas, monospace';
    const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const ss = (elapsed % 60).toFixed(2).padStart(5, '0');
    ctx.fillText(`${mm}:${ss}`, 24, 36);

    ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(220,230,200,0.85)';
    ctx.fillText(`STAGE  ${(distanceToFinish ?? 0).toFixed(0)} m`, 24, 58);

    // Handbrake hint
    if (car.handbraking) {
      ctx.fillStyle = '#ffd86b';
      ctx.font = '16px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('HANDBRAKE', 24, 80);
    }

    // Crash flash
    if (car.crashed > 0) {
      const a = Math.min(0.5, car.crashed * 1.5);
      ctx.fillStyle = `rgba(255,40,40,${a})`;
      ctx.fillRect(0, 0, W, H);
    }

    // FINISH banner
    if (finished) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H / 2 - 90, W, 180);
      ctx.fillStyle = '#ffe070';
      ctx.font = 'bold 92px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', W / 2, H / 2 + 12);
      ctx.fillStyle = '#fffceb';
      ctx.font = 'bold 28px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(`${mm}:${ss}`, W / 2, H / 2 + 52);
      ctx.font = '16px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,250,220,0.8)';
      ctx.fillText('Press R to restart', W / 2, H / 2 + 80);
    }
  }
}
