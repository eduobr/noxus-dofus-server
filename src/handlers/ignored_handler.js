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
class IgnoredHandler {

    static isIgnoringForSession(client, character)
    {
        for (var i in client.character.ignoredForSession)
        {
            if (client.character.ignoredForSession[i] == character._id)
                return true;
        }
        return false;
    }

    static isIgnoring(client, ignoredAccount)
    {
        for (var i in client.account.ignoredsList)
        {
            if (client.account.ignoredsList[i].ignoredAccountId == ignoredAccount.uid)
                return true;
        }
        return false;
    }

    static handleIgnoredAddRequestMessage(client, packet)
    {
        if (packet.name && packet.name.length > 0) {
            if (packet.name.toLowerCase() == client.character.name.toLowerCase() ||
                packet.name.toLowerCase() == client.account.nickname.toLowerCase()) {
                client.character.replyText("Impossible de vous ajouter vous-même à votre liste.");
                return;
            }
            var target = getWorldServer().getOnlineClientByCharacterName(packet.name);
            if (target == null)
                target = getWorldServer().getOnlineClientByNickName(packet.name);
            if (target) {
                if (packet.session == true) {
                    if (!IgnoredHandler.isIgnoringForSession(client, target.character)) {
                        client.character.ignoredForSession.push(target.character._id);
                        client.send(new Messages.IgnoredAddedMessage(new Types.IgnoredOnlineInformations(target.account.uid, target.account.nickname, target.character._id,
                            target.character.name, target.character.breed, target.character.sex), true));
                    }
                    else
                        client.send(new Messages.FriendAddFailureMessage(FriendFailureEnum.ALREADY_FRIEND));
                }
                else {
                    if (FriendHandler.isAlreadyFriend(client, target.account)) {
                        client.character.replyImportant("Impossible d'ajouter en ennemi quelqu'un de votre liste d'amis.");
                        return;
                    }
                    if (!IgnoredHandler.isIgnoring(client, target.account)) {
                        var ignored = new AccountIgnored({
                            _id: 0,
                            accountId: client.account.uid,
                            ignoredAccountId: target.account.uid
                        });

                        DBManager.createIgnored(ignored, function (ignored) {
                            client.account.ignoredsList.push(ignored);
                            IgnoredHandler.sendIgnoredList(client);
                        });
                    }
                    else
                        client.send(new Messages.FriendAddFailureMessage(FriendFailureEnum.ALREADY_FRIEND));
                }
            }
            else
                client.send(new Messages.FriendAddFailureMessage(FriendFailureEnum.CHARACTER_NOT_FOUND));
        }
    }

    static sendIgnoredList(client)
    {
        if (client.account.ignoredsList) {
            var list = client.account.ignoredsList;
            var sendList = [];
            for (var i in list) {
                var target = getWorldServer().getOnlineCharacterByAccountId(list[i].ignoredAccountId);
                if (target) {
                    sendList.push(new Types.IgnoredOnlineInformations(target.client.account.uid, target.client.account.nickname, target.client.character._id,
                        target.client.character.name, target.client.character.breed, target.client.character.sex));
                }
                else {
                    if (list[i].account) {
                        sendList.push(new Types.IgnoredInformations(list[i].account.uid, list[i].account.nickname));
                    }
                }
            }
            client.send(new Messages.IgnoredListMessage(sendList));
        }
    }

    static handleIgnoredGetListMessage(client, packet)
    {
        IgnoredHandler.sendIgnoredList(client);
    }

    static getIgnoredByAccountId(client, accountId)
    {
        for (var i in client.account.ignoredsList)
        {
            if (client.account.ignoredsList[i].ignoredAccountId == accountId)
                return client.account.ignoredsList[i];
        }
    }

    static handleIgnoredDeleteRequestMessage(client, packet) {
        if (packet.session == true) {
            var target = getWorldServer().getOnlineCharacterByAccountId(packet.accountId);
            if (target) {
                if (IgnoredHandler.isIgnoringForSession(client, target)) {
                    var index = client.character.ignoredForSession.indexOf(target.client.character._id);
                    if (index != -1)
                        client.character.ignoredForSession.splice(index, 1);
                        client.send(new Messages.IgnoredDeleteResultMessage(true, target.client.account.nickname, true));
                }
                else {
                    client.character.replyError("Impossible car vous n'ignorez pas ce joueur !");
                }
            }
            else
                client.send(new Messages.FriendAddFailureMessage(FriendFailureEnum.CHARACTER_NOT_FOUND));
        }
        else
        {
            DBManager.getAccount({uid: packet.accountId}, function(ignoredAccount)
            {
                if (ignoredAccount)
                {
                    if (IgnoredHandler.isIgnoring(client, ignoredAccount))
                    {
                        var ignored = IgnoredHandler.getIgnoredByAccountId(client, ignoredAccount.uid);
                        if (ignored)
                        {
                            var index = client.account.ignoredsList.indexOf(ignored);
                            if (index != -1)
                                client.account.ignoredsList.splice(index, 1);

                            DBManager.removeIgnored({accountId: client.account.uid, ignoredAccountId: ignoredAccount.uid}, function(result)
                            {
                                if (result)
                                    IgnoredHandler.sendIgnoredList(client);
                            });
                        }
                    }
                }
            });
        }
    }
}
module.exports = IgnoredHandler