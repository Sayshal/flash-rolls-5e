import { LogUtil } from '../utils/LogUtil.mjs';
import { MODULE_ID } from '../../constants/General.mjs';
import { getActorData } from '../helpers/Helpers.mjs';

/**
 * Manages token placement functionality
 * Allows GMs to create and place tokens on canvas by clicking
 */
export class TokenPlacementManager {

  static _isPlacingTokens = false;
  static _previewTokens = [];
  static _actorsToPlace = [];
  static _placementIndex = 0;
  static _canvasClickHandler = null;
  static _canvasRightClickHandler = null;
  static _canvasMoveHandler = null;
  static _canvasRightDownHandler = null;
  static _canvasRightUpHandler = null;
  static _cursorIndicator = null;
  static _cursorAnimation = null;
  static _rightMouseDown = false;

  /**
   * Place tokens for selected actors on the canvas
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async placeTokensForSelectedActors(menu) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can place tokens");
      return;
    }

    if (menu.selectedActors.size === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelectedForPlacement"));
      return;
    }

    if (this._isPlacingTokens) {
      ui.notifications.warn("Token placement already in progress");
      return;
    }

    const actorsToPlace = [];

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;

      if (actor.type === 'group' || actor.type === 'encounter') {
        const members = actor.system.members || [];
        for (const member of members) {
          const memberActor = member.actor || (member.uuid ? await fromUuid(member.uuid) : null);
          if (memberActor) {
            actorsToPlace.push(memberActor);
          }
        }
      } else {
        actorsToPlace.push(actor);
      }
    }

    if (actorsToPlace.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelectedForPlacement"));
      return;
    }

    this._actorsToPlace = actorsToPlace;
    this._placementIndex = 0;
    this._isPlacingTokens = true;

    await this._createPreviewTokens();
    this._attachCanvasHandlers();

    ui.notifications.info(`Click to place ${actorsToPlace.length} token(s), right-click to cancel`);
  }

  /**
   * Create preview tokens that follow the mouse cursor
   */
  static async _createPreviewTokens() {
    this._previewTokens = [];

    for (const actor of this._actorsToPlace) {
      const tokenData = await actor.getTokenDocument();

      const previewData = {
        ...tokenData.toObject(),
        x: 0,
        y: 0,
        alpha: 0.5
      };

      this._previewTokens.push({
        actor: actor,
        data: previewData
      });
    }
  }

  /**
   * Attach canvas event handlers for placement
   */
  static _attachCanvasHandlers() {
    this._canvasMoveHandler = (event) => this._onCanvasMouseMove(event);
    this._canvasClickHandler = (event) => this._onCanvasClick(event);
    this._canvasRightClickHandler = (event) => this._onCanvasRightClick(event);
    this._canvasRightDownHandler = (event) => { this._rightMouseDown = true; };
    this._canvasRightUpHandler = (event) => { this._rightMouseDown = false; };

    canvas.stage.on('mousemove', this._canvasMoveHandler);
    canvas.stage.on('click', this._canvasClickHandler);
    canvas.stage.on('rightclick', this._canvasRightClickHandler);
    canvas.stage.on('rightdown', this._canvasRightDownHandler);
    canvas.stage.on('rightup', this._canvasRightUpHandler);

    setTimeout(() => {
      this._createCursorIndicator();
    }, 100);
  }

