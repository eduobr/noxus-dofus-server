const Logger = require("../../io/logger")
const FightTeam = require("./fight_team")
const Fighter = require("./fighter")
const MonsterFighter = require("./monster_fighter")
const Fight = require("./fight")
const Messages = require("../../io/dofus/messages")
const Types = require("../../io/dofus/types")
class PVMFight extends Fight {


    constructor(fighterOne, monstersGroup) {
        super(fighterOne);
        this.monstersGroup = monstersGroup;
        this.fightType = Fight.FIGHT_TYPE.FIGHT_TYPE_PvM;
        this.teams.blue = new FightTeam(this, 1, new MonsterFighter(this).initFromMonster(monstersGroup.monsters[0]));
        this.teams.blue.isMonsterTeam = true;
        for(var i in monstersGroup.monsters) {
            if(i == 0) continue;
            this.teams.blue.addMember(new MonsterFighter(this).initFromMonster(monstersGroup.monsters[i]));
        }
        this.teams.blue.placementCells = this.placementCells.blue;
    }

    sendStartupPhase(fighter) {
        fighter.send(new Messages.GameFightJoinMessage(true, true, true, false, 0, this.fightType));
        super.sendStartupPhase(fighter);
    }
}
module.exports = PVMFight