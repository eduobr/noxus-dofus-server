const Basic = require("../../../utils/basic")
const MapPoint = require("../../pathfinding/map_point")
const InvisibilityBuff = require("../buffs/invisibility_buff")
class Invisiblity {

    static effectId = 150;

    static process(data) {
        data.caster.sequenceCount++;
        for(var t of data.targets) {
            t.addBuff(new InvisibilityBuff(data, data.spell, data.spellLevel, data.effect, data.caster, t));
        }
    }
}

module.exports = Invisiblity;