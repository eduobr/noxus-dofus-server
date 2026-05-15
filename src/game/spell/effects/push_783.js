const Basic = require("../../../utils/basic")
const MapPoint = require("../../pathfinding/map_point")
const Shapes = require("../../../game/fight/fight_shape_processor")
class Push {

    static effectId = 783;

    static process(data) {
        var point = MapPoint.fromCellId(data.caster.cellId);
        var dir = point.orientationTo(MapPoint.fromCellId(data.cellId));
        var line = new Shapes.Line(1);
        line._nDirection = dir;
        var cells = line.getCells(data.caster.cellId);
        var target = data.caster.fight.getFighterOnCell((cells[1]) ? cells[1] : 0);
        if (target)
            target.push(dir, 5);
    }
}

module.exports = Push;