var L=Object.defineProperty;var C=(p,e,o)=>e in p?L(p,e,{enumerable:!0,configurable:!0,writable:!0,value:o}):p[e]=o;var I=(p,e,o)=>C(p,typeof e!="symbol"?e+"":e,o);import{M as b,L as c,g as k,S,C as T,R as N}from"../scripts/flash-rolls-5e.js";const{ApplicationV2:_,HandlebarsApplicationMixin:$}=foundry.applications.api,g=class g extends $(_){constructor(e={}){super(e),this.actors=e.actors||[],this.rollSelections=new Map,this.rollMode="publicroll",this.flavor="",this.hideNpcNames=!1}async _prepareContext(e={}){const o=await super._prepareContext(e),a={};for(const[s,l]of Object.entries(CONFIG.DND5E.abilities))a[s]={label:game.i18n.localize(l.label),abbreviation:game.i18n.localize(l.abbreviation)};const t={};for(const[s,l]of Object.entries(CONFIG.DND5E.skills))t[s]={label:game.i18n.localize(l.label)};return{...o,actors:this.actors.map(s=>{const l=s.actor||s;return{id:l.id,name:l.name,img:l.img}}),abilities:a,skills:t,rollMode:this.rollMode,flavor:this.flavor,hideNpcNames:this.hideNpcNames}}_attachPartListeners(e,o,a){super._attachPartListeners(e,o,a);const t=o.querySelector(".roll-mode-select");t&&t.addEventListener("change",r=>{this.rollMode=r.target.value});const s=o.querySelector('input[name="flavor"]');s&&s.addEventListener("input",r=>{this.flavor=r.target.value});const l=o.querySelector('input[name="hideNpcNames"]');l&&l.addEventListener("change",r=>{this.hideNpcNames=r.target.checked}),o.querySelectorAll(".actor-roll-type").forEach(r=>{r.addEventListener("change",n=>{const d=n.target.dataset.actorId;this.rollSelections.set(d,n.target.value)})})}async _onRequest(e,o){if(this.actors.length===0){ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));return}for(const t of this.actors){const s=t.actor||t;if(!this.rollSelections.get(s.id)){ui.notifications.warn(game.i18n.format("FLASH_ROLLS.notifications.noRollSelected",{name:s.name}));return}}const a={actors:this.actors.map(t=>{const s=t.actor||t;return{actor:s,uniqueId:t.uniqueId||s.id,tokenId:t.tokenId||null,rollType:this.rollSelections.get(s.id)}}),rollMode:this.rollMode,flavor:this.flavor,hideNpcNames:this.hideNpcNames};await this._executeContestedRolls(a),this.close()}async _executeContestedRolls(e){c.log("_executeContestedRolls",[e]);const o=k(),t=S.get(o.groupRollsMsgEnabled.tag)?foundry.utils.randomID():null;c.log("ContestedRoll - groupRollId",[t]);const s={...e,isContestedRoll:!0};if(t){const l=e.actors.map(d=>{const f=d.actor,m=d.uniqueId||f.id,R=d.tokenId||null,[u,h]=d.rollType.split(":");return{actor:f,uniqueId:m,tokenId:R,rollType:u,rollKey:h}}),i=e.actors[0].rollType.split(":"),r=i[0],n=i[1];await T.createGroupRollMessage(l,r,n,s,t)}for(const l of e.actors)await this._executeRollForActor(l,s,t)}async _executeRollForActor(e,o,a=null){var f,m,R;const t=e.actor,s=e.tokenId,[l,i]=e.rollType.split(":");c.log("_executeRollForActor",[t.name,l,i,"tokenId:",s,"groupRollId:",a]);const r=k(),n=S.get(r.skipRollDialog.tag),d=S.get(r.rollRequestsEnabled.tag);try{if(l==="dice"){const u=await new Roll(i,t.getRollData()).evaluate(),h={actor:t};if(s){const w=((f=canvas.tokens)==null?void 0:f.get(s))||((R=(m=game.scenes.active)==null?void 0:m.tokens)==null?void 0:R.get(s));w&&(h.token=w)}const y=ChatMessage.implementation.getSpeaker(h),F=o.flavor||game.i18n.localize("FLASH_ROLLS.ui.dialogs.contestedRoll.customRoll"),M={speaker:y,flavor:F};o.rollMode&&(M.rollMode=o.rollMode),a&&(M.flags={"flash-rolls-5e":{groupRollId:a,isContestedRoll:!0}}),await u.toMessage(M)}else{const u=l==="ability"?"abilitycheck":l,h=N.isPlayerOwned(t),y=s||t.id;await FlashRolls5e.requestRoll({requestType:u,rollKey:i,actorIds:[y],sendAsRequest:h&&d,skipRollDialog:n,groupRollId:a,isContestedRoll:o.isContestedRoll||!1})}}catch(u){c.error("Error executing roll",[u]),ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.rollFailed",{name:t.name}),[u])}}async _onShowCode(e,o){c.log("ContestedRollDialog _onShowCode",[]);for(const t of this.actors){const s=t.actor||t;if(!this.rollSelections.get(s.id)){ui.notifications.warn(game.i18n.format("FLASH_ROLLS.notifications.noRollSelected",{name:s.name}));return}}const a=this._generateMacroCode();c.log("Generated macro code:",[a]);try{await this._createContestedRollMacro(a),this.close()}catch(t){c.error("Failed to create macro:",[t]),ui.notifications.error(`Failed to create macro: ${t.message}`)}}_generateMacroCode(){const e=this.rollSelections.get(this.actors[0].id).split(":"),o=e[0]==="ability"?"abilitycheck":e[0],a=e[1],t=this.actors.map(l=>{const[i,r]=this.rollSelections.get(l.id).split(":"),n=i==="ability"?"abilitycheck":i;return i==="dice"?`  // ${l.name}: Custom Dice Roll
  const actor${l.id} = game.actors.get("${l.id}");
  if (actor${l.id}) {
    const roll = await new Roll("${r}", actor${l.id}.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.implementation.getSpeaker({ actor: actor${l.id} }),
      flavor: "${this.flavor||"Custom Roll"}",
      rollMode: "${this.rollMode}",
      flags: {
        "flash-rolls-5e": {
          groupRollId: groupRollId,
          isContestedRoll: true
        }
      }
    });
  }`:`  // ${l.name}: ${i}:${r}
  await FlashRolls5e.requestRoll({
    requestType: "${n}",
    rollKey: "${r}",
    actorIds: ["${l.id}"],
    skipRollDialog: true,
    groupRollId: groupRollId,
    isContestedRoll: true
  });`}).join(`

`),s=this.actors.map(l=>`    {
      actor: game.actors.get("${l.id}"),
      uniqueId: "${l.id}",
      tokenId: null
    }`).join(`,
`);return`// Flash Token Actions: Contested Roll
// Roll Mode: ${this.rollMode}
${this.flavor?`// Flavor: ${this.flavor}`:""}

(async () => {
  try {
    const groupRollId = foundry.utils.randomID();

    const actorEntries = [
${s}
    ];

    await FlashRolls5e.createGroupRollMessage(
      actorEntries,
      "${o}",
      "${a}",
      { rollMode: "${this.rollMode}", flavor: "${this.flavor}", isContestedRoll: true },
      groupRollId
    );

${t}
  } catch (error) {
    ui.notifications.error("Failed to execute contested roll: " + error.message);
  }
})();`}async _createContestedRollMacro(e){const o=k(),a=S.get(o.addMacrosToFolder.tag);let t=null;a&&(t=await this._ensureFlashRollsFolder());const i={name:`Contested Roll: ${this.actors.map(n=>n.name).join(" vs ")}`,type:"script",command:e,img:"modules/flash-rolls-5e/assets/bolt-circle.svg",...t&&{folder:t},flags:{"flash-rolls-5e":{type:"contested-roll",actors:this.actors.map(n=>n.id),rollSelections:Array.from(this.rollSelections.entries()),rollMode:this.rollMode,flavor:this.flavor}}},r=await Macro.create(i);return ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.macroCreated",{macroName:r.name})),r.sheet.render(!0),r}async _ensureFlashRollsFolder(){const e="Flash Token Actions";let o=game.folders.find(a=>a.type==="Macro"&&a.name===e);if(!o)try{o=await Folder.create({name:e,type:"Macro",color:"#302437",sort:0}),c.log("Created Flash Token Actions macro folder",[o])}catch(a){return c.error("Failed to create Flash Token Actions macro folder:",[a]),ui.notifications.warn("Failed to create Flash Token Actions macro folder. Macro will be created without folder organization."),null}return(o==null?void 0:o.id)||null}async _onDeleteActor(e,o){const a=o.dataset.actorId;c.log("ContestedRollDialog _onDeleteActor",[a]),this.actors=this.actors.filter(t=>t.id!==a),this.rollSelections.delete(a),await this.render(!0)}static async show(e){if(!e||e.length===0)return ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected")),null;const o=new this({actors:e});return o.render(!0),o}};I(g,"DEFAULT_OPTIONS",{id:"flash5e-contested-roll-dialog",classes:["flash5e-dialog","flash5e-contested-roll-dialog"],tag:"div",window:{title:"FLASH_ROLLS.ui.dialogs.contestedRoll.title",icon:"fas fa-swords",resizable:!1,positioned:!0,frame:!0},position:{width:540,height:"auto"},actions:{request:g.prototype._onRequest,"show-code":g.prototype._onShowCode}}),I(g,"PARTS",{main:{template:`modules/${b}/templates/contested-roll-dialog.hbs`}});let v=g;export{v as ContestedRollDialog};
//# sourceMappingURL=ContestedRollDialog-CQk44pos.js.map
