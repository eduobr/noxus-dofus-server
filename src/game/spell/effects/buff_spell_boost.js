const Basic = require("../../../utils/basic")
const BoostSpellBuff = require("../buffs/boost_spell_buff")
class BuffSpellBoost {

    static effectId = 293;

    static process(data) {
        for(var t of data.targets) {
            t.addBuff(new BoostSpellBuff(data.effect.diceNum, data.effect.value, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = BuffSpellBoost;