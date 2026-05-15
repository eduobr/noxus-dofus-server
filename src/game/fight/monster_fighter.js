const Fighter = require("./fighter")
const Messages = require("../../io/dofus/messages")
const Types = require("../../io/dofus/types")
const Logger = require("../../io/logger")
const Fight = require("./fight")
const CharacterManager = require("../../managers/character_manager")
const WorldManager = require("../../managers/world_manager")
const MapPoint = require("../pathfinding/map_point")
const RemoveAPBuff = require("../../game/spell/buffs/remove_ap_buff")
const RemoveMPBuff = require("../../game/spell/buffs/remove_mp_buff")
const Basic = require("../../utils/basic")
const AddStateBuff = require("../spell/buffs/add_state_buff")
const Shapes = require("../../game/fight/fight_shape_processor")
const BasicAI = require("../monsters/ai/basic_ai")
class MonsterFighter extends Fighter {

    constructor(fight) {
        super(fight);
        this._id = fight.incrementCacheValue("monsterId", true);
        this.ready = true;
        this.ai = new BasicAI(this);
    }

    get id() {
        return this._id;
    }

    get level() {
        return this.monster.grade.level;
    }

    get isAI() {
        return true;
    }

    send(packet) {}

    refreshStats() { }

    getGameFightMinimalStatsPreparation() {
        return new Types.GameFightMinimalStatsPreparation(this.current.life, this.getStats().getMaxLife(), this.getStats().getMaxLife(), this.getStats().getTotalStats(17), 0,
            this.current.AP, this.getStats().getTotalStats(1),
            this.current.MP, this.getStats().getTotalStats(2), 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000);
    }

    getGameFightFighterInformations() {
        var t = new Types.GameFightMonsterInformations(this.id, this.monster.getEntityLook(),
            new Types.EntityDispositionInformations(this.cellId, this.dirId), this.team.id, 0, this.alive, this.getGameFightMinimalStatsPreparation(), [],
            this.monster.template._id, this.monster.grade.grade);
        return t;
    }

    getFightTeamMemberCharacterInformations() {
        return new Types.FightTeamMemberMonsterInformations(this.id, this.monster.template._id, this.monster.grade.grade);
    }

    startBrain() {
        Logger.debug("Process AI for the monster id: " + this.id);
        this.ai.process();
    }
}
module.exports = MonsterFighter