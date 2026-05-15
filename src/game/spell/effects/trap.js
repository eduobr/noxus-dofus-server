const Basic = require("../../../utils/basic")
const MapPoint = require("../../pathfinding/map_point")
const FightGlyph = require("../../fight/fight_glyph")
const MarkTypeEnum = require("../../../enums/mark_type_enum")
class Trap {

    static effectId = 400;

    static process(data) {
        console.log(data.spell);
        data.caster.fight.glyphs.push(new FightGlyph({caster: data.caster, fight: data.caster.fight, cells: data.shape, markType: MarkTypeEnum.TRAP,
            spell: data.spell, spellLevel: data.spellLevel, castCellId: data.cellId, effect: data.effect}));
    }
}

module.exports = Trap;