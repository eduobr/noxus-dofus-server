const Basic = require("../../../utils/basic")
const MapPoint = require("../../pathfinding/map_point")
const Logger = require("../../../io/logger")
class Attraction {

    static effectId = 6;

    static process(data) {
        for(var t of data.targets) {
            data.caster.sequenceCount++;
            if (data.glyphCell)
            {
                Logger.debug("Center cell is setted for glyph effect !");
            }
            var point = (data.glyphCell == 0) ? MapPoint.fromCellId(data.caster.cellId) : MapPoint.fromCellId(data.glyphCell);
            var dir = point.orientationTo(MapPoint.fromCellId(t.cellId));
            t.attract(dir, data, 550);
        }
    }
}

module.exports = Attraction;