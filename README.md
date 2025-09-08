# Flash Rolls 5e

[![alt-text](https://img.shields.io/badge/-Discord-%235662f6?style=for-the-badge)](https://discord.gg/cAuTaTYda3) 
![GitHub Downloads (specific asset, all releases)](https://img.shields.io/github/downloads/crlngn/flash-rolls-5e/module.zip?color=2b82fc&label=DOWNLOADS&style=for-the-badge)

This is a Foundry VTT module that facilitates rolling for GMs, adding the following features to core Foundry v13 / DnD5e 5.0.x: 
- Roll for multiple NPCs or PCs at once
- Calculate the result of group rolls with 4 different options (see below)
- Request skill checks, saving throws, etc. from single or multiple player actors, adding DCs and bonuses before the request
- Help new players who are unfamiliar with Foundry or tend to slow down combat
- Target tokens from template drawing

### Roll for multiple NPCs and request for all players, all at once:

https://github.com/user-attachments/assets/ae140c5f-5b8f-4c38-976e-238294fc4f2b

### Create and save macros for frequent roll requests

https://github.com/user-attachments/assets/a24505ab-99db-455e-9ec6-163a2bbf4181

### Interface and request from sheets:

https://github.com/user-attachments/assets/c2cae279-e2e0-43a5-91ff-d1bf5fc21458


## Group Roll Calculation

<img width="320" height="383" alt="image" src="https://github.com/user-attachments/assets/f2f36d65-568e-4907-b362-7b70991a1779" />

Four different modes of calculation are available in Settings:
  - **Standard Rule:** At least half the characters must pass the DC
  - **Simple Average:** All rolls are summed up and averaged, then checked against the DC
  - **Leader With Help:** (Daggerheart rule) The roll from the character with highest modifiers is considered, then each other success is added and failure subtracted
  - **Weakest Link** The roll from the character with lowest modifiers is considered, then each other success is added (other failures are discarded)
You can calculate group roll results via API as well, see below.

## How to use

### For Roll Requests and multi-rolls:

  <img width="650" alt="image" src="https://github.com/user-attachments/assets/7df899ba-3966-4edb-87c4-0693c17bf36b" />
  
  - Click the lightning bolt on sidebar to open the menu
  - Select one or more actors on the list and a menu will appear for the type of roll
  - There are a few toggles on top of the actors list, in the settings section:
    - **Roll Requests:** ON - Requests will be sent to players who own characters if they are online / OFF - All characters will be rolled locally by the GM (no requests)
    - **Skip Roll Dialog:** ON - Roll Configuration Dialog will be skipped and default options used. / OFF - Roll Config Dialog will apear, with option for DC on applicable rolls
    - **Group Rolls:** ON - Rolls from multiple actors triggered at once will show up in a condensed message, including Group Roll calculation / OFF - Each roll will be posted to an individual message
    - **Select All** ON - Selects all characters on PC or NPC list
    
  - When Roll Requests are activated, clicking to roll will open a opoup on player side, with all the selected configurations from DM. If you select advantage / disadvantage or situational bonus, the option should appear on player's side


### Macros

You can turn a request from Flash Rolls menu into a macro, so you can reuse frequent requests and trigger via keyboard or macro toolbar.

#### Creating Macros

**Via GM Dialog:**
1. Initiate a roll request via menu or character sheet (skill, save, etc.). Untoggle "Skip Roll Dialog" if you want to include DC and situational bonus.
2. When the GM dialog opens, configure the desired options (DC, situational bonus, advantage/disadvantage)
3. Click the "Create Macro" button (a </> symbol)
4. The macro is saved with all current settings and opens up for editing

**Via API:**
Use the `createMacro()` method to programmatically create macros with specific configurations (see above).

**Via Manual Creation:**
Create a script macro manually using the Flash Rolls API:

```javascript
// Example macro: Request Stealth checks from selected tokens
const selectedTokens = canvas.tokens?.controlled.map(t => t.id);

if (selectedTokens.length === 0) {
  ui.notifications.warn("Please select some tokens first");
  return;
}

FlashRolls5e.requestRoll({
  requestType: 'skill',
  rollKey: 'ste',
  actorIds: selectedTokens,
  dc: 12,
  skipRollDialog: true,
  sendAsRequest: true
});
```

#### Macro Structure

Generated macros have the following structure:

```javascript
// Flash Rolls: Acrobatics
try {
  FlashRolls5e.requestRoll({
    "requestType": "skill",
    "rollKey": "acr",
    "actorIds": ["actorId1", "actorId2"],
    "dc": 15,
    "situationalBonus": "+2",
    "advantage": false,
    "disadvantage": false,
    "skipRollDialog": true,
    "sendAsRequest": true
  });
} catch (error) {
  ui.notifications.error("Flash Rolls: Macro execution failed. The macro data may be malformed.");
}
```

#### Advanced Macro Examples

**Roll Request with Conditional DC:**
```javascript
// Macro: Perception check with dynamic DC based on scene darkness
// First, get the selected tokens (works with both token IDs and actor IDs)
const selectedTokens = canvas.tokens?.controlled.map(t => t.id) || [];

if (selectedTokens.length === 0) {
  ui.notifications.warn("Please select some tokens first");
  return;
}

const darkness = canvas.scene.environment.darkness || 0; // 0 = bright, 1 = complete darkness
const adaptiveDC = darkness > 0.5 ? 15 : (darkness > 0 ? 13 : 10);

FlashRolls5e.requestRoll({
  requestType: 'skill',
  rollKey: 'prc',
  actorIds: selectedTokens, // Can be token IDs or actor IDs
  dc: adaptiveDC,
  skipRollDialog: true
});
```

**Multi-Roll Macro:**
```javascript
// Macro: Request both Perception and Investigation
const selectedTokens = canvas.tokens?.controlled.map(t => t.id) || [];

// Perception first
FlashRolls5e.requestRoll({
  requestType: 'skill',
  rollKey: 'prc',
  actorIds: selectedTokens,
  dc: 13
});

// Investigation after a short delay
setTimeout(() => {
  FlashRolls5e.requestRoll({
    requestType: 'skill',
    rollKey: 'inv',
    actorIds: selectedTokens,
    dc: 15
  });
}, 1000);
```

## API

Flash Rolls 5e provides an API that users and other modules can use to interact with its roll request system and group roll calculations.

### Accessing the API

The API is available globally via the FlashRolls5e alias:

```javascript
// Global alias
FlashRolls5e.requestRoll(options);

// Alternative: Direct module API access
game.modules.get('flash-rolls-5e').api.requestRoll(options);
```

### API Methods

#### `requestRoll(options)`

Triggers roll requests for the provided actors using Flash Rolls 5e's roll orchestration flow.

**Parameters:**
- `options.requestType` (string) - Type of roll: `'skill'`, `'ability'`, `'savingthrow'`, `'tool'`, `'initiative'`, `'deathsave'`, `'hitdie'`, `'custom'`
- `options.rollKey` (string, optional) - Specific roll key (e.g., `'acr'` for Acrobatics, `'str'` for Strength)
- `options.actorIds` (string[], optional) - Array of actor IDs or token IDs to roll for
- `options.dc` (number, optional) - Difficulty Class for the roll
- `options.situationalBonus` (string, optional) - Situational bonus (e.g., `'+2'`, `'1d4'`)
- `options.advantage` (boolean, optional) - Roll with advantage
- `options.disadvantage` (boolean, optional) - Roll with disadvantage
- `options.skipRollDialog` (boolean, optional) - Skip the roll dialog
- `options.sendAsRequest` (boolean, optional) - Send to players instead of rolling locally. Default is true.

**Example:**
```javascript
// Request Acrobatics skill checks from selected actors
FlashRolls5e.requestRoll({
  requestType: 'skill',
  rollKey: 'acr',
  actorIds: ['actorId1', 'actorId2', 'actorId3'],
  dc: 15,
  situationalBonus: '+2',
  advantage: false,
  skipRollDialog: true,
  sendAsRequest: true
});

// Request Strength saving throws with disadvantage
FlashRolls5e.requestRoll({
  requestType: 'savingthrow',
  rollKey: 'str',
  actorIds: ['actorId1', 'actorId2'],
  dc: 12,
  disadvantage: true
});
```

#### `calculateGroupRoll(options)`

Calculate group roll results using Flash Rolls 5e's group calculation methods.

**Parameters:**
- `options.method` (number|string) - Calculation method:
  - `1` or `"Standard Rule"` - At least half the group must succeed
  - `2` or `"Group Average"` - Simple average of all rolls, rounded down
  - `3` or `"Leader with Help"` - Result from best actor in the roll type, modified by group successes/failures
  - `4` or `"Weakest Link"` - Result from worst actor in the roll type, plus other group successes
- `options.rollResults` (Object[]) - Array of roll results with `{ actorId, total, actorName? }`
- `options.dc` (number) - Difficulty Class to check against
- `options.actors` (Object[], optional) - Array of actor objects. **Auto-resolved from `actorId` values in rollResults if not provided** (checks both token actors and game actors)
- `options.rollType` (string) - Type of roll, required for methods 3 & 4 (e.g., `'skill'`, `'ability'`, `'savingthrow'`)
- `options.rollKey` (string) - Specific roll key, required for methods 3 & 4 (e.g., `'acr'` for Acrobatics, `'str'` for Strength)

**Returns:**
```javascript
{
  success: boolean,           // Whether the group succeeded
  result: number,             // Numeric result (varies by method)
  method: string,             // Method name used
  actorResults: [             // Individual actor results
    {
      actorId: string,
      actorName: string,      // Auto-resolved if not provided
      total: number,
      passed: boolean,
      isLeadRoll?: boolean    // Only present for methods 3&4, identifies leader/weakest
    }
  ],
  details: {                  // Detailed calculation breakdown
    finalResult: any,         // Method-specific result
    summary: string,          // Localized summary text
    // ... additional method-specific details
  }
}
```

**Examples:**
```javascript
// Standard Rule calculation
const result = await FlashRolls5e.calculateGroupRoll({
  method: "Standard Rule",  // or method: 1
  rollResults: [
    { actorId: "actorId1", total: 15 },  // actorName auto-resolved
    { actorId: "actorId2", total: 12, actorName: "Rogue" },
    { actorId: "actorId3", total: 8 }
  ],
  dc: 12
});
// Returns: { success: true, result: 1, method: 'Standard Rule', actorResults: [...], details: {...} }

// Group Average calculation
const avgResult = FlashRolls5e.calculateGroupRoll({
  method: 2,
  rollResults: [
    { actorId: "actorId1", total: 18 },
    { actorId: "actorId2", total: 14 },
    { actorId: "actorId3", total: 10 }
  ],
  dc: 15
});

// Returns: { success: false, result: 14, method: 'Group Average', ... }

// Leader with Help calculation (actors auto-resolved)
const leaderResult = FlashRolls5e.calculateGroupRoll({
  method: "Leader with Help",  // or method: 3
  rollResults: [
    { actorId: "actorId1", total: 15 },
    { actorId: "actorId2", total: 12 },
    { actorId: "actorId3", total: 8 }
  ],
  dc: 12,
  rollType: 'skill',  // Required for methods 3 & 4
  rollKey: 'acr'      // Required for methods 3 & 4
});
```

#### `getAvailableRollTypes()`

Returns the available roll request options that can be used with `requestRoll()`.

**Example:**
```javascript
const rollTypes = FlashRolls5e.getAvailableRollTypes();
console.log(rollTypes);
// Returns object with all available roll types and their configurations
```

#### `getSelectedActors()`

Get currently selected actors from the Flash Rolls menu.

**Returns:** `string[]` - Array of selected actor/token IDs

#### `isMenuOpen()`

Check if the Flash Rolls menu is currently open.

**Returns:** `boolean` - True if menu is rendered and visible

#### `createMacro(macroData)`

Creates a macro that executes Flash Rolls requests with pre-configured settings. This is the same functionality used by the "Create Macro" button in GM roll configuration dialog or in the menu items. The macro is saved to Flash Rolls folder, unless this setting is turned off by the user - in which case it is saved to the root.

**Parameters:**
- `macroData.requestType` (string) - Type of roll request (e.g., `'skill'`, `'savingthrow'`, `'tool'`, `'initiative'`, `'deathsave'`, `'hitdie'`, `'custom'`)
- `macroData.rollKey` (string, optional) - Specific roll key (e.g., `'acr'` for Acrobatics, `'str'` for Strength)
- `macroData.actorIds` (string[]) - Array of actor IDs to include
- `macroData.config` (Object) - Roll configuration options

**Example:**
```javascript
FlashRolls5e.createMacro({
  requestType: 'skill',
  rollKey: 'per',
  actorIds: ['actorId1', 'actorId2'],
  config: {
    dc: 15, // optional
    advantage: true, // optional
    skipRollDialog: true // optional
  }
});
```

## Actor Ownership for Roll Requests

Flash Rolls 5e follows specific rules for determining if a roll request should be sent to a player or rolled by the GM.

- **Player Characters (PCs)**: Only players who **explicitly own** an actor will receive roll requests for them. If GM gives ownership to all players by default, this is not considered as ownership for receiving roll requests, as it would be impossible to determine which player should receive the request. 
- **Offline Players**: If a player who owns a character is offline, the GM will automatically roll for that character locally
- **Multiple Owners**: If multiple players own the same actor, the request is sent to the first online non-GM owner

And of course, GMs don't receive requests for actors they own - they just roll locally.

**Explicit ownership** means the character either:

- Is selected as the main character of a user in the user configuration window (core Foundry)
- Has a player set as Owner (not Default) in the Ownership configuration window.

- *Ownership configuration (right click on actor)*:

<img width="500" alt="image" src="https://github.com/crlngn/flash-rolls-5e/blob/main/demo/docs/owner-configuration.webp?raw=true" />

- *User configuration (right click the user name in player list)*:

<img width="500" alt="image" src="https://github.com/crlngn/flash-rolls-5e/blob/main/demo/docs/user-config.webp?raw=true" />


## Dependencies

Flash Rolls 5e requires the [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) module to be installed and active.


## Compatibility

### Carolingian UI

This module works best together with [Carolingian UI](https://foundryvtt.com/packages/crlngn-ui), but also works with core Foundry UI.

### Midi-QOL and Ready Set Roll

I suggest you uncheck the setting "Treat Rolls from Player Sheets as Requests" when using Midi-QOL or Ready Set Roll. This setting is off by default, I am working to make it work with these modules.

## License

This module is licensed under the MIT License. See the LICENSE file for details.
