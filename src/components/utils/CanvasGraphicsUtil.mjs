import { LogUtil } from './LogUtil.mjs';

/**
 * Utility class for creating and managing canvas PIXI graphics
 * Provides methods for drawing shapes, animations, and managing the ruler layer
 */
export class CanvasGraphicsUtil {

  /**
   * Clear ruler children except specified elements to preserve
   * @param {PIXI.Container[]} preserve - Array of containers to preserve
   */
  static clearRulerExcept(preserve = []) {
    if (!canvas?.controls?.ruler) {
      LogUtil.warn("Canvas controls ruler not available");
      return;
    }

    const children = [...canvas.controls.ruler.children];
    for (const child of children) {
      if (!preserve.includes(child)) {
        canvas.controls.ruler.removeChild(child);
      }
    }
  }

  /**
   * Add child to ruler with safety check
   * @param {PIXI.DisplayObject} child - Child to add
   * @returns {boolean} True if added successfully
   */
  static addToRuler(child) {
    if (!canvas?.controls?.ruler) {
      LogUtil.warn("Canvas controls ruler not available");
      return false;
    }

    canvas.controls.ruler.addChild(child);
    return true;
  }

  /**
   * Create a rectangle outline shape
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Width
   * @param {number} height - Height
   * @param {Object} options - Style options
   * @returns {PIXI.Graphics} Graphics object
   */
  static createRectangle(x, y, width, height, options = {}) {
    const {
      lineWidth = 2,
      color = 0x00ff00,
      alpha = 0.8
    } = options;

    const shape = new PIXI.Graphics();
    shape.lineStyle(lineWidth, color, alpha);
    shape.drawRect(x, y, width, height);
    return shape;
  }

  /**
   * Create a circle outline shape
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} radius - Radius
   * @param {Object} options - Style options
   * @returns {PIXI.Graphics} Graphics object
   */
  static createCircle(x, y, radius, options = {}) {
    const {
      lineWidth = 3,
      color = 0xff0000,
      alpha = 0.9
    } = options;

    const shape = new PIXI.Graphics();
    shape.lineStyle(lineWidth, color, alpha);
    shape.drawCircle(x, y, radius);
    return shape;
  }

  /**
   * Create a line/arrow between two points
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   * @param {Object} options - Style options
   * @returns {PIXI.Graphics} Graphics object
   */
  static createLine(x1, y1, x2, y2, options = {}) {
    const {
      lineWidth = 3,
      color = 0xffff00,
      alpha = 0.9
    } = options;

    const line = new PIXI.Graphics();
    line.lineStyle(lineWidth, color, alpha);
    line.moveTo(x1, y1);
    line.lineTo(x2, y2);
    return line;
  }

  /**
   * Create text label
   * @param {string} text - Text content
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {Object} options - Text style options
   * @returns {PIXI.Text} Text object
   */
  static createText(text, x, y, options = {}) {
    const {
      fontSize = 16,
      fill = 0xffffff,
      stroke = 0x000000,
      strokeThickness = 3,
      anchor = 0.5
    } = options;

    const textObj = new PIXI.Text(text, {
      fontSize,
      fill,
      stroke,
      strokeThickness
    });

    textObj.anchor.set(anchor);
    textObj.x = x;
    textObj.y = y;

    return textObj;
  }

