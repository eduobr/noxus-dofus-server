const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
const DBManager = require("../database/dbmanager")
const ConfigManager = require("../utils/configmanager")
// Lazy require para romper ciclo: world → world_client → processor → handlers → world
function getWorldServer() { return require("../network/world"); }
const AuthServer = require("../network/auth")
const PlayableBreedEnum = require("../enums/playable_breed_enum")
const Character = require("../database/models/character")
const WorldManager = require("../managers/world_manager")
const AccountFriend = require("../database/models/account_friend")
const FriendFailureEnum = require("../enums/friend_failure_enum")
const PlayerStateEnum = require("../enums/player_state_enum")
const AccountIgnored = require("../database/models/account_ignored")
const FriendHandler = require("../handlers/friend_handler")
const IgnoredHandler = require("../handlers/ignored_handler")
const PartyFriend = require("../game/party/party_friend")
const PartyType = require("../enums/party_type")
const PartyInvitation = require("../game/party/party_invitation")
class PartyHandler {
    static handlePartyInvitationRequestMessage(client, packet) {
        if (packet.name && packet.name.length > 0) {
            var target = getWorldServer().getOnlineClientByCharacterName(packet.name);
            if (target)
            {
                if (!IgnoredHandler.isIgnoringForSession(target, client.character) && !IgnoredHandler.isIgnoring(target, client.account)) {
                        try {
                            if (client.character.party == null)
                                client.character.party = new PartyFriend(client.character);
                            target.character.invitation = new PartyInvitation(client.character.party, client.character, target.character);
                            target.character.invitation.showInvitation();
                        }
                        catch (error) {
                            Logger.error(error);
                        }
                }
                else
                    client.character.replyLangsMessage(1, 370, [target.character.name]);
            }
            else
                client.character.replyImportant("Impossible de trouver ce personnage.");
        }
    }

    static getPartyById(id)
    {
        var partys = getWorldServer().partys;
        for (var i in partys)
        {
            if (partys[i].id == id)
                return partys[i];
        }
        return null;
    }

    static handlePartyRefuseInvitationMessage(client, packet)
    {
        if (client.character.invitation)
        {
            client.character.invitation.declineInvitation();
        }
    }

    static handlePartyAcceptInvitationMessage(client, packet) {
        if (client.character.invitation)
        {
            client.character.invitation.acceptInvitation();
        }
    }

    static handlePartyLeaveRequestMessage(client, packet) {
        if (packet.partyId >= 0)
        {
            var party = getWorldServer().getPartyById(packet.partyId);
            if (party)
            {
                if (party.isInParty(client.character))
                {
                    party.removeMember(client.character, false);
                }
                else
                    client.character.replyImportant("Impossible car vous ne faites pas partis de ce groupe.");
            }
            else
                client.character.replyImportant("Impossible de trouver ce groupe.");
        }
    }

    static handlePartyKickRequestMessage(client, packet)
    {
        if (client.character.party && getWorldServer().getPartyById(client.character.party.id)
        && client.character.party.isInParty(client.character))
        {
            if (packet.partyId == client.character.party.id)
            {
                if (client.character.party.isLeader(client.character))
                {
                    var target = getWorldServer().getOnlineClientByCharacterId(packet.playerId);
                    if (target) {
                        client.character.party.removeMember(target.character, false);
                        target.character.replyImportant("Vous avez été exclu du groupe.");
                    }
                }
                else
                    client.character.replyImportant("Impossible car vous n'êtes pas le chef du groupe.")
            }
            else
                client.character.replyError("Une erreur est survenu, le groupe est invalide.");
        }
        else
            client.character.replyImportant("Impossible car vous n'êtes pas dans un groupe.");
    }

    static handlePartyAbdicateThroneMessage(client, packet) {
        if (client.character.party && getWorldServer().getPartyById(client.character.party.id)
            && client.character.party.isInParty(client.character))
        {
            if (packet.partyId == client.character.party.id)
            {
                if (client.character.party.isLeader(client.character))
                {
                    var target = getWorldServer().getOnlineClientByCharacterId(packet.playerId);
                    if (target) {
                        if (target.character.party && target.character.party == client.character.party
                        && target.character.party.isInParty(target.character)) {
                            client.character.party.setLeader(target.character);
                        }
                        else
                            client.character.replyImportant("Impossible car la cible n'est pas dans le groupe.");
                    }
                }
                else
                    client.character.replyImportant("Impossible car vous n'êtes pas le chef du groupe.")
            }
            else
                client.character.replyError("Une erreur est survenu, le groupe est invalide.");
        }
        else
            client.character.replyImportant("Impossible car vous n'êtes pas dans un groupe.");
    }

    static handlePartyFollowMemberRequestMessage(client, packet)
    {
        if (client.character.party && getWorldServer().getPartyById(client.character.party.id)
            && client.character.party.isInParty(client.character))
        {
            if (packet.partyId == client.character.party.id)
            {
                var target = getWorldServer().getOnlineClientByCharacterId(packet.playerId);
                if (target) {
                    if (target.character.party && target.character.party == client.character.party
                        && target.character.party.isInParty(target.character)) {
                        client.character.party.setAsFollower(client.character, target.character);
                    }
                    else
                        client.character.replyImportant("Impossible car la cible n'est pas dans le groupe.");
                }
            }
            else
                client.character.replyError("Une erreur est survenu, le groupe est invalide.");
        }
        else
            client.character.replyImportant("Impossible car vous n'êtes pas dans un groupe.");
    }

    static handlePartyStopFollowRequestMessage(client, packet)
    {
        if (client.character.party && getWorldServer().getPartyById(client.character.party.id)
            && client.character.party.isInParty(client.character))
        {
            if (packet.partyId == client.character.party.id)
            {
                var target = getWorldServer().getOnlineClientByCharacterId(packet.playerId);
                if (target) {
                    if (target.character.party && target.character.party == client.character.party
                        && target.character.party.isInParty(target.character)) {
                        client.character.party.stopFollowing(client.character, target.character);
                    }
                    else
                        client.character.replyImportant("Impossible car la cible n'est pas dans le groupe.");
                }
            }
            else
                client.character.replyError("Une erreur est survenu, le groupe est invalide.");
        }
        else
            client.character.replyImportant("Impossible car vous n'êtes pas dans un groupe.");
    }

    static handlePartyInvitationDetailsRequestMessage(client, packet)
    {
        if (client.character.invitation.party && getWorldServer().getPartyById(client.character.invitation.party.id))
        {
            if (packet.partyId == client.character.invitation.party.id)
            {
                client.character.invitation.party.getDetails(client.character, client.character.invitation.leader);
            }
            else
                client.character.replyError("Une erreur est survenu, le groupe est invalide.");
        }
        else
            client.character.replyImportant("Impossible car vous n'êtes pas dans un groupe.");
    }

    static handlePartyCancelInvitationMessage(client, packet)
    {
        if (client.character.party && getWorldServer().getPartyById(client.character.party.id)
            && client.character.party.isInParty(client.character)) {
            if (packet.partyId == client.character.party.id) {

                if (client.character.party.isLeader(client.character)) {
                    var target = getWorldServer().getOnlineClientByCharacterId(packet.guestId);
                    if (target) {
                        if (target.character.invitation.party.id == client.character.party.id) {
                            target.character.invitation = null;
                            target.send(new Messages.PartyInvitationCancelledForGuestMessage(client.character.party.id, target.character._id));
                            client.character.party.sendToParty(new Messages.PartyMemberRemoveMessage(client.character.party.id, packet.guestId));
                        }
                    }
                }
            }
        }
    }
}
module.exports = PartyHandler