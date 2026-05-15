const Logger = require("../../io/logger")
const FightTeam = require("./fight_team")
const Fighter = require("./fighter")
const Fight = require("./fight")
const Messages = require("../../io/dofus/messages")
const Types = require("../../io/dofus/types")
class ChallengeFight extends Fight {


    constructor(fighterOne, fighterTwo) {
        super(fighterOne);
        this.fightType = Fight.FIGHT_TYPE.FIGHT_TYPE_CHALLENGE;
        this.teams.blue = new FightTeam(this, 1, new Fighter(this).initFromCharacter(fighterTwo.character));
        this.teams.blue.placementCells = this.placementCells.blue;
    }

    sendStartupPhase(fighter) {
        fighter.send(new Messages.GameFightJoinMessage(true, true, true, false, 0, this.fightType));
        super.sendStartupPhase(fighter);
    }
}
module.exports = ChallengeFight