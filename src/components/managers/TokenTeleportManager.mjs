import { LogUtil } from '../utils/LogUtil.mjs';
import { MODULE_ID } from '../../constants/General.mjs';
import { getActorData } from '../helpers/Helpers.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';

/**
 * Manages token teleportation functionality
 * Allows GMs to teleport tokens to different locations or scenes with optional animations
 */
export class TokenTeleportManager {

  static _isTeleporting = false;
  static _isPerformingTeleport = false;
  static _tokensToTeleport = [];
  static _tokenDataToTeleport = [];
  static _sourceScene = null;
  static _canvasClickHandler = null;
  static _canvasRightClickHandler = null;
  static _canvasMoveHandler = null;
  static _canvasRightDownHandler = null;
  static _targetScene = null;
  static _sceneSelectDialog = null;
  static _cursorIndicator = null;
  static _cursorAnimation = null;
  static _rightMouseDown = false;
  static _rightMouseDownPosition = null;
  static _hasDragged = false;

  /**
   * Teleport selected tokens
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async teleportSelectedTokens(menu) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can teleport tokens");
      return;
    }

    if (menu.selectedActors.size === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTokensSelectedForTeleport"));
      return;
    }

    if (this._isTeleporting) {
      ui.notifications.warn("Teleportation already in progress");
      return;
    }

    const tokensToTeleport = [];
    const tokenDataToTeleport = [];

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;

      const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
      const token = tokenId ? canvas.tokens.get(tokenId) : canvas.tokens.placeables.find(t => t.actor?.id === actor.id);

      if (token) {
        tokensToTeleport.push(token);
        tokenDataToTeleport.push({
          id: token.id,
          sceneId: canvas.scene.id,
          x: token.document.x,
          y: token.document.y,
          width: token.document.width,
          height: token.document.height
        });
      }
    }

    if (tokensToTeleport.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTokensSelectedForTeleport"));
      return;
    }

    this._tokensToTeleport = tokensToTeleport;
    this._tokenDataToTeleport = tokenDataToTeleport;
    this._sourceScene = canvas.scene;
    this._targetScene = canvas.scene;
    this._isTeleporting = true;

    await this._showSceneSelector();
  }

  /**
   * Show dialog to select target scene
   */
  static async _showSceneSelector() {
    const scenes = game.scenes.filter(s => s.active || game.user.isGM);
    const currentSceneId = canvas.scene.id;

    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("FLASH_ROLLS.ui.dialogs.teleportDestinationLabel")}</label>
        <select id="target-scene" style="width: 100%;">
          ${scenes.map(s => {
            const isCurrent = s.id === currentSceneId;
            const label = isCurrent
              ? game.i18n.format("FLASH_ROLLS.ui.dialogs.teleportSameSceneLabel", { name: s.name })
              : s.name;
            return `<option value="${s.id}" ${isCurrent ? 'selected' : ''}>${label}</option>`;
          }).join('')}
        </select>
      </div>
      <p style="margin-top: 1em; font-size: 0.9em; color: var(--color-text-dark-secondary);">
        ${game.i18n.localize("FLASH_ROLLS.ui.dialogs.teleportDestinationHint")}
      </p>
    `;

    this._sceneSelectDialog = new Dialog({
      title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.teleportDestinationTitle"),
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("FLASH_ROLLS.ui.dialogs.teleportDestinationButton"),
          callback: (html) => {
            const sceneId = html.find('#target-scene').val();
            this._targetScene = game.scenes.get(sceneId);

            this._sceneSelectDialog.close();

            setTimeout(async () => {
              if (this._targetScene.id !== this._sourceScene.id) {
                await this._targetScene.view();
                await new Promise(resolve => setTimeout(resolve, 1000));
              }

              await this._showTargetingUI();
              this._attachCanvasHandlers();

              const tokenCount = this._tokenDataToTeleport?.length || 0;
              LogUtil.log(`Teleport ready with ${tokenCount} tokens`, this._tokenDataToTeleport);
              ui.notifications.info(`Click to teleport ${tokenCount} token(s), right-click to cancel`);
            }, 50);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => {
            this._cleanup();
          }
        }
      },
      default: "ok",
      close: () => {
      }
    });

    this._sceneSelectDialog.render(true);
  }

  /**
   * Get fresh token references from stored data
   * @returns {Array} Array of token objects
   */
  static _getTokensFromData() {
    const tokens = [];
    for (const data of this._tokenDataToTeleport) {
      const scene = game.scenes.get(data.sceneId);
      if (!scene) continue;

      const token = scene.tokens.get(data.id);
      if (token) {
        const tokenObj = canvas.scene.id === data.sceneId ? canvas.tokens.get(data.id) : null;
        tokens.push(tokenObj || { document: token, id: data.id });
      }
    }
    return tokens;
  }

  /**
   * Show targeting UI for destination selection
   */
  static async _showTargetingUI() {
    const positions = this._tokenDataToTeleport.map(t => ({ x: t.x, y: t.y }));
    const center = this._calculateCenterPoint(positions);

    if (this._targetScene.id === this._sourceScene.id) {
      const tokens = this._getTokensFromData();
      tokens.forEach(token => {
        if (token.alpha !== undefined) {
          token.alpha = 0.5;
        }
      });
    }
  }

  /**
   * Attach canvas event handlers for teleportation
   */
  static _attachCanvasHandlers() {
    LogUtil.log("Attaching canvas handlers for teleportation");

    this._canvasMoveHandler = (event) => this._onCanvasMouseMove(event);
    this._canvasClickHandler = (event) => this._onCanvasClick(event);
    this._canvasRightClickHandler = (event) => this._onCanvasRightClick(event);
    this._canvasRightDownHandler = (event) => {
      const position = event.data.getLocalPosition(canvas.tokens);
      this._rightMouseDownPosition = { x: position.x, y: position.y };
      this._hasDragged = false;
    };
    this._canvasRightUpHandler = (event) => {
      setTimeout(() => {
        this._rightMouseDownPosition = null;
        this._hasDragged = false;
      }, 300);
    };

    if (!canvas?.stage) {
      LogUtil.warn("Canvas stage not available");
      return;
    }

    canvas.stage.on('mousemove', this._canvasMoveHandler);
    canvas.stage.on('click', this._canvasClickHandler);
    canvas.stage.on('rightclick', this._canvasRightClickHandler);
    canvas.stage.on('rightdown', this._canvasRightDownHandler);
    canvas.stage.on('rightup', this._canvasRightUpHandler);

    LogUtil.log("Canvas handlers attached successfully");

    setTimeout(() => {
      this._createCursorIndicator();
    }, 100);
  }

  /**
   * Handle mouse move to show preview
   * @param {PIXI.InteractionEvent} event - The mouse move event
   */
  static async _onCanvasMouseMove(event) {
    if (this._rightMouseDownPosition) {
      const position = event.data.getLocalPosition(canvas.tokens);
      const dragDistance = Math.sqrt(
        Math.pow(position.x - this._rightMouseDownPosition.x, 2) +
        Math.pow(position.y - this._rightMouseDownPosition.y, 2)
      );
      if (dragDistance > 5) {
        this._hasDragged = true;
      }
    }

    if (!this._isTeleporting || !this._targetScene || this._tokenDataToTeleport.length === 0) {
      return;
    }

    if (!canvas?.controls) {
      return;
    }

    const position = event.data.getLocalPosition(canvas.tokens);
    const snapped = this._snapToHalfGrid(position.x, position.y);

    if (canvas.controls?.children) {
      try {
        const children = Array.from(canvas.controls.children);
        for (const child of children) {
          if (child !== this._cursorIndicator && child._flashRollsTeleportPreview) {
            canvas.controls.removeChild(child);
            if (child.destroy) child.destroy();
          }
        }
      } catch (error) {
        LogUtil.warn("Error clearing preview graphics", error);
      }
    }

    const sourceGridSize = this._sourceScene.grid.size;
    const targetGridSize = canvas.grid.size;

    const boundingBox = this._calculateBoundingBox(this._tokenDataToTeleport, sourceGridSize);
    const groupCenterX = boundingBox.x + boundingBox.width / 2;
    const groupCenterY = boundingBox.y + boundingBox.height / 2;

    const isSameScene = this._targetScene.id === this._sourceScene.id;

    try {
      for (let i = 0; i < this._tokenDataToTeleport.length; i++) {
        const tokenData = this._tokenDataToTeleport[i];
        const tokenDoc = this._sourceScene.tokens.get(tokenData.id);
        if (!tokenDoc) continue;

        const sourceTokenWidth = tokenData.width * sourceGridSize;
        const sourceTokenHeight = tokenData.height * sourceGridSize;
        const sourceTokenCenterX = tokenData.x + sourceTokenWidth / 2;
        const sourceTokenCenterY = tokenData.y + sourceTokenHeight / 2;

        const relativeGridX = (sourceTokenCenterX - groupCenterX) / sourceGridSize;
        const relativeGridY = (sourceTokenCenterY - groupCenterY) / sourceGridSize;

        const newCenterX = snapped.x + (relativeGridX * targetGridSize);
        const newCenterY = snapped.y + (relativeGridY * targetGridSize);

        const targetTokenWidth = tokenData.width * targetGridSize;
        const targetTokenHeight = tokenData.height * targetGridSize;

        const newX = newCenterX - targetTokenWidth / 2;
        const newY = newCenterY - targetTokenHeight / 2;

        const texture = await foundry.canvas.loadTexture(tokenDoc.texture.src);
        const ghostToken = new PIXI.Sprite(texture);
        ghostToken.anchor.set(0);
        ghostToken.x = newX;
        ghostToken.y = newY;
        ghostToken.width = targetTokenWidth;
        ghostToken.height = targetTokenHeight;
        ghostToken.alpha = 0.5;
        ghostToken.tint = 0x00ccff;
        ghostToken._flashRollsTeleportPreview = true;
        canvas.controls.addChild(ghostToken);
      }
    } catch (error) {
      LogUtil.warn("Error drawing teleport preview", error);
      return;
    }

    if (this._cursorIndicator) {
      this._cursorIndicator.x = snapped.x;
      this._cursorIndicator.y = snapped.y;
    }
  }

  /**
   * Handle canvas click to perform teleportation
   * @param {PIXI.InteractionEvent} event - The click event
   */
  static async _onCanvasClick(event) {
    if (!this._isTeleporting || this._isPerformingTeleport) return;

    const position = event.data.getLocalPosition(canvas.tokens);
    const snapped = this._snapToHalfGrid(position.x, position.y);

    await this._performTeleport(snapped);
  }

  /**
   * Perform the actual teleportation
   * @param {Object} destination - The destination point {x, y}
   */
  static async _performTeleport(destination) {
    this._isPerformingTeleport = true;

    const gridSize = this._sourceScene.grid.size;
    const boundingBox = this._calculateBoundingBox(this._tokenDataToTeleport, gridSize);
    const groupCenterX = boundingBox.x + boundingBox.width / 2;
    const groupCenterY = boundingBox.y + boundingBox.height / 2;

    const isSameScene = this._targetScene.id === this._sourceScene.id;

    try {
      if (isSameScene) {
        await this._performSameSceneTeleport(destination, groupCenterX, groupCenterY, gridSize);
      } else {
        await this._performCrossSceneTeleport(destination, groupCenterX, groupCenterY, gridSize);
      }
    } catch (error) {
      LogUtil.error("Failed to teleport tokens", [error]);
      ui.notifications.error("Failed to teleport tokens");
      this._isPerformingTeleport = false;
      this._cleanup();
    }
  }

  /**
   * Perform teleportation within the same scene with instant movement
   * @param {Object} destination - The destination point
   * @param {number} groupCenterX - X coordinate of group center
   * @param {number} groupCenterY - Y coordinate of group center
   * @param {number} gridSize - Grid size in pixels
   */
  static async _performSameSceneTeleport(destination, groupCenterX, groupCenterY, gridSize) {
    const SETTINGS = getSettings();
    const animationPath = SettingsUtil.get(SETTINGS.teleportAnimationPath.tag);

    const tokens = this._getTokensFromData();
    if (tokens.length === 0) {
      ui.notifications.warn("No valid tokens found for teleportation");
      this._cleanup();
      return;
    }

    const hideUpdates = this._tokenDataToTeleport.map(tokenData => ({
      _id: tokenData.id,
      hidden: true
    }));
    await this._sourceScene.updateEmbeddedDocuments('Token', hideUpdates, { animate: false });

    if (animationPath || this._hasJB2A()) {
      await this._playDepartureAnimations(tokens);
    }

    const updates = [];
    const arrivalPositions = [];
    for (const tokenData of this._tokenDataToTeleport) {
      const tokenWidth = tokenData.width * gridSize;
      const tokenHeight = tokenData.height * gridSize;
      const tokenCenterX = tokenData.x + tokenWidth / 2;
      const tokenCenterY = tokenData.y + tokenHeight / 2;

      const relativeFromGroupCenterX = tokenCenterX - groupCenterX;
      const relativeFromGroupCenterY = tokenCenterY - groupCenterY;

      const newCenterX = destination.x + relativeFromGroupCenterX;
      const newCenterY = destination.y + relativeFromGroupCenterY;

      const newX = newCenterX - tokenWidth / 2;
      const newY = newCenterY - tokenHeight / 2;

      updates.push({
        _id: tokenData.id,
        x: newX,
        y: newY,
        hidden: true
      });

      arrivalPositions.push({
        x: newCenterX,
        y: newCenterY
      });
    }

    await this._sourceScene.updateEmbeddedDocuments('Token', updates, { animate: false });

    if (animationPath || this._hasJB2A()) {
      await this._playArrivalAnimations(arrivalPositions);
    }

    const showUpdates = this._tokenDataToTeleport.map(tokenData => ({
      _id: tokenData.id,
      hidden: false
    }));

    await this._sourceScene.updateEmbeddedDocuments('Token', showUpdates, { animate: false });

    this._cleanup();

    ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.tokensTeleported", {
      count: this._tokenDataToTeleport.length
    }));
  }

  /**
   * Perform teleportation to a different scene
   * @param {Object} destination - The destination point
   * @param {number} groupCenterX - X coordinate of group center
   * @param {number} groupCenterY - Y coordinate of group center
   * @param {number} sourceGridSize - Source scene grid size in pixels
   */
  static async _performCrossSceneTeleport(destination, groupCenterX, groupCenterY, sourceGridSize) {
    const SETTINGS = getSettings();
    const animationPath = SettingsUtil.get(SETTINGS.teleportAnimationPath.tag);

    const tokens = this._getTokensFromData();
    if (tokens.length === 0) {
      ui.notifications.warn("No valid tokens found for teleportation");
      this._cleanup();
      return;
    }

    const hideUpdates = this._tokenDataToTeleport.map(tokenData => ({
      _id: tokenData.id,
      hidden: true
    }));
    await this._sourceScene.updateEmbeddedDocuments('Token', hideUpdates, { animate: false });

    if (animationPath || this._hasJB2A()) {
      await this._playDepartureAnimations(tokens);
    }

    await this._sourceScene.deleteEmbeddedDocuments('Token', this._tokenDataToTeleport.map(t => t.id));

    const targetGridSize = this._targetScene.grid.size;
    const tokenCreateData = [];
    const arrivalPositions = [];

    for (const tokenData of this._tokenDataToTeleport) {
      const sourceTokenWidth = tokenData.width * sourceGridSize;
      const sourceTokenHeight = tokenData.height * sourceGridSize;
      const sourceTokenCenterX = tokenData.x + sourceTokenWidth / 2;
      const sourceTokenCenterY = tokenData.y + sourceTokenHeight / 2;

      const relativeGridX = (sourceTokenCenterX - groupCenterX) / sourceGridSize;
      const relativeGridY = (sourceTokenCenterY - groupCenterY) / sourceGridSize;

      const newCenterX = destination.x + (relativeGridX * targetGridSize);
      const newCenterY = destination.y + (relativeGridY * targetGridSize);

      const targetTokenWidth = tokenData.width * targetGridSize;
      const targetTokenHeight = tokenData.height * targetGridSize;

      const newX = newCenterX - targetTokenWidth / 2;
      const newY = newCenterY - targetTokenHeight / 2;

      const tokenDoc = this._sourceScene.tokens.get(tokenData.id);
      const data = tokenDoc.toObject();
      data.x = newX;
      data.y = newY;

      tokenCreateData.push(data);
      arrivalPositions.push({
        x: newCenterX,
        y: newCenterY
      });
    }

    const createdTokens = await this._targetScene.createEmbeddedDocuments('Token', tokenCreateData.map(data => ({
      ...data,
      hidden: true
    })));

    if (animationPath || this._hasJB2A()) {
      await this._playArrivalAnimations(arrivalPositions);
    }

    await this._targetScene.updateEmbeddedDocuments('Token', createdTokens.map(t => ({
      _id: t.id,
      hidden: false
    })));

    this._cleanup();

    ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.tokensTeleported", {
      count: createdTokens.length
    }));
  }

  /**
   * Play teleport animations (departure and arrival on same scene)
   * @param {Array} tokens - Tokens to teleport
   * @param {Object} destination - Destination point
   * @param {Object} center - Center point of tokens
   */
  static async _playTeleportAnimations(tokens, destination, center) {
    await this._playDepartureAnimations(tokens);

    await new Promise(resolve => setTimeout(resolve, 300));

    const arrivalPositions = tokens.map(token => {
      const relativeX = token.document.x - center.x;
      const relativeY = token.document.y - center.y;
      return {
        x: destination.x + relativeX + (token.document.width * canvas.grid.size / 2),
        y: destination.y + relativeY + (token.document.height * canvas.grid.size / 2)
      };
    });

    await this._playArrivalAnimations(arrivalPositions);
  }

  /**
   * Play departure animations for tokens
   * @param {Array} tokens - Tokens departing
   */
  static async _playDepartureAnimations(tokens) {
    const SETTINGS = getSettings();
    let animationPath = SettingsUtil.get(SETTINGS.teleportAnimationPath.tag);

    if (!animationPath && this._hasJB2A()) {
      animationPath = await this._getDefaultJB2APath();
    }

    if (!animationPath) return;

    if (this._hasSequencer()) {
      const gridSize = canvas.grid.size;
      for (const token of tokens) {
        const centerX = token.document.x + (token.document.width * gridSize / 2);
        const centerY = token.document.y + (token.document.height * gridSize / 2);

        new Sequence()
          .effect()
          .file(animationPath)
          .atLocation({ x: centerX, y: centerY })
          .scale(0.5)
          .fadeIn(100)
          .fadeOut(200)
          .play();
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }

  /**
   * Play arrival animations at positions
   * @param {Array} positions - Array of {x, y} positions
   */
  static async _playArrivalAnimations(positions) {
    const SETTINGS = getSettings();
    let animationPath = SettingsUtil.get(SETTINGS.teleportAnimationPath.tag);

    if (!animationPath && this._hasJB2A()) {
      animationPath = await this._getDefaultJB2APath();
    }

    if (!animationPath) return;

    if (this._hasSequencer()) {
      for (const pos of positions) {
        new Sequence()
          .effect()
          .file(animationPath)
          .atLocation(pos)
          .scale(0.5)
          .fadeIn(100)
          .fadeOut(200)
          .play();
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Get JB2A module if available
   * @returns {Module|null} JB2A module or null
   */
  static _getJB2AModule() {
    return game.modules.get('JB2A_DnD5e') || game.modules.get('jb2a_patreon');
  }

  /**
   * Check if JB2A module is active
   * @returns {boolean} True if JB2A is available
   */
  static _hasJB2A() {
    const module = this._getJB2AModule();
    return module?.active;
  }

  /**
   * Check if Sequencer module is active
   * @returns {boolean} True if Sequencer is available
   */
  static _hasSequencer() {
    return game.modules.get('sequencer')?.active;
  }

  /**
   * Get default JB2A teleport animation path
   * @returns {string} Path to animation
   */
  static async _getDefaultJB2APath() {
    if (this._hasSequencer() && window.Sequencer?.Database) {
      const possiblePaths = [
        'jb2a.teleportation.circle.blue',
        'jb2a.teleport.circle.blue',
        'jb2a.teleportation.blue'
      ];

      for (const dbPath of possiblePaths) {
        if (Sequencer.Database.entryExists(dbPath)) {
          LogUtil.log(`Found JB2A teleport animation via Sequencer: ${dbPath}`);
          return dbPath;
        }
      }
    }

    const jb2aModule = this._getJB2AModule();
    if (jb2aModule?.active) {
      const modulePath = jb2aModule.id;
      const filePath = `modules/${modulePath}/Library/Generic/Energy/Teleport/Teleport01_01_Regular_Blue_500x300.webm`;

      LogUtil.log(`Using JB2A teleport animation file path: ${filePath}`);
      return filePath;
    }

    LogUtil.warn("JB2A module not found, animations disabled");
    return null;
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

    if (!canvas?.controls) {
      LogUtil.warn("Canvas controls not available for cursor indicator");
      return;
    }

    this._cursorIndicator = new PIXI.Container();
    this._cursorIndicator.zIndex = 1000;
    canvas.controls.addChild(this._cursorIndicator);

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
   * Handle right-click to cancel teleportation
   * @param {PIXI.InteractionEvent} event - The right-click event
   */
  static _onCanvasRightClick(event) {
    if (!this._isTeleporting) return;

    if (this._hasDragged) {
      LogUtil.log("Ignoring right-click due to drag");
      return;
    }

    event.stopPropagation();
    LogUtil.log("Cancelling teleport via right-click");
    this._cleanup();
    ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.teleportCancelled"));
  }

  /**
   * Calculate center point of multiple positions
   * @param {Array} positions - Array of {x, y} positions
   * @returns {Object} Center point {x, y}
   */
  static _calculateCenterPoint(positions) {
    if (positions.length === 0) return { x: 0, y: 0 };

    const sum = positions.reduce((acc, pos) => ({
      x: acc.x + pos.x,
      y: acc.y + pos.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / positions.length,
      y: sum.y / positions.length
    };
  }

  /**
   * Snap position to half-grid intervals
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Object} Snapped position {x, y}
   */
  static _snapToHalfGrid(x, y) {
    const gridSize = canvas.grid.size;
    const halfGrid = gridSize / 2;

    const snappedX = Math.round(x / halfGrid) * halfGrid;
    const snappedY = Math.round(y / halfGrid) * halfGrid;

    return { x: snappedX, y: snappedY };
  }

  /**
   * Calculate bounding box of multiple tokens
   * @param {Array} tokenDataArray - Array of token data objects with {x, y, width, height}
   * @param {number} gridSize - Grid size in pixels
   * @returns {Object} Bounding box {x, y, width, height}
   */
  static _calculateBoundingBox(tokenDataArray, gridSize) {
    if (tokenDataArray.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const tokenData of tokenDataArray) {
      const tokenWidth = tokenData.width * gridSize;
      const tokenHeight = tokenData.height * gridSize;

      minX = Math.min(minX, tokenData.x);
      minY = Math.min(minY, tokenData.y);
      maxX = Math.max(maxX, tokenData.x + tokenWidth);
      maxY = Math.max(maxY, tokenData.y + tokenHeight);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Calculate relative positions of tokens from a center point
   * @param {Array} tokens - Array of tokens
   * @returns {Array} Array of {token, relativeX, relativeY}
   */
  static _calculateRelativePositions(tokens) {
    const positions = tokens.map(t => ({ x: t.document.x, y: t.document.y }));
    const center = this._calculateCenterPoint(positions);

    return tokens.map(token => ({
      token: token,
      relativeX: token.document.x - center.x,
      relativeY: token.document.y - center.y
    }));
  }

  /**
   * Clean up teleportation mode and handlers
   */
  static _cleanup() {
    const tokens = this._getTokensFromData();
    tokens.forEach(token => {
      if (token.alpha !== undefined) {
        token.alpha = 1;
      }
    });

    this._clearPreviewGraphics();

    this._isTeleporting = false;
    this._isPerformingTeleport = false;
    this._tokensToTeleport = [];
    this._tokenDataToTeleport = [];
    this._sourceScene = null;
    this._targetScene = null;
    this._rightMouseDown = false;
    this._rightMouseDownPosition = null;

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

    if (this._sceneSelectDialog) {
      this._sceneSelectDialog.close();
      this._sceneSelectDialog = null;
    }
  }

  /**
   * Clear all preview graphics from canvas
   */
  static _clearPreviewGraphics() {
    if (!canvas?.controls?.children) return;

    try {
      const children = Array.from(canvas.controls.children);
      for (const child of children) {
        if (child._flashRollsTeleportPreview) {
          canvas.controls.removeChild(child);
          child.destroy();
        }
      }
    } catch (error) {
      LogUtil.warn("Error clearing preview graphics", error);
    }

    this._rightMouseDown = false;
    this._rightMouseDownPosition = null;
  }

  /**
   * Check if teleportation is currently active
   * @returns {boolean} True if teleporting
   */
  static isTeleporting() {
    return this._isTeleporting;
  }
}
