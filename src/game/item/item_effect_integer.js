const ItemDiceEffect = require("./item_dice_effect")
const Types = require("../../io/dofus/types")
const Messages = require("../../io/dofus/messages")
class ItemEffectInteger extends ItemDiceEffect {

    constructor(value, effectId, effectType) {
        super(effectId, effectType)
        this.value = value;
    }

    getObjectEffect() {
        return new Types.ObjectEffectInteger(this.effectId, this.value);
    }

}
module.exports = ItemEffectInteger