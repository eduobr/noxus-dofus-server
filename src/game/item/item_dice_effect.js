const Types = require("../../io/dofus/types")
const Messages = require("../../io/dofus/messages")
class ItemDiceEffect {

    constructor(effectId, effectType) {
        this.effectId = effectId;
        this.effectType = effectType;
    }
}
module.exports = ItemDiceEffect