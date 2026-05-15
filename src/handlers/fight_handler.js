const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const DBManager = require("../database/dbmanager")
const Datacenter = require("../database/datacenter")
const ConfigManager = require("../utils/configmanager")
const CharacterManager = require("../managers/character_manager")
const IgnoredHandler = require("../handlers/ignored_handler")
const Fight = require("../game/fight/fight")
const ChallengeFight = require("../game/fight/challenge_fight")
const PVMFight = require("../game/fight/pvm_fight")
class FightHandler {

    static handleGameRolePlayPlayerFightRequestMessage(client, packet) {
       var target = client.character.getMap().getClientByCharacterId(packet.targetId);
       if(target) {
           if(target.character.isBusy()) {
               //TODO: Busy
               return;
           }
           if (IgnoredHandler.isIgnoringForSession(target, client.character) && IgnoredHandler.isIgnoring(target, client.account)) {
                //TODO: Messages
               return;
           }
           Logger.debug("Fight request by " + client.character.name + " to " + target.character.name);
           client.character.requestedFight = { source: client.character._id, target: packet.targetId };
           target.character.requestedFight = { source: client.character._id, target: packet.targetId };

           target.send(new Messages.GameRolePlayPlayerFightFriendlyRequestedMessage(1, client.character._id, target.character._id));
           client.send(new Messages.GameRolePlayPlayerFightFriendlyRequestedMessage(1, client.character._id, target.character._id));
       }
    }

    static handleGameRolePlayPlayerFightFriendlyAnswerMessage(client, packet) {
        if(client.character.requestedFight) {
            var target = null;
            if(client.character._id != client.character.requestedFight.source) {
                target = client.character.getMap().getClientByCharacterId(client.character.requestedFight.source);
            }
            else {
                target = client.character.getMap().getClientByCharacterId(client.character.requestedFight.target);
            }
            if(target) {
                if(packet.accept) { // Create a new fight instance
                    client.send(new Messages.GameRolePlayPlayerFightFriendlyAnsweredMessage
                        (1, client.character.requestedFight.source, client.character.requestedFight.target, true));
                    target.send(new Messages.GameRolePlayPlayerFightFriendlyAnsweredMessage
                        (1, target.character.requestedFight.source, target.character.requestedFight.target, true));

                    // Create fight properly
                    var fight = new ChallengeFight(client, target);
                    fight.map.fights.push(fight);
                    client.character.fight = fight;
                    target.character.fight = fight;
                    fight.initialize();
                }
                else { // Decline invitation
                    client.send(new Messages.GameRolePlayPlayerFightFriendlyAnsweredMessage
                        (1, client.character.requestedFight.source, client.character.requestedFight.target, false));
                    target.send(new Messages.GameRolePlayPlayerFightFriendlyAnsweredMessage
                        (1, target.character.requestedFight.source, target.character.requestedFight.target, false));
                }
                target.character.requestedFight = null;
            }
            else {
                client.send(new Messages.GameRolePlayPlayerFightFriendlyAnsweredMessage
                    (1, client.character.requestedFight.source, client.character.requestedFight.target, false));
            }
            client.character.requestedFight = null;
        }
    }

    static handleGameFightPlacementPositionRequestMessage(client, packet) {
        if(client.character.isInFight()) {
            Logger.debug("Request fight placement to cellId: " + packet.cellId);
            client.character.fighter.team.fight.requestFightPlacement(client.character.fighter, packet.cellId);
        }
    }

    static handleGameFightReadyMessage(client, packet) {
        if(client.character.isInFight()) {
            Logger.debug("Request fight ready state: " + packet.isReady);
            client.character.fighter.setReadyState(packet.isReady);
        }
    }

    static handleGameFightJoinRequestMessage(client, packet) {
        var fight = client.character.getMap().getFightById(packet.fightId);
        if(fight) {
            if(fight.fightState == Fight.FIGHT_STATES.STARTING) {
                fight.joinTeam(client, packet.fighterId);
            }
            else {
                Logger.debug("Fight is started, can't join");
            }
        }
        else {
            Logger.debug("Fight not found on the map, maybe started ?");
        }
    }

    static handleGameContextQuitMessage(client, packet) {
        if(client.character.isInFight()) {
            client.character.fighter.hasLeave = true;
            client.character.fight.leaveFight(client.character.fighter, Fight.FIGHT_LEAVE_TYPE.ABANDONED);
        }
    }

    static handleGameFightTurnFinishMessage(client, packet) {
        if(client.character.isInFight()) {
            client.character.fighter.passTurn();
        }
    }

    static handleGameActionFightCastRequestMessage(client, packet) {
        if (client.character.isInFight()) {
            Logger.debug("Fighter want to cast spell id: " + packet.spellId + ", on cell id: " + packet.cellId);
            client.character.fight.requestCastSpell(client.character.fighter, packet.spellId, packet.cellId);
        }
    }

    static handleGameContextKickMessage(client, packet) {
        if(client.character.isInFight()) {
            Logger.debug("Fighter want to kick target id: " + packet.targetId);

        }
    }

    static handleGameActionFightCastOnTargetRequestMessage(client, packet)
    {
        if (client.character.isInFight())
        {
            var fighter = client.character.fight.getFighterById(packet.targetId);
            if (fighter) {
                client.character.fight.requestCastSpell(client.character.fighter, packet.spellId, fighter.cellId);
            }
        }
    }

    static handleGameRolePlayAttackMonsterRequestMessage(client, packet) {
        Logger.debug("Player id: " + client.character._id + " want to attack the monster group id: " + packet.monsterGroupId);
        var monsterGroup = client.character.getMap().getMonsterGroup(packet.monsterGroupId);
        if(monsterGroup) {
            if(client.character.cellid == monsterGroup.cellId) {
                if (!client.character.isInFight()) {
                    // Create fight properly
                    client.character.getMap().removeMonsterGroup(monsterGroup);
                    var fight = new PVMFight(client, monsterGroup);
                    fight.map.fights.push(fight);
                    client.character.fight = fight;
                    fight.initialize();
                }
            }
            else {
                Logger.error("Can't attack the monster group because he is not on the same cell");
            }
        }
        else {
            Logger.error("Can't attack the monster group because is missing");
        }
    }
}
module.exports = FightHandler