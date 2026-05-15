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
const ExchangeManager = require("../managers/exchange_manager")
const ExchangeType = require("../enums/exchange_type_enum")
class ExchangeHandler {

    static handleExchangePlayerRequestMessage(client, packet)
    {
        var target = getWorldServer().getOnlineClientByCharacterId(packet.target);
        if (target && target.character.mapid == client.character.mapid) {
            if (!IgnoredHandler.isIgnoringForSession(target, client.character) && !IgnoredHandler.isIgnoring(target, client.account)) {
                if (!target.character.isBusy()) {
                    var exchange = ExchangeManager.newExchange(packet.exchangeType, client.character, target.character);
                    if (exchange) {
                        client.character.exchange = exchange;
                        target.character.exchange = exchange;
                    }
                }
                else
                    client.character.replyLangsMessage(1, 209, []);
            }
            else
                client.character.replyLangsMessage(1, 370, [target.character.name]);
        }
    }

    static handleExchangeAcceptMessage(client, packet)
    {
        if (client.character.exchange
            && client.character.exchange.secondActor._id == client.character._id)
        {
            client.character.exchange.acceptExchange();
        }
    }

    static handleExchangeObjectMoveKamaMessage(client, packet)
    {
        if (client.character.exchange) {
            client.character.exchange.updateKamas(client.character, packet.quantity);
        }
    }

    static handleExchangeObjectMoveMessage(client, packet)
    {
        if (client.character.exchange) {
            client.character.exchange.moveItem(client.character, packet.objectUID, packet.quantity);
        }
    }

    static handleExchangeReadyMessage(client, packet)
    {
        if (client.character.exchange) {
            client.character.exchange.setReady(client.character, packet.ready);
        }
    }

}
module.exports = ExchangeHandler