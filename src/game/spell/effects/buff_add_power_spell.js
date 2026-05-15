const Basic = require("../../../utils/basic")
const AddPowerSpell = require("../buffs/add_power_spell_buff")
class BuffAddPowerSpell {

    static effectId = 1054;

    static process(data) {
        for(var t of data.targets) {
            var roll = 0;
            roll = (data.effect.diceSide > 0) ? Basic.getRandomInt(data.effect.diceNum, data.effect.diceSide) : data.effect.diceNum;
            t.addBuff(new AddPowerSpell(roll, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = BuffAddPowerSpell;