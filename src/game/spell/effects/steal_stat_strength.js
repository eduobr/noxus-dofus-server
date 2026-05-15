const Basic = require("../../../utils/basic")
const addStatStrengthBuff = require("../buffs/add_stat_strength_buff")
const RemoveStatStrengthBuff = require("../buffs/remove_stat_strength_buff")
class stealStatStrength {

    static effectId = 271;

    static process(data) {
        for(var t of data.targets) {
            var roll = 0;
            roll = (data.effect.diceSide > 0) ? Basic.getRandomInt(data.effect.diceNum, data.effect.diceSide) : data.effect.diceNum;
            data.caster.addBuff(new addStatStrengthBuff(roll, data.spell, data.spellLevel, data.effect, data.caster, data.caster));
            t.addBuff(new RemoveStatStrengthBuff(roll, data.spell, data.spellLevel, data.effect, data.caster, data.caster));
        }
    }
}

module.exports = stealStatStrength;