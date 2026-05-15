const Basic = require("../../../utils/basic")
const AddPowerBuff = require("../buffs/add_power_buff")
class BuffPower {

    static effectId = 138;

    static process(data) {
        data.caster.sequenceCount++;
        var buffPercentage = data.effect.diceNum;
        for(var t of data.targets) {
            t.addBuff(new AddPowerBuff(buffPercentage, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = BuffPower;