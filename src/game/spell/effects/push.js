const Basic = require("../../../utils/basic")
const MapPoint = require("../../pathfinding/map_point")
class Push {

    static effectId = 5;

    static process(data) {
        for(var t of data.targets) {
            data.caster.sequenceCount++;
            var point = null;
            if(data.cellId == t.cellId) {
                point = MapPoint.fromCellId(data.caster.cellId);
            }
            else {
                point = MapPoint.fromCellId(data.cellId);
            }
            var dir = point.orientationTo(MapPoint.fromCellId(t.cellId));
            t.push(dir, data.effect.diceNum);
        }
    }
}

module.exports = Push;