  /**
   * Create animated pulsing cursor indicator
   * @returns {Object} Object with container and animation interval
   */
  static createAnimatedCursor() {
    if (!canvas?.controls?.ruler) {
      LogUtil.warn("Canvas controls ruler not available for cursor");
      return { container: null, animation: null };
    }

    const container = new PIXI.Container();
    canvas.controls.ruler.addChild(container);

    const circle1 = new PIXI.Graphics();
    circle1.lineStyle(3, 0x00ff00, 1);
    circle1.drawCircle(0, 0, 20);
    container.addChild(circle1);

    const circle2 = new PIXI.Graphics();
    circle2.lineStyle(3, 0x00ff00, 0.6);
    circle2.drawCircle(0, 0, 30);
    container.addChild(circle2);

    const circle3 = new PIXI.Graphics();
    circle3.lineStyle(3, 0x00ff00, 0.3);
    circle3.drawCircle(0, 0, 40);
    container.addChild(circle3);

    let animationFrame = 0;
    const animation = setInterval(() => {
      animationFrame += 0.05;

      const scale1 = 1 + Math.sin(animationFrame) * 0.3;
      const scale2 = 1 + Math.sin(animationFrame + 1) * 0.3;
      const scale3 = 1 + Math.sin(animationFrame + 2) * 0.3;

      circle1.alpha = 0.8 + Math.sin(animationFrame) * 0.2;
      circle2.alpha = 0.5 + Math.sin(animationFrame + 1) * 0.3;
      circle3.alpha = 0.3 + Math.sin(animationFrame + 2) * 0.2;

      circle1.scale.set(scale1);
      circle2.scale.set(scale2);
      circle3.scale.set(scale3);
    }, 50);

    return { container, animation };
  }

  /**
   * Destroy animated cursor
   * @param {PIXI.Container} container - Container to destroy
   * @param {number} animation - Animation interval ID
   */
  static destroyAnimatedCursor(container, animation) {
    if (animation) {
      clearInterval(animation);
    }

    if (container) {
      container.destroy({ children: true });
    }
  }

  /**
   * Draw token preview boxes with numbers
   * @param {Array} tokens - Array of token data
   * @param {Object} destination - Destination point {x, y}
   * @param {Object} center - Center point {x, y}
   * @param {number} gridSize - Grid size
   */
  static drawTokenPreviews(tokens, destination, center, gridSize) {
    const previews = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const relativeX = token.document.x - center.x;
      const relativeY = token.document.y - center.y;

      const newX = destination.x + relativeX;
      const newY = destination.y + relativeY;

      const rect = this.createRectangle(
        newX,
        newY,
        token.document.width * gridSize,
        token.document.height * gridSize,
        { color: 0x00ccff, alpha: 0.8 }
      );

      previews.push(rect);
      this.addToRuler(rect);

      const centerX = newX + (token.document.width * gridSize / 2);
      const centerY = newY + (token.document.height * gridSize / 2);

      const text = this.createText(`${i + 1}`, centerX, centerY);
      previews.push(text);
      this.addToRuler(text);
    }

    return previews;
  }

  /**
   * Draw arrows from current positions to destination
   * @param {Array} tokens - Array of tokens
   * @param {Object} destination - Destination point
   * @param {Object} center - Center point
   * @param {number} gridSize - Grid size
   */
  static drawTeleportArrows(tokens, destination, center, gridSize) {
    const arrows = [];

    for (const token of tokens) {
      const relativeX = token.document.x - center.x;
      const relativeY = token.document.y - center.y;

      const newX = destination.x + relativeX;
      const newY = destination.y + relativeY;

      const arrow = this.createLine(
        token.document.x + (token.document.width * gridSize / 2),
        token.document.y + (token.document.height * gridSize / 2),
        newX + (token.document.width * gridSize / 2),
        newY + (token.document.height * gridSize / 2),
        { color: 0xffff00, alpha: 0.9 }
      );

      arrows.push(arrow);
      this.addToRuler(arrow);
    }

    return arrows;
  }

  /**
   * Draw placement preview for tokens
   * @param {Array} previewTokens - Array of preview token data
   * @param {Object} destination - Destination point {x, y}
   * @param {number} gridSize - Grid size
   */
  static drawPlacementPreviews(previewTokens, destination, gridSize) {
    const previews = [];
    const offset = gridSize * 0.1;

    for (let i = 0; i < previewTokens.length; i++) {
      const xOffset = (i % 3) * offset;
      const yOffset = Math.floor(i / 3) * offset;

      const shape = this.createRectangle(
        destination.x - gridSize/2 + xOffset,
        destination.y - gridSize/2 + yOffset,
        gridSize,
        gridSize,
        { color: 0x00ff00, alpha: 0.8 }
      );

      previews.push(shape);
      this.addToRuler(shape);

      const text = this.createText(`${i + 1}`, destination.x + xOffset, destination.y + yOffset);
      previews.push(text);
      this.addToRuler(text);
    }

    return previews;
  }
}
