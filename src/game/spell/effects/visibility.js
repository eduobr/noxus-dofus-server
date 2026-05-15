const Basic = require("../../../utils/basic")
const MapPoint = require("../../pathfinding/map_point")
const InvisibilityBuff = require("../buffs/invisibility_buff")
const InvisbilityStateEnum = require("../../../enums/invisibility_state_enum")
class Visibility {

    static effectId = 202;

    static process(data) {
        data.caster.sequenceCount++;
        for(var t of data.targets) {
            if (t.isInvisible()) {
                t.invisibilityState = InvisbilityStateEnum.VISIBLE;
                t.updateInvisibility(150);
                t.fight.synchronizeFight(t, true);
            }
        }
    }
}

module.exports = Visibility;