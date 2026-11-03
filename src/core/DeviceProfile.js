// DeviceProfile — viewport & input-capability detection.
// Classifies the device (desktop / tablet / phone), tracks orientation and
// viewport size, and notifies listeners when any of it changes. Sets
// data-attributes on <html> so CSS can adapt the layout.

export class DeviceProfile {
  constructor() {
    this.listeners = new Set();
    this.state = this._compute();
    this._apply();

    const update = () => {
      const next = this._compute();
      const changed =
        next.type !== this.state.type ||
        next.orientation !== this.state.orientation ||
        next.touch !== this.state.touch ||
        next.width !== this.state.width ||
        next.height !== this.state.height;
      this.state = next;
      if (changed) {
        this._apply();
        this.listeners.forEach((fn) => fn(this.state));
      }
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 150));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
    const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', update);
  }

  _compute() {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('mobile'); // ?mobile=1 forces touch UI, ?mobile=0 disables it
    const mm = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);

    const coarse = mm('(pointer: coarse)');
    const hasFinePointer = mm('(any-pointer: fine)');
    const maxTouch = navigator.maxTouchPoints || 0;
    const ua = navigator.userAgent || '';
    const uaMobile =
      (navigator.userAgentData && navigator.userAgentData.mobile) ||
      /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
    // iPadOS reports itself as Macintosh but has touch points.
    const uaTablet = /iPad|Tablet/i.test(ua) || (/Macintosh/i.test(ua) && maxTouch > 1);

    const vv = window.visualViewport;
    const width = Math.round(vv ? vv.width : window.innerWidth);
    const height = Math.round(vv ? vv.height : window.innerHeight);
    const shortSide = Math.min(width, height);

    let touch = (coarse || uaMobile || uaTablet) && (maxTouch > 0 || 'ontouchstart' in window);
    // A touchscreen laptop with a mouse keeps desktop controls unless forced.
    if (touch && hasFinePointer && !uaMobile && !uaTablet) touch = false;
    if (forced === '1') touch = true;
    if (forced === '0') touch = false;

    let type = 'desktop';
    if (touch) type = shortSide < 600 && !uaTablet ? 'phone' : 'tablet';

    return {
      type,
      touch,
      width,
      height,
      orientation: width >= height ? 'landscape' : 'portrait',
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  _apply() {
    const root = document.documentElement;
    root.dataset.device = this.state.type;
    root.dataset.orientation = this.state.orientation;
    root.classList.toggle('touch-ui', this.state.touch);
  }

  get isTouch() {
    return this.state.touch;
  }

  get isPhone() {
    return this.state.type === 'phone';
  }

  // Render-quality budget: cap pixel ratio harder on phones to keep frame rate up.
  get maxPixelRatio() {
    if (this.state.type === 'phone') return 1.5;
    if (this.state.type === 'tablet') return 1.75;
    return 2;
  }

  // Wider FOV in portrait so the player can see around the character.
  get baseFov() {
    if (!this.state.touch) return null;
    return this.state.orientation === 'portrait' ? 78 : 68;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
