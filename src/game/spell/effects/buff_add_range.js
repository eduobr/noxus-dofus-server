const Basic = require("../../../utils/basic")
const AddRangeBuff = require("../buffs/add_range_buff")
class BuffAddRange {

    static effectId = 117;

    static process(data) {
        for(var t of data.targets) {
            var roll = 0;
            roll = (data.effect.diceSide > 0) ? Basic.getRandomInt(data.effect.diceNum, data.effect.diceSide) : data.effect.diceNum;
            t.addBuff(new AddRangeBuff(roll, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = BuffAddRange;