const Basic = require("../../../utils/basic")
const RemoveApBuff = require("../buffs/remove_ap_buff_fix")
class BuffRemoveAp168 {

    static effectId = 168;

    static process(data) {
        for(var t of data.targets) {
            t.addBuff(new RemoveApBuff(data.effect.diceNum, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = BuffRemoveAp168;