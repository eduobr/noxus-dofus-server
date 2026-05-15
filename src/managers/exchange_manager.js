const PartyType = require("../enums/party_type")
const Logger = require("../io/logger")
const WorldServer = require("../network/world")
const Datacenter = require("../database/datacenter")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const PartyFollower = require("../game/party/party_follower")
const CompassEnum = require("../enums/compass_type_enum")
const ExchangeType = require("../enums/exchange_type_enum")
class ExchangeManager {

    static exchangeAvailable = {
        1:require("../game/exchange/exchange_player"),
    };

    static newExchange(exchangeType, firstActor, secondActor)
    {
        if (ExchangeManager.exchangeAvailable[exchangeType])
        {
            return new ExchangeManager.exchangeAvailable[exchangeType](exchangeType, firstActor, secondActor);
        }
        else
            firstActor.character.replyImportant("Ce type d'échange n'est pas encore disponible ou est invalide.");
    }
}
module.exports = ExchangeManager