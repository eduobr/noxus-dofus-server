const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
// Lazy require para romper ciclo con DBManager durante carga de módulos
function getDBManager() { return require("../database/dbmanager"); }
const ConfigManager = require("../utils/configmanager")
// Lazy requires para romper ciclos con network/world y network/auth
function getWorldServer() { return require("../network/world"); }
function getAuthServer() { return require("../network/auth"); }
const ChatChannel = require("../enums/chat_activable_channels_enum")
const Character = require("../database/models/character")
const AccountRole = require("../enums/account_role_enum")
const Common = require("../common")
const WorldManager = require("../managers/world_manager")
const FriendHandler = require("../handlers/friend_handler")
class LoaderManager {

    static LoadAccountData(client, callback)
    {
        try
        {
            client.account.friends = [];
            client.account.ignoredsList = [];

            getDBManager().getFriends({accountId: client.account.uid}, function(friends){
                for (var i in friends) {
                    var friend = friends[i];

                    (function(tmp){
                        getDBManager().getAccount({uid: tmp.friendAccountId}, function (account) {
                            if (account) {
                                    tmp.account = account;
                                    client.account.friends.push(tmp);
                            }
                        });
                    })(friend);
                }
                getDBManager().getIgnoreds({accountId: client.account.uid}, function(ignoreds) {
                    for (var i in ignoreds)
                    {
                        var ignored = ignoreds[i];
                        (function(tmp2) {
                            getDBManager().getAccount({uid: tmp2.ignoredAccountId}, function (account) {
                                if (account) {
                                    tmp2.account = account;
                                    client.account.ignoredsList.push(tmp2);
                                }
                            });
                        })(ignored);
                    }
                    Logger.infos("Account data successfully loaded for account " + client.account.username + " (" + client.account.uid + ")");
                    callback();
                });
            });
        }
        catch (error)
        {
            Logger.error("Can't load account data for " + client.account.username + ", error :" + error);
            client.close();
        }
    }

    static getFriendsOnline(client, callback)
    {
        var friendOnline = 0;
        if (client.account.friends)
        {
            for (var i in client.account.friends)
            {
                var character = getWorldServer().getOnlineCharacterByAccountId(client.account.friends[i].friendAccountId);
                if (character)
                {
                    FriendHandler.sendFriendsList(character.client);
                    friendOnline++;
                }
            }
            callback(friendOnline);
            return;

        }
        callback(0);
        return;
    }

    static LoadCharacterData(client, callback)
    {
        LoaderManager.getFriendsOnline(client, function(online){
            client.character.friendsOnline = online;
            callback();
        });
    }

}
module.exports = LoaderManager