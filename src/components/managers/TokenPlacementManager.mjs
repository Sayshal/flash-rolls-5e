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

    ui.notifications.info(`Click to place ${actorsToPlace.length} token(s) one at a time, right-click to skip current token`);
  }

  /**
   * Create preview tokens that follow the mouse cursor
   */
  static async _createPreviewTokens() {
    this._previewTokens = [];

    for (const actor of this._actorsToPlace) {
      const baseActor = actor.isToken ? actor.baseActor : actor;
      const tokenData = await baseActor.getTokenDocument();

      const previewData = {
        ...tokenData.toObject(),
        x: 0,
        y: 0,
        alpha: 0.5,
        actorLink: false
      };

      this._previewTokens.push({
        actor: baseActor,
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
  }

  /**
   * Handle mouse move to update preview token position
   * @param {PIXI.InteractionEvent} event - The mouse move event
   */
  static async _onCanvasMouseMove(event) {
    if (!this._isPlacingTokens) return;
    if (this._placementIndex >= this._previewTokens.length) return;

    const position = event.data.getLocalPosition(canvas.tokens);
    const snapped = canvas.grid.getSnappedPoint({ x: position.x, y: position.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

    if (canvas.controls?.children) {
      try {
        const children = Array.from(canvas.controls.children);
        for (const child of children) {
          if (child._flashRollsPlacementPreview) {
            canvas.controls.removeChild(child);
            if (child.destroy) child.destroy();
          }
        }
      } catch (error) {
        LogUtil.warn("Error clearing preview graphics", error);
      }
    }

    const currentPreview = this._previewTokens[this._placementIndex];
    const tokenData = currentPreview.data;
    const gridSize = canvas.grid.size;

    try {
      const texture = await foundry.canvas.loadTexture(tokenData.texture.src);
      const ghostToken = new PIXI.Sprite(texture);

      const tokenWidth = tokenData.width * gridSize;
      const tokenHeight = tokenData.height * gridSize;

      ghostToken.anchor.set(0);
      ghostToken.x = snapped.x - tokenWidth / 2;
      ghostToken.y = snapped.y - tokenHeight / 2;
      ghostToken.width = tokenWidth;
      ghostToken.height = tokenHeight;
      ghostToken.alpha = 0.5;
      ghostToken.tint = 0x00ccff;
      ghostToken._flashRollsPlacementPreview = true;

      if (canvas.controls) {
        canvas.controls.addChild(ghostToken);
      }

      const progressText = `${this._placementIndex + 1}/${this._previewTokens.length}`;
      const text = new PIXI.Text(progressText, {
        fontSize: 20,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 4
      });
      text.anchor.set(0.5);
      text.x = snapped.x;
      text.y = snapped.y - tokenHeight / 2 - 20;
      text._flashRollsPlacementPreview = true;

      if (canvas.controls) {
        canvas.controls.addChild(text);
      }
    } catch (error) {
      LogUtil.warn("Error drawing placement preview", error);
    }
  }

  /**
   * Handle canvas click to place current token
   * @param {PIXI.InteractionEvent} event - The click event
   */
  static async _onCanvasClick(event) {
    if (!this._isPlacingTokens) return;
    if (this._placementIndex >= this._previewTokens.length) return;

    const position = event.data.getLocalPosition(canvas.tokens);
    const snapped = canvas.grid.getSnappedPoint({ x: position.x, y: position.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

    const gridSize = canvas.grid.size;
    const currentPreview = this._previewTokens[this._placementIndex];

    const tokenData = {
      ...currentPreview.data,
      x: snapped.x - (currentPreview.data.width * gridSize) / 2,
      y: snapped.y - (currentPreview.data.height * gridSize) / 2,
      alpha: 1,
      actorLink: false
    };

    try {
      await canvas.scene.createEmbeddedDocuments('Token', [tokenData]);
      this._placementIndex++;

      if (this._placementIndex >= this._previewTokens.length) {
        const totalPlaced = this._previewTokens.length;
        this._cleanup();
        ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.tokensPlaced", {
          count: totalPlaced
        }));
      }
    } catch (error) {
      LogUtil.error("Failed to create token", [error, currentPreview.actor.name]);
    }
  }


  /**
   * Handle right-click to skip current token
   * @param {PIXI.InteractionEvent} event - The right-click event
   */
  static _onCanvasRightClick(event) {
    if (!this._isPlacingTokens) return;
    if (this._placementIndex >= this._previewTokens.length) return;

    if (this._rightMouseDown) {
      return;
    }

    event.stopPropagation();

    this._previewTokens.splice(this._placementIndex, 1);
    this._actorsToPlace.splice(this._placementIndex, 1);

    if (this._previewTokens.length === 0 || this._placementIndex >= this._previewTokens.length) {
      this._cleanup();
      ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.tokenPlacementCancelled"));
    } else {
      this._clearPreviewGraphics();
    }
  }

  /**
   * Clear all preview graphics from canvas
   */
  static _clearPreviewGraphics() {
    if (!canvas.controls?.children) return;

    try {
      const children = Array.from(canvas.controls.children);
      for (const child of children) {
        if (child._flashRollsPlacementPreview) {
          canvas.controls.removeChild(child);
          if (child.destroy) child.destroy();
        }
      }
    } catch (error) {
      LogUtil.warn("Error clearing preview graphics", error);
    }
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

    this._rightMouseDown = false;

    this._clearPreviewGraphics();
  }

  /**
   * Check if token placement is currently active
   * @returns {boolean} True if placing tokens
   */
  static isPlacing() {
    return this._isPlacingTokens;
  }

  /**
   * Place tokens at a specific location automatically
   * @param {string[]} actorIds - Array of actor/token IDs to place
   * @param {Object} location - Location to place tokens {x: number, y: number}
   */
  static async placeTokensAtLocation(actorIds, location) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can place tokens");
      return;
    }

    if (!actorIds || actorIds.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelectedForPlacement"));
      return;
    }

    if (!location || typeof location.x !== 'number' || typeof location.y !== 'number') {
      ui.notifications.error("Invalid location provided for token placement");
      return;
    }

    const actorsToPlace = [];

    for (const uniqueId of actorIds) {
      const actor = getActorData(uniqueId);
      if (!actor) {
        LogUtil.warn(`Could not find actor for ID: ${uniqueId}`);
        continue;
      }

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
      LogUtil.warn("No valid actors found for placement", actorIds);
      return;
    }

    const snapped = canvas.grid.getSnappedPoint({ x: location.x, y: location.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
    const gridSize = canvas.grid.size;
    const tokensCreated = [];

    for (const actor of actorsToPlace) {
      const baseActor = actor.isToken ? actor.baseActor : actor;
      const tokenData = await baseActor.getTokenDocument();

      const finalTokenData = {
        ...tokenData.toObject(),
        x: snapped.x - (tokenData.width * gridSize) / 2,
        y: snapped.y - (tokenData.height * gridSize) / 2,
        alpha: 1,
        actorLink: false
      };

      try {
        const created = await canvas.scene.createEmbeddedDocuments('Token', [finalTokenData]);
        tokensCreated.push(...created);
      } catch (error) {
        LogUtil.error("Failed to create token", [error, baseActor.name]);
      }
    }
  }
}
