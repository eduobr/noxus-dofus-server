const Basic = require("../../../utils/basic")
const RemoveRangeBuff = require("../buffs/remove_range_buff")
const AddMPBuff = require("../buffs/add_mp_buff")
class stealMP {

    static effectId = 77;

    static process(data) {
        for(var t of data.targets) {
            var roll = 0;
            roll = (data.effect.diceSide > 0) ? Basic.getRandomInt(data.effect.diceNum, data.effect.diceSide) : data.effect.diceNum;
            var lostMP = t.looseMP(data, roll);
            if (lostMP > 0) {
                data.caster.addBuff(new AddMPBuff(lostMP, data.spell, data.spellLevel, data.effect, data.caster, data.caster));
            }

        }
    }
}

module.exports = stealMP;