const Basic = require("../../../utils/basic")
const AddStateBuff = require("../buffs/add_state_buff")
class AddState {

    static effectId = 950;

    static process(data) {
        for(var t of data.targets) {
            t.addBuff(new AddStateBuff(data.effect.value, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = AddState;