  /**
   * Handle mouse move to update preview token positions
   * @param {PIXI.InteractionEvent} event - The mouse move event
   */
  static _onCanvasMouseMove(event) {
    if (!this._isPlacingTokens) return;

    const position = event.data.getLocalPosition(canvas.tokens);
    const snapped = canvas.grid.getSnappedPoint({ x: position.x, y: position.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

    if (canvas.controls?.ruler?.children) {
      try {
        const children = Array.from(canvas.controls.ruler.children);
        for (const child of children) {
          if (child !== this._cursorIndicator) {
            canvas.controls.ruler.removeChild(child);
          }
        }
      } catch (error) {
        LogUtil.warn("Error clearing ruler children", error);
      }
    }

    const gridSize = canvas.grid.size;
    const offset = gridSize * 0.1;

    for (let i = 0; i < this._previewTokens.length; i++) {
      const previewToken = this._previewTokens[i];
      const xOffset = (i % 3) * offset;
      const yOffset = Math.floor(i / 3) * offset;

      const shape = new PIXI.Graphics();
      shape.lineStyle(2, 0x00ff00, 0.8);
      shape.drawRect(
        snapped.x - gridSize/2 + xOffset,
        snapped.y - gridSize/2 + yOffset,
        gridSize,
        gridSize
      );

      if (canvas.controls?.ruler) {
        canvas.controls.ruler.addChild(shape);
      }

      const text = new PIXI.Text(`${i + 1}`, {
        fontSize: 16,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 3
      });
      text.anchor.set(0.5);
      text.x = snapped.x + xOffset;
      text.y = snapped.y + yOffset;

      if (canvas.controls?.ruler) {
        canvas.controls.ruler.addChild(text);
      }
    }

    if (this._cursorIndicator) {
      this._cursorIndicator.x = snapped.x;
      this._cursorIndicator.y = snapped.y;
    }
  }

  /**
   * Handle canvas click to place tokens
   * @param {PIXI.InteractionEvent} event - The click event
   */
  static async _onCanvasClick(event) {
    if (!this._isPlacingTokens) return;

    const position = event.data.getLocalPosition(canvas.tokens);
    const snapped = canvas.grid.getSnappedPoint({ x: position.x, y: position.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

    const gridSize = canvas.grid.size;
    const offset = gridSize * 0.1;
    const tokensCreated = [];

    for (let i = 0; i < this._previewTokens.length; i++) {
      const previewToken = this._previewTokens[i];
      const xOffset = (i % 3) * offset;
      const yOffset = Math.floor(i / 3) * offset;

      const tokenData = {
        ...previewToken.data,
        x: snapped.x - gridSize/2 + xOffset,
        y: snapped.y - gridSize/2 + yOffset,
        alpha: 1
      };

      try {
        const tokenDoc = await canvas.scene.createEmbeddedDocuments('Token', [tokenData]);
        tokensCreated.push(tokenDoc[0]);
      } catch (error) {
        LogUtil.error("Failed to create token", [error, previewToken.actor.name]);
      }
    }

    this._cleanup();

    if (tokensCreated.length > 0) {
      ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.tokensPlaced", {
        count: tokensCreated.length
      }));
    }
  }

  /**
   * Create animated cursor indicator
   */
  static _createCursorIndicator() {
    if (!canvas?.controls?.ruler) {
      LogUtil.warn("Canvas controls not ready for cursor indicator");
      return;
    }

    if (this._cursorIndicator) {
      this._cursorIndicator.destroy({ children: true });
      this._cursorIndicator = null;
    }

    if (this._cursorAnimation) {
      clearInterval(this._cursorAnimation);
      this._cursorAnimation = null;
    }

    this._cursorIndicator = new PIXI.Container();
    this._cursorIndicator.zIndex = 1000;
    canvas.controls.ruler.addChild(this._cursorIndicator);

    const circle1 = new PIXI.Graphics();
    circle1.lineStyle(3, 0x00ff00, 1);
    circle1.drawCircle(0, 0, 20);
    this._cursorIndicator.addChild(circle1);

    const circle2 = new PIXI.Graphics();
    circle2.lineStyle(3, 0x00ff00, 0.6);
    circle2.drawCircle(0, 0, 30);
    this._cursorIndicator.addChild(circle2);

    const circle3 = new PIXI.Graphics();
    circle3.lineStyle(3, 0x00ff00, 0.3);
    circle3.drawCircle(0, 0, 40);
    this._cursorIndicator.addChild(circle3);

    let animationFrame = 0;
    this._cursorAnimation = setInterval(() => {
      if (!this._cursorIndicator || !this._cursorIndicator.parent) {
        if (this._cursorAnimation) {
          clearInterval(this._cursorAnimation);
          this._cursorAnimation = null;
        }
        return;
      }

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

    LogUtil.log("Cursor indicator created and animation started");
  }

  /**
   * Handle right-click to cancel placement
   * @param {PIXI.InteractionEvent} event - The right-click event
   */
  static _onCanvasRightClick(event) {
    if (!this._isPlacingTokens) return;

    if (this._rightMouseDown) {
      return;
    }

    event.stopPropagation();
    this._cleanup();
    ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.tokenPlacementCancelled"));
  }

  /**
   * Clean up placement mode and handlers
   */
  static _cleanup() {
    this._isPlacingTokens = false;
    this._previewTokens = [];
    this._actorsToPlace = [];
    this._placementIndex = 0;

    if (this._canvasMoveHandler) {
      canvas.stage.off('mousemove', this._canvasMoveHandler);
      this._canvasMoveHandler = null;
    }

    if (this._canvasClickHandler) {
      canvas.stage.off('click', this._canvasClickHandler);
      this._canvasClickHandler = null;
    }

    if (this._canvasRightClickHandler) {
      canvas.stage.off('rightclick', this._canvasRightClickHandler);
      this._canvasRightClickHandler = null;
    }

    if (this._canvasRightDownHandler) {
      canvas.stage.off('rightdown', this._canvasRightDownHandler);
      this._canvasRightDownHandler = null;
    }

    if (this._canvasRightUpHandler) {
      canvas.stage.off('rightup', this._canvasRightUpHandler);
      this._canvasRightUpHandler = null;
    }

    if (this._cursorAnimation) {
      clearInterval(this._cursorAnimation);
      this._cursorAnimation = null;
    }

    if (this._cursorIndicator) {
      this._cursorIndicator.destroy({ children: true });
      this._cursorIndicator = null;
    }

    this._rightMouseDown = false;
    canvas.controls.ruler.clear();
  }

  /**
   * Check if token placement is currently active
   * @returns {boolean} True if placing tokens
   */
  static isPlacing() {
    return this._isPlacingTokens;
  }
}
