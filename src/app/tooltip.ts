export class Tooltip {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.position = "fixed";
    this.el.style.zIndex = "99999";
    this.el.style.maxWidth = "520px";
    this.el.style.padding = "8px 10px";
    this.el.style.borderRadius = "8px";
    this.el.style.fontSize = "12px";
    this.el.style.lineHeight = "1.35";
    this.el.style.pointerEvents = "none";
    this.el.style.whiteSpace = "pre-wrap";
    this.el.style.display = "none";

    // theme via CSS vars (与你 styles.css 的暗色/亮色一致)
    this.el.style.background = "var(--panel)";
    this.el.style.color = "var(--fg)";
    this.el.style.border = "1px solid var(--border)";
    this.el.style.boxShadow = "0 6px 24px rgba(0,0,0,.22)";

    document.body.appendChild(this.el);
  }

  show(x: number, y: number, text: string) {
    if (!text) return this.hide();
    this.el.textContent = text;
    const dx = 14, dy = 16;
    this.el.style.left = `${Math.min(window.innerWidth - 20, x + dx)}px`;
    this.el.style.top = `${Math.min(window.innerHeight - 20, y + dy)}px`;
    this.el.style.display = "block";
  }

  hide() {
    this.el.style.display = "none";
  }

  bindTo(container: HTMLElement, selector = "[data-tip]") {
    container.addEventListener("mousemove", (e) => {
      const t = (e.target as HTMLElement | null)?.closest(selector) as HTMLElement | null;
      if (!t) return;
      const tip = t.getAttribute("data-tip") || "";
      this.show(e.clientX, e.clientY, tip);
    });

    container.addEventListener("mouseleave", () => this.hide(), true);
    container.addEventListener("mousedown", () => this.hide(), true);
    container.addEventListener("wheel", () => this.hide(), { passive: true });
  }
}
