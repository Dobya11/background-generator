//TODO: Split this
//TODO: Add reset
//TODO: Make smaller functions
//TODO: Fix gif jumping, speed and direction
//TODO: Fix gif encoder library loading issue
//TODO: Gaps during rotation
//TODO: Fix color replacement for grayscale colors(maybe switch to another color dimension)
//TODO: Add offset position for tiles

const app = {
  svgCache: {},
  patterns: [],
  canvas: null,
  ctx: null,
  animCanvas: null,
  animCtx: null,
  animationToken: 0,
  animationTimer: null,
  settings: {
    pattern: null,
    color1: "#000000",
    color2: "#ffffff",
    tileSize: 84,
    bgWidth: 1920,
    bgHeight: 1080,
    rotation: 0,
    enableGif: false,
    gifDirection: "horizontal",
    gifSpeed: 100,
  },

  async init() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.animCanvas = document.createElement("canvas");
    this.animCtx = this.animCanvas.getContext("2d");
    await this.loadPatterns();
    this.setupListeners();
  },

  async loadPatterns() {
    const previewDiv = document.getElementById("patternPreview");
    let links = [];

    try {
      const response = await fetch("./patterns/manifest.json", {
        cache: "no-store",
      });
      if (response.ok) {
        const manifest = await response.json();
        const files = Array.isArray(manifest)
          ? manifest
          : Array.isArray(manifest.patterns)
            ? manifest.patterns
            : [];
        links = files
          .map((item) => (typeof item === "string" ? item : item?.file))
          .filter(Boolean);
      }
    } catch (_) {}

    if (!links.length) {
      try {
        const response = await fetch("./patterns/");
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          links = Array.from(doc.querySelectorAll("a"))
            .map((a) => (a.getAttribute("href") || a.textContent).trim())
            .map((name) => decodeURIComponent(name.split("/").pop()))
            .filter((name) => /\.svg$/i.test(name))
            .sort();
        }
      } catch (_) {}
    }

    links = links
      .map((file) => this.normalizePatternPath(file))
      .filter((file) => /\.svg$/i.test(file));

    this.patterns = [...new Set(links)];
    previewDiv.innerHTML = "";

    await Promise.all(
      links.map((file) => this.addPatternPreview(file, previewDiv)),
    );

    if (!this.settings.pattern) {
      this.settings.pattern = links[0];
      this.updatePatternSelection();
      this.generate();
    }
  },

  async addPatternPreview(file, container) {
    let svg = await this.getSvg(file);
    if (!svg) return;

    svg = svg.replace(/<svg[^>]*>/i, (match) => {
      if (/viewBox\s*=\s*["']/i.test(match)) {
        let normalized = match.replace(/\s+width="[^"]*"/i, "");
        normalized = normalized.replace(/\s+height="[^"]*"/i, "");
        return normalized;
      }

      const widthMatch = /width\s*=\s*["']([^"']*)["']/i.exec(match);
      const heightMatch = /height\s*=\s*["']([^"']*)["']/i.exec(match);
      const w = widthMatch
        ? widthMatch[1].replace(/[^0-9]/g, "") || "256"
        : "256";
      const h = heightMatch
        ? heightMatch[1].replace(/[^0-9]/g, "") || "256"
        : "256";
      let normalized = match.replace(/\s+width="[^"]*"/i, "");
      normalized = normalized.replace(/\s+height="[^"]*"/i, "");
      normalized = normalized.replace(/>$/, ` viewBox="0 0 ${w} ${h}">`);
      return normalized;
    });

    const div = document.createElement("div");
    div.className = "pattern-item";
    div.dataset.pattern = file;
    div.innerHTML = svg;
    div.addEventListener("click", () => {
      this.settings.pattern = file;
      this.updatePatternSelection();
      this.generate();
    });
    container.appendChild(div);
  },

  updatePatternSelection() {
    document.querySelectorAll(".pattern-item").forEach((el) => {
      el.classList.remove("active");
    });
    const active = Array.from(document.querySelectorAll(".pattern-item")).find(
      (el) => el.dataset.pattern === this.settings.pattern,
    );
    if (active) active.classList.add("active");
  },

  setupListeners() {
    const createSettingListener =
      (settingKey, transform = (v) => v) =>
      (e) => {
        this.settings[settingKey] = transform(e.target.value);
        this.refreshPreview();
      };

    const updateColor = (colorId) => (e) => {
      const colorInput = document.getElementById(colorId);
      const colorHex = document.getElementById(colorId + "Hex");

      let hex = String(e.target.value || "")
        .trim()
        .toUpperCase();

      if (e.target === colorHex) {
        if (!/^#[0-9A-F]{6}$/i.test(hex)) {
          colorHex.setCustomValidity(
            "Use a 6-digit hex color such as #123456.",
          );
          return;
        }

        colorHex.setCustomValidity("");
        colorInput.value = hex;
      } else {
        hex = colorInput.value.toUpperCase();

        if (colorHex) {
          colorHex.value = hex;
        }
      }

      this.settings[colorId] = hex;
      this.refreshPreview();
    };

    const color1Input = document.getElementById("color1");
    const color2Input = document.getElementById("color2");
    const color1Hex = document.getElementById("color1Hex");
    const color2Hex = document.getElementById("color2Hex");

    color1Input.addEventListener("change", updateColor("color1"));
    color1Input.addEventListener("input", updateColor("color1"));
    color1Hex.addEventListener("change", updateColor("color1"));
    color1Hex.addEventListener("input", updateColor("color1"));

    color2Input.addEventListener("change", updateColor("color2"));
    color2Input.addEventListener("input", updateColor("color2"));
    color2Hex.addEventListener("change", updateColor("color2"));
    color2Hex.addEventListener("input", updateColor("color2"));

    document.querySelectorAll(".color-group .color-preset").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const color = e.currentTarget.dataset.color;
        const colorGroup = e.currentTarget.closest(".color-group");

        const input = colorGroup.querySelector('input[type="color"]');
        const hexInput = colorGroup.querySelector(".hex-input");

        input.value = color;

        if (hexInput) {
          hexInput.value = color.toUpperCase();
        }

        if (input.id === "color1") {
          this.settings.color1 = color.toUpperCase();
        } else {
          this.settings.color2 = color.toUpperCase();
        }

        this.refreshPreview();
      });
    });

    document.getElementById("tileSize").addEventListener(
      "change",
      createSettingListener("tileSize", (v) => parseInt(v, 10)),
    );

    document.getElementById("bgSize").addEventListener("change", (e) => {
      const customDiv = document.getElementById("customSizeDiv");

      if (e.target.value === "custom") {
        customDiv.classList.remove("hidden");
      } else {
        customDiv.classList.add("hidden");

        const [w, h] = e.target.value.split("x").map(Number);

        this.settings.bgWidth = w;
        this.settings.bgHeight = h;

        this.refreshPreview();
      }
    });

    document.getElementById("customWidth").addEventListener(
      "change",
      createSettingListener("bgWidth", (v) => parseInt(v, 10)),
    );

    document.getElementById("customHeight").addEventListener(
      "change",
      createSettingListener("bgHeight", (v) => parseInt(v, 10)),
    );

    document.getElementById("rotation").addEventListener(
      "change",
      createSettingListener("rotation", (v) => parseInt(v, 10)),
    );

    document
      .getElementById("downloadPng")
      .addEventListener("click", () => this.downloadPng());

    const enableGif = document.getElementById("enableGif");

    if (enableGif) {
      enableGif.addEventListener("change", (e) => {
        this.settings.enableGif = e.target.checked;

        const gifDiv = document.getElementById("gifDiv");
        const gifBtn = document.getElementById("downloadGif");

        if (e.target.checked) {
          gifDiv?.classList.remove("hidden");
          gifBtn?.classList.remove("hidden");

          this.generateAnimPreview();
        } else {
          gifDiv?.classList.add("hidden");
          gifBtn?.classList.add("hidden");

          this.animationToken++;

          if (this.animationTimer) {
            clearTimeout(this.animationTimer);
          }

          this.animationTimer = null;

          this.generate();
        }
      });
    }

    const gifDirection = document.getElementById("gifDirection");

    if (gifDirection) {
      gifDirection.addEventListener(
        "change",
        createSettingListener("gifDirection"),
      );
    }

    const gifSpeed = document.getElementById("gifSpeed");

    if (gifSpeed) {
      gifSpeed.addEventListener("input", (e) => {
        this.settings.gifSpeed = Math.max(
          50,
          Math.min(500, parseInt(e.target.value, 10) || 100),
        );

        if (this.settings.enableGif) {
          this.generateAnimPreview();
        }
      });
    }

    const downloadGif = document.getElementById("downloadGif");

    if (downloadGif) {
      downloadGif.addEventListener("click", () => this.downloadGif());
    }
  },

  refreshPreview() {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.animationToken++;

    if (this.settings.enableGif) this.generateAnimPreview();
    else this.generate();
  },

  normalizePatternPath(filename) {
    return String(filename || "")
      .replace(/\\/g, "/")
      .replace(/^\.\/patterns\//i, "")
      .replace(/^patterns\//i, "")
      .replace(/^\/+/, "");
  },

  async getSvg(filename) {
    const normalized = this.normalizePatternPath(filename);
    if (!normalized) return null;
    if (this.svgCache[normalized]) return this.svgCache[normalized];
    try {
      const response = await fetch(
        `./patterns/${normalized.split("/").map(encodeURIComponent).join("/")}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Not found (${response.status})`);
      const svg = await response.text();
      this.svgCache[normalized] = svg;
      return svg;
    } catch (e) {
      console.error("Failed to load:", filename, e);
      return null;
    }
  },

  async loadSvgAsImage(filename, color1, color2) {
    let svgString = await this.getSvg(filename);
    if (!svgString) throw new Error(`Could not load SVG: ${filename}`);

    svgString = svgString.replace(/<svg[^>]*>/i, (match) => {
      if (/viewBox\s*=\s*["']/i.test(match)) {
        let normalized = match.replace(/\s+width="[^"]*"/i, "");
        normalized = normalized.replace(/\s+height="[^"]*"/i, "");
        return normalized;
      } else {
        const widthMatch = /width\s*=\s*["']([^"']*)["']/i.exec(match);
        const heightMatch = /height\s*=\s*["']([^"']*)["']/i.exec(match);
        const w = widthMatch ? widthMatch[1].replace(/[^0-9]/g, "") : "256";
        const h = heightMatch ? heightMatch[1].replace(/[^0-9]/g, "") : "256";
        let normalized = match.replace(/\s+width="[^"]*"/i, "");
        normalized = normalized.replace(/\s+height="[^"]*"/i, "");
        normalized = normalized.replace(/>$/, ` viewBox="0 0 ${w} ${h}">`);
        return normalized;
      }
    });

    const coloredSvg = this.replaceSvgColors(svgString, color1, color2);
    const blob = new Blob([coloredSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load SVG as image"));
      };
      img.src = url;
    });
  },

  replaceSvgColors(svgString, color1, color2) {
    const hexToRgb = (hex) => {
      hex = hex.replace("#", "").trim();

      if (hex.length === 3) {
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      }

      if (!/^[0-9a-f]{6}$/i.test(hex)) {
        return null;
      }

      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    };

    const rgbToHex = (r, g, b) => {
      return (
        "#" +
        [r, g, b]
          .map((value) =>
            Math.round(Math.max(0, Math.min(255, value)))
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
          .toUpperCase()
      );
    };

    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);

    if (!c1 || !c2) {
      return svgString;
    }

    const grayscaleToColor = (gray) => {
      const t = Math.max(0, Math.min(255, gray)) / 255;

      return rgbToHex(
        c1.r + (c2.r - c1.r) * t,
        c1.g + (c2.g - c1.g) * t,
        c1.b + (c2.b - c1.b) * t,
      );
    };

    const replaceRgb = (match, r, g, b) => {
      r = Number(r);
      g = Number(g);
      b = Number(b);

      if (r === g && g === b) {
        return grayscaleToColor(r);
      }

      return match;
    };

    return svgString

      .replace(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi, (match, hex) => {
        const normalized =
          hex.length === 3
            ? hex
                .split("")
                .map((c) => c + c)
                .join("")
            : hex;

        const r = parseInt(normalized.substring(0, 2), 16);
        const g = parseInt(normalized.substring(2, 4), 16);
        const b = parseInt(normalized.substring(4, 6), 16);

        if (r === g && g === b) {
          return grayscaleToColor(r);
        }

        return match;
      })

      .replace(/\brgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi, replaceRgb)

      .replace(
        /\brgb\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)/gi,
        (match, r, g, b) => {
          r = Number(r);
          g = Number(g);
          b = Number(b);

          if (r === g && g === b) {
            return grayscaleToColor((r / 100) * 255);
          }

          return match;
        },
      )

      .replace(
        /\brgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/gi,
        (match, r, g, b, alpha) => {
          r = Number(r);
          g = Number(g);
          b = Number(b);

          if (r === g && g === b) {
            return `rgba(${parseInt(grayscaleToColor(r).slice(1, 3), 16)}, ${parseInt(
              grayscaleToColor(r).slice(3, 5),
              16,
            )}, ${parseInt(grayscaleToColor(r).slice(5, 7), 16)}, ${alpha})`;
          }

          return match;
        },
      )

      .replace(
        /\brgba\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*([0-9.]+)\s*\)/gi,
        (match, r, g, b, alpha) => {
          r = Number(r);
          g = Number(g);
          b = Number(b);

          if (r === g && g === b) {
            const hex = grayscaleToColor((r / 100) * 255);

            return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(
              hex.slice(3, 5),
              16,
            )}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;
          }

          return match;
        },
      );
  },

  getTileGrid(bgWidth, bgHeight, tileSize) {
    const padding = tileSize * 2;

    return {
      startX: -padding,
      endX: bgWidth + padding,
      startY: -padding,
      endY: bgHeight + padding,
    };
  },

  drawPatternFrame(
    ctx,
    bgWidth,
    bgHeight,
    rotation,
    tileSize,
    offsetX = 0,
    offsetY = 0,
    img,
  ) {
    ctx.clearRect(0, 0, bgWidth, bgHeight);

    ctx.fillStyle = this.settings.color2;
    ctx.fillRect(0, 0, bgWidth, bgHeight);

    ctx.save();

    ctx.translate(bgWidth / 2, bgHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-bgWidth / 2, -bgHeight / 2);

    const grid = this.getTileGrid(bgWidth, bgHeight, tileSize);

    for (let y = grid.startY + offsetY; y < grid.endY; y += tileSize) {
      for (let x = grid.startX + offsetX; x < grid.endX; x += tileSize) {
        ctx.drawImage(img, x, y, tileSize, tileSize);
      }
    }

    ctx.restore();
  },

  async generate() {
    if (!this.settings.pattern) return;

    try {
      const { bgWidth, bgHeight, rotation, tileSize } = this.settings;

      this.canvas.width = bgWidth;
      this.canvas.height = bgHeight;

      const { img, url } = await this.loadSvgAsImage(
        this.settings.pattern,
        this.settings.color1,
        this.settings.color2,
      );

      this.drawPatternFrame(
        this.ctx,
        bgWidth,
        bgHeight,
        rotation,
        tileSize,
        0,
        0,
        img,
      );

      this.showPreview(false);

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Generate failed:", e);
      alert("Failed to generate pattern: " + (e?.message || e));
    }
  },

  async generateAnimPreview() {
    if (!this.settings.pattern) return;

    try {
      if (this.animationTimer) {
        clearTimeout(this.animationTimer);
        this.animationTimer = null;
      }
      const animationToken = ++this.animationToken;

      const { bgWidth, bgHeight, rotation, tileSize } = this.settings;
      this.animCanvas.width = bgWidth;
      this.animCanvas.height = bgHeight;

      const { img, url } = await this.loadSvgAsImage(
        this.settings.pattern,
        this.settings.color1,
        this.settings.color2,
      );

      const frames = Math.max(8, Math.min(32, tileSize));
      let frameIndex = 0;

      const animate = async () => {
        if (animationToken !== this.animationToken) {
          URL.revokeObjectURL(url);
          return;
        }

        const { x: offsetX, y: offsetY } = this.getAnimationOffset(
          frameIndex,
          frames,
          tileSize,
        );

        await this.drawPatternFrame(
          this.animCtx,
          bgWidth,
          bgHeight,
          rotation,
          tileSize,
          offsetX,
          offsetY,
          img,
        );
        this.showPreview();

        frameIndex += 1;
        this.animationTimer = setTimeout(() => {
          if (animationToken === this.animationToken) {
            animate();
          }
        }, this.settings.gifSpeed);
      };

      animate();
    } catch (e) {
      console.error("Animation preview failed:", e);
    }
  },

  getAnimationOffset(frame, frameCount, tileSize) {
    const offset = (frame / frameCount) * tileSize;

    switch (this.settings.gifDirection) {
      case "horizontal":
        return { x: offset, y: 0 };

      case "vertical":
        return { x: 0, y: offset };

      case "diagonal":
        return { x: offset, y: offset };

      default:
        return { x: 0, y: 0 };
    }
  },

  showPreview() {
    const preview = document.getElementById("preview");
    preview.innerHTML = "";
    const useCanvas = this.settings.enableGif ? this.animCanvas : this.canvas;
    preview.appendChild(useCanvas);
  },

  async downloadPng() {
    if (!this.settings.pattern) {
      alert("Select a pattern first");
      return;
    }

    try {
      await this.generate();
      const patternName = this.settings.pattern.replace(/\.svg$/i, "");
      const link = document.createElement("a");
      link.href = this.canvas.toDataURL("image/png");
      link.download = `${patternName}_${this.settings.bgWidth}x${this.settings.bgHeight}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error("PNG creation failed:", e);
      alert("PNG creation failed: " + (e?.message || e));
    }
  },

  async downloadGif() {
    if (!this.settings.pattern) {
      alert("Select a pattern first");
      return;
    }

    const patternName = this.settings.pattern.replace(/\.svg$/i, "");
    const btn = document.getElementById("downloadGif");
    btn.disabled = true;
    btn.textContent = "Creating...";

    try {
      const { bgWidth, bgHeight, rotation, tileSize } = this.settings;
      const frames = Math.max(8, Math.min(32, tileSize));

      const { img, url } = await this.loadSvgAsImage(
        this.settings.pattern,
        this.settings.color1,
        this.settings.color2,
      );

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = bgWidth;
      tempCanvas.height = bgHeight;
      const tempCtx = tempCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      const Encoder = window.GIFEncoder || window.GIFEncoder2?.GIFEncoder;
      if (typeof Encoder !== "function") {
        throw new Error(
          "GIF encoder library did not load. Check your internet connection or CDN access.",
        );
      }
      const gif = new Encoder(bgWidth, bgHeight);
      gif.setDelay(this.settings.gifSpeed);
      gif.setRepeat(0);
      gif.start();

      for (let frame = 0; frame < frames; frame++) {
        const { x, y } = this.getAnimationOffset(frame, frames, tileSize);

        this.drawPatternFrame(
          tempCtx,
          bgWidth,
          bgHeight,
          rotation,
          tileSize,
          x,
          y,
          img,
        );

        gif.addFrame(tempCtx);
      }

      gif.finish();

      const bytes =
        typeof gif.bytesView === "function"
          ? gif.bytesView()
          : typeof gif.stream === "function"
            ? gif.stream().getData()
            : gif.out;

      if (!bytes) throw new Error("GIF encoder returned no data.");

      const gifBlob = new Blob([bytes], { type: "image/gif" });
      const downloadUrl = URL.createObjectURL(gifBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${patternName}_${bgWidth}x${bgHeight}.gif`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("GIF creation failed:", e);
      alert("GIF creation failed: " + (e?.message || e));
    } finally {
      btn.disabled = false;
      btn.textContent = "GIF";
    }
  },
};

app.init();
