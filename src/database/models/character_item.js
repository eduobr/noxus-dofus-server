const Types = require("../../io/dofus/types")
const Messages = require("../../io/dofus/messages")
// Lazy require para romper ciclo: ItemManager → CharacterItem → ItemManager
function getItemManager() { return require("../../game/item/item_manager"); }
const ItemDiceEffect = require("../../game/item/item_dice_effect")
const ItemEffectInteger = require("../../game/item/item_effect_integer")
// Lazy require para romper ciclo con DBManager
function getDBManager() { return require("../../database/dbmanager"); }

class CharacterItem {

    static DEFAULT_SLOT = 63;

    constructor(raw) {
        this._id = raw._id ? raw._id : -1;
        this.templateId = raw.templateId;
        this.effects = raw.effects;
        this.position = CharacterItem.DEFAULT_SLOT;
        this.quantity = raw.quantity;
    }

    rebuildEffects() {
        this.effects = this.copyEffects();
    }

    getTemplate() {
        return getItemManager().getItemTemplateById(this.templateId);
    }

    getObjectItem() {
        var effects = [];
        for(var effect of this.effects) {
            effects.push(effect.getObjectEffect());
        }
        return new Types.ObjectItem(this.position, this.templateId, effects, this._id, this.quantity);
    }

    copyEffects() {
        var copyEffects = this.effects;
        var effects = [];
        for(var e of copyEffects) {
            if(e.effectType == "ObjectEffectInteger") {
                effects.push(new ItemEffectInteger(e.value, e.effectId, "ObjectEffectInteger"));
            }
        }
        return effects;
    }

    isSame(item) {
        if(item.templateId != this.templateId) return false;
        if(item._id == this._id) return false;
        for(var effect of this.effects) {
            for(var effectToCompare of item.effects) {
                if(effect.effectId == effectToCompare.effectId) {

                    if(effect.effectType == "ObjectEffectInteger") {
                        if(effect.value != effectToCompare.value) {
                            return false;
                        }
                    }

                }
            }
        }
        return true;
    }

    create(callback) {
        var self = this;
        if(this._id == -1) {
            getDBManager().getNextSequence("items_players_bags").then(autoIndex => {
                self._id = autoIndex;
                callback();
            }).catch(err => {
                callback(err);
            });
        }
        else{
            callback();
        }
    }
}
module.exports = CharacterItem