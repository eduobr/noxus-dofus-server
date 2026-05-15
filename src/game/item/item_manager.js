// Lazy require para romper ciclo: Datacenter → ItemManager → Datacenter
function getDatacenter() { return require("../../database/datacenter"); }
const ItemDiceEffect = require("./item_dice_effect")
const ItemEffectInteger = require("./item_effect_integer")
const Basic = require("../../utils/basic")
const Logger = require("../../io/logger")
const CharacterItem = require("../../database/models/character_item")
const Types = require("../../io/dofus/types")
class ItemManager {

    static getItemTemplateById(id) {
        return getDatacenter().items.filter(function (x) {
            if (x._id == id) return x;
        })[0];
    }

    static generateItem(itemId) {
        var itemTemplate = ItemManager.getItemTemplateById(itemId);
        if (itemTemplate == null)
            return null;
        var effectsGenerated = [];
        for(var effect of itemTemplate.possibleEffects) {
            var re = ItemManager.generateRandomEffect(effect);
            if(re) effectsGenerated.push(re);
        }

        var item = new CharacterItem({templateId: itemId, effects: effectsGenerated, quantity: 1});
        return item;
    }

    static generateSomeItems(items) {

    }

    static generateItemStack(itemId,stack) {
        var itemTemplate = ItemManager.getItemTemplateById(itemId);
        if (itemTemplate == null)
            return null;
        var effectsGenerated = [];
        for(var effect of itemTemplate.possibleEffects) {
            var re = ItemManager.generateRandomEffect(effect);
            if(re) effectsGenerated.push(re);
        }

        var item = new CharacterItem({templateId: itemId, effects: effectsGenerated, quantity: stack});
        return item;
    }

    static generateRandomEffect(effect) {
        var randomableEffects = [78, 105, 106, 107, 110, 111, 112, 114, 115, 117, 118, 119, 120, 121, 123, 124, 125, 126, 128, 136,
            137, 142, 150, 160, 161, 164, 165, 176, 178, 182, 184, 210, 211, 212, 213, 214, 240, 241, 242, 243, 244, 265, 174, 430,
            422, 219, 215, 218, 216, 217, 410, 753, 414, 418, 428, 138, 424, 426, 419]; // Effects who can be random

        if(randomableEffects.indexOf(effect.effectId) != -1) { // ObjectEffectInteger
            let lowValue = effect.diceNum;
            let highValue = effect.diceSide;
            let randomValue = Basic.getRandomInt(lowValue, highValue);
            let diceEffect = new ItemEffectInteger(randomValue, effect.effectId, "ObjectEffectInteger");
            return diceEffect;
        }

        Logger.error("Can't generate effect for effectId: " + effect.effectId);
        return null;
    }

    static getObjectEffectDice(effect){
            let lowValue = effect.diceNum;
            let highValue = effect.diceSide;
            let randomValue = Basic.getRandomInt(lowValue, highValue);
            let diceEffect = new ItemEffectInteger(randomValue, effect.effectId, "ObjectEffectInteger");
           return new Types.ObjectEffectDice(effect.effectId,lowValue,highValue,randomValue);
    }
}
module.exports = ItemManager